import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import AppDataSource from './database/data-source';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ContactsModule } from './contacts/contacts.module';
import { DealsModule } from './deals/deals.module';
import { TasksModule } from './tasks/tasks.module';
import { CompaniesModule } from './companies/companies.module';
import { ActivitiesModule } from './activities/activities.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { WhatsAppModule } from './integrations/whatsapp/whatsapp.module';
import { QueueModule } from './queues/queue.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './email/email.module';
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
        ttl: configService.get<number>('THROTTLE_TTL', 60) * 1000,
        limit: configService.get<number>('THROTTLE_LIMIT', 10),
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

    // Queue management
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
    ContactsModule,
    CompaniesModule,
    DealsModule,
    TasksModule,
    ActivitiesModule,
    IntegrationsModule,
    WhatsAppModule,
    QueueModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}