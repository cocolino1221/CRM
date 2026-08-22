import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { McpModule } from '../../src/mcp/mcp.module';
import authConfig from '../../src/config/auth.config';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
// Only imported for typing BootstrapTestAppOptions — deliberately NOT added
// to the TypeOrmModule `entities` list below. User has OneToMany relations
// to Contact/Deal/Task (which cascade into Company/Pipeline/Activity/etc.),
// and TypeORM's metadata builder requires every relation target to be
// registered or it throws at connection init. Pulling in that whole graph
// would defeat the point of a focused MCP test module, so callers that need
// an authenticated `req.user` build a plain (unpersisted) User-shaped object
// instead — see oauth-authorize.e2e-spec.ts.
import { User } from '../../src/database/entities/user.entity';
import { McpOauthClient } from '../../src/database/entities/mcp-oauth-client.entity';
import { McpOauthGrant } from '../../src/database/entities/mcp-oauth-grant.entity';
import { McpRefreshToken } from '../../src/database/entities/mcp-refresh-token.entity';
import { McpToolInvocation } from '../../src/database/entities/mcp-tool-invocation.entity';

export interface BootstrapTestAppOptions {
  /**
   * When provided, JwtAuthGuard is overridden so every request is treated
   * as authenticated with `currentUserRef.user` (read at request time, so
   * it can be assigned after the seeded user is created).
   */
  currentUserRef?: { user?: User };
}

/**
 * Builds a focused NestJS test application hosting the MCP module.
 *
 * IMPORTANT: hardcodes `database: 'slackcrm_mcp_e2e'` — do NOT read DB_NAME
 * from env. The env DB_NAME (slackcrm) is a migrated baseline DB that
 * dropSchema must never wipe.
 */
export async function bootstrapTestApp(
  options: BootstrapTestAppOptions = {},
): Promise<INestApplication> {
  const moduleBuilder = Test.createTestingModule({
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
  });

  if (options.currentUserRef) {
    const currentUserRef = options.currentUserRef;
    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = currentUserRef.user;
        return true;
      },
    });
  }

  const moduleFixture: TestingModule = await moduleBuilder.compile();

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
