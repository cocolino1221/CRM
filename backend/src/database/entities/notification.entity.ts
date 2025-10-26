import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';

export enum NotificationType {
  LEAD = 'lead',
  TASK = 'task',
  EMAIL = 'email',
  CALL = 'call',
  MEETING = 'meeting',
  SYSTEM = 'system',
}

@Entity('notifications')
export class Notification extends WorkspaceEntity {
  @Column({
    type: 'enum',
    enum: NotificationType,
    comment: 'Type of notification',
  })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255, comment: 'Notification title' })
  title: string;

  @Column({ type: 'text', comment: 'Notification message' })
  message: string;

  @Column({ type: 'boolean', default: false, comment: 'Read status' })
  isRead: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: 'Optional link' })
  link?: string;

  @Column('uuid', { comment: 'User ID' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'jsonb', nullable: true, comment: 'Additional metadata' })
  metadata?: Record<string, any>;
}
