import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';
import { FormSubmission } from './form-submission.entity';

export enum FormStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum FormFieldType {
  TEXT = 'text',
  EMAIL = 'email',
  PHONE = 'phone',
  NUMBER = 'number',
  TEXTAREA = 'textarea',
  SELECT = 'select',
  RADIO = 'radio',
  CHECKBOX = 'checkbox',
  DATE = 'date',
  FILE = 'file',
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // For select, radio, checkbox
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  defaultValue?: any;
  helpText?: string;
}

export interface FormSettings {
  submitButtonText?: string;
  successMessage?: string;
  redirectUrl?: string;
  notifyOnSubmit?: boolean;
  notifyEmails?: string[];
  allowMultipleSubmissions?: boolean;
  requireAuthentication?: boolean;
  captchaEnabled?: boolean;
}

@Entity('forms')
@Index('IDX_forms_workspace_status', ['workspaceId', 'status'])
export class Form extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Form name',
  })
  name: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Form description',
  })
  description?: string;

  @Column({
    type: 'enum',
    enum: FormStatus,
    default: FormStatus.DRAFT,
    comment: 'Form status',
  })
  @Index('IDX_forms_status')
  status: FormStatus;

  @Column({
    type: 'jsonb',
    comment: 'Form fields configuration',
  })
  fields: FormField[];

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Form settings',
  })
  settings?: FormSettings;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    comment: 'Unique form slug for public URL',
  })
  @Index('IDX_forms_slug')
  slug: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Number of form submissions',
  })
  submissionCount: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Number of form views',
  })
  viewCount: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last submission date',
  })
  lastSubmittedAt?: Date;

  // Relationships
  @Column('uuid')
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @OneToMany(() => FormSubmission, (submission) => submission.form)
  submissions: FormSubmission[];

  get conversionRate(): number {
    if (this.viewCount === 0) return 0;
    return (this.submissionCount / this.viewCount) * 100;
  }
}
