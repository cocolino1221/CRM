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

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TaskType {
  CALL = 'call',
  EMAIL = 'email',
  MEETING = 'meeting',
  FOLLOW_UP = 'follow_up',
  DEMO = 'demo',
  PROPOSAL = 'proposal',
  CONTRACT = 'contract',
  ONBOARDING = 'onboarding',
  SUPPORT = 'support',
  OTHER = 'other',
}

@Entity('tasks')
@Index('IDX_tasks_workspace_status', ['workspaceId', 'status'])
@Index('IDX_tasks_workspace_assignee', ['workspaceId', 'assigneeId'])
@Index('IDX_tasks_workspace_priority', ['workspaceId', 'priority'])
@Index('IDX_tasks_due_date_idx', ['dueDate'])
@Index('IDX_tasks_contact_id', ['contactId'])
@Index('IDX_tasks_deal_id', ['dealId'])
export class Task extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Task title',
  })
  title: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Task description',
  })
  description?: string;

  @Column({
    type: 'enum',
    enum: TaskType,
    default: TaskType.OTHER,
    comment: 'Type of task',
  })
  @Index('IDX_tasks_type')
  type: TaskType;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
    comment: 'Current task status',
  })
  @Index('IDX_tasks_status')
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
    comment: 'Task priority level',
  })
  @Index('IDX_tasks_priority')
  priority: TaskPriority;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Task due date and time',
  })
  @Index('IDX_tasks_due_date')
  dueDate?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When task was started',
  })
  startedAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When task was completed',
  })
  completedAt?: Date;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Estimated duration in minutes',
  })
  estimatedDuration: number;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Actual duration in minutes',
  })
  actualDuration?: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Task completion notes',
  })
  completionNotes?: string;

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
    type: 'boolean',
    default: false,
    comment: 'Is task recurring',
  })
  isRecurring: boolean;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Recurrence rule configuration',
  })
  recurrenceRule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: Date;
    count?: number;
    byWeekDay?: number[];
    byMonthDay?: number[];
  };

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Next occurrence for recurring tasks',
  })
  nextOccurrence?: Date;

  // Relationships
  @Column('uuid', { nullable: true })
  assigneeId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigneeId' })
  assignee?: User;

  @Column('uuid', { nullable: true })
  creatorId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'creatorId' })
  creator?: User;

  @Column('uuid', { nullable: true })
  contactId?: string;

  @ManyToOne(() => Contact, (contact) => contact.tasks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  @Column('uuid', { nullable: true })
  dealId?: string;

  @ManyToOne(() => Deal, (deal) => deal.tasks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'dealId' })
  deal?: Deal;

  // Virtual properties
  get isOverdue(): boolean {
    if (!this.dueDate || this.status === TaskStatus.COMPLETED) return false;
    return new Date(this.dueDate) < new Date();
  }

  get isCompleted(): boolean {
    return this.status === TaskStatus.COMPLETED;
  }

  get isPending(): boolean {
    return this.status === TaskStatus.PENDING;
  }

  get isInProgress(): boolean {
    return this.status === TaskStatus.IN_PROGRESS;
  }

  get daysUntilDue(): number | null {
    if (!this.dueDate) return null;
    const today = new Date();
    const dueDate = new Date(this.dueDate);
    return Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  get estimatedHours(): number {
    return this.estimatedDuration / 60;
  }

  get actualHours(): number | null {
    return this.actualDuration ? this.actualDuration / 60 : null;
  }

  // Lifecycle hooks
  @BeforeInsert()
  @BeforeUpdate()
  updateStatus() {
    // Auto-update status based on conditions
    if (this.status === TaskStatus.COMPLETED && !this.completedAt) {
      this.completedAt = new Date();
    }

    if (this.status !== TaskStatus.COMPLETED && this.completedAt) {
      this.completedAt = null;
    }

    // Mark as overdue if past due date and not completed
    if (this.isOverdue && this.status === TaskStatus.PENDING) {
      this.status = TaskStatus.OVERDUE;
    }

    // Calculate actual duration if task is completed and was in progress
    if (
      this.status === TaskStatus.COMPLETED &&
      this.startedAt &&
      this.completedAt &&
      !this.actualDuration
    ) {
      this.actualDuration = Math.floor(
        (this.completedAt.getTime() - this.startedAt.getTime()) / (1000 * 60),
      );
    }
  }

  /**
   * Start working on the task
   */
  start(): void {
    if (this.status === TaskStatus.PENDING || this.status === TaskStatus.OVERDUE) {
      this.status = TaskStatus.IN_PROGRESS;
      this.startedAt = new Date();
    }
  }

  /**
   * Complete the task
   */
  complete(notes?: string): void {
    this.status = TaskStatus.COMPLETED;
    this.completedAt = new Date();
    if (notes) {
      this.completionNotes = notes;
    }

    // Calculate actual duration
    if (this.startedAt) {
      this.actualDuration = Math.floor(
        (this.completedAt.getTime() - this.startedAt.getTime()) / (1000 * 60),
      );
    }
  }

  /**
   * Cancel the task
   */
  cancel(reason?: string): void {
    this.status = TaskStatus.CANCELLED;
    if (reason) {
      this.completionNotes = `Cancelled: ${reason}`;
    }
  }

  /**
   * Reschedule the task to a new due date
   */
  reschedule(newDueDate: Date): void {
    this.dueDate = newDueDate;
    if (this.status === TaskStatus.OVERDUE) {
      this.status = TaskStatus.PENDING;
    }
  }

  /**
   * Get task priority score for sorting
   */
  getPriorityScore(): number {
    const priorityScores = {
      [TaskPriority.LOW]: 1,
      [TaskPriority.MEDIUM]: 2,
      [TaskPriority.HIGH]: 3,
      [TaskPriority.URGENT]: 4,
    };
    return priorityScores[this.priority] || 1;
  }
}