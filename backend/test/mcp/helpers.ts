import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { McpModule } from '../../src/mcp/mcp.module';
import authConfig from '../../src/config/auth.config';
import { McpOauthClient } from '../../src/database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../../src/database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../../src/database/entities/mcp-refresh-token.entity';
import { McpToolInvocation } from '../../src/database/entities/mcp-tool-invocation.entity';

/**
 * Builds a focused NestJS test application hosting the MCP module.
 *
 * IMPORTANT: hardcodes `database: 'slackcrm_mcp_e2e'` — do NOT read DB_NAME
 * from env. The env DB_NAME (slackcrm) is a migrated baseline DB that
 * dropSchema must never wipe.
 */
export async function bootstrapTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: ['.env.test', '.env'],
        load: [authConfig],
      }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: 'localhost',
        port: 55432,
        username: 'postgres',
        password: 'password',
        database: 'slackcrm_mcp_e2e',
        entities: [McpOauthClient, McpOauthGrant, McpRefreshToken, McpToolInvocation],
        synchronize: true,
        dropSchema: true,
        logging: false,
      }),
      McpModule,
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Replicate main.ts's prefix + exclusion so root-level well-known routes resolve.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      '.well-known/oauth-authorization-server',
      '.well-known/oauth-protected-resource',
    ],
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.init();
  return app;
}
