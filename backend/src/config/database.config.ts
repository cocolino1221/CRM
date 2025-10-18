import { registerAs } from '@nestjs/config';

export default registerAs('database', () => {
  // Support both DATABASE_URL (Neon, Supabase, etc.) and individual params
  const databaseUrl = process.env.DATABASE_URL;

  // If using DATABASE_URL, parse it
  if (databaseUrl) {
    return {
      url: databaseUrl,
      ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      synchronize: process.env.DB_SYNC === 'true',
      logging: process.env.DB_LOGGING === 'true' || process.env.NODE_ENV === 'development',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 100,
      connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 60000,
    };
  }

  // Otherwise use individual connection parameters
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    name: process.env.DB_NAME || 'slackcrm',
    ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    synchronize: process.env.DB_SYNC === 'true',
    logging: process.env.DB_LOGGING === 'true' || process.env.NODE_ENV === 'development',
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS, 10) || 100,
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 60000,
  };
});