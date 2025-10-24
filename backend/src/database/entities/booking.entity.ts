import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';
import { Contact } from './contact.entity';
import { MeetingType } from './meeting-type.entity';
import { v4 as uuidv4 } from 'uuid';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
}

/**
 * Booked appointments/meetings
 */
@Entity('bookings')
@Index('IDX_bookings_workspace_host', ['workspaceId', 'hostId'])
@Index('IDX_bookings_start_time', ['startTime'])
@Index('IDX_bookings_status', ['status'])
@Index('IDX_bookings_confirmation_code', ['confirmationCode'])
export class Booking extends WorkspaceEntity {
  @Column('uuid')
  hostId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hostId' })
  host: User;

  @Column('uuid', { nullable: true })
  meetingTypeId?: string;

  @ManyToOne(() => MeetingType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meetingTypeId' })
  meetingType?: MeetingType;

  @Column('uuid', { nullable: true })
  contactId?: string;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  // Guest information (if not a contact)
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Guest name',
  })
  guestName?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Guest email',
  })
  guestEmail?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Guest phone',
  })
  guestPhone?: string;

  @Column({
    type: 'timestamptz',
    comment: 'Meeting start time',
  })
  @Index('IDX_bookings_start')
  startTime: Date;

  @Column({
    type: 'timestamptz',
    comment: 'Meeting end time',
  })
  endTime: Date;

  @Column({
    type: 'int',
    comment: 'Duration in minutes',
  })
  duration: number;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'UTC',
    comment: 'Timezone for this booking',
  })
  timezone: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'zoom',
    comment: 'Meeting location type',
  })
  locationType: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Meeting location/link',
  })
  location?: string;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
    comment: 'Booking status',
  })
  status: BookingStatus;

  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: 'Unique confirmation code',
  })
  confirmationCode: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional notes from guest',
  })
  notes?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Answers to custom questions',
  })
  customAnswers?: Record<string, any>;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Cancellation reason',
  })
  cancellationReason?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When the booking was cancelled',
  })
  cancelledAt?: Date;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Calendar event ID for sync',
  })
  calendarEventId?: string;

  @BeforeInsert()
  generateConfirmationCode() {
    if (!this.confirmationCode) {
      this.confirmationCode = uuidv4().substring(0, 8).toUpperCase();
    }
  }
}
