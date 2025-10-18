import {
  Entity,
  Column,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { BaseEntity } from './base.entity';

export interface WorkspaceSettings {
  timezone: string;
  dateFormat: string;
  currency: string;
  features: {
    aiEnabled: boolean;
    slackIntegration: boolean;
    emailIntegration: boolean;
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
    type: 'jsonb',
    default: () => "'{}'",
  })
  settings: WorkspaceSettings;
}