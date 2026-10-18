import { describe, expect, it } from 'vitest';
import { parseOAuthRedirectUrl } from './oauth-callback';

describe('parseOAuthRedirectUrl', () => {
  it('reads the code off our own callback link', () => {
    const out = parseOAuthRedirectUrl('easyteamcrm://auth/callback?code=abc123');

    expect(out).toEqual({ code: 'abc123', error: undefined });
  });

  it('reads an error the server sent instead', () => {
    const out = parseOAuthRedirectUrl('easyteamcrm://auth/callback?error=access_denied');

    expect(out?.error).toBe('access_denied');
    expect(out?.code).toBeUndefined();
  });

  it('accepts the link however the host and path land', () => {
    for (const url of [
      'easyteamcrm://auth/callback?code=a',
      'easyteamcrm:///auth/callback?code=a',
      'easyteamcrm://auth/callback/?code=a',
    ]) {
      expect(parseOAuthRedirectUrl(url)?.code).toBe('a');
    }
  });

  // The old matcher accepted any URL containing /auth/callback anywhere, from
  // any scheme. A link another app opened could therefore hand this screen a
  // code, which is the whole attack.
  it('refuses a callback that is not on our scheme', () => {
    for (const url of [
      'otherapp://auth/callback?code=stolen',
      'https://evil.example.com/auth/callback?code=stolen',
      'https://evil.example.com/?next=easyteamcrm://auth/callback&code=stolen',
    ]) {
      expect(parseOAuthRedirectUrl(url)).toBeNull();
    }
  });

  it('refuses a link on our scheme that is not the callback', () => {
    expect(parseOAuthRedirectUrl('easyteamcrm://leads?code=a')).toBeNull();
    expect(parseOAuthRedirectUrl('easyteamcrm://auth/callback-not-really?code=a')).toBeNull();
  });

  it('is not case-sensitive about the scheme, which iOS may rewrite', () => {
    expect(parseOAuthRedirectUrl('EasyTeamCRM://auth/callback?code=a')?.code).toBe('a');
  });

  it('returns null rather than throwing on rubbish', () => {
    for (const url of ['', 'not a url', '://', null as any, undefined as any]) {
      expect(parseOAuthRedirectUrl(url)).toBeNull();
    }
  });

  it('returns the callback with nothing on it rather than inventing a code', () => {
    expect(parseOAuthRedirectUrl('easyteamcrm://auth/callback')).toEqual({
      code: undefined,
      error: undefined,
    });
  });
});
