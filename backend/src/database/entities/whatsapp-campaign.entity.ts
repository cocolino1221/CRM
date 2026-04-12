import { Entity, Column, Index } from 'typeorm';
import { WorkspaceEntity } from './base.entity';

export enum WhatsAppCampaignStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

export interface WaCsvRecipient {
  phone: string;
  firstName?: string;
  lastName?: string;
  vars?: string[]; // positional template component params
}

@Entity('whatsapp_campaigns')
@Index('IDX_wa_campaigns_workspace', ['workspaceId'])
@Index('IDX_wa_campaigns_scheduled', ['status', 'scheduledAt'])
export class WhatsAppCampaign extends WorkspaceEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  templateName: string;

  @Column({ type: 'varchar', length: 20, default: 'pt_BR' })
  language: string;

  /** Global template params (used when recipient has no per-row vars) */
  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  templateParams: any[];

  /** Recipients from CSV upload — stored without creating CRM contacts */
  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  csvRecipients: WaCsvRecipient[];

  @Column({
    type: 'enum',
    enum: WhatsAppCampaignStatus,
    default: WhatsAppCampaignStatus.DRAFT,
  })
  status: WhatsAppCampaignStatus;

  @Column({ type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  stats: {
    total?: number;
    sent?: number;
    failed?: number;
  };

  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;
}
