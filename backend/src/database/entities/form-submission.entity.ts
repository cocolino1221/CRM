import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Form } from './form.entity';
import { Contact } from './contact.entity';

export enum SubmissionStatus {
  NEW = 'new',
  REVIEWED = 'reviewed',
  CONVERTED = 'converted',
  SPAM = 'spam',
}

@Entity('form_submissions')
@Index('IDX_submissions_form_status', ['formId', 'status'])
@Index('IDX_submissions_form_created', ['formId', 'createdAt'])
export class FormSubmission extends BaseEntity {
  @Column('uuid')
  formId: string;

  @ManyToOne(() => Form, (form) => form.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'formId' })
  form: Form;

  @Column({
    type: 'jsonb',
    comment: 'Form submission data',
  })
  data: Record<string, any>;

  @Column({
    type: 'enum',
    enum: SubmissionStatus,
    default: SubmissionStatus.NEW,
    comment: 'Submission status',
  })
  @Index('IDX_submissions_status')
  status: SubmissionStatus;

  @Column({
    type: 'varchar',
    length: 45,
    nullable: true,
    comment: 'Submitter IP address',
  })
  ipAddress?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'User agent',
  })
  userAgent?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Referrer URL',
  })
  referrer?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'UTM parameters and tracking data',
  })
  trackingData?: Record<string, any>;

  @Column('uuid', { nullable: true })
  contactId?: string;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When submission was reviewed',
  })
  reviewedAt?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Review notes',
  })
  notes?: string;
}
