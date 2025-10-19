import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Node Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),

  // Application
  PORT: Joi.number().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),

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
  JWT_REFRESH_SECRET: Joi.string().min(32).optional(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(10),

  // Email Configuration
  EMAIL_PROVIDER: Joi.string().valid('sendgrid', 'smtp').default('smtp'),
  FROM_EMAIL: Joi.string().email().default('noreply@slackcrm.com'),

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

  // Slack Integration
  SLACK_CLIENT_ID: Joi.string().optional(),
  SLACK_CLIENT_SECRET: Joi.string().optional(),
  SLACK_SIGNING_SECRET: Joi.string().optional(),
  SLACK_BOT_TOKEN: Joi.string().optional(),

  // AI Services
  OPENAI_API_KEY: Joi.string().optional(),
  CLAUDE_API_KEY: Joi.string().optional(),

  // External Integrations
  TYPEFORM_API_KEY: Joi.string().optional(),
  ZOOM_API_KEY: Joi.string().optional(),
  ZOOM_API_SECRET: Joi.string().optional(),
  MANYCHAT_API_TOKEN: Joi.string().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().optional(),
  GOOGLE_CLIENT_SECRET: Joi.string().optional(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().optional(),

  // Microsoft OAuth
  MICROSOFT_CLIENT_ID: Joi.string().optional(),
  MICROSOFT_CLIENT_SECRET: Joi.string().optional(),
  MICROSOFT_CALLBACK_URL: Joi.string().uri().optional(),
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
