import { Entity, Column, Index } from 'typeorm';
import { WorkspaceEntity } from './base.entity';

export enum FunnelStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('funnels')
@Index('IDX_funnels_workspace_status', ['workspaceId', 'status'])
export class Funnel extends WorkspaceEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: FunnelStatus, default: FunnelStatus.DRAFT })
  status: FunnelStatus;

  @Column({ type: 'uuid', comment: 'WhatsApp Integration this funnel\'s flow belongs to' })
  integrationId: string;

  @Column({ type: 'varchar', length: 100, comment: 'id of an entry in that integration\'s config.conversationFlows' })
  flowId: string;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Anchor date for anchorOffset-timed steps, e.g. the webinar date/time' })
  anchorDate?: Date;
}
