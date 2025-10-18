import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
config();

const configService = new ConfigService();

/**
 * TypeORM Data Source Configuration
 * Used for migrations, CLI commands, and application database connection
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get('DB_HOST', 'localhost'),
  port: configService.get('DB_PORT', 5432),
  username: configService.get('DB_USERNAME', 'postgres'),
  password: configService.get('DB_PASSWORD', 'password'),
  database: configService.get('DB_NAME', 'slackcrm'),

  // SSL Configuration for production
  ssl: configService.get('NODE_ENV') === 'production'
    ? { rejectUnauthorized: false }
    : false,

  // Connection pool settings
  extra: {
    max: configService.get('DB_MAX_CONNECTIONS', 100),
    min: configService.get('DB_MIN_CONNECTIONS', 5),
    connectionTimeoutMillis: configService.get('DB_CONNECTION_TIMEOUT', 60000),
    idleTimeoutMillis: configService.get('DB_IDLE_TIMEOUT', 600000),
    acquireTimeoutMillis: configService.get('DB_ACQUIRE_TIMEOUT', 60000),
  },

  // Entity and migration paths
  entities: [join(__dirname, 'entities/**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations/**/*{.ts,.js}')],
  subscribers: [join(__dirname, 'subscribers/**/*{.ts,.js}')],

  // Migration settings
  migrationsRun: configService.get('NODE_ENV') === 'production',
  migrationsTableName: 'migrations',

  // Development settings
  synchronize: configService.get('NODE_ENV') === 'development' &&
               configService.get('DB_SYNC', 'false') === 'true',

  // Logging
  logging: configService.get('NODE_ENV') === 'development' ? 'all' : ['error', 'warn'],
  logger: 'advanced-console',

  // Performance optimizations
  cache: configService.get('NODE_ENV') === 'production' ? {
    type: 'redis',
    options: {
      host: configService.get('REDIS_HOST', 'localhost'),
      port: configService.get('REDIS_PORT', 6379),
      password: configService.get('REDIS_PASSWORD'),
      db: configService.get('REDIS_DB', 2),
    },
    duration: 60000, // 1 minute cache
  } : false,

  // Connection options
  dropSchema: configService.get('NODE_ENV') === 'test',
  name: 'default',
});

export default AppDataSource;