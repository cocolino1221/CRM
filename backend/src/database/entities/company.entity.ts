import {
  Entity,
  Column,
  OneToMany,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { Contact } from './contact.entity';
import { Deal } from './deal.entity';

export enum CompanySize {
  STARTUP = 'startup',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  ENTERPRISE = 'enterprise',
}

export enum CompanyIndustry {
  TECHNOLOGY = 'technology',
  HEALTHCARE = 'healthcare',
  FINANCE = 'finance',
  EDUCATION = 'education',
  RETAIL = 'retail',
  MANUFACTURING = 'manufacturing',
  CONSULTING = 'consulting',
  REAL_ESTATE = 'real_estate',
  OTHER = 'other',
}

@Entity('companies')
@Index('IDX_companies_workspace_industry', ['workspaceId', 'industry'])
@Index('IDX_companies_workspace_size', ['workspaceId', 'size'])
@Index('IDX_companies_domain_idx', ['domain'])
export class Company extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Company name',
  })
  @Index('IDX_companies_name')
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Company website domain',
  })
  @Index('IDX_companies_domain')
  domain?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Company website URL',
  })
  website?: string;

  @Column({
    type: 'enum',
    enum: CompanyIndustry,
    nullable: true,
    comment: 'Company industry',
  })
  @Index('IDX_companies_industry')
  industry?: CompanyIndustry;

  @Column({
    type: 'enum',
    enum: CompanySize,
    nullable: true,
    comment: 'Company size',
  })
  @Index('IDX_companies_size')
  size?: CompanySize;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Number of employees',
  })
  employeeCount?: number;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Company phone number',
  })
  phone?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Company description',
  })
  description?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Company address information',
  })
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };

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
    type: 'boolean',
    default: true,
    comment: 'Is company active',
  })
  isActive: boolean;

  // Relationships
  @OneToMany(() => Contact, (contact) => contact.company)
  contacts: Contact[];

  @OneToMany(() => Deal, (deal) => deal.company)
  deals: Deal[];

  // Virtual properties
  get totalContacts(): number {
    return this.contacts?.length || 0;
  }

  get totalDeals(): number {
    return this.deals?.length || 0;
  }

  // Lifecycle hooks
  @BeforeInsert()
  @BeforeUpdate()
  validateData() {
    if (this.website && !this.domain) {
      try {
        const url = new URL(this.website.startsWith('http') ? this.website : `https://${this.website}`);
        this.domain = url.hostname.replace('www.', '');
      } catch {
        // Invalid URL, leave domain empty
      }
    }

    if (this.name) {
      this.name = this.name.trim();
    }
  }
}