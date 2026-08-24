import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpGuard } from './auth/mcp.guard';
import { McpToolInvocation } from '../database/entities/mcp-tool-invocation.entity';
import { User } from '../database/entities/user.entity';
import { McpOauthModule } from './mcp-oauth.module';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { DealsModule } from '../deals/deals.module';
import { TasksModule } from '../tasks/tasks.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { EmailCampaignsModule } from '../email-campaigns/email-campaigns.module';

/**
 * Production MCP surface: OAuth Authorization Server (`McpOauthModule`) +
 * the tool-call endpoint (`McpController`/`McpService`), which needs the
 * real domain services injected. Split out of `McpOauthModule` (Task 12
 * regression fix) so a focused e2e test can boot just the OAuth AS without
 * the domain-module graph — see `mcp-oauth.module.ts` for the rationale.
 * `McpTokenService`/`McpOauthService` are reused from `McpOauthModule`,
 * not re-declared here.
 */
@Module({
  imports: [
    McpOauthModule,
    ContactsModule,
    DealsModule,
    TasksModule,
    AnalyticsModule,
    WorkflowsModule,
    WhatsAppModule,
    EmailCampaignsModule,
    TypeOrmModule.forFeature([McpToolInvocation, User]),
  ],
  controllers: [McpController],
  providers: [McpService, McpGuard],
})
export class McpModule {}
