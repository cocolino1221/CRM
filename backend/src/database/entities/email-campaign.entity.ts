import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';

export enum EmailCampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('email_campaigns')
@Index('IDX_email_campaigns_workspace', ['workspaceId'])
@Index('IDX_email_campaigns_status', ['workspaceId', 'status'])
export class EmailCampaign extends WorkspaceEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Column({ type: 'text', nullable: true })
  htmlBody: string;

  @Column({ type: 'text', nullable: true })
  textBody: string;

  @Column({
    type: 'enum',
    enum: EmailCampaignStatus,
    default: EmailCampaignStatus.DRAFT,
  })
  status: EmailCampaignStatus;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  filters: {
    tags?: string[];
    statuses?: string[];
    sources?: string[];
  };

  @Column({ type: 'jsonb', nullable: true, default: {} })
  stats: {
    total?: number;
    sent?: number;
    failed?: number;
  };

  /** Optional: recipients uploaded from CSV — used instead of CRM contact filters */
  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  csvRecipients: Array<{ email: string; name?: string }>;

  @Column('uuid')
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdById' })
  createdBy: User;
}
