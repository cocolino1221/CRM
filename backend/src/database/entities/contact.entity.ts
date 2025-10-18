import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';
import { Company } from './company.entity';
import { Deal } from './deal.entity';
import { Task } from './task.entity';
import { Activity } from './activity.entity';

export enum ContactStatus {
  LEAD = 'lead',
  PROSPECT = 'prospect',
  QUALIFIED = 'qualified',
  CUSTOMER = 'customer',
  INACTIVE = 'inactive',
  CHURNED = 'churned',
}

export enum ContactSource {
  WEBSITE = 'website',
  REFERRAL = 'referral',
  SOCIAL_MEDIA = 'social_media',
  EMAIL_CAMPAIGN = 'email_campaign',
  COLD_OUTREACH = 'cold_outreach',
  EVENT = 'event',
  SLACK = 'slack',
  TYPEFORM = 'typeform',
  OTHER = 'other',
}

@Entity('contacts')
@Index('IDX_contacts_workspace_status', ['workspaceId', 'status'])
@Index('IDX_contacts_workspace_owner', ['workspaceId', 'ownerId'])
@Index('IDX_contacts_email_idx', ['email'])
@Index('IDX_contacts_lead_score_idx', ['leadScore'])
export class Contact extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Contact first name',
  })
  firstName: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Contact last name',
  })
  lastName: string;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Contact email address',
  })
  @Index('IDX_contacts_email')
  email: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Contact phone number',
  })
  phone?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Job title',
  })
  jobTitle?: string;

  @Column({
    type: 'enum',
    enum: ContactStatus,
    default: ContactStatus.LEAD,
    comment: 'Contact lifecycle status',
  })
  @Index('IDX_contacts_status')
  status: ContactStatus;

  @Column({
    type: 'enum',
    enum: ContactSource,
    nullable: true,
    comment: 'How contact was acquired',
  })
  source?: ContactSource;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Lead scoring (0-100)',
  })
  @Index('IDX_contacts_lead_score')
  leadScore: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Contact notes',
  })
  notes?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Custom fields for additional data',
  })
  customFields?: Record<string, any>;

  @Column({
    type: 'simple-array',
    nullable: true,
    comment: 'Tags for categorization',
  })
  tags?: string[];

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last time contact was reached out to',
  })
  lastContactedAt?: Date;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Email marketing opt-in status',
  })
  emailOptIn: boolean;

  // Relationships
  @Column('uuid', { nullable: true })
  ownerId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerId' })
  owner?: User;

  @Column('uuid', { nullable: true })
  companyId?: string;

  @ManyToOne(() => Company, (company) => company.contacts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'companyId' })
  company?: Company;

  @OneToMany(() => Deal, (deal) => deal.contact)
  deals: Deal[];

  @OneToMany(() => Task, (task) => task.contact)
  tasks: Task[];

  @OneToMany(() => Activity, (activity) => activity.contact)
  activities: Activity[];

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isQualified(): boolean {
    return [ContactStatus.QUALIFIED, ContactStatus.CUSTOMER].includes(this.status);
  }

  @BeforeInsert()
  @BeforeUpdate()
  validateData() {
    if (this.email) {
      this.email = this.email.toLowerCase().trim();
    }
  }

  updateLeadScore(): void {
    let score = 0;
    if (this.email) {
      const domain = this.email.split('@')[1];
      if (!['gmail.com', 'yahoo.com', 'hotmail.com'].includes(domain)) {
        score += 20;
      } else {
        score += 10;
      }
    }
    if (this.jobTitle) {
      const title = this.jobTitle.toLowerCase();
      if (title.includes('ceo') || title.includes('cto')) {
        score += 30;
      } else if (title.includes('manager')) {
        score += 20;
      }
    }
    if (this.companyId) score += 15;
    this.leadScore = Math.min(100, score);
  }
}