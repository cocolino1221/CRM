import { JwtService } from '@nestjs/jwt';
import { McpTokenService } from './mcp-token.service';
import { UserRole } from '../../database/entities/user.entity';

describe('McpTokenService', () => {
  const jwt = new JwtService({ secret: 'test-secret-at-least-32-chars-long!!' });
  const svc = new McpTokenService(jwt);

  it('round-trips access token claims', () => {
    const token = svc.issueAccessToken({
      workspaceId: 'ws1', userId: 'u1', role: UserRole.CLOSER, scopes: ['crm.read'],
    });
    const claims = svc.verifyAccessToken(token);
    expect(claims).toMatchObject({ workspaceId: 'ws1', userId: 'u1', role: UserRole.CLOSER, scopes: ['crm.read'], typ: 'mcp-access' });
  });

  it('rejects a token with wrong typ', () => {
    const bad = jwt.sign({ typ: 'other', workspaceId: 'ws1' });
    expect(() => svc.verifyAccessToken(bad)).toThrow();
  });
});
