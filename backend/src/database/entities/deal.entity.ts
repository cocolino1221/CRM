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
import { Contact } from './contact.entity';
import { Company } from './company.entity';
import { Task } from './task.entity';
import { Activity } from './activity.entity';

export enum DealStage {
  LEAD = 'lead',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  CLOSED_WON = 'closed_won',
  CLOSED_LOST = 'closed_lost',
}

export enum DealPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum DealSource {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  REFERRAL = 'referral',
  PARTNER = 'partner',
  EVENT = 'event',
  MARKETING = 'marketing',
  SLACK = 'slack',
  OTHER = 'other',
}

@Entity('deals')
@Index('IDX_deals_workspace_stage', ['workspaceId', 'stage'])
@Index('IDX_deals_workspace_owner', ['workspaceId', 'ownerId'])
@Index('IDX_deals_workspace_priority', ['workspaceId', 'priority'])
@Index('IDX_deals_expected_close_idx', ['expectedCloseDate'])
@Index('IDX_deals_value_idx', ['value'])
export class Deal extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Deal title',
  })
  title: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    comment: 'Deal value in cents',
  })
  @Index('IDX_deals_value')
  value: number;

  @Column({
    type: 'varchar',
    length: 3,
    default: 'USD',
    comment: 'Currency code',
  })
  currency: string;

  @Column({
    type: 'enum',
    enum: DealStage,
    default: DealStage.LEAD,
    comment: 'Current deal stage',
  })
  @Index('IDX_deals_stage')
  stage: DealStage;

  @Column({
    type: 'enum',
    enum: DealPriority,
    default: DealPriority.MEDIUM,
    comment: 'Deal priority level',
  })
  @Index('IDX_deals_priority')
  priority: DealPriority;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Win probability percentage (0-100)',
  })
  probability: number;

  @Column({
    type: 'enum',
    enum: DealSource,
    nullable: true,
    comment: 'How deal was originated',
  })
  source?: DealSource;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Expected close date',
  })
  @Index('IDX_deals_expected_close')
  expectedCloseDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Actual close date',
  })
  actualCloseDate?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Deal description and notes',
  })
  description?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for loss (if closed lost)',
  })
  lossReason?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Custom fields for additional data',
  })
  customFields?: Record<string, any>;

  @Column({
    type: 'simple-array',
    nullable: true,
    comment: 'Tags for categorization',
  })
  tags?: string[];

  @Column({
    type: 'int',
    default: 1,
    comment: 'Number of decision makers',
  })
  decisionMakers: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Has budget been confirmed',
  })
  budgetConfirmed: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last activity on this deal',
  })
  lastActivityAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Timestamp when deal was closed (won or lost)',
  })
  closedDate?: Date;

  // Relationships
  @Column('uuid', { nullable: true })
  ownerId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner?: User;

  @Column('uuid', { nullable: true })
  contactId?: string;

  @ManyToOne(() => Contact, (contact) => contact.deals, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  @Column('uuid', { nullable: true })
  companyId?: string;

  @ManyToOne(() => Company, (company) => company.deals, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'companyId' })
  company?: Company;

  @OneToMany(() => Task, (task) => task.deal)
  tasks: Task[];

  @OneToMany(() => Activity, (activity) => activity.deal)
  activities: Activity[];

  // Virtual properties
  get isOpen(): boolean {
    return ![DealStage.CLOSED_WON, DealStage.CLOSED_LOST].includes(this.stage);
  }

  get isClosed(): boolean {
    return [DealStage.CLOSED_WON, DealStage.CLOSED_LOST].includes(this.stage);
  }

  get isWon(): boolean {
    return this.stage === DealStage.CLOSED_WON;
  }

  get isLost(): boolean {
    return this.stage === DealStage.CLOSED_LOST;
  }

  get weightedValue(): number {
    return (this.value * this.probability) / 100;
  }

  get daysToClose(): number | null {
    if (!this.expectedCloseDate) return null;
    const today = new Date();
    const closeDate = new Date(this.expectedCloseDate);
    return Math.ceil((closeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  get isOverdue(): boolean {
    if (!this.expectedCloseDate || this.isClosed) return false;
    return new Date(this.expectedCloseDate) < new Date();
  }

  // Lifecycle hooks
  @BeforeInsert()
  @BeforeUpdate()
  validateData() {
    // Ensure probability is within valid range
    if (this.probability < 0) this.probability = 0;
    if (this.probability > 100) this.probability = 100;

    // Auto-set probability based on stage
    if (!this.probability || this.probability === 0) {
      switch (this.stage) {
        case DealStage.LEAD:
          this.probability = 10;
          break;
        case DealStage.QUALIFIED:
          this.probability = 25;
          break;
        case DealStage.PROPOSAL:
          this.probability = 50;
          break;
        case DealStage.NEGOTIATION:
          this.probability = 75;
          break;
        case DealStage.CLOSED_WON:
          this.probability = 100;
          break;
        case DealStage.CLOSED_LOST:
          this.probability = 0;
          break;
      }
    }

    // Set actual close date when deal is closed
    if (this.isClosed && !this.actualCloseDate) {
      this.actualCloseDate = new Date();
    }

    // Clear actual close date if deal is reopened
    if (this.isOpen && this.actualCloseDate) {
      this.actualCloseDate = null;
    }
  }

  /**
   * Move deal to next stage
   */
  advanceStage(): void {
    const stageOrder = [
      DealStage.LEAD,
      DealStage.QUALIFIED,
      DealStage.PROPOSAL,
      DealStage.NEGOTIATION,
      DealStage.CLOSED_WON,
    ];

    const currentIndex = stageOrder.indexOf(this.stage);
    if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
      this.stage = stageOrder[currentIndex + 1];
      this.validateData();
    }
  }

  /**
   * Calculate deal health score based on various factors
   */
  getHealthScore(): number {
    let score = 50; // Base score

    // Stage progression scoring
    const stageScores = {
      [DealStage.LEAD]: 10,
      [DealStage.QUALIFIED]: 30,
      [DealStage.PROPOSAL]: 50,
      [DealStage.NEGOTIATION]: 70,
      [DealStage.CLOSED_WON]: 100,
      [DealStage.CLOSED_LOST]: 0,
    };
    score = stageScores[this.stage] || score;

    // Budget confirmation
    if (this.budgetConfirmed) score += 10;

    // Recent activity
    if (this.lastActivityAt) {
      const daysSinceActivity = Math.floor(
        (Date.now() - this.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceActivity < 7) score += 15;
      else if (daysSinceActivity < 14) score += 10;
      else if (daysSinceActivity < 30) score += 5;
      else score -= 10; // Stale deal
    }

    // Time to close
    const daysToClose = this.daysToClose;
    if (daysToClose !== null) {
      if (daysToClose < 0) score -= 20; // Overdue
      else if (daysToClose < 30) score += 10; // Close to closing
    }

    return Math.max(0, Math.min(100, score));
  }
}