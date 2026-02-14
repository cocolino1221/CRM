import { Module, OnModuleInit } from '@nestjs/common';
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
import { Pipeline } from '../database/entities/pipeline.entity';
import { PipelineStage } from '../database/entities/pipeline-stage.entity';
import { User } from '../database/entities/user.entity';

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
import { PandaDocIntegrationHandler } from './handlers/pandadoc.handler';
import { DocuSignIntegrationHandler } from './handlers/docusign.handler';
import { CalendlyIntegrationHandler } from './handlers/calendly.handler';
import { KajabiIntegrationHandler } from './handlers/kajabi.handler';
import { WebhookIntegrationHandler } from './handlers/webhook.handler';
import { ApiIntegrationHandler } from './handlers/api.handler';
import { WhatsAppIntegrationHandler } from './handlers/whatsapp.handler';

// Modules
import { ContactsModule } from '../contacts/contacts.module';
import { QueueModule } from '../queues/queue.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

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
      Pipeline,
      PipelineStage,
      User,
    ]),
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ScheduleModule,
    EventEmitterModule,
    ContactsModule, // Import ContactsModule to access ContactsService
    QueueModule, // Import QueueModule to enable async import jobs
    WhatsAppModule, // Import WhatsAppModule for auto-send on new leads
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
    PandaDocIntegrationHandler,
    DocuSignIntegrationHandler,
    CalendlyIntegrationHandler,
    KajabiIntegrationHandler,
    WebhookIntegrationHandler,
    ApiIntegrationHandler,
    WhatsAppIntegrationHandler,

    // Registry initialization
    // Registry initialization
    // Handlers are registered in onModuleInit
  ],
  exports: [
    IntegrationsService,
    IntegrationRegistry,
    OAuthService,
    WebhookService,
    SyncService,
  ],
})
export class IntegrationsModule implements OnModuleInit {
  constructor(
    private registry: IntegrationRegistry,
    private slack: SlackIntegrationHandler,
    private google: GoogleIntegrationHandler,
    private microsoft: MicrosoftIntegrationHandler,
    private salesforce: SalesforceIntegrationHandler,
    private hubspot: HubSpotIntegrationHandler,
    private zoom: ZoomIntegrationHandler,
    private typeform: TypeformIntegrationHandler,
    private pandadoc: PandaDocIntegrationHandler,
    private docusign: DocuSignIntegrationHandler,
    private calendly: CalendlyIntegrationHandler,
    private kajabi: KajabiIntegrationHandler,
    private webhook: WebhookIntegrationHandler,
    private api: ApiIntegrationHandler,
    private whatsapp: WhatsAppIntegrationHandler,
  ) { }

  onModuleInit() {
    // Register handlers with the registry
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.SLACK), this.slack);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.GOOGLE), this.google);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.MICROSOFT), this.microsoft);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.SALESFORCE), this.salesforce);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.HUBSPOT), this.hubspot);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.ZOOM), this.zoom);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.TYPEFORM), this.typeform);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.PANDADOC), this.pandadoc);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.DOCUSIGN), this.docusign);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.CALENDLY), this.calendly);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.KAJABI), this.kajabi);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.WEBHOOK), this.webhook);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.API), this.api);
    this.registry.register(this.registry.getIntegrationMetadata(IntegrationType.WHATSAPP), this.whatsapp);
  }
}