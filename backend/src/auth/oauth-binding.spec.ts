import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * The hole this closes: the mobile app exchanged whatever auth code arrived
 * on its deep link. Any app on the device that can open etcrm://auth/callback
 * could hand it a code from the attacker's own login, and the user would be
 * signed into the attacker's account and type their data into it.
 *
 * Each login attempt now mints a secret that never travels through the
 * browser or the redirect. The code is bound to it, so a code obtained by
 * someone else cannot be redeemed by this client, and a code intercepted
 * from this client cannot be redeemed by anyone else.
 */
const SECRET = 'test-oauth-secret';

function build() {
  const jwtService = new JwtService({ secret: SECRET });
  const configService = {
    get: jest.fn((key: string) => (key === 'auth.jwtSecret' ? SECRET : undefined)),
  };

  const service = new AuthService(
    {} as any,
    {} as any,
    jwtService,
    configService as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, jwtService };
}

const authResponse = { user: { id: 'u-1' }, accessToken: 'a', refreshToken: 'r' } as any;

describe('OAuth login binding', () => {
  it('mints a secret that is hard to guess, and a different one each time', () => {
    const { service } = build();

    const a = service.createOAuthBinding();
    const b = service.createOAuthBinding();

    expect(a.binding).toMatch(/^[a-f0-9]{48,}$/);
    expect(a.binding).not.toBe(b.binding);
    expect(a.bindingHash).not.toBe(a.binding);
  });

  it('carries the hash in the state, and never the secret itself', () => {
    const { service, jwtService } = build();
    const { binding, bindingHash } = service.createOAuthBinding();

    const state = service.generateOAuthState('mobile', bindingHash);
    const decoded: any = jwtService.verify(state, { secret: SECRET });

    expect(decoded.bindingHash).toBe(bindingHash);
    expect(JSON.stringify(decoded)).not.toContain(binding);
  });

  it('reads the hash back off the state', () => {
    const { service } = build();
    const { bindingHash } = service.createOAuthBinding();

    const state = service.generateOAuthState('mobile', bindingHash);

    expect(service.getOAuthStateBindingHash(state)).toBe(bindingHash);
    expect(service.getOAuthStateSource(state)).toBe('mobile');
  });

  it('returns no hash for a state that carries none', () => {
    const { service } = build();

    expect(service.getOAuthStateBindingHash(service.generateOAuthState('web'))).toBeNull();
    expect(service.getOAuthStateBindingHash('nonsense')).toBeNull();
  });

  it('redeems a bound code when the right secret is presented', () => {
    const { service } = build();
    const { binding, bindingHash } = service.createOAuthBinding();

    const code = service.createOAuthAuthCode(authResponse, bindingHash);

    expect(service.consumeOAuthAuthCode(code, binding)).toMatchObject({ accessToken: 'a' });
  });

  // The attack: a code from someone else's login, injected into this client.
  it('refuses a bound code presented with the wrong secret', () => {
    const { service } = build();
    const attacker = service.createOAuthBinding();
    const ours = service.createOAuthBinding();

    const attackerCode = service.createOAuthAuthCode(authResponse, attacker.bindingHash);

    expect(() => service.consumeOAuthAuthCode(attackerCode, ours.binding)).toThrow(
      UnauthorizedException,
    );
  });

  it('refuses a bound code presented with no secret at all', () => {
    const { service } = build();
    const { bindingHash } = service.createOAuthBinding();

    const code = service.createOAuthAuthCode(authResponse, bindingHash);

    expect(() => service.consumeOAuthAuthCode(code)).toThrow(UnauthorizedException);
    expect(() => service.consumeOAuthAuthCode(code, '')).toThrow(UnauthorizedException);
  });

  // The browser flow has no deep link to hijack and no client to hold a
  // secret, so it keeps working exactly as before.
  it('still redeems an unbound code, for the web flow', () => {
    const { service } = build();

    const code = service.createOAuthAuthCode(authResponse);

    expect(service.consumeOAuthAuthCode(code)).toMatchObject({ accessToken: 'a' });
  });

  // The bypass the first version left open: start the login the old way,
  // get a state with no binding in it, and the exchange asks for nothing.
  it('refuses an unbound code that claims to be a mobile login', () => {
    const { service } = build();

    const code = service.createOAuthAuthCode(authResponse, undefined, 'mobile');

    expect(() => service.consumeOAuthAuthCode(code)).toThrow(UnauthorizedException);
  });

  it('refuses an unbound code when a binding is presented anyway', () => {
    const { service } = build();
    const { binding } = service.createOAuthBinding();

    const code = service.createOAuthAuthCode(authResponse);

    // Either the code lost its binding or this binding belongs elsewhere;
    // neither is a login worth completing.
    expect(() => service.consumeOAuthAuthCode(code, binding)).toThrow(UnauthorizedException);
  });

  it('still redeems a bound mobile code with its secret', () => {
    const { service } = build();
    const { binding, bindingHash } = service.createOAuthBinding();

    const code = service.createOAuthAuthCode(authResponse, bindingHash, 'mobile');

    expect(service.consumeOAuthAuthCode(code, binding)).toMatchObject({ accessToken: 'a' });
  });

  it('refuses a code that was not signed by us', () => {
    const { service } = build();
    const forged = new JwtService({ secret: 'someone-else' }).sign({
      type: 'oauth-auth-code',
      data: authResponse,
    });

    expect(() => service.consumeOAuthAuthCode(forged)).toThrow(UnauthorizedException);
  });
});
