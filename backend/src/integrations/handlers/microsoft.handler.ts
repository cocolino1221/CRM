import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class MicrosoftIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(MicrosoftIntegrationHandler.name);
  private readonly graphApiUrl = 'https://graph.microsoft.com/v1.0';

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const response = await this.httpService.axiosRef.get(`${this.graphApiUrl}/me`, {
        headers: { Authorization: `Bearer ${integration.credentials?.accessToken}` },
      });
      return {
        success: true,
        message: 'Connected to Microsoft 365 successfully',
        data: {
          displayName: response.data.displayName,
          mail: response.data.mail,
          userPrincipalName: response.data.userPrincipalName,
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Microsoft 365 connection failed: ${error.message}`
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const accessToken = integration.credentials?.accessToken;
      if (!accessToken) {
        throw new Error('Access token not found');
      }

      const syncType = options?.type || 'contacts';
      let records = [];

      switch (syncType) {
        case 'calendar':
          records = await this.syncCalendar(accessToken, options);
          break;
        case 'contacts':
          records = await this.syncContacts(accessToken, options);
          break;
        case 'emails':
          records = await this.syncEmails(accessToken, options);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore: false, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`Microsoft 365 sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing Microsoft 365 webhook');

    // Microsoft Graph sends change notifications
    if (payload.value && Array.isArray(payload.value)) {
      const events = payload.value.map((notification: any) => ({
        type: `microsoft.${notification.resourceData?.['@odata.type']?.split('.').pop() || 'change'}`,
        changeType: notification.changeType,
        resourceId: notification.resourceData?.id,
        subscriptionId: notification.subscriptionId,
        timestamp: notification.resourceData?.lastModifiedDateTime || new Date(),
      }));

      return { events };
    }

    // Validation token for subscription creation
    if (payload.validationToken) {
      return { validationToken: payload.validationToken };
    }

    return { event: 'microsoft.webhook', data: payload };
  }

  /**
   * Sync calendar events from Microsoft 365
   */
  private async syncCalendar(accessToken: string, options?: any): Promise<any[]> {
    try {
      const params: any = {
        $top: options?.limit || 100,
        $orderby: 'start/dateTime',
      };

      // Get upcoming events by default
      if (!options?.includeAll) {
        const startDateTime = new Date().toISOString();
        params.$filter = `start/dateTime ge '${startDateTime}'`;
      }

      const response = await this.httpService.axiosRef.get(
        `${this.graphApiUrl}/me/calendar/events`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      return response.data.value.map((event: any) => ({
        id: event.id,
        subject: event.subject,
        body: event.bodyPreview,
        start: event.start.dateTime,
        end: event.end.dateTime,
        location: event.location?.displayName,
        attendees: event.attendees?.map((a: any) => ({
          email: a.emailAddress.address,
          name: a.emailAddress.name,
          status: a.status.response,
        })),
        organizer: {
          email: event.organizer.emailAddress.address,
          name: event.organizer.emailAddress.name,
        },
        isOnline: event.isOnlineMeeting,
        onlineUrl: event.onlineMeetingUrl,
        createdAt: event.createdDateTime,
        updatedAt: event.lastModifiedDateTime,
      }));
    } catch (error) {
      this.logger.error(`Calendar sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync contacts from Microsoft 365
   */
  private async syncContacts(accessToken: string, options?: any): Promise<any[]> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.graphApiUrl}/me/contacts`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            $top: options?.limit || 100,
            $orderby: 'displayName',
          },
        }
      );

      return response.data.value.map((contact: any) => ({
        id: contact.id,
        displayName: contact.displayName,
        givenName: contact.givenName,
        surname: contact.surname,
        emailAddresses: contact.emailAddresses?.map((e: any) => e.address) || [],
        businessPhones: contact.businessPhones || [],
        mobilePhone: contact.mobilePhone,
        homePhones: contact.homePhones || [],
        jobTitle: contact.jobTitle,
        companyName: contact.companyName,
        department: contact.department,
        officeLocation: contact.officeLocation,
        businessAddress: contact.businessAddress,
        homeAddress: contact.homeAddress,
        birthday: contact.birthday,
        personalNotes: contact.personalNotes,
        createdAt: contact.createdDateTime,
        updatedAt: contact.lastModifiedDateTime,
      }));
    } catch (error) {
      this.logger.error(`Contacts sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync emails from Microsoft 365
   */
  private async syncEmails(accessToken: string, options?: any): Promise<any[]> {
    try {
      const params: any = {
        $top: options?.limit || 50,
        $orderby: 'receivedDateTime desc',
      };

      // Filter by folder if specified
      const folder = options?.folder || 'inbox';
      const endpoint = folder === 'inbox'
        ? `${this.graphApiUrl}/me/mailFolders/inbox/messages`
        : `${this.graphApiUrl}/me/messages`;

      // Filter unread emails if specified
      if (options?.unreadOnly) {
        params.$filter = 'isRead eq false';
      }

      const response = await this.httpService.axiosRef.get(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      });

      return response.data.value.map((email: any) => ({
        id: email.id,
        conversationId: email.conversationId,
        subject: email.subject,
        bodyPreview: email.bodyPreview,
        body: email.body?.content,
        bodyContentType: email.body?.contentType,
        from: {
          email: email.from?.emailAddress.address,
          name: email.from?.emailAddress.name,
        },
        toRecipients: email.toRecipients?.map((r: any) => ({
          email: r.emailAddress.address,
          name: r.emailAddress.name,
        })),
        ccRecipients: email.ccRecipients?.map((r: any) => ({
          email: r.emailAddress.address,
          name: r.emailAddress.name,
        })),
        isRead: email.isRead,
        isDraft: email.isDraft,
        hasAttachments: email.hasAttachments,
        importance: email.importance,
        receivedAt: email.receivedDateTime,
        sentAt: email.sentDateTime,
      }));
    } catch (error) {
      this.logger.error(`Email sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a calendar event
   */
  async createCalendarEvent(
    accessToken: string,
    eventData: {
      subject: string;
      body?: string;
      start: string;
      end: string;
      location?: string;
      attendees?: Array<{ email: string; name?: string }>;
      isOnlineMeeting?: boolean;
    }
  ): Promise<any> {
    try {
      const event = {
        subject: eventData.subject,
        body: {
          contentType: 'HTML',
          content: eventData.body || '',
        },
        start: {
          dateTime: eventData.start,
          timeZone: 'UTC',
        },
        end: {
          dateTime: eventData.end,
          timeZone: 'UTC',
        },
        location: eventData.location ? { displayName: eventData.location } : undefined,
        attendees: eventData.attendees?.map(a => ({
          emailAddress: {
            address: a.email,
            name: a.name || a.email,
          },
          type: 'required',
        })),
        isOnlineMeeting: eventData.isOnlineMeeting || false,
      };

      const response = await this.httpService.axiosRef.post(
        `${this.graphApiUrl}/me/calendar/events`,
        event,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create calendar event: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send an email
   */
  async sendEmail(
    accessToken: string,
    emailData: {
      subject: string;
      body: string;
      to: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>;
      importance?: 'low' | 'normal' | 'high';
    }
  ): Promise<any> {
    try {
      const message = {
        message: {
          subject: emailData.subject,
          body: {
            contentType: 'HTML',
            content: emailData.body,
          },
          toRecipients: emailData.to.map(t => ({
            emailAddress: {
              address: t.email,
              name: t.name || t.email,
            },
          })),
          ccRecipients: emailData.cc?.map(c => ({
            emailAddress: {
              address: c.email,
              name: c.name || c.email,
            },
          })),
          importance: emailData.importance || 'normal',
        },
        saveToSentItems: true,
      };

      await this.httpService.axiosRef.post(
        `${this.graphApiUrl}/me/sendMail`,
        message,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true, message: 'Email sent successfully' };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }
}