import {
  Entity,
  Column,
  OneToMany,
  Index,
  Unique,
  BeforeInsert,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { randomBytes } from 'crypto';

export interface WorkspaceSettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  billing?: {
    grandfathered?: boolean;
    package?: 'legacy' | 'starter' | 'growth' | 'scale';
    billingProvider?: 'manual' | 'stripe';
    billingStatus?: 'inactive' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    trialEndsAt?: string;
    currentPeriodEndAt?: string;
  };
  limits?: {
    maxUsers?: number | null;
    maxWhatsAppNumbers?: number | null;
  };
  features: {
    aiEnabled: boolean;
    slackIntegration: boolean;
    emailIntegration: boolean;
    whatsappEnabled?: boolean;
    contactsEnabled?: boolean;
    leadsEnabled?: boolean;
    calendarEnabled?: boolean;
    pipelineEnabled?: boolean;
    tasksEnabled?: boolean;
    automationEnabled?: boolean;
    marketingEnabled?: boolean;
    mobileAppEnabled?: boolean;
  };
  // Shared voice-note library, sent across Messenger/Instagram/WhatsApp inside
  // an open conversation. Capped at AUDIO_LIBRARY_MAX items. Files live in R2.
  audioLibrary?: WorkspaceAudioTemplate[];
  // Read markers for the Messenger/Instagram inbox, keyed by conversation id
  // (channel:account:sender) → ISO timestamp last marked read. Inbound messages
  // newer than this count as unread; absence of a key means fully unread.
  metaInboxReads?: Record<string, string>;
}

export interface WorkspaceAudioTemplate {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

@Entity('workspaces')
@Unique(['domain'])
@Index('IDX_workspaces_name', ['name'])
export class Workspace extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Workspace name',
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
    comment: 'Workspace domain',
  })
  domain: string;

  @Column({
    type: 'enum',
    enum: ['trial', 'starter', 'professional', 'enterprise'],
    default: 'trial',
  })
  plan: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  isActive: boolean;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    unique: true,
    comment: 'Short invite code for joining this workspace',
  })
  inviteCode: string;

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
  })
  settings: WorkspaceSettings;

  @BeforeInsert()
  generateInviteCode() {
    if (!this.inviteCode) {
      this.inviteCode = randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    }
  }

  regenerateInviteCode(): string {
    this.inviteCode = randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    return this.inviteCode;
  }
}
