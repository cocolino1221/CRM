export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  DATA_SYNC: 'data-sync',
  REPORTS: 'reports',
  INTEGRATIONS: 'integrations',
  ANALYTICS: 'analytics',
} as const;

export const JOB_TYPES = {
  // Email jobs
  SEND_EMAIL: 'send-email',
  SEND_BULK_EMAIL: 'send-bulk-email',
  SEND_WELCOME_EMAIL: 'send-welcome-email',
  SEND_PASSWORD_RESET: 'send-password-reset',

  // Notification jobs
  SEND_NOTIFICATION: 'send-notification',
  SEND_SLACK_NOTIFICATION: 'send-slack-notification',

  // Data sync jobs
  SYNC_CONTACTS: 'sync-contacts',
  SYNC_DEALS: 'sync-deals',
  SYNC_INTEGRATION: 'sync-integration',
  EXPORT_DATA: 'export-data',
  IMPORT_DATA: 'import-data',

  // Report jobs
  GENERATE_REPORT: 'generate-report',
  GENERATE_ANALYTICS: 'generate-analytics',

  // Integration jobs
  WEBHOOK_DELIVERY: 'webhook-delivery',
  INTEGRATION_SYNC: 'integration-sync',

  // Analytics jobs
  CALCULATE_METRICS: 'calculate-metrics',
  UPDATE_LEAD_SCORES: 'update-lead-scores',
} as const;

export const JOB_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
} as const;