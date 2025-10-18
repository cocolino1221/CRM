import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';
import { Contact } from './contact.entity';
import { Deal } from './deal.entity';
import { Task } from './task.entity';

export enum ActivityType {
  EMAIL = 'email',
  CALL = 'call',
  MEETING = 'meeting',
  NOTE = 'note',
  SMS = 'sms',
  TASK_COMPLETION = 'task_completion',
  DEAL_STAGE_CHANGE = 'deal_stage_change',
  CONTACT_STATUS_CHANGE = 'contact_status_change',
  SLACK_MESSAGE = 'slack_message',
  SLACK_THREAD = 'slack_thread',
  FORM_SUBMISSION = 'form_submission',
  DOCUMENT_UPLOAD = 'document_upload',
  SYSTEM_EVENT = 'system_event',
  WEBHOOK = 'webhook',
  API_CALL = 'api_call',
  OTHER = 'other',
}

export enum ActivityDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  INTERNAL = 'internal',
}

export enum ActivityOutcome {
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  NO_ANSWER = 'no_answer',
  VOICEMAIL = 'voicemail',
  BUSY = 'busy',
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
  PENDING = 'pending',
}

@Entity('activities')
@Index('IDX_activities_workspace_type', ['workspaceId', 'type'])
@Index('IDX_activities_workspace_user', ['workspaceId', 'userId'])
@Index('IDX_activities_workspace_contact', ['workspaceId', 'contactId'])
@Index('IDX_activities_workspace_deal', ['workspaceId', 'dealId'])
@Index('IDX_activities_occurred_at_idx', ['occurredAt'])
@Index('IDX_activities_created_at', ['createdAt'])
export class Activity extends WorkspaceEntity {
  @Column({
    type: 'enum',
    enum: ActivityType,
    comment: 'Type of activity',
  })
  @Index('IDX_activities_type')
  type: ActivityType;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Activity title/subject',
  })
  title: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Activity description/content',
  })
  description?: string;

  @Column({
    type: 'enum',
    enum: ActivityDirection,
    nullable: true,
    comment: 'Direction of communication',
  })
  direction?: ActivityDirection;

  @Column({
    type: 'enum',
    enum: ActivityOutcome,
    nullable: true,
    comment: 'Activity outcome/result',
  })
  outcome?: ActivityOutcome;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Duration in minutes',
  })
  duration?: number;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'When the activity occurred',
  })
  @Index('IDX_activities_occurred_at')
  occurredAt: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Scheduled start time for meetings/calls',
  })
  scheduledAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When activity was completed',
  })
  completedAt?: Date;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Activity-specific metadata',
  })
  metadata?: {
    // Email specific
    emailSubject?: string;
    emailFrom?: string;
    emailTo?: string[];
    emailCc?: string[];
    emailBcc?: string[];
    emailMessageId?: string;
    emailThreadId?: string;

    // Call specific
    phoneNumber?: string;
    callDuration?: number;
    recordingUrl?: string;

    // Meeting specific
    meetingLink?: string;
    meetingPlatform?: string;
    attendees?: string[];
    location?: string;

    // Slack specific
    slackChannel?: string;
    slackChannelId?: string;
    slackMessageId?: string;
    slackThreadId?: string;
    slackUserId?: string;
    slackTeamId?: string;

    // Form specific
    formId?: string;
    formName?: string;
    formResponses?: Record<string, any>;

    // Document specific
    documentUrl?: string;
    documentName?: string;
    documentSize?: number;
    documentType?: string;

    // System/API specific
    sourceSystem?: string;
    sourceId?: string;
    apiEndpoint?: string;
    webhookSource?: string;

    // General
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    visibility?: 'public' | 'private' | 'team';
    attachments?: Array<{
      name: string;
      url: string;
      size: number;
      type: string;
    }>;

    [key: string]: any;
  };

  @Column({
    type: 'simple-array',
    nullable: true,
    comment: 'Tags for categorization',
  })
  tags?: string[];

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is activity pinned',
  })
  isPinned: boolean;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is activity a follow-up required',
  })
  followUpRequired: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Follow-up due date',
  })
  followUpDate?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Follow-up notes',
  })
  followUpNotes?: string;

  // Relationships
  @Column('uuid', { nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column('uuid', { nullable: true })
  contactId?: string;

  @ManyToOne(() => Contact, (contact) => contact.activities, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  @Column('uuid', { nullable: true })
  dealId?: string;

  @ManyToOne(() => Deal, (deal) => deal.activities, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dealId' })
  deal?: Deal;

  @Column('uuid', { nullable: true })
  taskId?: string;

  @ManyToOne(() => Task, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task?: Task;

  @Column('uuid', { nullable: true })
  parentActivityId?: string;

  @ManyToOne(() => Activity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentActivityId' })
  parentActivity?: Activity;

  // Virtual properties
  get isCompleted(): boolean {
    return !!this.completedAt;
  }

  get isScheduled(): boolean {
    return !!this.scheduledAt && this.scheduledAt > new Date();
  }

  get isOverdue(): boolean {
    if (!this.scheduledAt || this.isCompleted) return false;
    return this.scheduledAt < new Date();
  }

  get durationHours(): number | null {
    return this.duration ? this.duration / 60 : null;
  }

  get isFollowUpDue(): boolean {
    if (!this.followUpRequired || !this.followUpDate) return false;
    return this.followUpDate <= new Date();
  }

  get isEmailActivity(): boolean {
    return this.type === ActivityType.EMAIL;
  }

  get isCallActivity(): boolean {
    return this.type === ActivityType.CALL;
  }

  get isMeetingActivity(): boolean {
    return this.type === ActivityType.MEETING;
  }

  get isSlackActivity(): boolean {
    return [ActivityType.SLACK_MESSAGE, ActivityType.SLACK_THREAD].includes(this.type);
  }

  get displayTitle(): string {
    if (this.type === ActivityType.EMAIL && this.metadata?.emailSubject) {
      return this.metadata.emailSubject;
    }
    return this.title;
  }

  // Lifecycle hooks
  @BeforeInsert()
  @BeforeUpdate()
  validateData() {
    if (this.duration && this.duration < 0) {
      this.duration = 0;
    }

    if (this.scheduledAt && this.completedAt && this.scheduledAt > this.completedAt) {
      this.completedAt = null;
    }

    if (this.type === ActivityType.CALL && this.metadata?.phoneNumber) {
      this.metadata.phoneNumber = this.metadata.phoneNumber.replace(/\D/g, '');
    }

    if (this.followUpRequired && !this.followUpDate) {
      const defaultFollowUp = new Date();
      defaultFollowUp.setDate(defaultFollowUp.getDate() + 3);
      this.followUpDate = defaultFollowUp;
    }

    if (!this.followUpRequired && this.followUpDate) {
      this.followUpDate = null;
      this.followUpNotes = null;
    }
  }

  /**
   * Mark activity as completed
   */
  complete(): void {
    this.completedAt = new Date();
    this.outcome = this.outcome || ActivityOutcome.SUCCESSFUL;
  }

  /**
   * Schedule a follow-up activity
   */
  scheduleFollowUp(date: Date, notes?: string): void {
    this.followUpRequired = true;
    this.followUpDate = date;
    if (notes) {
      this.followUpNotes = notes;
    }
  }

  /**
   * Complete follow-up requirement
   */
  completeFollowUp(): void {
    this.followUpRequired = false;
    this.followUpDate = null;
    this.followUpNotes = null;
  }

  /**
   * Pin activity for importance
   */
  pin(): void {
    this.isPinned = true;
  }

  /**
   * Unpin activity
   */
  unpin(): void {
    this.isPinned = false;
  }

  /**
   * Get activity priority from metadata
   */
  getPriority(): string {
    return this.metadata?.priority || 'medium';
  }

  /**
   * Check if activity involves external communication
   */
  isExternalCommunication(): boolean {
    return [
      ActivityType.EMAIL,
      ActivityType.CALL,
      ActivityType.SMS,
      ActivityType.MEETING,
      ActivityType.SLACK_MESSAGE,
    ].includes(this.type);
  }

  /**
   * Get activity score for timeline sorting
   */
  getTimelineScore(): number {
    let score = 50; // Base score

    // Activity type scoring
    const typeScores = {
      [ActivityType.DEAL_STAGE_CHANGE]: 90,
      [ActivityType.MEETING]: 85,
      [ActivityType.CALL]: 80,
      [ActivityType.EMAIL]: 70,
      [ActivityType.TASK_COMPLETION]: 60,
      [ActivityType.NOTE]: 50,
      [ActivityType.SLACK_MESSAGE]: 45,
      [ActivityType.SYSTEM_EVENT]: 20,
    };
    score = typeScores[this.type] || score;

    // Pinned activities get higher score
    if (this.isPinned) score += 20;

    // Recent activities get bonus
    const hoursAgo = (Date.now() - this.occurredAt.getTime()) / (1000 * 60 * 60);
    if (hoursAgo < 24) score += 10;
    else if (hoursAgo < 168) score += 5; // Within a week

    // Duration bonus for longer interactions
    if (this.duration && this.duration > 30) score += 5;

    return Math.max(0, Math.min(100, score));
  }
}