import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpTokenService } from './auth/mcp-token.service';
import { McpOauthClient } from '../database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../database/entities/mcp-refresh-token.entity';
import { McpToolInvocation } from '../database/entities/mcp-tool-invocation.entity';
import { User } from '../database/entities/user.entity';
import { WellKnownController } from './oauth/well-known.controller';
import { McpOauthController } from './oauth/mcp-oauth.controller';
import { McpOauthService } from './oauth/mcp-oauth.service';

/**
 * The MCP OAuth Authorization Server — deliberately split out from
 * `McpModule` (Task 12) so it can be booted in a focused e2e test without
 * dragging in the 7 heavy domain modules (Contacts/Deals/Tasks/Analytics/
 * Workflows/WhatsApp/EmailCampaigns) that `McpModule` now imports for the
 * tool-call endpoint. Those domain modules pull in Bull/Redis/the full
 * entity graph, which the focused OAuth e2e DB doesn't provide.
 *
 * `McpModule` imports this module and reuses `McpTokenService` (via
 * `JwtModule` + provider export) and `McpOauthService` from it rather than
 * re-declaring them.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      McpOauthClient,
      McpOauthGrant,
      McpRefreshToken,
      McpToolInvocation,
      User,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('auth.jwtSecret'),
        signOptions: { expiresIn: configService.get('auth.jwtExpiresIn') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [WellKnownController, McpOauthController],
  providers: [McpTokenService, McpOauthService],
  exports: [McpTokenService, McpOauthService, JwtModule],
})
export class McpOauthModule {}
