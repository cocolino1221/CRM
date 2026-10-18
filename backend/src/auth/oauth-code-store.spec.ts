import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * The hole this closes is worse than the one the binding closed.
 *
 * The short-lived "auth code" was a JWT carrying the whole AuthResponse —
 * accessToken AND refreshToken — and it was placed in the deep-link URL. A
 * JWT payload is base64url, not encrypted, so any app that received the link
 * could decode it and read the refresh token without ever calling the
 * exchange. The binding was bypassed by a shorter path, and the same string
 * sat in browser history, Referer headers and proxy logs.
 *
 * The code is now an opaque handle. Nothing about the session travels in the
 * URL, and redeeming it consumes it.
 */
const SECRET = 'test-oauth-secret';

function build() {
  const jwtService = new JwtService({ secret: SECRET });
  const configService = {
    get: jest.fn((key: string) => (key === 'auth.jwtSecret' ? SECRET : undefined)),
  };
  return new AuthService(
    {} as any,
    {} as any,
    jwtService,
    configService as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

const authResponse = {
  user: { id: 'u-1', email: 'a@b.ro' },
  accessToken: 'ACCESS-TOKEN-SECRET',
  refreshToken: 'REFRESH-TOKEN-SECRET',
} as any;

describe('the OAuth auth code', () => {
  it('is an opaque handle, not a container', () => {
    const service = build();

    const code = service.createOAuthAuthCode(authResponse);

    // Nothing about the session may be recoverable from the string itself.
    expect(code).not.toContain('REFRESH-TOKEN-SECRET');
    expect(code).not.toContain('ACCESS-TOKEN-SECRET');
    expect(code).not.toContain('.');
    expect(code).toMatch(/^[a-f0-9]{32,}$/);
  });

  it('cannot be decoded back into the session, however it is read', () => {
    const service = build();

    const code = service.createOAuthAuthCode(authResponse);
    const decodedAttempts = [
      Buffer.from(code, 'base64').toString('utf8'),
      Buffer.from(code, 'hex').toString('utf8'),
      code,
    ].join(' ');

    expect(decodedAttempts).not.toContain('REFRESH-TOKEN-SECRET');
  });

  it('hands back the session to whoever redeems it properly', () => {
    const service = build();
    const { binding, bindingHash } = service.createOAuthBinding();

    const code = service.createOAuthAuthCode(authResponse, bindingHash, 'mobile');

    expect(service.consumeOAuthAuthCode(code, binding)).toMatchObject({
      refreshToken: 'REFRESH-TOKEN-SECRET',
    });
  });

  // Replay: the docstring always claimed the code was consumed; it never was.
  it('can be redeemed only once', () => {
    const service = build();
    const { binding, bindingHash } = service.createOAuthBinding();

    const code = service.createOAuthAuthCode(authResponse, bindingHash, 'mobile');
    service.consumeOAuthAuthCode(code, binding);

    expect(() => service.consumeOAuthAuthCode(code, binding)).toThrow(UnauthorizedException);
  });

  it('refuses a handle nobody issued', () => {
    const service = build();

    expect(() => service.consumeOAuthAuthCode('a'.repeat(64), 'x')).toThrow(UnauthorizedException);
    expect(() => service.consumeOAuthAuthCode('')).toThrow(UnauthorizedException);
  });

  it('refuses a handle whose moment has passed', () => {
    const service = build();
    const { binding, bindingHash } = service.createOAuthBinding();
    const code = service.createOAuthAuthCode(authResponse, bindingHash, 'mobile');

    const realNow = Date.now;
    Date.now = () => realNow() + 60 * 60 * 1000;
    try {
      expect(() => service.consumeOAuthAuthCode(code, binding)).toThrow(UnauthorizedException);
    } finally {
      Date.now = realNow;
    }
  });

  // The remaining way in: the web flow minted codes with no binding, and the
  // exchange accepted them when no binding was presented. An attacker could
  // complete a web login with their own account and push that code into a
  // victim's app.
  it('refuses any code presented without its binding, web flow included', () => {
    const service = build();
    const { bindingHash } = service.createOAuthBinding();

    const webCode = service.createOAuthAuthCode(authResponse, bindingHash, 'web');

    expect(() => service.consumeOAuthAuthCode(webCode)).toThrow(UnauthorizedException);
  });

  it('refuses a code issued with no binding at all', () => {
    const service = build();

    const code = service.createOAuthAuthCode(authResponse);

    expect(() => service.consumeOAuthAuthCode(code)).toThrow(UnauthorizedException);
    expect(() => service.consumeOAuthAuthCode(code, 'anything')).toThrow(UnauthorizedException);
  });

  it('refuses the right code with the wrong secret', () => {
    const service = build();
    const mine = service.createOAuthBinding();
    const theirs = service.createOAuthBinding();

    const code = service.createOAuthAuthCode(authResponse, mine.bindingHash, 'mobile');

    expect(() => service.consumeOAuthAuthCode(code, theirs.binding)).toThrow(
      UnauthorizedException,
    );
  });
});
