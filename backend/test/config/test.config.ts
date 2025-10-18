/**
 * Test configuration and environment setup
 */

export const testConfig = {
  // Database configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'test',
    password: process.env.DB_PASSWORD || 'test',
    name: process.env.DB_NAME || 'slackcrm_test',
    nameE2E: process.env.DB_NAME_E2E || 'slackcrm_test_e2e',
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'test-jwt-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret',
    expiresIn: '1h',
    refreshExpiresIn: '7d',
  },

  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    testDb: 1, // Use different DB for tests
    e2eDb: 2,  // Use different DB for E2E tests
  },

  // Test timeouts
  timeouts: {
    unit: 10000,    // 10 seconds for unit tests
    integration: 30000, // 30 seconds for integration tests
    e2e: 60000,     // 60 seconds for E2E tests
  },

  // Mock services
  mocks: {
    sendgrid: {
      apiKey: 'test-sendgrid-key',
    },
    slack: {
      botToken: 'test-bot-token',
      signingSecret: 'test-signing-secret',
    },
  },

  // Test data
  testData: {
    workspace: {
      id: 'test-workspace-123',
      name: 'Test Workspace',
    },
    user: {
      email: 'testuser@example.com',
      firstName: 'Test',
      lastName: 'User',
      password: 'password123',
      hashedPassword: '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    },
    company: {
      name: 'Test Company',
      website: 'https://testcompany.com',
      industry: 'Technology',
    },
  },
};

/**
 * Get configuration for specific test environment
 */
export const getTestConfig = (environment: 'unit' | 'integration' | 'e2e' = 'unit') => {
  const config = { ...testConfig };

  switch (environment) {
    case 'e2e':
      config.database.name = config.database.nameE2E;
      config.redis.url = `${config.redis.url}/${config.redis.e2eDb}`;
      break;
    case 'integration':
      config.redis.url = `${config.redis.url}/${config.redis.testDb}`;
      break;
    default:
      // Unit tests don't need real database/redis
      break;
  }

  return config;
};

/**
 * Environment variables setup for tests
 */
export const setupTestEnvironment = (environment: 'unit' | 'integration' | 'e2e' = 'unit') => {
  const config = getTestConfig(environment);

  // Set NODE_ENV
  process.env.NODE_ENV = `test-${environment}`;

  // Database
  process.env.DB_HOST = config.database.host;
  process.env.DB_PORT = config.database.port.toString();
  process.env.DB_USERNAME = config.database.username;
  process.env.DB_PASSWORD = config.database.password;
  process.env.DB_NAME = config.database.name;

  // JWT
  process.env.JWT_SECRET = config.jwt.secret;
  process.env.JWT_REFRESH_SECRET = config.jwt.refreshSecret;

  // Redis
  process.env.REDIS_URL = config.redis.url;

  // Mock services
  process.env.SENDGRID_API_KEY = config.mocks.sendgrid.apiKey;
  process.env.SLACK_BOT_TOKEN = config.mocks.slack.botToken;
  process.env.SLACK_SIGNING_SECRET = config.mocks.slack.signingSecret;

  // Disable external services in tests
  process.env.DISABLE_EXTERNAL_SERVICES = 'true';
};

/**
 * Restore original environment after tests
 */
export const cleanupTestEnvironment = () => {
  const testEnvVars = [
    'NODE_ENV',
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'REDIS_URL',
    'SENDGRID_API_KEY',
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET',
    'DISABLE_EXTERNAL_SERVICES',
  ];

  testEnvVars.forEach(envVar => {
    delete process.env[envVar];
  });
};