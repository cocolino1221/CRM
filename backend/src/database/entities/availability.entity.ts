import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

/**
 * User availability/working hours
 * Defines when a user is available for bookings
 */
@Entity('availabilities')
@Index('IDX_availabilities_workspace_user', ['workspaceId', 'userId'])
@Index('IDX_availabilities_day', ['dayOfWeek'])
export class Availability extends WorkspaceEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: DayOfWeek,
    comment: 'Day of the week',
  })
  dayOfWeek: DayOfWeek;

  @Column({
    type: 'time',
    comment: 'Start time (HH:MM format)',
  })
  startTime: string;

  @Column({
    type: 'time',
    comment: 'End time (HH:MM format)',
  })
  endTime: string;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Is this availability active',
  })
  isActive: boolean;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'UTC',
    comment: 'Timezone for this availability',
  })
  timezone: string;
}
