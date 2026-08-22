import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('mcp_oauth_grants')
@Index(['workspaceId', 'userId', 'clientId'], { unique: true })
export class McpOauthGrant {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() workspaceId: string;
  @Column() userId: string;
  @Column() clientId: string;
  @Column() clientName: string;
  @Column({ type: 'jsonb' }) scopes: string[];
  @Column({ default: false }) revoked: boolean;
  @Column({ type: 'timestamptz', nullable: true }) lastUsedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
