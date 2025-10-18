import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';

export enum IntegrationType {
  SLACK = 'slack',
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
  SALESFORCE = 'salesforce',
  HUBSPOT = 'hubspot',
  PIPEDRIVE = 'pipedrive',
  ZOOM = 'zoom',
  TYPEFORM = 'typeform',
  CALENDAR = 'calendar',
  EMAIL = 'email',
  SMS = 'sms',
  SOCIAL_MEDIA = 'social_media',
  WEBHOOK = 'webhook',
  API = 'api',
  DATABASE = 'database',
  CUSTOM = 'custom',
}

export enum IntegrationStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  ERROR = 'error',
  DISABLED = 'disabled',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended',
}

export enum IntegrationAuthType {
  OAUTH2 = 'oauth2',
  API_KEY = 'api_key',
  BASIC_AUTH = 'basic_auth',
  JWT = 'jwt',
  WEBHOOK = 'webhook',
  NONE = 'none',
}

@Entity('integrations')
@Index('IDX_integrations_workspace_type', ['workspaceId', 'type'])
@Index('IDX_integrations_workspace_status', ['workspaceId', 'status'])
@Index('IDX_integrations_workspace_user', ['workspaceId', 'userId'])
@Index('IDX_integrations_external_id', ['externalId'])
@Index('IDX_integrations_created_at', ['createdAt'])
export class Integration extends WorkspaceEntity {
  @Column({
    type: 'enum',
    enum: IntegrationType,
    comment: 'Type of integration',
  })
  @Index('IDX_integrations_type')
  type: IntegrationType;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Integration display name',
  })
  name: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Integration description',
  })
  description?: string;

  @Column({
    type: 'enum',
    enum: IntegrationStatus,
    default: IntegrationStatus.PENDING,
    comment: 'Integration status',
  })
  @Index('IDX_integrations_status')
  status: IntegrationStatus;

  @Column({
    type: 'enum',
    enum: IntegrationAuthType,
    comment: 'Authentication type',
  })
  authType: IntegrationAuthType;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'External service ID/key',
  })
  externalId?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Integration configuration settings',
  })
  config?: {
    // OAuth settings
    clientId?: string;
    clientSecret?: string;
    scopes?: string[];
    redirectUri?: string;
    authUrl?: string;
    tokenUrl?: string;

    // API settings
    apiUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;

    // Webhook settings
    webhookUrl?: string;
    webhookSecret?: string;
    events?: string[];

    // Sync settings
    syncFrequency?: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'manual';
    syncDirection?: 'bidirectional' | 'inbound' | 'outbound';
    autoSync?: boolean;

    // Feature flags
    features?: {
      contacts?: boolean;
      deals?: boolean;
      tasks?: boolean;
      activities?: boolean;
      calendar?: boolean;
      email?: boolean;
      messaging?: boolean;
      files?: boolean;
      analytics?: boolean;
    };

    // Custom fields mapping
    fieldMapping?: Record<string, string>;

    // Rate limiting
    rateLimit?: {
      requests: number;
      period: string;
    };

    [key: string]: any;
  };

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Encrypted authentication credentials',
  })
  credentials?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
    tokenType?: string;
    scope?: string;

    // API Key auth
    apiKey?: string;
    apiSecret?: string;

    // Basic auth
    username?: string;
    password?: string;

    // Custom credentials
    [key: string]: any;
  };

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Last sync information',
  })
  lastSync?: {
    timestamp: Date;
    status: 'success' | 'error' | 'partial';
    recordsProcessed?: number;
    recordsCreated?: number;
    recordsUpdated?: number;
    recordsSkipped?: number;
    errors?: string[];
    nextSync?: Date;
  };

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Integration metadata',
  })
  metadata?: {
    version?: string;
    provider?: string;
    category?: string;
    tags?: string[];
    icon?: string;
    color?: string;
    homepage?: string;
    documentation?: string;
    supportEmail?: string;

    // Usage stats
    totalSyncs?: number;
    lastActivity?: Date;
    errorCount?: number;
    successRate?: number;

    // Custom metadata
    [key: string]: any;
  };

  @Column({
    type: 'simple-array',
    nullable: true,
    comment: 'Integration capabilities/permissions',
  })
  permissions?: string[];

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Is integration enabled',
  })
  isEnabled: boolean;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is integration verified/trusted',
  })
  isVerified: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When integration was last active',
  })
  lastActivityAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When credentials expire',
  })
  expiresAt?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Last error message',
  })
  lastError?: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Number of consecutive errors',
  })
  errorCount: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When integration was installed',
  })
  installedAt?: Date;

  // Relationships
  @Column('uuid', { nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @OneToMany(() => IntegrationWebhook, (webhook) => webhook.integration)
  webhooks: IntegrationWebhook[];

  @OneToMany(() => IntegrationLog, (log) => log.integration)
  logs: IntegrationLog[];

  // Virtual properties
  get isExpired(): boolean {
    if (!this.expiresAt) return false;
    return this.expiresAt < new Date();
  }

  get isHealthy(): boolean {
    return this.status === IntegrationStatus.ACTIVE &&
           this.errorCount < 5 &&
           !this.isExpired;
  }

  get needsReauth(): boolean {
    return this.status === IntegrationStatus.EXPIRED ||
           (this.authType === IntegrationAuthType.OAUTH2 && this.isExpired);
  }

  get displayName(): string {
    return this.name || `${this.type} Integration`;
  }

  get statusColor(): string {
    const colors = {
      [IntegrationStatus.ACTIVE]: '#22c55e',
      [IntegrationStatus.PENDING]: '#f59e0b',
      [IntegrationStatus.ERROR]: '#ef4444',
      [IntegrationStatus.DISABLED]: '#6b7280',
      [IntegrationStatus.EXPIRED]: '#f97316',
      [IntegrationStatus.SUSPENDED]: '#dc2626',
    };
    return colors[this.status] || '#6b7280';
  }

  // Lifecycle hooks
  @BeforeInsert()
  @BeforeUpdate()
  validateIntegration() {
    if (this.status === IntegrationStatus.ACTIVE && !this.installedAt) {
      this.installedAt = new Date();
    }

    if (this.errorCount < 0) {
      this.errorCount = 0;
    }

    // Auto-disable if too many errors
    if (this.errorCount >= 10 && this.status === IntegrationStatus.ACTIVE) {
      this.status = IntegrationStatus.ERROR;
    }

    // Set expiry based on OAuth token
    if (this.authType === IntegrationAuthType.OAUTH2 && this.credentials?.expiresAt) {
      this.expiresAt = new Date(this.credentials.expiresAt);
    }
  }

  /**
   * Mark integration as active and reset error count
   */
  activate(): void {
    this.status = IntegrationStatus.ACTIVE;
    this.errorCount = 0;
    this.lastError = null;
    this.lastActivityAt = new Date();
  }

  /**
   * Mark integration as having an error
   */
  recordError(error: string): void {
    this.status = IntegrationStatus.ERROR;
    this.lastError = error;
    this.errorCount += 1;
    this.lastActivityAt = new Date();
  }

  /**
   * Reset error count and clear last error
   */
  clearErrors(): void {
    this.errorCount = 0;
    this.lastError = null;
  }

  /**
   * Update last sync information
   */
  updateSync(syncInfo: Integration['lastSync']): void {
    this.lastSync = {
      ...this.lastSync,
      ...syncInfo,
      timestamp: new Date(),
    };
    this.lastActivityAt = new Date();
  }

  /**
   * Check if integration has a specific permission
   */
  hasPermission(permission: string): boolean {
    return this.permissions?.includes(permission) || false;
  }

  /**
   * Check if integration supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    return this.config?.features?.[feature] === true;
  }

  /**
   * Get integration health score
   */
  getHealthScore(): number {
    let score = 100;

    // Status penalty
    if (this.status !== IntegrationStatus.ACTIVE) {
      score -= 50;
    }

    // Error penalty
    if (this.errorCount > 0) {
      score -= Math.min(this.errorCount * 10, 40);
    }

    // Expiry penalty
    if (this.isExpired) {
      score -= 30;
    }

    // Inactivity penalty
    if (this.lastActivityAt) {
      const daysSinceActivity = Math.floor(
        (Date.now() - this.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceActivity > 30) {
        score -= 20;
      } else if (daysSinceActivity > 7) {
        score -= 10;
      }
    }

    return Math.max(0, Math.min(100, score));
  }
}

@Entity('integration_webhooks')
@Index('IDX_integration_webhooks_integration', ['integrationId'])
@Index('IDX_integration_webhooks_event', ['event'])
@Index('IDX_integration_webhooks_status', ['status'])
export class IntegrationWebhook extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Webhook URL endpoint',
  })
  url: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Event type',
  })
  event: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: 'Webhook status',
  })
  status: 'active' | 'disabled' | 'error';

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Webhook secret for verification',
  })
  secret?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Webhook headers',
  })
  headers?: Record<string, string>;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Number of delivery failures',
  })
  failureCount: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last successful delivery',
  })
  lastDeliveredAt?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Last error message',
  })
  lastError?: string;

  // Relationships
  @Column('uuid')
  integrationId: string;

  @ManyToOne(() => Integration, (integration) => integration.webhooks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'integrationId' })
  integration: Integration;
}

@Entity('integration_logs')
@Index('IDX_integration_logs_integration', ['integrationId'])
@Index('IDX_integration_logs_level', ['level'])
@Index('IDX_integration_logs_created_at', ['createdAt'])
export class IntegrationLog extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 20,
    comment: 'Log level',
  })
  level: 'debug' | 'info' | 'warn' | 'error';

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Log message',
  })
  message: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Additional log data',
  })
  data?: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Action or operation',
  })
  action?: string;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Duration in milliseconds',
  })
  duration?: number;

  // Relationships
  @Column('uuid')
  integrationId: string;

  @ManyToOne(() => Integration, (integration) => integration.logs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'integrationId' })
  integration: Integration;
}