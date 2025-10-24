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

/**
 * Meeting types that can be booked (like Calendly event types)
 */
@Entity('meeting_types')
@Index('IDX_meeting_types_workspace_user', ['workspaceId', 'userId'])
@Index('IDX_meeting_types_slug', ['slug'])
export class MeetingType extends WorkspaceEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Meeting type name',
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
    comment: 'URL-friendly slug for booking page',
  })
  slug: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Meeting description',
  })
  description?: string;

  @Column({
    type: 'int',
    default: 30,
    comment: 'Duration in minutes',
  })
  duration: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Buffer time before meeting in minutes',
  })
  bufferBefore: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Buffer time after meeting in minutes',
  })
  bufferAfter: number;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'zoom',
    comment: 'Meeting location type (zoom, meet, phone, in-person)',
  })
  locationType: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Meeting location details',
  })
  location?: string;

  @Column({
    type: 'varchar',
    length: 7,
    default: '#3B82F6',
    comment: 'Color for calendar display',
  })
  color: string;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Is this meeting type active',
  })
  isActive: boolean;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is this a public booking page',
  })
  isPublic: boolean;

  @Column({
    type: 'int',
    default: 60,
    comment: 'Maximum days in advance that can be booked',
  })
  maxBookingDays: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Minimum hours notice required for booking',
  })
  minNoticeHours: number;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Custom questions for booking form',
  })
  customQuestions?: Array<{
    id: string;
    question: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox';
    required: boolean;
    options?: string[];
  }>;

  @BeforeInsert()
  generateSlug() {
    if (!this.slug && this.name) {
      this.slug = this.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
  }
}
