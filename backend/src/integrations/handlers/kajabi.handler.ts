import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { IntegrationHandler } from '../registry/integration.registry';
import { Integration } from '../../database/entities/integration.entity';
import { Contact, ContactStatus, ContactSource } from '../../database/entities/contact.entity';
import { ContactsService } from '../../contacts/contacts.service';
import { Pipeline } from '../../database/entities/pipeline.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';

interface KajabiMember {
  id: number;
  email: string;
  name: string;
  created_at: string;
  tags: string[];
  custom_fields: Record<string, any>;
}

interface KajabiWebhookEvent {
  event: string;
  member: KajabiMember;
  offer?: {
    id: number;
    name: string;
    price: number;
  };
}

@Injectable()
export class KajabiIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(KajabiIntegrationHandler.name);
  private readonly baseUrl = 'https://api.kajabi.com';

  constructor(
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => ContactsService))
    private contactsService: ContactsService,
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    @InjectRepository(PipelineStage)
    private pipelineStageRepository: Repository<PipelineStage>,
  ) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const apiKey = integration.credentials?.apiKey;

      if (!apiKey) {
        throw new Error('API key is required');
      }

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/v1/members`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          params: {
            per_page: 1,
          },
        }),
      );

      this.logger.log('Kajabi connection test successful');
      return {
        success: true,
        message: 'Successfully connected to Kajabi',
        data: { status: response.status }
      };
    } catch (error) {
      this.logger.error(`Kajabi connection test failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to connect to Kajabi: ${error.message}`
      };
    }
  }

  async handleWebhook(integration: Integration, payload: KajabiWebhookEvent): Promise<any> {
    this.logger.log(`Handling Kajabi webhook: ${payload.event}`);

    switch (payload.event) {
      case 'member.created':
      case 'member.updated':
        return this.handleMemberEvent(integration, payload);

      case 'offer.purchased':
        return this.handleOfferPurchased(integration, payload);

      case 'assessment.completed':
        return this.handleAssessmentCompleted(integration, payload);

      default:
        this.logger.warn(`Unhandled Kajabi event: ${payload.event}`);
        return { success: true, message: 'Event acknowledged but not handled' };
    }
  }

  async syncData(integration: Integration): Promise<any> {
    this.logger.log('Starting Kajabi members sync');

    const apiKey = integration.credentials?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required');
    }

    try {
      const contacts: Partial<Contact>[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await firstValueFrom(
          this.httpService.get(`${this.baseUrl}/v1/members`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            params: {
              page,
              per_page: 100,
            },
          }),
        );

        const members = response.data.members || [];

        for (const member of members) {
          contacts.push(this.mapMemberToContact(member));
        }

        hasMore = response.data.meta?.has_more || false;
        page++;
      }

      this.logger.log(`Synced ${contacts.length} members from Kajabi`);

      return {
        success: true,
        recordsProcessed: contacts.length,
        recordsCreated: contacts.length,
        contacts,
      };
    } catch (error) {
      this.logger.error(`Kajabi sync failed: ${error.message}`);
      throw new Error(`Failed to sync Kajabi data: ${error.message}`);
    }
  }

  private async handleMemberEvent(integration: Integration, payload: KajabiWebhookEvent): Promise<any> {
    const workspaceId = integration.workspaceId;
    const memberData = payload.member;

    if (!memberData.email) {
      this.logger.warn(`Kajabi webhook missing email - skipping contact creation`);
      return {
        status: 'error',
        message: 'No email found in member data',
      };
    }

    this.logger.log(`Processing Kajabi member: ${memberData.email}`);

    try {
      // Get pipeline configuration from integration config
      const pipelineConfig = integration.config?.kajabiPipeline;
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
          if (!pipelineStageId && defaultPipeline.stages && defaultPipeline.stages.length > 0) {
            pipelineStageId = defaultPipeline.stages[0].id;
          }
        }
      }

      const contactData = this.mapMemberToContact(memberData);

      // Create contact with explicit required fields
      const contact = await this.contactsService.create(workspaceId, {
        firstName: contactData.firstName || 'Unknown',
        lastName: contactData.lastName || '',
        email: contactData.email!,
        phone: contactData.phone,
        jobTitle: contactData.jobTitle,
        status: contactData.status,
        source: contactData.source,
        tags: contactData.tags,
        customFields: contactData.customFields,
        pipelineId,
        pipelineStageId,
        notes: `Lead created from Kajabi`,
      });

      this.logger.log(`Contact created from Kajabi: ${contact.id} (${contact.email})`);

      return {
        status: 'success',
        message: 'Contact created successfully',
        contact: {
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to create contact from Kajabi: ${error.message}`);

      if (error.message?.includes('already exists')) {
        return {
          status: 'duplicate',
          message: 'Contact with this email already exists',
          email: memberData.email,
        };
      }

      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  private async handleOfferPurchased(integration: Integration, payload: KajabiWebhookEvent): Promise<any> {
    const workspaceId = integration.workspaceId;
    const memberData = payload.member;

    if (!memberData.email) {
      this.logger.warn(`Kajabi purchase webhook missing email - skipping`);
      return {
        status: 'error',
        message: 'No email found in member data',
      };
    }

    this.logger.log(`Kajabi member ${memberData.email} purchased ${payload.offer?.name}`);

    try {
      const contactData = this.mapMemberToContact(memberData);

      // Create or update contact with purchase information
      const contact = await this.contactsService.create(workspaceId, {
        firstName: contactData.firstName || 'Unknown',
        lastName: contactData.lastName || '',
        email: contactData.email!,
        phone: contactData.phone,
        jobTitle: contactData.jobTitle,
        status: ContactStatus.CUSTOMER,
        source: contactData.source,
        tags: contactData.tags,
        customFields: {
          ...contactData.customFields,
          lastPurchaseDate: new Date().toISOString(),
          lastPurchasedOffer: payload.offer?.name,
          lastPurchaseAmount: payload.offer?.price,
        },
        notes: `Customer from Kajabi - Purchased: ${payload.offer?.name}`,
      });

      this.logger.log(`Contact updated from Kajabi purchase: ${contact.id} (${contact.email})`);

      return {
        status: 'success',
        message: 'Contact updated with purchase information',
        contact: {
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
        purchase: {
          offer: payload.offer?.name,
          amount: payload.offer?.price,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to update contact from Kajabi purchase: ${error.message}`);

      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  private async handleAssessmentCompleted(integration: Integration, payload: any): Promise<any> {
    const workspaceId = integration.workspaceId;
    const memberData = payload.member;

    if (!memberData.email) {
      this.logger.warn(`Kajabi assessment webhook missing email - skipping`);
      return {
        status: 'error',
        message: 'No email found in member data',
      };
    }

    this.logger.log(`Kajabi member ${memberData.email} completed assessment`);

    try {
      const contactData = this.mapMemberToContact(memberData);

      // Create or update contact with assessment data
      const contact = await this.contactsService.create(workspaceId, {
        firstName: contactData.firstName || 'Unknown',
        lastName: contactData.lastName || '',
        email: contactData.email!,
        phone: contactData.phone,
        jobTitle: contactData.jobTitle,
        status: contactData.status,
        source: contactData.source,
        leadScore: payload.assessment?.score || 0,
        tags: contactData.tags,
        customFields: {
          ...contactData.customFields,
          lastAssessmentDate: new Date().toISOString(),
          assessmentScore: payload.assessment?.score,
        },
        notes: `Lead from Kajabi - Completed assessment`,
      });

      this.logger.log(`Contact updated from Kajabi assessment: ${contact.id} (${contact.email})`);

      return {
        status: 'success',
        message: 'Contact updated with assessment data',
        contact: {
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
        assessment: {
          score: payload.assessment?.score,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to update contact from Kajabi assessment: ${error.message}`);

      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  private mapMemberToContact(member: KajabiMember): Partial<Contact> {
    const [firstName, ...lastNameParts] = member.name?.split(' ') || ['', ''];
    const lastName = lastNameParts.join(' ');

    return {
      firstName: firstName || 'Unknown',
      lastName: lastName || '',
      email: member.email,
      source: ContactSource.KAJABI,
      status: ContactStatus.LEAD,
      tags: member.tags || [],
      customFields: {
        kajabiId: member.id,
        kajabiCreatedAt: member.created_at,
        ...member.custom_fields,
      },
    };
  }

  // Additional helper methods

  async getMembers(integration: Integration, filters?: {
    email?: string;
    tag?: string;
    createdAfter?: Date;
  }): Promise<KajabiMember[]> {
    const apiKey = integration.credentials?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required');
    }

    const params: any = { per_page: 100 };

    if (filters?.email) params.email = filters.email;
    if (filters?.tag) params.tag = filters.tag;
    if (filters?.createdAfter) {
      params.created_after = filters.createdAfter.toISOString();
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/v1/members`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        params,
      }),
    );

    return response.data.members || [];
  }

  async getMemberById(integration: Integration, memberId: number): Promise<KajabiMember> {
    const apiKey = integration.credentials?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required');
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/v1/members/${memberId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }),
    );

    return response.data.member;
  }

  async addTagToMember(integration: Integration, memberId: number, tag: string): Promise<void> {
    const apiKey = integration.credentials?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required');
    }

    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/v1/members/${memberId}/tags`,
        { tag },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    this.logger.log(`Added tag "${tag}" to Kajabi member ${memberId}`);
  }

  async removeTagFromMember(integration: Integration, memberId: number, tag: string): Promise<void> {
    const apiKey = integration.credentials?.apiKey;
    if (!apiKey) {
      throw new Error('API key is required');
    }

    await firstValueFrom(
      this.httpService.delete(`${this.baseUrl}/v1/members/${memberId}/tags/${tag}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }),
    );

    this.logger.log(`Removed tag "${tag}" from Kajabi member ${memberId}`);
  }
}
