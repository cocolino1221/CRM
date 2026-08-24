import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { Funnel } from './funnel.entity';
import { Contact } from './contact.entity';

export enum FunnelEnrollmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXITED = 'exited',
}

@Entity('funnel_enrollments')
@Index('IDX_funnel_enrollments_workspace_funnel', ['workspaceId', 'funnelId'])
@Index('IDX_funnel_enrollments_contact', ['contactId'])
export class FunnelEnrollment extends WorkspaceEntity {
  @Column('uuid')
  funnelId: string;

  @ManyToOne(() => Funnel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'funnelId' })
  funnel: Funnel;

  @Column('uuid')
  contactId: string;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column({ type: 'varchar', length: 32, comment: 'WhatsApp waId driving the flow for this enrollment' })
  waId: string;

  @Column({ type: 'enum', enum: FunnelEnrollmentStatus, default: FunnelEnrollmentStatus.ACTIVE })
  status: FunnelEnrollmentStatus;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'Current conversationFlows step id' })
  currentStepId?: string;

  @Column({ type: 'boolean', nullable: true, comment: 'Manually marked attended — the funnel branch signal' })
  attendedManual?: boolean;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  enrolledAt: Date;
}
