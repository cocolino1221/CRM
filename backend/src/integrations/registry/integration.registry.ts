import { Injectable, Logger } from '@nestjs/common';
import { IntegrationType, IntegrationAuthType, Integration } from '../../database/entities/integration.entity';

export interface IntegrationMetadata {
  type: IntegrationType;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  provider: string;
  homepage?: string;
  documentation?: string;
  supportEmail?: string;

  // Authentication
  defaultAuthType: IntegrationAuthType;
  supportedAuthTypes: IntegrationAuthType[];

  // Configuration
  defaultConfig: Record<string, any>;
  configSchema: any; // JSON Schema for validation

  // Capabilities
  defaultPermissions: string[];
  supportedFeatures: string[];

  // API Information
  apiVersion?: string;
  baseUrl?: string;

  // Limits
  rateLimit?: {
    requests: number;
    period: string;
  };

  // Custom properties
  [key: string]: any;
}

export interface IntegrationHandler {
  testConnection(integration: Integration): Promise<{ success: boolean; message?: string; data?: any }>;
  syncData?(integration: Integration, options?: any): Promise<any>;
  handleWebhook?(integration: Integration, payload: any): Promise<any>;
  refreshAuth?(integration: Integration): Promise<any>;
  validateConfig?(config: any): Promise<boolean>;
}

@Injectable()
export class IntegrationRegistry {
  private readonly logger = new Logger(IntegrationRegistry.name);
  private readonly integrations = new Map<IntegrationType, IntegrationMetadata>();
  private readonly handlers = new Map<IntegrationType, IntegrationHandler>();

  constructor() {
    this.initializeIntegrations();
  }

  /**
   * Initialize all supported integrations
   */
  private initializeIntegrations() {
    // Slack Integration
    this.register({
      type: IntegrationType.SLACK,
      name: 'Slack',
      description: 'Connect with Slack workspaces for messaging and collaboration',
      category: 'Communication',
      icon: 'https://cdn.brandfolder.io/5H442O3W/at/pl546j-7le8zk-6gwiyo/Slack_Mark.svg',
      color: '#4A154B',
      provider: 'Slack Technologies',
      homepage: 'https://slack.com',
      documentation: 'https://api.slack.com',
      supportEmail: 'support@slack.com',

      defaultAuthType: IntegrationAuthType.OAUTH2,
      supportedAuthTypes: [IntegrationAuthType.OAUTH2, IntegrationAuthType.WEBHOOK],

      defaultConfig: {
        scopes: ['channels:read', 'chat:write', 'users:read'],
        features: {
          messaging: true,
          channels: true,
          users: true,
          files: true,
        },
        syncFrequency: 'realtime',
        autoSync: true,
      },

      configSchema: {
        type: 'object',
        properties: {
          teamId: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
          features: {
            type: 'object',
            properties: {
              messaging: { type: 'boolean' },
              channels: { type: 'boolean' },
              users: { type: 'boolean' },
              files: { type: 'boolean' },
            },
          },
        },
      },

      defaultPermissions: ['read:channels', 'write:messages', 'read:users'],
      supportedFeatures: ['messaging', 'channels', 'users', 'files', 'commands'],

      apiVersion: '1.0',
      baseUrl: 'https://slack.com/api',

      rateLimit: {
        requests: 100,
        period: 'minute',
      },
    });

    // Google Workspace Integration
    this.register({
      type: IntegrationType.GOOGLE,
      name: 'Google Workspace',
      description: 'Integrate with Gmail, Google Calendar, and Google Drive',
      category: 'Productivity',
      icon: 'https://developers.google.com/identity/images/g-logo.png',
      color: '#4285F4',
      provider: 'Google',
      homepage: 'https://workspace.google.com',
      documentation: 'https://developers.google.com/workspace',

      defaultAuthType: IntegrationAuthType.OAUTH2,
      supportedAuthTypes: [IntegrationAuthType.OAUTH2],

      defaultConfig: {
        scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar'],
        features: {
          email: true,
          calendar: true,
          contacts: true,
          files: true,
        },
        syncFrequency: 'hourly',
        autoSync: true,
      },

      configSchema: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
        },
      },

      defaultPermissions: ['read:email', 'read:calendar', 'read:contacts'],
      supportedFeatures: ['email', 'calendar', 'contacts', 'files'],

      apiVersion: 'v1',
      baseUrl: 'https://www.googleapis.com',
    });

    // Microsoft 365 Integration
    this.register({
      type: IntegrationType.MICROSOFT,
      name: 'Microsoft 365',
      description: 'Connect with Outlook, Teams, and OneDrive',
      category: 'Productivity',
      icon: 'https://img.icons8.com/color/48/000000/microsoft.png',
      color: '#0078D4',
      provider: 'Microsoft',
      homepage: 'https://www.microsoft.com/en-us/microsoft-365',
      documentation: 'https://docs.microsoft.com/en-us/graph',

      defaultAuthType: IntegrationAuthType.OAUTH2,
      supportedAuthTypes: [IntegrationAuthType.OAUTH2],

      defaultConfig: {
        scopes: ['https://graph.microsoft.com/Mail.Read', 'https://graph.microsoft.com/Calendars.Read'],
        features: {
          email: true,
          calendar: true,
          contacts: true,
          files: true,
          teams: true,
        },
        syncFrequency: 'hourly',
        autoSync: true,
      },

      configSchema: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          scopes: { type: 'array', items: { type: 'string' } },
        },
      },

      defaultPermissions: ['read:email', 'read:calendar', 'read:contacts'],
      supportedFeatures: ['email', 'calendar', 'contacts', 'files', 'teams'],

      apiVersion: '1.0',
      baseUrl: 'https://graph.microsoft.com',
    });

    // Salesforce Integration
    this.register({
      type: IntegrationType.SALESFORCE,
      name: 'Salesforce',
      description: 'Sync contacts, deals, and activities with Salesforce CRM',
      category: 'CRM',
      icon: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
      color: '#00A1E0',
      provider: 'Salesforce',
      homepage: 'https://salesforce.com',
      documentation: 'https://developer.salesforce.com',

      defaultAuthType: IntegrationAuthType.OAUTH2,
      supportedAuthTypes: [IntegrationAuthType.OAUTH2, IntegrationAuthType.API_KEY],
      configSchema: {},

      defaultConfig: {
        features: {
          contacts: true,
          deals: true,
          activities: true,
          accounts: true,
        },
        syncFrequency: 'daily',
        syncDirection: 'bidirectional',
        autoSync: true,
        fieldMapping: {
          'contact.email': 'Email',
          'contact.firstName': 'FirstName',
          'contact.lastName': 'LastName',
        },
      },

      defaultPermissions: ['read:contacts', 'write:contacts', 'read:opportunities'],
      supportedFeatures: ['contacts', 'deals', 'activities', 'accounts'],

      apiVersion: '52.0',
      baseUrl: 'https://[instance].salesforce.com/services/data',
    });

    // HubSpot Integration
    this.register({
      type: IntegrationType.HUBSPOT,
      name: 'HubSpot',
      description: 'Connect with HubSpot CRM for contacts, deals, and marketing',
      category: 'CRM',
      icon: 'https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png',
      color: '#FF7A59',
      provider: 'HubSpot',
      homepage: 'https://hubspot.com',
      documentation: 'https://developers.hubspot.com',

      defaultAuthType: IntegrationAuthType.OAUTH2,
      supportedAuthTypes: [IntegrationAuthType.OAUTH2, IntegrationAuthType.API_KEY],
      configSchema: {},

      defaultConfig: {
        features: {
          contacts: true,
          deals: true,
          companies: true,
          activities: true,
        },
        syncFrequency: 'hourly',
        syncDirection: 'bidirectional',
        autoSync: true,
      },

      defaultPermissions: ['read:contacts', 'write:contacts', 'read:deals'],
      supportedFeatures: ['contacts', 'deals', 'companies', 'activities'],

      apiVersion: '3',
      baseUrl: 'https://api.hubapi.com',
    });

    // Zoom Integration
    this.register({
      type: IntegrationType.ZOOM,
      name: 'Zoom',
      description: 'Schedule and manage Zoom meetings',
      category: 'Communication',
      icon: 'https://zoom.us/static/6.3.35/image/favicon.ico',
      color: '#2D8CFF',
      provider: 'Zoom',
      homepage: 'https://zoom.us',
      documentation: 'https://marketplace.zoom.us/docs/api-reference/zoom-api',

      defaultAuthType: IntegrationAuthType.OAUTH2,
      supportedAuthTypes: [IntegrationAuthType.OAUTH2, IntegrationAuthType.JWT],
      configSchema: {},

      defaultConfig: {
        features: {
          meetings: true,
          webinars: true,
          recordings: true,
        },
        syncFrequency: 'realtime',
        autoSync: true,
      },

      defaultPermissions: ['read:meetings', 'write:meetings'],
      supportedFeatures: ['meetings', 'webinars', 'recordings'],

      apiVersion: '2',
      baseUrl: 'https://api.zoom.us/v2',
    });

    // Typeform Integration
    this.register({
      type: IntegrationType.TYPEFORM,
      name: 'Typeform',
      description: 'Collect form submissions and survey responses from Typeform',
      category: 'Forms & Surveys',
      icon: 'https://images.typeform.com/images/QvjZ4wDfqJZg',
      color: '#262627',
      provider: 'Typeform',
      homepage: 'https://typeform.com',
      documentation: 'https://developer.typeform.com',
      supportEmail: 'support@typeform.com',

      defaultAuthType: IntegrationAuthType.API_KEY,
      supportedAuthTypes: [IntegrationAuthType.API_KEY, IntegrationAuthType.WEBHOOK],

      defaultConfig: {
        features: {
          forms: true,
          responses: true,
          webhooks: true,
          analytics: true,
        },
        syncFrequency: 'realtime',
        syncDirection: 'inbound',
        autoSync: true,
      },

      configSchema: {
        type: 'object',
        properties: {
          formIds: { type: 'array', items: { type: 'string' } },
          webhookTag: { type: 'string' },
          autoCreateContacts: { type: 'boolean' },
        },
      },

      defaultPermissions: ['read:forms', 'read:responses', 'manage:webhooks'],
      supportedFeatures: ['forms', 'responses', 'webhooks', 'analytics'],

      apiVersion: '1',
      baseUrl: 'https://api.typeform.com',

      rateLimit: {
        requests: 100,
        period: 'minute',
      },
    });

    // Generic Webhook Integration
    this.register({
      type: IntegrationType.WEBHOOK,
      name: 'Webhook',
      description: 'Receive data from any service via webhooks',
      category: 'Developer',
      icon: 'https://img.icons8.com/ios/50/000000/webhook.png',
      color: '#6B7280',
      provider: 'SlackCRM',

      defaultAuthType: IntegrationAuthType.WEBHOOK,
      supportedAuthTypes: [IntegrationAuthType.WEBHOOK, IntegrationAuthType.API_KEY],

      defaultConfig: {
        events: ['*'],
        verifySignature: true,
        responseFormat: 'json',
      },

      defaultPermissions: ['receive:webhooks'],
      supportedFeatures: ['webhooks', 'realtime'],

      configSchema: {
        type: 'object',
        properties: {
          events: { type: 'array', items: { type: 'string' } },
          secret: { type: 'string' },
          verifySignature: { type: 'boolean' },
        },
      },
    });

    // Custom API Integration
    this.register({
      type: IntegrationType.API,
      name: 'Custom API',
      description: 'Connect to any REST API service',
      category: 'Developer',
      icon: 'https://img.icons8.com/ios/50/000000/api.png',
      color: '#10B981',
      provider: 'SlackCRM',

      defaultAuthType: IntegrationAuthType.API_KEY,
      supportedAuthTypes: [
        IntegrationAuthType.API_KEY,
        IntegrationAuthType.OAUTH2,
        IntegrationAuthType.BASIC_AUTH,
        IntegrationAuthType.JWT,
      ],

      defaultConfig: {
        syncFrequency: 'manual',
        autoSync: false,
        headers: {
          'Content-Type': 'application/json',
        },
      },

      defaultPermissions: ['api:call'],
      supportedFeatures: ['api', 'sync', 'webhooks'],

      configSchema: {
        type: 'object',
        properties: {
          baseUrl: { type: 'string', format: 'uri' },
          headers: { type: 'object' },
          timeout: { type: 'number', minimum: 1000 },
        },
        required: ['baseUrl'],
      },
    });

    this.logger.log(`Initialized ${this.integrations.size} integrations`);
  }

  /**
   * Register an integration
   */
  register(metadata: IntegrationMetadata, handler?: IntegrationHandler): void {
    this.integrations.set(metadata.type, metadata);

    if (handler) {
      this.handlers.set(metadata.type, handler);
    }
  }

  /**
   * Get all available integrations
   */
  getAvailableIntegrations(): IntegrationMetadata[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get integrations by category
   */
  getIntegrationsByCategory(): Record<string, IntegrationMetadata[]> {
    const integrations = this.getAvailableIntegrations();

    return integrations.reduce((acc, integration) => {
      const category = integration.category || 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(integration);
      return acc;
    }, {} as Record<string, IntegrationMetadata[]>);
  }

  /**
   * Get integration metadata by type
   */
  getIntegrationMetadata(type: IntegrationType): IntegrationMetadata | undefined {
    return this.integrations.get(type);
  }

  /**
   * Get integration handler
   */
  getIntegrationHandler(type: IntegrationType): IntegrationHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Check if integration type is supported
   */
  isSupported(type: IntegrationType): boolean {
    return this.integrations.has(type);
  }

  /**
   * Search integrations
   */
  searchIntegrations(query: string): IntegrationMetadata[] {
    const searchTerm = query.toLowerCase();

    return this.getAvailableIntegrations().filter(integration =>
      integration.name.toLowerCase().includes(searchTerm) ||
      integration.description.toLowerCase().includes(searchTerm) ||
      integration.category.toLowerCase().includes(searchTerm) ||
      integration.provider.toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Get featured integrations
   */
  getFeaturedIntegrations(): IntegrationMetadata[] {
    // Return popular/recommended integrations
    const featured = [
      IntegrationType.SLACK,
      IntegrationType.GOOGLE,
      IntegrationType.MICROSOFT,
      IntegrationType.SALESFORCE,
      IntegrationType.HUBSPOT,
    ];

    return featured
      .map(type => this.getIntegrationMetadata(type))
      .filter(Boolean) as IntegrationMetadata[];
  }

  /**
   * Validate integration configuration
   */
  async validateConfig(type: IntegrationType, config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const metadata = this.getIntegrationMetadata(type);
    if (!metadata) {
      return { valid: false, errors: ['Integration type not supported'] };
    }

    const handler = this.getIntegrationHandler(type);
    if (handler?.validateConfig) {
      try {
        const isValid = await handler.validateConfig(config);
        return { valid: isValid };
      } catch (error) {
        return { valid: false, errors: [error.message] };
      }
    }

    // Basic validation using schema if available
    if (metadata.configSchema) {
      // TODO: Implement JSON schema validation
      return { valid: true };
    }

    return { valid: true };
  }
}