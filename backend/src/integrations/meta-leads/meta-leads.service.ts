import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, ContactSource, ContactStatus } from '../../database/entities/contact.entity';
import { Integration, IntegrationType } from '../../database/entities/integration.entity';
import { Pipeline } from '../../database/entities/pipeline.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { ContactsService } from '../../contacts/contacts.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

export interface MetaLeadFormConfig {
  formId: string;
  pageId: string;
  name?: string;
  enabled?: boolean;
  pipelineId?: string;
  pipelineStageId?: string;
  whatsApp?: {
    enabled?: boolean;
    templateName?: string;
    templateLanguage?: string;
    includeNameParam?: boolean;
    welcomeMessage?: string;
  };
  // Mirrors LandingPage.funnelId from the webinar-lead-funnel design
  // (docs/superpowers/specs/2026-08-23-webinar-lead-funnel-design.md, Phase 1
  // — not implemented in this codebase as of this writing: no Funnel /
  // FunnelEnrollment entities, no flow-arming entry point on WhatsAppService
  // exist yet). Stored now so the field round-trips through the form config
  // editor without a later migration; actual enrollment is a documented
  // no-op until Phase 1 lands — see the TODO in handleLeadgenChange() below
  // for the exact wiring this needs once it does.
  funnelId?: string;
  addedAt?: string;
}

interface LeadgenChangeValue {
  leadgen_id?: string;
  form_id?: string;
  page_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  created_time?: number;
}

interface ExtractedLeadData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  companyName?: string;
  customFields: Record<string, any>;
}

/**
 * Handles Meta (Facebook/Instagram) Lead Ads: the `leadgen` webhook change
 * only carries a leadgen_id — the actual answers must be fetched separately
 * via Graph API. Deliberately does not depend on MetaMessagingService (which
 * owns the webhook HTTP endpoint) to avoid a circular module dependency;
 * Page-token resolution is duplicated here in a minimal form instead.
 */
@Injectable()
export class MetaLeadsService {
  private readonly logger = new Logger(MetaLeadsService.name);
  private readonly facebookApiUrl = 'https://graph.facebook.com/v23.0';
  // Same rationale as MetaMessagingService.recentMessageIds: Meta retries
  // webhook deliveries, sometimes near-simultaneously. Synchronous mark
  // before any await closes the race a DB check alone can't catch.
  private readonly recentLeadIds = new Map<string, number>();
  private static readonly RECENT_ID_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Pipeline)
    private readonly pipelineRepository: Repository<Pipeline>,
    @InjectRepository(PipelineStage)
    private readonly pipelineStageRepository: Repository<PipelineStage>,
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => WhatsAppService))
    private readonly whatsAppService: WhatsAppService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Entry point from the shared Meta webhook controller. Fire-and-forget. */
  async processWebhookPayload(payload: any): Promise<void> {
    const entryList = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entryList) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== 'leadgen') continue;
        try {
          await this.handleLeadgenChange(change.value || {}, entry);
        } catch (error: any) {
          this.logger.error(`Failed to process leadgen change: ${error?.message || error}`);
        }
      }
    }
  }

  private async handleLeadgenChange(value: LeadgenChangeValue, entry: any): Promise<void> {
    const leadgenId = String(value?.leadgen_id || '').trim();
    const formId = String(value?.form_id || '').trim();
    const pageId = String(value?.page_id || entry?.id || '').trim();

    if (!leadgenId || !pageId) {
      this.logger.warn(`Leadgen webhook missing leadgen_id/page_id: ${JSON.stringify(value)}`);
      return;
    }

    if (!this.markLeadSeen(leadgenId)) {
      return;
    }

    const resolved = await this.findFacebookIntegrationByPageId(pageId);
    if (!resolved) {
      this.logger.warn(`Leadgen webhook for unrecognized page ${pageId} (leadgen_id=${leadgenId})`);
      return;
    }

    const { integration, pageAccessToken, pageName } = resolved;
    const workspaceId = integration.workspaceId;

    if (await this.leadAlreadyProcessed(workspaceId, leadgenId)) {
      return;
    }

    const lead = await this.fetchLead(leadgenId, pageAccessToken);
    if (!lead) return;

    const resolvedFormId = formId || String(lead.form_id || '');
    const contactData = this.mapFieldDataToContact(lead.field_data || []);
    this.applyNameFallbacks(contactData);

    const formConfig = this.getFormConfig(integration, resolvedFormId);
    if (formConfig && formConfig.enabled === false) {
      this.logger.log(`Leadgen form ${resolvedFormId} is disabled for integration ${integration.id} — skipping`);
      return;
    }

    let pipelineId = formConfig?.pipelineId || integration.config?.metaLeadsPipeline?.pipelineId;
    let pipelineStageId = formConfig?.pipelineStageId || integration.config?.metaLeadsPipeline?.pipelineStageId;

    if (!pipelineId) {
      const defaultPipeline = await this.pipelineRepository.findOne({
        where: { workspaceId, isDefault: true },
        relations: ['stages'],
      });
      if (defaultPipeline) {
        pipelineId = defaultPipeline.id;
        if (!pipelineStageId && defaultPipeline.stages?.length) {
          pipelineStageId = defaultPipeline.stages[0].id;
        }
      }
    }

    const formName = formConfig?.name || resolvedFormId || 'Facebook Lead Ads';
    const email = contactData.email || `lead_${leadgenId}@meta.leadads.placeholder.invalid`;

    try {
      const contact = await this.contactsService.create(workspaceId, {
        // applyNameFallbacks() guarantees these are set before we get here.
        firstName: contactData.firstName!,
        lastName: contactData.lastName!,
        email,
        phone: contactData.phone,
        jobTitle: contactData.jobTitle,
        status: ContactStatus.LEAD,
        source: ContactSource.FACEBOOK,
        customFields: {
          ...contactData.customFields,
          metaLeadgenId: leadgenId,
          metaLeadMetadata: {
            leadgenId,
            formId: resolvedFormId,
            formName,
            pageId,
            pageName,
            adId: lead.ad_id,
            adName: lead.ad_name,
            campaignId: lead.campaign_id,
            campaignName: lead.campaign_name,
            isOrganic: lead.is_organic,
            platform: lead.platform,
            createdTime: lead.created_time,
          },
        },
        tags: ['meta-lead-ads', formName],
        pipelineId,
        pipelineStageId,
        notes: `Lead created from Facebook/Instagram Lead Ads: ${formName}`,
      });

      this.logger.log(`Contact created from Meta Lead Ads: ${contact.id} (form=${formName})`);

      await this.maybeSendWhatsAppWelcome(formConfig, integration, contactData);

      // TODO(webinar-lead-funnel Phase 1): once Funnel/FunnelEnrollment
      // entities and the flow-arming entry point on WhatsAppService exist
      // (see docs/superpowers/specs/2026-08-23-webinar-lead-funnel-design.md),
      // enroll here when formConfig?.funnelId is set — same pattern as
      // landing-pages.service.ts#submitPublic: create a FunnelEnrollment for
      // (formConfig.funnelId, contact.id), then call the flow-arming entry
      // point with the funnel's flowId. Deliberately not wired yet: Phase 1
      // does not exist in this codebase, so there is nothing correct to call.
      this.maybeLogPendingFunnelEnrollment(formConfig, contact.id);

      try {
        await this.notificationsService.create(workspaceId, {
          type: NotificationType.LEAD,
          title: 'New lead from Facebook/Instagram Lead Ads',
          message: `${[contactData.firstName, contactData.lastName].filter(Boolean).join(' ') || 'A new lead'} submitted "${formName}".`,
          userId: integration.userId,
          link: '/contacts',
          metadata: { contactId: contact.id, leadgenId, formId: resolvedFormId, source: 'meta-lead-ads' },
        });
      } catch (error: any) {
        this.logger.warn(`Lead Ads notification failed: ${error?.message || 'unknown error'}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to create contact from Meta Lead Ads (leadgen_id=${leadgenId}): ${error?.message || error}`);
    }
  }

  private async maybeSendWhatsAppWelcome(
    formConfig: MetaLeadFormConfig | null,
    integration: Integration,
    contactData: ExtractedLeadData,
  ): Promise<void> {
    const whatsAppConfig = formConfig?.whatsApp?.enabled
      ? formConfig.whatsApp
      : integration.config?.metaLeadsWhatsApp;
    if (!contactData.phone || !whatsAppConfig?.enabled) return;

    try {
      const phone = contactData.phone.replace(/[^0-9]/g, '');
      if (phone.length < 10) return;

      if (whatsAppConfig.templateName) {
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
      } else if (whatsAppConfig.welcomeMessage) {
        const msg = whatsAppConfig.welcomeMessage.replace('{{firstName}}', contactData.firstName || 'there');
        await this.whatsAppService.sendTextMessage(phone, msg);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to send WhatsApp to Meta Lead Ads lead: ${error?.message || error}`);
    }
  }

  // See the TODO in handleLeadgenChange(). Once Phase 1 lands, replace this
  // with the real enrollment call; until then it only surfaces a clear,
  // actionable log line so a funnelId configured on a form isn't silently
  // ignored.
  private maybeLogPendingFunnelEnrollment(formConfig: MetaLeadFormConfig | null, contactId: string): void {
    if (!formConfig?.funnelId) return;
    this.logger.warn(
      `Lead form ${formConfig.formId} has funnelId=${formConfig.funnelId} configured, but funnel enrollment ` +
        `is not wired up yet (webinar-lead-funnel Phase 1 not implemented) — contact ${contactId} was created ` +
        `but NOT enrolled in any funnel.`,
    );
  }

  private async fetchLead(leadgenId: string, pageAccessToken: string): Promise<any | null> {
    try {
      const response = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/${leadgenId}`, {
        params: {
          fields:
            'id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,created_time,is_organic,platform',
          access_token: pageAccessToken,
        },
        timeout: 15000,
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch lead ${leadgenId}: ${error?.response?.data?.error?.message || error?.message}`,
      );
      return null;
    }
  }

  private mapFieldDataToContact(fieldData: Array<{ name: string; values?: string[] }>): ExtractedLeadData {
    const result: ExtractedLeadData = { customFields: {} };

    for (const field of fieldData || []) {
      const key = String(field?.name || '').trim().toLowerCase();
      const value = Array.isArray(field?.values) ? field.values.join(', ') : '';
      if (!key) continue;

      switch (key) {
        case 'email':
          result.email = value;
          break;
        case 'first_name':
          result.firstName = value;
          break;
        case 'last_name':
          result.lastName = value;
          break;
        case 'full_name': {
          const parts = value.trim().split(/\s+/);
          if (!result.firstName) result.firstName = parts[0] || '';
          if (!result.lastName) result.lastName = parts.slice(1).join(' ');
          break;
        }
        case 'phone_number':
          result.phone = value;
          break;
        case 'company_name':
          result.companyName = value;
          break;
        case 'job_title':
          result.jobTitle = value;
          break;
        default:
          result.customFields[field.name] = value;
      }
    }

    return result;
  }

  private applyNameFallbacks(contactData: ExtractedLeadData): void {
    contactData.firstName = (contactData.firstName || '').trim();
    contactData.lastName = (contactData.lastName || '').trim();

    if (contactData.firstName && !contactData.lastName && contactData.firstName.includes(' ')) {
      const parts = contactData.firstName.split(/\s+/);
      contactData.firstName = parts[0] || '';
      contactData.lastName = parts.slice(1).join(' ');
    }

    if (!contactData.firstName && contactData.email) {
      const localPart = String(contactData.email).split('@')[0] || '';
      const tokens = localPart.split(/[._-]+/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length > 0) {
        const [first, ...rest] = tokens;
        const toTitle = (v: string) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
        contactData.firstName = toTitle(first);
        if (!contactData.lastName && rest.length > 0) {
          contactData.lastName = rest.map(toTitle).join(' ');
        }
      }
    }

    if (!contactData.firstName) contactData.firstName = 'Lead';
    if (!contactData.lastName) contactData.lastName = '';
  }

  private markLeadSeen(leadgenId: string): boolean {
    const now = Date.now();
    if (this.recentLeadIds.has(leadgenId)) return false;
    this.recentLeadIds.set(leadgenId, now);
    if (this.recentLeadIds.size > 5000) {
      for (const [id, ts] of this.recentLeadIds) {
        if (now - ts > MetaLeadsService.RECENT_ID_TTL_MS) this.recentLeadIds.delete(id);
      }
    }
    return true;
  }

  private async leadAlreadyProcessed(workspaceId: string, leadgenId: string): Promise<boolean> {
    return this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere("contact.customFields->>'metaLeadgenId' = :leadgenId", { leadgenId })
      .getExists();
  }

  // ---------------- Page/token resolution (kept local — see class doc) ----------------

  private async findFacebookIntegrationByPageId(
    pageId: string,
  ): Promise<{ integration: Integration; pageAccessToken: string; pageName?: string } | null> {
    const rows = await this.integrationRepository.find({ where: { type: IntegrationType.API } });
    const candidates = rows.filter(
      (i) => String(i.config?.provider || i.externalId || '').trim().toLowerCase() === 'facebook',
    );

    let integration = candidates.find((i) => String(i.config?.pageId || '') === pageId) || null;
    if (!integration) return null;

    return this.ensurePageAccessToken(integration, pageId);
  }

  private async ensurePageAccessToken(
    integration: Integration,
    expectedPageId?: string,
  ): Promise<{ integration: Integration; pageAccessToken: string; pageName?: string } | null> {
    const cachedPageId = String(integration.config?.pageId || '').trim();
    const cachedToken = String(integration.credentials?.pageAccessToken || '').trim();
    if (cachedToken && (!expectedPageId || cachedPageId === expectedPageId)) {
      return { integration, pageAccessToken: cachedToken, pageName: integration.config?.pageName };
    }

    const userAccessToken = String(integration.credentials?.accessToken || '').trim();
    if (!userAccessToken) return null;

    const response = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/me/accounts`, {
      params: { fields: 'id,name,access_token', access_token: userAccessToken },
      timeout: 15000,
    });

    const pages = Array.isArray(response.data?.data) ? response.data.data : [];
    const page = expectedPageId
      ? pages.find((p: any) => String(p?.id || '') === expectedPageId)
      : pages.find((p: any) => String(p?.id || '') === cachedPageId) || pages[0];
    if (!page?.access_token) return null;

    integration.config = {
      ...(integration.config || {}),
      pageId: String(page.id),
      pageName: String(page.name || integration.name || 'Facebook Page'),
    };
    integration.credentials = {
      ...(integration.credentials || {}),
      pageAccessToken: String(page.access_token),
    };
    await this.integrationRepository.save(integration);

    return {
      integration,
      pageAccessToken: String(page.access_token),
      pageName: integration.config.pageName,
    };
  }

  // ---------------- Form config management (used by MetaLeadsController) ----------------

  getFormConfig(integration: Integration, formId: string): MetaLeadFormConfig | null {
    const forms = integration.config?.metaLeadForms;
    if (!Array.isArray(forms)) return null;
    return forms.find((f: MetaLeadFormConfig) => f.formId === formId) || null;
  }

  async addForm(
    integration: Integration,
    formId: string,
    pageId: string,
    config?: { name?: string; pipelineId?: string; pipelineStageId?: string; whatsApp?: any; funnelId?: string },
  ): Promise<{ form: MetaLeadFormConfig; forms: MetaLeadFormConfig[] }> {
    const forms: MetaLeadFormConfig[] = integration.config?.metaLeadForms || [];
    if (forms.find((f) => f.formId === formId)) {
      throw new BadRequestException(`Form ${formId} is already connected`);
    }

    const newForm: MetaLeadFormConfig = {
      formId,
      pageId,
      name: config?.name || formId,
      enabled: true,
      pipelineId: config?.pipelineId,
      pipelineStageId: config?.pipelineStageId,
      whatsApp: config?.whatsApp,
      funnelId: config?.funnelId,
      addedAt: new Date().toISOString(),
    };

    forms.push(newForm);
    return { form: newForm, forms };
  }

  removeForm(integration: Integration, formId: string): MetaLeadFormConfig[] {
    const forms: MetaLeadFormConfig[] = integration.config?.metaLeadForms || [];
    const index = forms.findIndex((f) => f.formId === formId);
    if (index === -1) throw new NotFoundException(`Form ${formId} not found`);
    forms.splice(index, 1);
    return forms;
  }

  updateFormConfig(integration: Integration, formId: string, config: Partial<MetaLeadFormConfig>): MetaLeadFormConfig[] {
    const forms: MetaLeadFormConfig[] = integration.config?.metaLeadForms || [];
    const form = forms.find((f) => f.formId === formId);
    if (!form) throw new NotFoundException(`Form ${formId} not found`);
    Object.assign(form, config);
    return forms;
  }

  async listAvailableForms(integration: Integration): Promise<any[]> {
    const pageId = String(integration.config?.pageId || '').trim();
    if (!pageId) throw new BadRequestException('Connect a Facebook Page before listing Lead Ads forms');

    const resolved = await this.ensurePageAccessToken(integration, pageId);
    if (!resolved) throw new BadRequestException('Facebook integration is missing an access token');

    const response = await this.httpService.axiosRef.get(`${this.facebookApiUrl}/${pageId}/leadgen_forms`, {
      params: { fields: 'id,name,status,leads_count', access_token: resolved.pageAccessToken },
      timeout: 15000,
    });

    return Array.isArray(response.data?.data) ? response.data.data : [];
  }

  async subscribePageToLeadgen(integration: Integration): Promise<{ success: boolean }> {
    const pageId = String(integration.config?.pageId || '').trim();
    if (!pageId) throw new BadRequestException('Connect a Facebook Page before subscribing to Lead Ads');

    const resolved = await this.ensurePageAccessToken(integration, pageId);
    if (!resolved) throw new BadRequestException('Facebook integration is missing an access token');

    await this.httpService.axiosRef.post(`${this.facebookApiUrl}/${pageId}/subscribed_apps`, null, {
      params: { subscribed_fields: 'leadgen', access_token: resolved.pageAccessToken },
      timeout: 15000,
    });

    return { success: true };
  }
}
