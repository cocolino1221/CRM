import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';

export enum WorkflowStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DRAFT = 'draft',
  ERROR = 'error',
}

export enum WorkflowTriggerType {
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  DEAL_CREATED = 'deal.created',
  DEAL_UPDATED = 'deal.updated',
  DEAL_WON = 'deal.won',
  DEAL_LOST = 'deal.lost',
  TASK_CREATED = 'task.created',
  TASK_COMPLETED = 'task.completed',
  FORM_SUBMITTED = 'form.submitted',
  EMAIL_RECEIVED = 'email.received',
  WEBHOOK = 'webhook',
  SCHEDULE = 'schedule',
  PAYMENT_RECEIVED = 'payment.received',
}

export enum WorkflowActionType {
  SEND_EMAIL = 'send_email',
  SEND_SMS = 'send_sms',
  CREATE_TASK = 'create_task',
  CREATE_DEAL = 'create_deal',
  UPDATE_CONTACT = 'update_contact',
  ADD_TAG = 'add_tag',
  SEND_WEBHOOK = 'send_webhook',
  WAIT = 'wait',
  AI_AGENT = 'ai_agent',
  CREATE_INVOICE = 'create_invoice',
}

@Entity('workflows')
export class Workflow extends WorkspaceEntity {
  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.DRAFT,
  })
  status: WorkflowStatus;

  @Column({
    type: 'enum',
    enum: WorkflowTriggerType,
  })
  triggerType: WorkflowTriggerType;

  @Column({ type: 'jsonb', nullable: true })
  triggerConfig: any;

  @Column({ type: 'jsonb' })
  actions: WorkflowAction[];

  @Column({ type: 'int', default: 0 })
  executionCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastExecutedAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  lastError: any;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ type: 'uuid' })
  createdBy: string;

  @OneToMany(() => WorkflowExecution, (execution) => execution.workflow)
  executions: WorkflowExecution[];
}

export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  config: any;
  condition?: WorkflowCondition;
}

export interface WorkflowCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'not_equals';
  value: any;
}

@Entity('workflow_executions')
export class WorkflowExecution extends WorkspaceEntity {
  @ManyToOne(() => Workflow, (workflow) => workflow.executions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workflowId' })
  workflow: Workflow;

  @Column({ type: 'uuid' })
  workflowId: string;

  @Column({ type: 'enum', enum: ['success', 'failed', 'partial'] })
  status: 'success' | 'failed' | 'partial';

  @Column({ type: 'jsonb', nullable: true })
  triggerData: any;

  @Column({ type: 'jsonb', nullable: true })
  results: any[];

  @Column({ type: 'jsonb', nullable: true })
  errors: any[];

  @Column({ type: 'int', nullable: true })
  durationMs: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;
}
