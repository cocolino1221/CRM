export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  DATA_SYNC: 'data-sync',
  REPORTS: 'reports',
  INTEGRATIONS: 'integrations',
  ANALYTICS: 'analytics',
  AI: 'ai',
  WEBHOOK: 'webhook',
  WORKFLOW: 'workflow',
  CAMPAIGN_DISPATCH: 'campaign-dispatch',
  WHATSAPP_FOLLOWUP: 'whatsapp-followup',
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
  IMPORT_GOOGLE_SHEETS: 'import-google-sheets',

  // Report jobs
  GENERATE_REPORT: 'generate-report',
  GENERATE_ANALYTICS: 'generate-analytics',

  // Integration jobs
  WEBHOOK_DELIVERY: 'webhook-delivery',
  INTEGRATION_SYNC: 'integration-sync',

  // Analytics jobs
  CALCULATE_METRICS: 'calculate-metrics',
  UPDATE_LEAD_SCORES: 'update-lead-scores',

  // AI jobs
  AI_LEAD_SCORE: 'ai-lead-score',
  AI_ENRICH_CONTACT: 'ai-enrich-contact',
  AI_GENERATE_EMAIL: 'ai-generate-email',
  AI_SENTIMENT_ANALYSIS: 'ai-sentiment-analysis',
  AI_PROCESS_LEAD: 'ai-process-lead',

  // Webhook jobs
  WEBHOOK_SEND: 'webhook-send',
  WEBHOOK_RETRY: 'webhook-retry',

  // Workflow jobs
  WORKFLOW_EXECUTE: 'workflow-execute',
  WORKFLOW_SCHEDULED: 'workflow-scheduled',

  // Campaign dispatch jobs (delayed, fire at scheduledAt)
  DISPATCH_WA_CAMPAIGN: 'dispatch-wa-campaign',
  DISPATCH_EMAIL_CAMPAIGN: 'dispatch-email-campaign',

  // WhatsApp flow follow-up (delayed, fires if the contact hasn't replied)
  CHECK_FOLLOWUP_REPLY: 'check-followup-reply',
} as const;

export const JOB_PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 3,
  LOW: 4,
} as const;