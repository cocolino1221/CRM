import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class HubSpotIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(HubSpotIntegrationHandler.name);
  private readonly apiUrl = 'https://api.hubapi.com';

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/oauth/v1/access-tokens/${integration.credentials?.accessToken}`
      );
      return {
        success: true,
        message: 'Connected to HubSpot successfully',
        data: {
          hubId: response.data.hub_id,
          hubDomain: response.data.hub_domain,
          user: response.data.user,
          scopes: response.data.scopes,
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `HubSpot connection failed: ${error.message}`
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
      let hasMore = false;
      let nextCursor = null;

      switch (syncType) {
        case 'contacts':
          const contactsResult = await this.syncContacts(accessToken, options);
          records = contactsResult.records;
          hasMore = contactsResult.hasMore;
          nextCursor = contactsResult.nextCursor;
          break;
        case 'deals':
          const dealsResult = await this.syncDeals(accessToken, options);
          records = dealsResult.records;
          hasMore = dealsResult.hasMore;
          nextCursor = dealsResult.nextCursor;
          break;
        case 'companies':
          const companiesResult = await this.syncCompanies(accessToken, options);
          records = companiesResult.records;
          hasMore = companiesResult.hasMore;
          nextCursor = companiesResult.nextCursor;
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore, nextCursor, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`HubSpot sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing HubSpot webhook');

    // HubSpot sends multiple events in an array
    if (Array.isArray(payload)) {
      const events = payload.map((event: any) => ({
        type: `hubspot.${event.subscriptionType}`,
        objectType: event.objectType,
        objectId: event.objectId,
        propertyName: event.propertyName,
        propertyValue: event.propertyValue,
        changeSource: event.changeSource,
        eventId: event.eventId,
        occurredAt: new Date(event.occurredAt),
      }));

      return { events };
    }

    return { event: 'hubspot.webhook', data: payload };
  }

  /**
   * Sync contacts from HubSpot
   */
  private async syncContacts(accessToken: string, options?: any): Promise<any> {
    try {
      const params: any = {
        limit: options?.limit || 100,
        properties: [
          'firstname',
          'lastname',
          'email',
          'phone',
          'company',
          'jobtitle',
          'lifecyclestage',
          'hs_lead_status',
          'createdate',
          'lastmodifieddate',
        ].join(','),
      };

      if (options?.after) {
        params.after = options.after;
      }

      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/crm/v3/objects/contacts`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      const contacts = response.data.results.map((contact: any) => ({
        id: contact.id,
        firstName: contact.properties.firstname,
        lastName: contact.properties.lastname,
        email: contact.properties.email,
        phone: contact.properties.phone,
        company: contact.properties.company,
        jobTitle: contact.properties.jobtitle,
        lifecycleStage: contact.properties.lifecyclestage,
        leadStatus: contact.properties.hs_lead_status,
        createdAt: contact.properties.createdate,
        updatedAt: contact.properties.lastmodifieddate,
      }));

      return {
        records: contacts,
        hasMore: !!response.data.paging?.next?.after,
        nextCursor: response.data.paging?.next?.after,
      };
    } catch (error) {
      this.logger.error(`Contacts sync failed: ${error.message}`);
      return { records: [], hasMore: false };
    }
  }

  /**
   * Sync deals from HubSpot
   */
  private async syncDeals(accessToken: string, options?: any): Promise<any> {
    try {
      const params: any = {
        limit: options?.limit || 100,
        properties: [
          'dealname',
          'amount',
          'dealstage',
          'pipeline',
          'closedate',
          'createdate',
          'hs_lastmodifieddate',
          'hubspot_owner_id',
        ].join(','),
        associations: 'contacts,companies',
      };

      if (options?.after) {
        params.after = options.after;
      }

      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/crm/v3/objects/deals`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      const deals = response.data.results.map((deal: any) => ({
        id: deal.id,
        name: deal.properties.dealname,
        amount: parseFloat(deal.properties.amount) || 0,
        stage: deal.properties.dealstage,
        pipeline: deal.properties.pipeline,
        closeDate: deal.properties.closedate,
        ownerId: deal.properties.hubspot_owner_id,
        createdAt: deal.properties.createdate,
        updatedAt: deal.properties.hs_lastmodifieddate,
        associations: deal.associations,
      }));

      return {
        records: deals,
        hasMore: !!response.data.paging?.next?.after,
        nextCursor: response.data.paging?.next?.after,
      };
    } catch (error) {
      this.logger.error(`Deals sync failed: ${error.message}`);
      return { records: [], hasMore: false };
    }
  }

  /**
   * Sync companies from HubSpot
   */
  private async syncCompanies(accessToken: string, options?: any): Promise<any> {
    try {
      const params: any = {
        limit: options?.limit || 100,
        properties: [
          'name',
          'domain',
          'industry',
          'phone',
          'city',
          'state',
          'country',
          'numberofemployees',
          'annualrevenue',
          'createdate',
          'hs_lastmodifieddate',
        ].join(','),
      };

      if (options?.after) {
        params.after = options.after;
      }

      const response = await this.httpService.axiosRef.get(
        `${this.apiUrl}/crm/v3/objects/companies`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params,
        }
      );

      const companies = response.data.results.map((company: any) => ({
        id: company.id,
        name: company.properties.name,
        domain: company.properties.domain,
        industry: company.properties.industry,
        phone: company.properties.phone,
        city: company.properties.city,
        state: company.properties.state,
        country: company.properties.country,
        employeeCount: parseInt(company.properties.numberofemployees) || 0,
        annualRevenue: parseFloat(company.properties.annualrevenue) || 0,
        createdAt: company.properties.createdate,
        updatedAt: company.properties.hs_lastmodifieddate,
      }));

      return {
        records: companies,
        hasMore: !!response.data.paging?.next?.after,
        nextCursor: response.data.paging?.next?.after,
      };
    } catch (error) {
      this.logger.error(`Companies sync failed: ${error.message}`);
      return { records: [], hasMore: false };
    }
  }

  /**
   * Create a contact in HubSpot
   */
  async createContact(
    accessToken: string,
    contactData: {
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      company?: string;
      jobTitle?: string;
    }
  ): Promise<any> {
    try {
      const properties: any = {
        email: contactData.email,
      };

      if (contactData.firstName) properties.firstname = contactData.firstName;
      if (contactData.lastName) properties.lastname = contactData.lastName;
      if (contactData.phone) properties.phone = contactData.phone;
      if (contactData.company) properties.company = contactData.company;
      if (contactData.jobTitle) properties.jobtitle = contactData.jobTitle;

      const response = await this.httpService.axiosRef.post(
        `${this.apiUrl}/crm/v3/objects/contacts`,
        { properties },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a contact in HubSpot
   */
  async updateContact(
    accessToken: string,
    contactId: string,
    updates: Record<string, any>
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.patch(
        `${this.apiUrl}/crm/v3/objects/contacts/${contactId}`,
        { properties: updates },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update contact: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a deal in HubSpot
   */
  async createDeal(
    accessToken: string,
    dealData: {
      name: string;
      amount?: number;
      stage?: string;
      pipeline?: string;
      closeDate?: string;
    }
  ): Promise<any> {
    try {
      const properties: any = {
        dealname: dealData.name,
      };

      if (dealData.amount) properties.amount = dealData.amount.toString();
      if (dealData.stage) properties.dealstage = dealData.stage;
      if (dealData.pipeline) properties.pipeline = dealData.pipeline;
      if (dealData.closeDate) properties.closedate = dealData.closeDate;

      const response = await this.httpService.axiosRef.post(
        `${this.apiUrl}/crm/v3/objects/deals`,
        { properties },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create deal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Associate a contact with a deal
   */
  async associateContactWithDeal(
    accessToken: string,
    contactId: string,
    dealId: string
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.put(
        `${this.apiUrl}/crm/v3/objects/contacts/${contactId}/associations/deals/${dealId}/3`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to associate contact with deal: ${error.message}`);
      throw error;
    }
  }
}