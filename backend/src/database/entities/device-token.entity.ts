import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';

export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

@Entity('device_tokens')
@Index('IDX_device_tokens_user', ['userId'])
@Index('IDX_device_tokens_token', ['token'], { unique: true })
export class DeviceToken extends WorkspaceEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 500 })
  token: string;

  @Column({ type: 'enum', enum: DevicePlatform })
  platform: DevicePlatform;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
