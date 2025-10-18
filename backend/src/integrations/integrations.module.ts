import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Entities
import {
  Integration,
  IntegrationWebhook,
  IntegrationLog,
  IntegrationType,
} from '../database/entities/integration.entity';
import { Contact } from '../database/entities/contact.entity';
import { Company } from '../database/entities/company.entity';
import { Deal } from '../database/entities/deal.entity';
import { Task } from '../database/entities/task.entity';
import { Activity } from '../database/entities/activity.entity';

// Services
import { IntegrationsService } from './integrations.service';
import { IntegrationRegistry } from './registry/integration.registry';
import { OAuthService } from './auth/oauth.service';
import { WebhookService } from './webhook/webhook.service';
import { SyncService } from './sync/sync.service';

// Controllers
import { IntegrationsController } from './integrations.controller';

// Handlers
import { SlackIntegrationHandler } from './handlers/slack.handler';
import { GoogleIntegrationHandler } from './handlers/google.handler';
import { MicrosoftIntegrationHandler } from './handlers/microsoft.handler';
import { SalesforceIntegrationHandler } from './handlers/salesforce.handler';
import { HubSpotIntegrationHandler } from './handlers/hubspot.handler';
import { ZoomIntegrationHandler } from './handlers/zoom.handler';
import { TypeformIntegrationHandler } from './handlers/typeform.handler';
import { WebhookIntegrationHandler } from './handlers/webhook.handler';
import { ApiIntegrationHandler } from './handlers/api.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Integration,
      IntegrationWebhook,
      IntegrationLog,
      Contact,
      Company,
      Deal,
      Task,
      Activity,
    ]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ScheduleModule,
    EventEmitterModule,
  ],
  controllers: [IntegrationsController],
  providers: [
    // Core services
    IntegrationsService,
    IntegrationRegistry,
    OAuthService,
    WebhookService,
    SyncService,

    // Integration handlers
    SlackIntegrationHandler,
    GoogleIntegrationHandler,
    MicrosoftIntegrationHandler,
    SalesforceIntegrationHandler,
    HubSpotIntegrationHandler,
    ZoomIntegrationHandler,
    TypeformIntegrationHandler,
    WebhookIntegrationHandler,
    ApiIntegrationHandler,

    // Registry initialization
    {
      provide: 'INTEGRATION_HANDLERS',
      useFactory: (
        slack: SlackIntegrationHandler,
        google: GoogleIntegrationHandler,
        microsoft: MicrosoftIntegrationHandler,
        salesforce: SalesforceIntegrationHandler,
        hubspot: HubSpotIntegrationHandler,
        zoom: ZoomIntegrationHandler,
        typeform: TypeformIntegrationHandler,
        webhook: WebhookIntegrationHandler,
        api: ApiIntegrationHandler,
        registry: IntegrationRegistry,
      ) => {
        // Register handlers with the registry
        registry.register(registry.getIntegrationMetadata(IntegrationType.SLACK), slack);
        registry.register(registry.getIntegrationMetadata(IntegrationType.GOOGLE), google);
        registry.register(registry.getIntegrationMetadata(IntegrationType.MICROSOFT), microsoft);
        registry.register(registry.getIntegrationMetadata(IntegrationType.SALESFORCE), salesforce);
        registry.register(registry.getIntegrationMetadata(IntegrationType.HUBSPOT), hubspot);
        registry.register(registry.getIntegrationMetadata(IntegrationType.ZOOM), zoom);
        registry.register(registry.getIntegrationMetadata(IntegrationType.TYPEFORM), typeform);
        registry.register(registry.getIntegrationMetadata(IntegrationType.WEBHOOK), webhook);
        registry.register(registry.getIntegrationMetadata(IntegrationType.API), api);

        return {
          slack,
          google,
          microsoft,
          salesforce,
          hubspot,
          zoom,
          typeform,
          webhook,
          api,
        };
      },
      inject: [
        SlackIntegrationHandler,
        GoogleIntegrationHandler,
        MicrosoftIntegrationHandler,
        SalesforceIntegrationHandler,
        HubSpotIntegrationHandler,
        ZoomIntegrationHandler,
        TypeformIntegrationHandler,
        WebhookIntegrationHandler,
        ApiIntegrationHandler,
        IntegrationRegistry,
      ],
    },
  ],
  exports: [
    IntegrationsService,
    IntegrationRegistry,
    OAuthService,
    WebhookService,
    SyncService,
  ],
})
export class IntegrationsModule {}