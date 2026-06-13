import { Injectable, Logger, BadRequestException, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { ContactsService } from '../../contacts/contacts.service';
import { Pipeline } from '../../database/entities/pipeline.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { ContactSource, ContactStatus } from '../../database/entities/contact.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

interface TypeformWebhookPayload {
  event_id: string;
  event_type: 'form_response';
  form_response: {
    form_id: string;
    token: string;
    landed_at: string;
    submitted_at: string;
    definition: {
      id: string;
      title: string;
      fields: any[];
    };
    answers: TypeformAnswer[];
    calculated?: {
      score: number;
    };
  };
}

interface TypeformAnswer {
  type: string;
  field: {
    id: string;
    type: string;
    ref: string;
  };
  [key: string]: any; // Dynamic answer fields
}

/**
 * Typeform integration handler
 * Handles webhooks and form submissions
 */
@Injectable()
export class TypeformIntegrationHandler {
  private readonly logger = new Logger(TypeformIntegrationHandler.name);
  private readonly TYPEFORM_API_URL = 'https://api.typeform.com';

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => ContactsService))
    private contactsService: ContactsService,
    @Inject(forwardRef(() => WhatsAppService))
    private whatsAppService: WhatsAppService,
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    @InjectRepository(PipelineStage)
    private pipelineStageRepository: Repository<PipelineStage>,
  ) {}

  /**
   * Test Typeform API connection
   */
  async testConnection(integration: any): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const apiKey = integration.credentials?.apiToken || integration.credentials?.apiKey || integration.config?.apiToken || integration.config?.apiKey || this.configService.get<string>('TYPEFORM_API_KEY');

      if (!apiKey) {
        return {
          success: false,
          message: 'API key not configured',
        };
      }

      // Test by fetching user profile
      const response = await axios.get(`${this.TYPEFORM_API_URL}/me`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      return {
        success: true,
        message: 'Connected to Typeform successfully',
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`Typeform test connection failed: ${error.message}`);
      return {
        success: false,
        message: `Typeform connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Sync data from Typeform (fetch forms and responses)
   */
  async syncData(integration: any, options?: any): Promise<any> {
    try {
      const apiKey = integration.credentials?.apiToken || integration.credentials?.apiKey || integration.config?.apiToken || integration.config?.apiKey || this.configService.get<string>('TYPEFORM_API_KEY');

      if (!apiKey) {
        throw new BadRequestException('API key not configured');
      }

      const syncType = options?.type || 'responses';

      if (syncType === 'forms') {
        // Fetch all forms
        const response = await axios.get(`${this.TYPEFORM_API_URL}/forms`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        return {
          records: response.data.items || [],
          hasMore: false,
        };
      } else if (syncType === 'responses' && options?.formId) {
        // Fetch responses for a specific form
        return await this.getFormResponses(options.formId);
      }

      return { records: [], hasMore: false };
    } catch (error) {
      this.logger.error(`Typeform sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  /**
   * Handle Typeform webhook - automatically creates contact and lead
   */
  async handleWebhook(integration: any, payload: TypeformWebhookPayload | any): Promise<any> {
    this.logger.log(`Processing Typeform webhook: ${payload.event_type || 'unknown'}`);

    if (payload.event_type !== 'form_response') {
      this.logger.warn(`Unsupported event type: ${payload.event_type}`);
      return { status: 'ignored' };
    }

    const formResponse = payload.form_response;
    const workspaceId = integration.workspaceId;

    // Extract contact information from answers (use definition.fields to resolve field titles)
    const contactData = this.extractContactData(formResponse.answers, formResponse.definition?.fields || []);

    // Build metadata
    const metadata = {
      formId: formResponse.form_id,
      formTitle: formResponse.definition.title,
      submittedAt: formResponse.submitted_at,
      responseToken: formResponse.token,
      score: formResponse.calculated?.score,
      typeformUrl: `https://admin.typeform.com/form/${formResponse.form_id}/results#responses`,
    };

    // Validate we have required fields
    if (!contactData.email) {
      this.logger.warn(`Typeform webhook missing email - skipping contact creation`);
      return {
        status: 'error',
        message: 'No email found in form response',
        answers: formResponse.answers,
      };
    }

    // Normalize name values from Typeform and avoid generic "Lead from Typeform"
    contactData.firstName = (contactData.firstName || '').trim();
    contactData.lastName = (contactData.lastName || '').trim();

    // If firstName contains full name, split it
    if (contactData.firstName && !contactData.lastName && contactData.firstName.includes(' ')) {
      const parts = contactData.firstName.split(/\s+/);
      contactData.firstName = parts[0] || '';
      contactData.lastName = parts.slice(1).join(' ');
    }

    // If still missing, infer a readable name from email local-part
    if (!contactData.firstName && contactData.email) {
      const localPart = String(contactData.email).split('@')[0] || '';
      const tokens = localPart
        .split(/[._-]+/)
        .map((token: string) => token.trim())
        .filter(Boolean);
      if (tokens.length > 0) {
        const [first, ...rest] = tokens;
        const toTitle = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        contactData.firstName = toTitle(first);
        if (!contactData.lastName && rest.length > 0) {
          contactData.lastName = rest.map(toTitle).join(' ');
        }
      }
    }

    if (!contactData.firstName) {
      contactData.firstName = 'Contact';
    }
    if (!contactData.lastName) {
      contactData.lastName = '';
    }

    try {
      // Look up form-specific config first, then fall back to global config
      const formConfig = this.getFormConfig(integration, formResponse.form_id);
      const pipelineConfig = formConfig?.pipelineId
        ? formConfig
        : integration.config?.typeformPipeline;
      let pipelineId = pipelineConfig?.pipelineId;
      let pipelineStageId = pipelineConfig?.pipelineStageId;

      // If no pipeline configured, use default pipeline
      if (!pipelineId) {
        const defaultPipeline = await this.pipelineRepository.findOne({
          where: { workspaceId, isDefault: true },
          relations: ['stages'],
        });

        if (defaultPipeline) {
          pipelineId = defaultPipeline.id;
          // Use first stage if no stage specified
          if (!pipelineStageId && defaultPipeline.stages && defaultPipeline.stages.length > 0) {
            pipelineStageId = defaultPipeline.stages[0].id;
          }
        }
      }

      // Create contact with all extracted data
      const contact = await this.contactsService.create(workspaceId, {
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        email: contactData.email,
        phone: contactData.phone,
        jobTitle: contactData.jobTitle,
        status: ContactStatus.LEAD,
        source: ContactSource.TYPEFORM,
        customFields: {
          ...contactData.customFields,
          typeformMetadata: metadata,
        },
        tags: ['typeform', formResponse.definition.title],
        pipelineId,
        pipelineStageId,
        leadScore: formResponse.calculated?.score || 0,
        notes: `Lead created from Typeform: ${formResponse.definition.title}`,
      });

      this.logger.log(`Contact created from Typeform: ${contact.id} (${contact.email})`);

      // Auto-send WhatsApp welcome message if contact has phone and feature is enabled
      let whatsAppSent = false;
      const whatsAppConfig = formConfig?.whatsApp?.enabled
        ? formConfig.whatsApp
        : integration.config?.typeformWhatsApp;
      if (contactData.phone && whatsAppConfig?.enabled) {
        try {
          const phone = contactData.phone.replace(/[^0-9]/g, '');
          if (phone.length >= 10) {
            if (whatsAppConfig.templateName) {
              // Send template message (works outside 24h window)
              const params = [];
              if (whatsAppConfig.includeNameParam) {
                params.push({ type: 'body', parameters: [{ type: 'text', text: contactData.firstName || 'there' }] });
              }
              await this.whatsAppService.sendTemplateMessage(
                phone,
                whatsAppConfig.templateName,
                whatsAppConfig.templateLanguage || 'en',
                params,
              );
              this.logger.log(`WhatsApp template sent to new Typeform lead: ${phone}`);
            } else if (whatsAppConfig.welcomeMessage) {
              // Send text message (only works within 24h window - likely won't work for new leads)
              const msg = whatsAppConfig.welcomeMessage
                .replace('{{firstName}}', contactData.firstName || 'there')
                .replace('{{formTitle}}', formResponse.definition.title || 'our form');
              await this.whatsAppService.sendTextMessage(phone, msg);
              this.logger.log(`WhatsApp welcome sent to new Typeform lead: ${phone}`);
            }
            whatsAppSent = true;
          }
        } catch (err) {
          this.logger.warn(`Failed to send WhatsApp to Typeform lead: ${err.message}`);
        }
      }

      return {
        event: 'form_response',
        status: 'success',
        message: 'Contact created successfully',
        data: {
          contact: {
            id: contact.id,
            email: contact.email,
            firstName: contact.firstName,
            lastName: contact.lastName,
          },
          pipelineId,
          pipelineStageId,
          metadata,
          whatsAppSent,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create contact from Typeform: ${error.message}`);

      // If contact already exists, that's okay - return success
      if (error.message?.includes('already exists')) {
        return {
          status: 'duplicate',
          message: 'Contact with this email already exists',
          email: contactData.email,
        };
      }

      return {
        status: 'error',
        message: error.message,
        contactData,
      };
    }
  }

  /**
   * Extract contact information from form answers
   * Uses definition fields to resolve human-readable field titles (since field.ref is a UUID)
   */
  private extractContactData(answers: TypeformAnswer[], definitionFields: any[]): any {
    const contactData: any = {
      source: 'typeform',
      customFields: {},
    };

    // Build a map of field id -> field title from definition
    const fieldTitleMap: Record<string, string> = {};
    for (const field of definitionFields) {
      if (field.id && field.title) {
        fieldTitleMap[field.id] = field.title.toLowerCase().trim();
      }
    }

    answers.forEach(answer => {
      const fieldTitle = fieldTitleMap[answer.field.id] || '';
      const fieldType = answer.type;
      const value = this.extractAnswerValue(answer);

      // Match by field title (human-readable) or by answer type
      if (fieldType === 'email' || fieldTitle.includes('email')) {
        contactData.email = answer.email || value;
      } else if (
        fieldTitle.includes('first name') ||
        fieldTitle.includes('firstname') ||
        fieldTitle.includes('prénom') ||
        fieldTitle.includes('prenume') ||
        fieldTitle === 'first'
      ) {
        contactData.firstName = answer.text || value;
      } else if (
        fieldTitle.includes('last name') ||
        fieldTitle.includes('lastname') ||
        fieldTitle.includes('surname') ||
        fieldTitle.includes('family name') ||
        fieldTitle.includes('nom') ||
        fieldTitle.includes('nume') ||
        fieldTitle === 'last'
      ) {
        contactData.lastName = answer.text || value;
      } else if (
        fieldTitle.includes('full name') ||
        fieldTitle.includes('your name') ||
        fieldTitle.includes('nume complet') ||
        fieldTitle === 'name'
      ) {
        // Handle full name field - split into first/last
        const fullName = (answer.text || value || '').trim();
        const parts = fullName.split(/\s+/);
        if (!contactData.firstName) contactData.firstName = parts[0] || '';
        if (!contactData.lastName) contactData.lastName = parts.slice(1).join(' ') || '';
      } else if (fieldType === 'phone_number' || fieldTitle.includes('phone') || fieldTitle.includes('telefon')) {
        contactData.phone = answer.phone_number || value;
      } else if (
        fieldTitle.includes('company') ||
        fieldTitle.includes('organization') ||
        fieldTitle.includes('companie') ||
        fieldTitle.includes('firma')
      ) {
        contactData.companyName = answer.text || value;
      } else if (
        fieldTitle.includes('job') ||
        fieldTitle.includes('title') ||
        fieldTitle.includes('position') ||
        fieldTitle.includes('role') ||
        fieldTitle.includes('functie')
      ) {
        contactData.jobTitle = answer.text || value;
      } else {
        // Store other fields as custom fields using the readable title
        const customKey = fieldTitleMap[answer.field.id] || answer.field.ref;
        contactData.customFields[customKey] = value;
      }
    });

    return contactData;
  }

  /**
   * Extract answer value based on type
   */
  private extractAnswerValue(answer: TypeformAnswer): any {
    switch (answer.type) {
      case 'text':
      case 'email':
        return answer.text || answer.email;
      case 'number':
        return answer.number;
      case 'boolean':
        return answer.boolean;
      case 'choice':
        return answer.choice?.label;
      case 'choices':
        return answer.choices?.labels;
      case 'date':
        return answer.date;
      case 'url':
        return answer.url;
      case 'file_url':
        return answer.file_url;
      case 'payment':
        return {
          amount: answer.payment?.amount,
          currency: answer.payment?.currency,
        };
      default:
        return answer.text;
    }
  }

  /**
   * Get form-specific config from integration's typeformForms array
   */
  private getFormConfig(integration: any, formId: string): any | null {
    const forms = integration.config?.typeformForms;
    if (!Array.isArray(forms)) return null;
    return forms.find((f: any) => f.formId === formId && f.enabled !== false) || null;
  }

  /**
   * Get all connected forms for an integration
   */
  async getConnectedForms(integration: any): Promise<any[]> {
    const forms = integration.config?.typeformForms || [];
    const apiKey = integration.credentials?.apiToken || integration.credentials?.apiKey || integration.config?.apiToken || integration.config?.apiKey;

    // Enrich form data with Typeform API details if possible
    const enrichedForms = [];
    for (const form of forms) {
      let formDetails: any = { ...form };
      if (apiKey && form.formId) {
        try {
          const details = await this.getFormDetails(form.formId, apiKey);
          formDetails.title = details.title;
          formDetails.responseCount = details._links?.display || undefined;
        } catch {
          // API call failed, use stored data
        }
      }
      enrichedForms.push(formDetails);
    }
    return enrichedForms;
  }

  /**
   * Add a form to the integration config
   */
  async addForm(integration: any, formId: string, config?: {
    name?: string;
    pipelineId?: string;
    pipelineStageId?: string;
    whatsApp?: any;
  }): Promise<any> {
    const apiKey = integration.credentials?.apiToken || integration.credentials?.apiKey || integration.config?.apiToken || integration.config?.apiKey;

    // Verify form exists
    let formTitle = config?.name || formId;
    if (apiKey) {
      try {
        const details = await this.getFormDetails(formId, apiKey);
        formTitle = details.title || formTitle;
      } catch {
        // Form might still be valid, continue
      }
    }

    const forms = integration.config?.typeformForms || [];
    const existing = forms.find((f: any) => f.formId === formId);
    if (existing) {
      throw new BadRequestException(`Form ${formId} is already connected`);
    }

    const newForm = {
      formId,
      name: formTitle,
      enabled: true,
      webhookRegistered: false,
      pipelineId: config?.pipelineId,
      pipelineStageId: config?.pipelineStageId,
      whatsApp: config?.whatsApp,
      addedAt: new Date().toISOString(),
    };

    // Register webhook with Typeform API
    const appUrl = integration.config?.backendUrl || this.configService.get<string>('APP_URL') || '';
    const webhookUrl = appUrl ? `${appUrl}/api/v1/integrations/webhooks/${integration.id}` : '';
    if (apiKey && webhookUrl) {
      try {
        const tag = `slackcrm_${formId.substring(0, 8)}`;
        await this.createWebhook(formId, webhookUrl, tag, apiKey);
        newForm.webhookRegistered = true;
        this.logger.log(`Webhook registered for form ${formId}`);
      } catch (err) {
        this.logger.warn(`Failed to auto-register webhook for form ${formId}: ${err.message}`);
      }
    }

    forms.push(newForm);
    return { form: newForm, forms };
  }

  /**
   * Remove a form from the integration config
   */
  async removeForm(integration: any, formId: string): Promise<any[]> {
    const forms = integration.config?.typeformForms || [];
    const formIndex = forms.findIndex((f: any) => f.formId === formId);
    if (formIndex === -1) {
      throw new BadRequestException(`Form ${formId} not found`);
    }

    const apiKey = integration.credentials?.apiToken || integration.credentials?.apiKey || integration.config?.apiToken || integration.config?.apiKey;

    // Try to unregister webhook
    if (apiKey && forms[formIndex].webhookRegistered) {
      try {
        const tag = `slackcrm_${formId.substring(0, 8)}`;
        await this.deleteWebhook(formId, tag, apiKey);
      } catch {
        // Webhook might already be deleted
      }
    }

    forms.splice(formIndex, 1);
    return forms;
  }

  /**
   * Update form-specific config
   */
  updateFormConfig(integration: any, formId: string, config: any): any[] {
    const forms = integration.config?.typeformForms || [];
    const form = forms.find((f: any) => f.formId === formId);
    if (!form) {
      throw new BadRequestException(`Form ${formId} not found`);
    }
    Object.assign(form, config);
    return forms;
  }

  /**
   * Get form details from Typeform API
   */
  async getFormDetails(formId: string, apiKey?: string): Promise<any> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      const response = await axios.get(`${this.TYPEFORM_API_URL}/forms/${formId}`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get form details: ${error.message}`);
      throw new BadRequestException('Failed to fetch Typeform details');
    }
  }

  /**
   * Get form responses
   */
  async getFormResponses(formId: string, limit: number = 25, apiKey?: string): Promise<any> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      const response = await axios.get(`${this.TYPEFORM_API_URL}/forms/${formId}/responses`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
        params: {
          page_size: limit,
        },
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get form responses: ${error.message}`);
      throw new BadRequestException('Failed to fetch Typeform responses');
    }
  }

  /**
   * Create webhook subscription
   */
  async createWebhook(formId: string, webhookUrl: string, tag?: string, apiKey?: string): Promise<any> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      const response = await axios.put(
        `${this.TYPEFORM_API_URL}/forms/${formId}/webhooks/${tag || 'slackcrm'}`,
        {
          url: webhookUrl,
          enabled: true,
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create webhook: ${error.message}`);
      throw new BadRequestException('Failed to create Typeform webhook');
    }
  }

  /**
   * Delete webhook subscription
   */
  async deleteWebhook(formId: string, tag: string = 'slackcrm', apiKey?: string): Promise<void> {
    try {
      const key = apiKey || this.configService.get<string>('TYPEFORM_API_KEY');
      await axios.delete(`${this.TYPEFORM_API_URL}/forms/${formId}/webhooks/${tag}`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      this.logger.log(`Webhook deleted for form ${formId}`);
    } catch (error) {
      this.logger.error(`Failed to delete webhook: ${error.message}`);
      throw new BadRequestException('Failed to delete Typeform webhook');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(signature: string, payload: string, secret: string): boolean {
    // Typeform doesn't currently support webhook signatures
    // This is a placeholder for future implementation
    return true;
  }
}
