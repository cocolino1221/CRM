import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { UserRole } from '../../database/entities/user.entity';

export type McpAccessClaims = {
  workspaceId: string; userId: string; role: UserRole; scopes: string[]; typ: 'mcp-access';
};

@Injectable()
export class McpTokenService {
  constructor(private readonly jwt: JwtService) {}

  issueAccessToken(ctx: { workspaceId: string; userId: string; role: UserRole; scopes: string[] }): string {
    return this.jwt.sign({ ...ctx, typ: 'mcp-access' }, { expiresIn: '15m' });
  }

  verifyAccessToken(token: string): McpAccessClaims {
    let payload: any;
    try { payload = this.jwt.verify(token); } catch { throw new UnauthorizedException('invalid_token'); }
    if (payload?.typ !== 'mcp-access') throw new UnauthorizedException('invalid_token');
    return payload as McpAccessClaims;
  }

  issueRefreshToken(ctx: { grantId: string; workspaceId: string; userId: string; scopes: string[] }) {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const token = this.jwt.sign({ ...ctx, jti, typ: 'mcp-refresh' }, { expiresIn: '30d' });
    return { token, jti, expiresAt };
  }
}
