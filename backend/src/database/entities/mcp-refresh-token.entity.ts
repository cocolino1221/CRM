import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('mcp_refresh_tokens')
export class McpRefreshToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ unique: true }) jti: string;
  @Column() grantId: string;
  @Column() workspaceId: string;
  @Column() userId: string;
  @Column({ type: 'jsonb' }) scopes: string[];
  @Column({ default: false }) revoked: boolean;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @CreateDateColumn() createdAt: Date;
}
