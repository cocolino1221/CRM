/**
 * Application-wide constants
 */

export const APP_CONFIG = {
  NAME: 'SlackCRM',
  VERSION: '1.0.0',
  DESCRIPTION: 'AI-Powered Team CRM Platform',
} as const;

export const API_CONFIG = {
  VERSION: 'v1',
  PREFIX: 'api',
  DEFAULT_TIMEOUT: 30000,
  MAX_REQUEST_SIZE: '50mb',
} as const;

export const DATABASE_CONFIG = {
  MAX_CONNECTIONS: 100,
  CONNECTION_TIMEOUT: 60000,
  QUERY_TIMEOUT: 30000,
} as const;

export const CACHE_CONFIG = {
  DEFAULT_TTL: 3600, // 1 hour in seconds
  MAX_TTL: 86400, // 24 hours in seconds
  KEY_PREFIX: 'slackcrm:',
} as const;

export const RATE_LIMIT_CONFIG = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100,
  MAX_REQUESTS_PER_IP: 1000,
  SKIP_SUCCESSFUL_REQUESTS: false,
} as const;

export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  ALGORITHM: 'RS256',
} as const;

export const PASSWORD_CONFIG = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  BCRYPT_ROUNDS: 12,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SYMBOLS: true,
} as const;

export const SLACK_CONFIG = {
  SCOPES: [
    'app_mentions:read',
    'channels:history',
    'channels:read',
    'chat:write',
    'commands',
    'im:history',
    'im:read',
    'im:write',
    'users:read',
    'users:read.email',
    'files:read',
    'files:write',
  ],
  EVENT_TYPES: [
    'app_mention',
    'message.channels',
    'message.im',
    'team_join',
    'user_change',
  ],
} as const;

export const EMAIL_CONFIG = {
  MAX_RECIPIENTS: 100,
  MAX_SUBJECT_LENGTH: 255,
  MAX_BODY_LENGTH: 10000,
  ALLOWED_ATTACHMENTS: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv'],
  MAX_ATTACHMENT_SIZE: 25 * 1024 * 1024, // 25MB
} as const;

export const LEAD_SCORING = {
  EMAIL_DOMAIN_WEIGHT: 10,
  JOB_TITLE_WEIGHT: 15,
  COMPANY_SIZE_WEIGHT: 20,
  INTERACTION_WEIGHT: 25,
  ENGAGEMENT_WEIGHT: 30,
  MAX_SCORE: 100,
} as const;

export const WEBHOOK_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  TIMEOUT: 10000, // 10 seconds
  MAX_PAYLOAD_SIZE: 1024 * 1024, // 1MB
} as const;

export const FILE_UPLOAD = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  AVATAR_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  AVATAR_DIMENSIONS: { width: 300, height: 300 },
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;