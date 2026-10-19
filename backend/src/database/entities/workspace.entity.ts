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
    // Set for workspaces created after plans launched: they must pick a plan
    // (Stripe Checkout) before using integrations. Older workspaces keep full access.
    requiresPlan?: boolean;
    interval?: 'month' | 'year';
    cancelAtPeriodEnd?: boolean;
    trialUsed?: boolean;
  };
  limits?: {
    maxUsers?: number | null;
    maxWhatsAppNumbers?: number | null;
  };
  /**
   * How long, in minutes, a fresh lead is left alone before it shows up in
   * "De sunat" — per source, because someone who just bought a book behaves
   * differently from someone who filled in a form.
   *
   * It exists so a setter does not ring the person who is, at that moment,
   * picking a slot in the calendar. Nothing is stored on the lead: the queue
   * simply does not return it yet, and the moment it books it appears under
   * "Programați" instead.
   */
  leadGrace?: {
    typeform?: number;
    woocommerce?: number;
    manual?: number;
  };
  /** Which KPIs the reports show, and the daily target for each. */
  kpis?: {
    enabled: string[];
    targets: Record<string, number>;
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
  // Custom logo URL shown in the mobile app instead of the default EasyTeam logo.
  // Set via PUT /workspaces/current/branding; upload itself goes through /upload.
  brandLogoUrl?: string;
  // Look of the public booking page; validated by normalizeBookingBranding.
  bookingPage?: import('../../scheduling/booking-branding').BookingBranding;
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
