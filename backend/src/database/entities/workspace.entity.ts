import {
  Entity,
  Column,
  OneToMany,
  Index,
  Unique,
  BeforeInsert,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { randomBytes } from 'crypto';

export interface WorkspaceSettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  features: {
    aiEnabled: boolean;
    slackIntegration: boolean;
    emailIntegration: boolean;
    whatsappEnabled?: boolean;
    contactsEnabled?: boolean;
    leadsEnabled?: boolean;
    calendarEnabled?: boolean;
    pipelineEnabled?: boolean;
    tasksEnabled?: boolean;
    automationEnabled?: boolean;
    marketingEnabled?: boolean;
    mobileAppEnabled?: boolean;
  };
}

@Entity('workspaces')
@Unique(['domain'])
@Index('IDX_workspaces_name', ['name'])
export class Workspace extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Workspace name',
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    unique: true,
    comment: 'Workspace domain',
  })
  domain: string;

  @Column({
    type: 'enum',
    enum: ['trial', 'starter', 'professional', 'enterprise'],
    default: 'trial',
  })
  plan: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  isActive: boolean;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    unique: true,
    comment: 'Short invite code for joining this workspace',
  })
  inviteCode: string;

  @Column({
    type: 'jsonb',
    default: () => "'{}'",
  })
  settings: WorkspaceSettings;

  @BeforeInsert()
  generateInviteCode() {
    if (!this.inviteCode) {
      this.inviteCode = randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    }
  }

  regenerateInviteCode(): string {
    this.inviteCode = randomBytes(4).toString('hex').toUpperCase().slice(0, 8);
    return this.inviteCode;
  }
}
