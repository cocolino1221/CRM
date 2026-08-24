import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('mcp_tool_invocations')
export class McpToolInvocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column() workspaceId: string;
  @Column() userId: string;
  @Index() @Column() toolName: string;
  @Column({ type: 'jsonb', nullable: true }) args: Record<string, any> | null;
  @Column() status: 'success' | 'denied' | 'error';
  @Column({ type: 'text', nullable: true }) error: string | null;
  @CreateDateColumn() createdAt: Date;
}
