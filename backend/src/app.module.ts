import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import AppDataSource from './database/data-source';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ContactsModule } from './contacts/contacts.module';
import { DealsModule } from './deals/deals.module';
import { TasksModule } from './tasks/tasks.module';
import { CompaniesModule } from './companies/companies.module';
import { ActivitiesModule } from './activities/activities.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { WhatsAppModule } from './integrations/whatsapp/whatsapp.module';
import { WhatsAppFollowupModule } from './integrations/whatsapp/whatsapp-followup.module';
import { MetaMessagingModule } from './integrations/meta-messaging/meta-messaging.module';
import { AudioLibraryModule } from './integrations/audio-library/audio-library.module';
import { GoogleSheetsModule } from './integrations/google-sheets/google-sheets.module';
import { SmartBillModule } from './smartbill/smartbill.module';
import { QueueModule } from './queues/queue.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './email/email.module';
import { PipelineModule } from './pipelines/pipeline.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EventsModule } from './events/events.module';
import { MeetingReminderModule } from './events/meeting-reminder.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { DocumentsModule } from './documents/documents.module';
import { FormsModule } from './forms/forms.module';
import { LandingPagesModule } from './landing-pages/landing-pages.module';
import { FunnelsModule } from './funnels/funnels.module';
import { AIModule } from './ai/ai.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { UploadModule } from './upload/upload.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
import { CampaignSchedulerModule } from './scheduler/campaign-scheduler.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import authConfig from './config/auth.config';
import { validationSchema } from './config/env.validation';

/**
 * Main application module
 * Configures all core modules, database, security, and infrastructure
 */
@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      load: [databaseConfig, redisConfig, authConfig],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Database configuration
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('database.url');

        // If using DATABASE_URL (Neon, Supabase, etc.)
        if (url) {
          return {
            type: 'postgres',
            url,
            ssl: configService.get('database.ssl'),
            synchronize: configService.get<boolean>('database.synchronize'),
            logging: configService.get<boolean>('database.logging'),
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
            autoLoadEntities: true,
            extra: {
              max: configService.get<number>('database.maxConnections'),
              connectionTimeoutMillis: configService.get<number>('database.connectionTimeout'),
            },
          };
        }

        // Otherwise use individual connection parameters
        return {
          type: 'postgres',
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.name'),
          ssl: configService.get('database.ssl'),
          synchronize: configService.get<boolean>('database.synchronize'),
          logging: configService.get<boolean>('database.logging'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          autoLoadEntities: true,
        };
      },
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ([{
        ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000, // Time window in milliseconds
        limit: configService.get<number>('THROTTLE_LIMIT', 100), // Max requests per time window (increased from 10 to 100)
      }]),
      inject: [ConfigService],
    }),

    // Task scheduling
    ScheduleModule.forRoot(),

    // Event system
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // Queue management (requires Redis)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
          db: configService.get('redis.db', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    HealthModule,
    EmailModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    ContactsModule,
    CompaniesModule,
    DealsModule,
    TasksModule,
    ActivitiesModule,
    // GoogleSheetsModule must register BEFORE IntegrationsModule so its static
    // /integrations/google-sheets/* routes are matched ahead of the generic
    // /integrations/:id patterns ("google-sheets" is not a UUID).
    GoogleSheetsModule,
    IntegrationsModule,
    WhatsAppModule,
    WhatsAppFollowupModule,
    MetaMessagingModule,
    AudioLibraryModule,
    SmartBillModule,
    PipelineModule,
    NotificationsModule,
    EventsModule,
    MeetingReminderModule,
    AvailabilityModule,
    BookingsModule,
    DocumentsModule,
    FormsModule,
    LandingPagesModule,
    FunnelsModule,
    AIModule,
    WorkflowsModule,
    UploadModule,
    PlatformAdminModule,
    EmailCampaignsModule,
    CampaignSchedulerModule,
    QueueModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
