import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Node Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),

  // Application
  PORT: Joi.number().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),
  APP_URL: Joi.string().uri().optional().default('http://localhost:3000'),

  // Database - Either DATABASE_URL or individual connection parameters
  DATABASE_URL: Joi.string().optional(),
  DB_HOST: Joi.string().optional(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().optional(),
  DB_PASSWORD: Joi.string().optional(),
  DB_NAME: Joi.string().optional(),
  DB_SSL: Joi.boolean().default(false),
  DB_SYNC: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_MAX_CONNECTIONS: Joi.number().default(100),
  DB_MIN_CONNECTIONS: Joi.number().default(5),
  DB_CONNECTION_TIMEOUT: Joi.number().default(60000),
  DB_IDLE_TIMEOUT: Joi.number().default(600000),
  DB_ACQUIRE_TIMEOUT: Joi.number().default(60000),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),

  // Stack Auth Configuration
  NEXT_PUBLIC_STACK_PROJECT_ID: Joi.string().optional(),
  NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: Joi.string().optional(),
  STACK_SECRET_SERVER_KEY: Joi.string().optional(),

  // JWT Authentication
  JWT_SECRET: Joi.string().min(32).required()
    .messages({
      'string.min': 'JWT_SECRET must be at least 32 characters long for security',
      'any.required': 'JWT_SECRET is required for authentication',
    }),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required()
    .messages({
      'string.min': 'JWT_REFRESH_SECRET must be at least 32 characters long for security',
      'any.required': 'JWT_REFRESH_SECRET is required for refresh tokens',
    }),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // OAuth State Secret (dedicated secret for OAuth CSRF protection)
  // Required in production; optional in development (will use JWT_SECRET as fallback with a warning)
  OAUTH_STATE_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required().messages({
      'string.min': 'OAUTH_STATE_SECRET must be at least 32 characters long for security',
      'any.required': 'OAUTH_STATE_SECRET is required for OAuth flows in production',
    }),
    otherwise: Joi.string().min(32).optional(),
  }),

  // Encryption Key for sensitive data (integration credentials, etc.)
  // Required in production; optional in development (credentials stored unencrypted with a warning)
  ENCRYPTION_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().length(64).required().messages({
      'string.length': 'ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes). Generate with: openssl rand -hex 32',
      'any.required': 'ENCRYPTION_KEY is required for encrypting OAuth tokens and API keys in production',
    }),
    otherwise: Joi.string().length(64).optional(),
  }),

  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(60), // Reduced from 100 to 60 req/min for better security

  // Email Configuration
  EMAIL_PROVIDER: Joi.string().valid('sendgrid', 'smtp', 'resend').default('smtp'),
  FROM_EMAIL: Joi.string().email().default('noreply@slackcrm.com'),

  // Resend
  RESEND_API_KEY: Joi.string().when('EMAIL_PROVIDER', {
    is: 'resend',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // SendGrid
  SENDGRID_API_KEY: Joi.string().when('EMAIL_PROVIDER', {
    is: 'sendgrid',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // SMTP
  SMTP_HOST: Joi.string().when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.optional(),
    otherwise: Joi.optional(),
  }),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.optional(),
    otherwise: Joi.optional(),
  }),
  SMTP_PASS: Joi.string().when('EMAIL_PROVIDER', {
    is: 'smtp',
    then: Joi.optional(),
    otherwise: Joi.optional(),
  }),

  // Slack Integration (legacy - kept for backward compatibility)
  SLACK_CLIENT_ID: Joi.string().optional(),
  SLACK_CLIENT_SECRET: Joi.string().optional(),
  SLACK_SIGNING_SECRET: Joi.string().optional(),
  SLACK_BOT_TOKEN: Joi.string().optional(),

  // OAuth Integrations - Use OAUTH_{PROVIDER}_CLIENT_ID format
  // Google OAuth
  OAUTH_GOOGLE_CLIENT_ID: Joi.string().optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_GOOGLE_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_GOOGLE_SCOPES: Joi.string().optional(),
  // Legacy Google OAuth (for backward compatibility)
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().optional(),

  // Slack OAuth
  OAUTH_SLACK_CLIENT_ID: Joi.string().optional(),
  OAUTH_SLACK_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_SLACK_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_SLACK_SCOPES: Joi.string().optional(),

  // Microsoft OAuth
  OAUTH_MICROSOFT_CLIENT_ID: Joi.string().optional(),
  OAUTH_MICROSOFT_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_MICROSOFT_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_MICROSOFT_SCOPES: Joi.string().optional(),
  // Legacy Microsoft OAuth (for backward compatibility)
  MICROSOFT_CLIENT_ID: Joi.string().optional(),
  MICROSOFT_CLIENT_SECRET: Joi.string().optional(),
  MICROSOFT_CALLBACK_URL: Joi.string().uri().optional(),

  // Salesforce OAuth
  OAUTH_SALESFORCE_CLIENT_ID: Joi.string().optional(),
  OAUTH_SALESFORCE_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_SALESFORCE_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_SALESFORCE_SCOPES: Joi.string().optional(),

  // HubSpot OAuth
  OAUTH_HUBSPOT_CLIENT_ID: Joi.string().optional(),
  OAUTH_HUBSPOT_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_HUBSPOT_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_HUBSPOT_SCOPES: Joi.string().optional(),

  // Zoom OAuth
  OAUTH_ZOOM_CLIENT_ID: Joi.string().optional(),
  OAUTH_ZOOM_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_ZOOM_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_ZOOM_SCOPES: Joi.string().optional(),

  // DocuSign OAuth
  OAUTH_DOCUSIGN_CLIENT_ID: Joi.string().optional(),
  OAUTH_DOCUSIGN_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_DOCUSIGN_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_DOCUSIGN_SCOPES: Joi.string().optional(),

  // Calendly OAuth
  OAUTH_CALENDLY_CLIENT_ID: Joi.string().optional(),
  OAUTH_CALENDLY_CLIENT_SECRET: Joi.string().optional(),
  OAUTH_CALENDLY_REDIRECT_URI: Joi.string().uri().optional(),
  OAUTH_CALENDLY_SCOPES: Joi.string().optional(),

  // AI Services
  OPENAI_API_KEY: Joi.string().optional(),
  CLAUDE_API_KEY: Joi.string().optional(),

  // External Integrations
  TYPEFORM_API_KEY: Joi.string().optional(),
  ZOOM_API_KEY: Joi.string().optional(),
  ZOOM_API_SECRET: Joi.string().optional(),
  MANYCHAT_API_TOKEN: Joi.string().optional(),

  // WhatsApp Business API (Cloud API)
  WHATSAPP_ACCESS_TOKEN: Joi.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().optional(),
  WHATSAPP_VERIFY_TOKEN: Joi.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: Joi.string().optional(),
});

/**
 * Validate environment variables at startup
 */
export function validateEnvironment(config: Record<string, unknown>) {
  const { error, value } = validationSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    const errorMessages = error.details.map((detail) => detail.message).join(', ');
    throw new Error(`Environment validation failed: ${errorMessages}`);
  }

  return value;
}
