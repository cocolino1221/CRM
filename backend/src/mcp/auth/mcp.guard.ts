import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../database/entities/user.entity';
import { McpTokenService } from './mcp-token.service';
import { McpAuthContext, mcpStore } from './mcp-auth.context';

/**
 * Bearer-token auth guard for the /mcp surface.
 *
 * Deliberately does NOT hit the database to check grant revocation on
 * every request — that would put a Neon round-trip on every MCP call.
 * Revocation is handled at the refresh-token layer (Task 13): access
 * tokens are short-lived (15m) and simply expire; there is no per-request
 * grant lookup here.
 *
 * NOTE on AsyncLocalStorage: a Nest guard cannot wrap the downstream
 * handler execution in `mcpStore.run(ctx, ...)` the way middleware could.
 * Instead we (a) attach the context to the request object as
 * `req.mcpContext` so a controller (Task 12) can explicitly do
 * `mcpStore.run(req.mcpContext, () => handler(...))`, and (b) call
 * `mcpStore.enterWith(ctx)` here, which sets the store for the remainder
 * of the current async execution context (i.e. everything downstream of
 * this guard within the same request), so `getMcpContext()` already works
 * without the controller needing to do anything.
 */
@Injectable()
export class McpGuard implements CanActivate {
  constructor(
    private readonly mcpTokenService: McpTokenService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const authHeader: string | undefined = req.headers?.authorization;
    const token = this.extractBearerToken(authHeader);
    if (!token) {
      this.unauthorized(res, 'missing_token');
    }

    let claims;
    try {
      claims = this.mcpTokenService.verifyAccessToken(token);
    } catch {
      this.unauthorized(res, 'invalid_token');
    }

    const user = await this.userRepository.findOne({
      where: {
        id: claims.userId,
        status: UserStatus.ACTIVE,
      },
      relations: ['workspace'],
    });

    if (!user) {
      this.unauthorized(res, 'user_not_found');
    }

    if (user.isLocked) {
      this.unauthorized(res, 'account_locked');
    }

    const ctx: McpAuthContext = {
      workspaceId: claims.workspaceId,
      userId: claims.userId,
      // Live role from the DB wins over the token's embedded role so a
      // role change takes effect immediately instead of waiting up to
      // 15m for the access token to expire.
      role: user.role,
      user,
      scopes: claims.scopes,
    };

    req.mcpContext = ctx;
    mcpStore.enterWith(ctx);

    return true;
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader || typeof authHeader !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    return match ? match[1].trim() : null;
  }

  private unauthorized(res: any, reason: string): never {
    res?.setHeader?.('WWW-Authenticate', 'Bearer');
    throw new UnauthorizedException(reason);
  }
}
