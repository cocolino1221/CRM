import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { Workspace } from './workspace.entity';
import { Contact } from './contact.entity';
import { Deal } from './deal.entity';
import { Task } from './task.entity';

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CLOSER = 'closer',
  SETTER = 'setter',
  SALES_REP = 'sales_rep',
  SUPPORT_AGENT = 'support_agent',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@Entity('users')
@Index('IDX_users_workspace_email', ['workspaceId', 'email'], { unique: true })
@Index('IDX_users_workspace_status', ['workspaceId', 'status'])
export class User extends WorkspaceEntity {
  @ManyToOne(() => Workspace)
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'User email address',
  })
  @Index('IDX_users_email')
  email: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'User first name',
  })
  firstName: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'User last name',
  })
  lastName: string;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Hashed password',
  })
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.SALES_REP,
    comment: 'User role in workspace',
  })
  @Index('IDX_users_role')
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
    comment: 'User account status',
  })
  @Index('IDX_users_status')
  status: UserStatus;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Slack user ID for integration',
  })
  slackUserId?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'User avatar URL',
  })
  avatar?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'User preferences and settings',
  })
  preferences?: Record<string, any>;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Last login timestamp',
  })
  lastLoginAt?: Date;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Failed login attempts counter',
  })
  failedLoginAttempts: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Account locked until timestamp',
  })
  lockedUntil?: Date;

  @OneToMany(() => Contact, (contact) => contact.owner)
  contacts: Contact[];

  @OneToMany(() => Deal, (deal) => deal.owner)
  deals: Deal[];

  @OneToMany(() => Task, (task) => task.assignee)
  tasks: Task[];

  // Methods
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isLocked(): boolean {
    return this.lockedUntil ? this.lockedUntil > new Date() : false;
  }

  get isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  async validatePassword(password: string): Promise<boolean> {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, this.password);
  }

  updateLastLogin(): void {
    this.lastLoginAt = new Date();
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;
  }

  incrementFailedLoginAttempts(): void {
    this.failedLoginAttempts++;
    // Lock account after 5 failed attempts for 15 minutes
    if (this.failedLoginAttempts >= 5) {
      this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
  }

  resetFailedLoginAttempts(): void {
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;
  }

  hasPermission(action: string): boolean {
    // Role-based permission check
    switch (this.role) {
      case UserRole.ADMIN:
        return true; // Admin can do everything
      case UserRole.MANAGER:
        return !action.includes('admin'); // Manager can do most things except admin actions
      case UserRole.CLOSER:
        // Closers can manage deals, contacts, and close sales
        return ['read', 'create', 'update', 'deal', 'contact', 'close'].some(perm => action.includes(perm));
      case UserRole.SETTER:
        // Setters can create and qualify leads, schedule appointments
        return ['read', 'create', 'lead', 'contact', 'qualify', 'schedule'].some(perm => action.includes(perm));
      case UserRole.SALES_REP:
        return ['read', 'create', 'update'].some(perm => action.includes(perm));
      case UserRole.SUPPORT_AGENT:
        return ['read', 'update'].some(perm => action.includes(perm));
      default:
        return false;
    }
  }
}