import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';
import { Contact } from './contact.entity';
import { Deal } from './deal.entity';

export enum EventType {
  MEETING = 'meeting',
  CALL = 'call',
  TASK = 'task',
  DEADLINE = 'deadline',
  APPOINTMENT = 'appointment',
}

export enum EventStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
}

export enum MeetingPlatform {
  ZOOM = 'zoom',
  GOOGLE_MEET = 'google_meet',
  MICROSOFT_TEAMS = 'microsoft_teams',
  PHONE = 'phone',
  IN_PERSON = 'in_person',
  OTHER = 'other',
}

@Entity('events')
@Index('IDX_events_workspace_date', ['workspaceId', 'startDate'])
@Index('IDX_events_organizer', ['organizerId'])
export class Event extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Event title',
  })
  title: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Event description',
  })
  description?: string;

  @Column({
    type: 'enum',
    enum: EventType,
    default: EventType.MEETING,
    comment: 'Type of event',
  })
  type: EventType;

  @Column({
    type: 'enum',
    enum: EventStatus,
    default: EventStatus.SCHEDULED,
    comment: 'Event status',
  })
  status: EventStatus;

  @Column({
    type: 'timestamptz',
    comment: 'Event start date and time',
  })
  @Index('IDX_events_start_date')
  startDate: Date;

  @Column({
    type: 'timestamptz',
    comment: 'Event end date and time',
  })
  endDate: Date;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is all day event',
  })
  isAllDay: boolean;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Event location or meeting link',
  })
  location?: string;

  @Column({
    type: 'enum',
    enum: MeetingPlatform,
    nullable: true,
    comment: 'Meeting platform if virtual',
  })
  meetingPlatform?: MeetingPlatform;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Meeting link (Zoom, Google Meet, etc)',
  })
  meetingLink?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Meeting ID or room number',
  })
  meetingId?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Meeting password',
  })
  meetingPassword?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Event color for calendar display',
  })
  color?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Reminder settings',
  })
  reminders?: {
    email?: boolean;
    sms?: boolean;
    minutes?: number[];
  };

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is recurring event',
  })
  isRecurring: boolean;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Recurrence rule',
  })
  recurrenceRule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: Date;
    count?: number;
  };

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'External calendar event ID (Google Calendar, Outlook, etc)',
  })
  externalEventId?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Source of event (calendly, google_calendar, manual, etc)',
  })
  source?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Custom fields for additional data',
  })
  customFields?: Record<string, any>;

  // Relationships
  @Column('uuid', { comment: 'Event organizer/creator' })
  organizerId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizerId' })
  organizer: User;

  @ManyToMany(() => User)
  @JoinTable({
    name: 'event_attendees',
    joinColumn: { name: 'eventId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  attendees: User[];

  @Column('uuid', { nullable: true, comment: 'Related contact' })
  contactId?: string;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  @Column('uuid', { nullable: true, comment: 'Related deal' })
  dealId?: string;

  @ManyToOne(() => Deal, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dealId' })
  deal?: Deal;

  // Helper methods
  get duration(): number {
    return Math.floor((this.endDate.getTime() - this.startDate.getTime()) / (1000 * 60));
  }

  get isPast(): boolean {
    return this.endDate < new Date();
  }

  get isUpcoming(): boolean {
    return this.startDate > new Date();
  }

  get isToday(): boolean {
    const today = new Date();
    const start = new Date(this.startDate);
    return (
      start.getDate() === today.getDate() &&
      start.getMonth() === today.getMonth() &&
      start.getFullYear() === today.getFullYear()
    );
  }
}
