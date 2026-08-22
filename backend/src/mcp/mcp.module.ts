import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpTokenService } from './auth/mcp-token.service';
import { McpOauthClient } from '../database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../database/entities/mcp-refresh-token.entity';
import { McpToolInvocation } from '../database/entities/mcp-tool-invocation.entity';
import { WellKnownController } from './oauth/well-known.controller';
import { McpOauthController } from './oauth/mcp-oauth.controller';
import { McpOauthService } from './oauth/mcp-oauth.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      McpOauthClient,
      McpOauthGrant,
      McpRefreshToken,
      McpToolInvocation,
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
  exports: [McpTokenService, McpOauthService],
})
export class McpModule {}
