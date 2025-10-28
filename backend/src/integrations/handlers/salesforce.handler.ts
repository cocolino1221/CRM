import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Integration } from '../../database/entities/integration.entity';
import { IntegrationHandler } from '../registry/integration.registry';

@Injectable()
export class SalesforceIntegrationHandler implements IntegrationHandler {
  private readonly logger = new Logger(SalesforceIntegrationHandler.name);
  private readonly apiVersion = 'v58.0';

  constructor(private httpService: HttpService) {}

  async testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }> {
    try {
      const instanceUrl = integration.config?.instanceUrl || 'https://login.salesforce.com';
      const response = await this.httpService.axiosRef.get(
        `${instanceUrl}/services/data/${this.apiVersion}/`,
        {
          headers: { Authorization: `Bearer ${integration.credentials?.accessToken}` },
        }
      );
      return {
        success: true,
        message: 'Connected to Salesforce successfully',
        data: {
          instanceUrl,
          version: this.apiVersion,
          identity: response.data.identity,
        }
      };
    } catch (error) {
      return {
        success: false,
        message: `Salesforce connection failed: ${error.message}`
      };
    }
  }

  async syncData(integration: Integration, options?: any): Promise<any> {
    try {
      const accessToken = integration.credentials?.accessToken;
      const instanceUrl = integration.config?.instanceUrl;

      if (!accessToken || !instanceUrl) {
        throw new Error('Access token or instance URL not found');
      }

      const syncType = options?.type || 'leads';
      let records = [];

      switch (syncType) {
        case 'leads':
          records = await this.syncLeads(instanceUrl, accessToken, options);
          break;
        case 'contacts':
          records = await this.syncContacts(instanceUrl, accessToken, options);
          break;
        case 'accounts':
          records = await this.syncAccounts(instanceUrl, accessToken, options);
          break;
        case 'opportunities':
          records = await this.syncOpportunities(instanceUrl, accessToken, options);
          break;
        default:
          throw new Error(`Unsupported sync type: ${syncType}`);
      }

      return { records, hasMore: false, syncedAt: new Date() };
    } catch (error) {
      this.logger.error(`Salesforce sync failed: ${error.message}`);
      return { records: [], hasMore: false, error: error.message };
    }
  }

  async handleWebhook(integration: Integration, payload: any): Promise<any> {
    this.logger.log('Processing Salesforce webhook');

    // Salesforce Outbound Messages or Platform Events
    if (payload.notifications || payload.sObject) {
      const events = (payload.notifications || [payload]).map((notification: any) => ({
        type: `salesforce.${notification.sObject?.attributes?.type || 'change'}`,
        objectId: notification.Id || notification.sObject?.Id,
        objectType: notification.sObject?.attributes?.type,
        data: notification.sObject,
        timestamp: new Date(),
      }));

      return { events };
    }

    return { event: 'salesforce.webhook', data: payload };
  }

  /**
   * Sync leads from Salesforce
   */
  private async syncLeads(instanceUrl: string, accessToken: string, options?: any): Promise<any[]> {
    try {
      const limit = options?.limit || 100;
      const query = `SELECT Id, FirstName, LastName, Email, Phone, Company, Status, LeadSource, CreatedDate, LastModifiedDate FROM Lead ORDER BY CreatedDate DESC LIMIT ${limit}`;

      const response = await this.httpService.axiosRef.get(
        `${instanceUrl}/services/data/${this.apiVersion}/query`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { q: query },
        }
      );

      return response.data.records.map((lead: any) => ({
        id: lead.Id,
        firstName: lead.FirstName,
        lastName: lead.LastName,
        email: lead.Email,
        phone: lead.Phone,
        company: lead.Company,
        status: lead.Status,
        source: lead.LeadSource,
        createdAt: lead.CreatedDate,
        updatedAt: lead.LastModifiedDate,
      }));
    } catch (error) {
      this.logger.error(`Leads sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync contacts from Salesforce
   */
  private async syncContacts(instanceUrl: string, accessToken: string, options?: any): Promise<any[]> {
    try {
      const limit = options?.limit || 100;
      const query = `SELECT Id, FirstName, LastName, Email, Phone, Title, AccountId, Account.Name, CreatedDate, LastModifiedDate FROM Contact ORDER BY CreatedDate DESC LIMIT ${limit}`;

      const response = await this.httpService.axiosRef.get(
        `${instanceUrl}/services/data/${this.apiVersion}/query`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { q: query },
        }
      );

      return response.data.records.map((contact: any) => ({
        id: contact.Id,
        firstName: contact.FirstName,
        lastName: contact.LastName,
        email: contact.Email,
        phone: contact.Phone,
        title: contact.Title,
        accountId: contact.AccountId,
        accountName: contact.Account?.Name,
        createdAt: contact.CreatedDate,
        updatedAt: contact.LastModifiedDate,
      }));
    } catch (error) {
      this.logger.error(`Contacts sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync accounts from Salesforce
   */
  private async syncAccounts(instanceUrl: string, accessToken: string, options?: any): Promise<any[]> {
    try {
      const limit = options?.limit || 100;
      const query = `SELECT Id, Name, Website, Industry, Phone, BillingCity, BillingState, BillingCountry, NumberOfEmployees, AnnualRevenue, CreatedDate, LastModifiedDate FROM Account ORDER BY CreatedDate DESC LIMIT ${limit}`;

      const response = await this.httpService.axiosRef.get(
        `${instanceUrl}/services/data/${this.apiVersion}/query`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { q: query },
        }
      );

      return response.data.records.map((account: any) => ({
        id: account.Id,
        name: account.Name,
        website: account.Website,
        industry: account.Industry,
        phone: account.Phone,
        city: account.BillingCity,
        state: account.BillingState,
        country: account.BillingCountry,
        employeeCount: account.NumberOfEmployees,
        annualRevenue: account.AnnualRevenue,
        createdAt: account.CreatedDate,
        updatedAt: account.LastModifiedDate,
      }));
    } catch (error) {
      this.logger.error(`Accounts sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync opportunities from Salesforce
   */
  private async syncOpportunities(instanceUrl: string, accessToken: string, options?: any): Promise<any[]> {
    try {
      const limit = options?.limit || 100;
      const query = `SELECT Id, Name, Amount, StageName, CloseDate, Probability, AccountId, Account.Name, OwnerId, Owner.Name, CreatedDate, LastModifiedDate FROM Opportunity ORDER BY CreatedDate DESC LIMIT ${limit}`;

      const response = await this.httpService.axiosRef.get(
        `${instanceUrl}/services/data/${this.apiVersion}/query`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { q: query },
        }
      );

      return response.data.records.map((opportunity: any) => ({
        id: opportunity.Id,
        name: opportunity.Name,
        amount: opportunity.Amount,
        stage: opportunity.StageName,
        closeDate: opportunity.CloseDate,
        probability: opportunity.Probability,
        accountId: opportunity.AccountId,
        accountName: opportunity.Account?.Name,
        ownerId: opportunity.OwnerId,
        ownerName: opportunity.Owner?.Name,
        createdAt: opportunity.CreatedDate,
        updatedAt: opportunity.LastModifiedDate,
      }));
    } catch (error) {
      this.logger.error(`Opportunities sync failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Create a lead in Salesforce
   */
  async createLead(
    instanceUrl: string,
    accessToken: string,
    leadData: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      company: string;
      status?: string;
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${instanceUrl}/services/data/${this.apiVersion}/sobjects/Lead`,
        {
          FirstName: leadData.firstName,
          LastName: leadData.lastName,
          Email: leadData.email,
          Phone: leadData.phone,
          Company: leadData.company,
          Status: leadData.status || 'Open - Not Contacted',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create lead: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update a lead in Salesforce
   */
  async updateLead(
    instanceUrl: string,
    accessToken: string,
    leadId: string,
    updates: Record<string, any>
  ): Promise<any> {
    try {
      await this.httpService.axiosRef.patch(
        `${instanceUrl}/services/data/${this.apiVersion}/sobjects/Lead/${leadId}`,
        updates,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true, id: leadId };
    } catch (error) {
      this.logger.error(`Failed to update lead: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create an opportunity in Salesforce
   */
  async createOpportunity(
    instanceUrl: string,
    accessToken: string,
    opportunityData: {
      name: string;
      amount?: number;
      stage: string;
      closeDate: string;
      accountId?: string;
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${instanceUrl}/services/data/${this.apiVersion}/sobjects/Opportunity`,
        {
          Name: opportunityData.name,
          Amount: opportunityData.amount,
          StageName: opportunityData.stage,
          CloseDate: opportunityData.closeDate,
          AccountId: opportunityData.accountId,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create opportunity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Convert lead to contact/opportunity
   */
  async convertLead(
    instanceUrl: string,
    accessToken: string,
    leadId: string,
    options?: {
      createOpportunity?: boolean;
      opportunityName?: string;
    }
  ): Promise<any> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${instanceUrl}/services/data/${this.apiVersion}/sobjects/Lead/${leadId}/convert`,
        {
          convertedStatus: 'Qualified',
          doNotCreateOpportunity: !options?.createOpportunity,
          opportunityName: options?.opportunityName,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to convert lead: ${error.message}`);
      throw error;
    }
  }
}