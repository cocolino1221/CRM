import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('mcp_oauth_clients')
export class McpOauthClient {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ unique: true }) clientId: string;
  @Column({ type: 'jsonb' }) redirectUris: string[];
  @Column() clientName: string;
  @Column({ type: 'text', nullable: true }) clientUri: string | null;
  @CreateDateColumn() createdAt: Date;
}
