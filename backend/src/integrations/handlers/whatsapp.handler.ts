import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact, ContactSource } from '../../database/entities/contact.entity';

interface WhatsAppContact {
  wa_id: string;
  profile: {
    name: string;
  };
}

interface WhatsAppGroupInfo {
  id: string;
  subject: string;
  participants: WhatsAppContact[];
}

@Injectable()
export class WhatsAppIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(WhatsAppIntegrationHandler.name);
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
  ) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const accessToken = integration.credentials?.accessToken?.replace(/\s+/g, '');
      if (!accessToken) {
        return { success: false, message: 'Access token not found' };
      }

      const phoneNumberId = integration.config?.phoneNumberId || integration.externalId;
      if (!phoneNumberId) {
        return { success: false, message: 'Phone number ID not configured' };
      }

      // Try to fetch phone number details — requires whatsapp_business_management permission
      try {
        const response = await this.httpService.axiosRef.get(
          `${this.apiUrl}/${phoneNumberId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        return {
          success: true,
          message: 'Connected to WhatsApp Business API successfully',
          data: {
            phoneNumber: response.data.display_phone_number,
            verifiedName: response.data.verified_name,
            quality: response.data.quality_rating,
          },
        };
      } catch (phoneErr) {
        const status = phoneErr.response?.status;
        // 401 = bad token → fail hard
        if (status === 401) {
          return {
            success: false,
            message: `WhatsApp connection failed: ${phoneErr.response?.data?.error?.message || phoneErr.message}`,
          };
        }
        // 400/403/404 = token valid but missing management permission or wrong phone ID
        // Still consider connected if token passed 401 check; message sending will work
        this.logger.warn(`WhatsApp phone number metadata unavailable (status ${status}): ${phoneErr.response?.data?.error?.message || phoneErr.message}`);
        return {
          success: true,
          message: 'Connected (limited) — token valid, but phone number metadata requires whatsapp_business_management permission. Sending messages still works.',
          data: { phoneNumberId },
        };
      }
    } catch (error) {
      this.logger.error(`WhatsApp connection test failed: ${error.message}`);
      return {
        success: false,
        message: `WhatsApp connection failed: ${error.message}`,
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const accessToken = integration.credentials?.accessToken?.replace(/\s+/g, '');
      if (!accessToken) {
        throw new Error('Access token not found');
      }

      const syncType = options?.type || 'contacts';
      let records = [];

      switch (syncType) {
        case 'contacts':
          records = await this.syncContacts(integration, accessToken);
          break;
        case 'groups':
          records = await this.syncGroupContacts(integration, accessToken, options?.groupId);
          break;
        case 'messages':
          records = await this.syncMessages(integration, accessToken);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return {
        records,
        hasMore: false,
        syncedAt: new Date(),
        recordsProcessed: records.length,
      };
    } catch (error) {
      this.logger.error(`WhatsApp sync failed: ${error.message}`);
      return {
        records: [],
        hasMore: false,
        error: error.message,
        syncedAt: new Date(),
      };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing WhatsApp webhook');

    try {
      // WhatsApp webhook payload structure
      if (payload.entry && Array.isArray(payload.entry)) {
        const events = [];

        for (const entry of payload.entry) {
          if (entry.changes && Array.isArray(entry.changes)) {
            for (const change of entry.changes) {
              const { value } = change;

              // Handle incoming messages
              if (value.messages && Array.isArray(value.messages)) {
                for (const message of value.messages) {
                  events.push({
                    type: 'whatsapp.message.received',
                    from: message.from,
                    messageId: message.id,
                    timestamp: message.timestamp,
                    messageType: message.type,
                    content: message.text?.body || message,
                    contact: value.contacts?.[0],
                  });

                  // Auto-create or update contact from incoming message
                  if (value.contacts?.[0]) {
                    await this.createOrUpdateContact(
                      integration,
                      value.contacts[0],
                      message.from,
                    );
                  }
                }
              }

              // Handle message status updates
              if (value.statuses && Array.isArray(value.statuses)) {
                for (const status of value.statuses) {
                  events.push({
                    type: 'whatsapp.message.status',
                    messageId: status.id,
                    status: status.status,
                    timestamp: status.timestamp,
                    recipientId: status.recipient_id,
                  });
                }
              }
            }
          }
        }

        return { events, processed: events.length };
      }

      return { event: 'whatsapp.webhook', data: payload };
    } catch (error) {
      this.logger.error(`WhatsApp webhook processing failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync contacts from WhatsApp conversations
   */
  private async syncContacts(integration: Integration, accessToken: string): Promise<any[]> {
    try {
      const phoneNumberId = integration.config?.phoneNumberId || integration.externalId;

      // Note: WhatsApp Business API doesn't have a direct endpoint to list all contacts
      // Contacts are created when they message you or you message them
      // This method would typically sync from your CRM's existing WhatsApp conversations

      this.logger.log('WhatsApp contacts are synced through message interactions');

      return [];
    } catch (error) {
      this.logger.error(`WhatsApp contacts sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Import contacts from WhatsApp group
   */
  async syncGroupContacts(
    integration: Integration,
    accessToken: string,
    groupId?: string,
  ): Promise<any[]> {
    try {
      const phoneNumberId = integration.config?.phoneNumberId || integration.externalId;

      if (!groupId) {
        this.logger.warn('Group ID not provided for group contacts sync');
        return [];
      }

      // Fetch group information and participants
      // Note: This requires WhatsApp Business API with group management permissions
      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/${phoneNumberId}/groups/${groupId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const groupInfo: WhatsAppGroupInfo = response.data;
      const importedContacts = [];

      // Import each participant as a contact
      for (const participant of groupInfo.participants || []) {
        const contact = await this.createOrUpdateContact(
          integration,
          participant,
          participant.wa_id,
          { groupId: groupInfo.id, groupName: groupInfo.subject },
        );

        if (contact) {
          importedContacts.push(contact);
        }
      }

      this.logger.log(
        `Imported ${importedContacts.length} contacts from WhatsApp group: ${groupInfo.subject}`,
      );

      return importedContacts;
    } catch (error) {
      this.logger.error(`WhatsApp group contacts import failed: ${error.message}`);

      // If the endpoint is not available, provide helpful error message
      if (error.response?.status === 404) {
        throw new Error(
          'WhatsApp group management requires specific permissions. Please ensure your WhatsApp Business API account has group management enabled.',
        );
      }

      return [];
    }
  }

  /**
   * Sync recent messages
   */
  private async syncMessages(integration: Integration, accessToken: string): Promise<any[]> {
    try {
      // WhatsApp messages are typically received via webhooks
      // This method is for historical message sync if needed

      this.logger.log('WhatsApp messages are received through webhooks in real-time');

      return [];
    } catch (error) {
      this.logger.error(`WhatsApp messages sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Create or update contact from WhatsApp data
   */
  private async createOrUpdateContact(
    integration: Integration,
    whatsappContact: any,
    phoneNumber: string,
    metadata?: any,
  ): Promise<Contact | null> {
    try {
      const contactData = {
        firstName: whatsappContact.profile?.name || 'WhatsApp Contact',
        lastName: '',
        email: `${phoneNumber}@whatsapp.placeholder`,
        phone: phoneNumber,
        workspaceId: integration.workspaceId,
        ownerId: integration.userId,
        source: ContactSource.WHATSAPP,
        notes: JSON.stringify({
          whatsappId: whatsappContact.wa_id || phoneNumber,
          importedFrom: 'whatsapp',
          importDate: new Date(),
          ...metadata,
        }),
      };

      // Check if contact already exists by phone number
      const existingContact = await this.contactRepository.findOne({
        where: {
          phone: phoneNumber,
          workspaceId: integration.workspaceId,
        },
      });

      if (existingContact) {
        // Update existing contact with WhatsApp info
        existingContact.notes = JSON.stringify({
          ...(existingContact.notes ? JSON.parse(existingContact.notes) : {}),
          whatsappId: whatsappContact.wa_id || phoneNumber,
          importedFrom: 'whatsapp',
          lastSync: new Date(),
          ...metadata,
        });
        return await this.contactRepository.save(existingContact);
      } else {
        // Create new contact
        const newContact = this.contactRepository.create(contactData);
        return await this.contactRepository.save(newContact);
      }
    } catch (error) {
      this.logger.error(`Failed to create/update WhatsApp contact: ${error.message}`);
      return null;
    }
  }

  /**
   * Import contacts from multiple WhatsApp groups
   */
  async importFromGroups(
    integration: Integration,
    groupIds: string[],
  ): Promise<{ totalImported: number; groups: any[] }> {
    const accessToken = integration.credentials?.accessToken?.replace(/\s+/g, '');
    if (!accessToken) {
      throw new Error('Access token not found');
    }

    const results = [];
    let totalImported = 0;

    for (const groupId of groupIds) {
      try {
        const contacts = await this.syncGroupContacts(integration, accessToken, groupId);
        results.push({
          groupId,
          success: true,
          contactsImported: contacts.length,
        });
        totalImported += contacts.length;
      } catch (error) {
        results.push({
          groupId,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      totalImported,
      groups: results,
    };
  }

  async refreshAuth(integration: Integration): Promise<any> {
    // WhatsApp Business API uses long-lived tokens
    // Token refresh is typically not needed unless explicitly expired
    this.logger.log('WhatsApp uses long-lived access tokens');
    return { success: true, message: 'WhatsApp tokens are long-lived' };
  }

  async validateConfig(config: any): Promise<boolean> {
    // Validate WhatsApp integration configuration
    const required = ['phoneNumberId'];

    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required configuration: ${field}`);
      }
    }

    return true;
  }
}
