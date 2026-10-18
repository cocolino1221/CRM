/**
 * Reading the OAuth callback that arrives as a deep link.
 *
 * The matcher this replaces accepted any URL containing "/auth/callback"
 * anywhere in it, from any scheme — so a link opened by another app, or a web
 * page the user tapped, could hand the login screen a code. Anchoring to our
 * own scheme and the exact path is the first of the two locks; the binding
 * demanded at the exchange is the second.
 */

/** Must match `expo.scheme` in app.json. */
export const APP_SCHEME = 'easyteamcrm';

const CALLBACK_PATH = 'auth/callback';

export interface OAuthRedirect {
  code?: string;
  error?: string;
}

export function parseOAuthRedirectUrl(url: string | null | undefined): OAuthRedirect | null {
  if (typeof url !== 'string' || !url.trim()) return null;

  // iOS has been known to hand back the scheme in a different case.
  const [scheme] = url.split(':', 1);
  if (!scheme || scheme.toLowerCase() !== APP_SCHEME) return null;

  // Everything after the scheme, with any number of leading slashes gone, so
  // easyteamcrm://auth/callback and easyteamcrm:///auth/callback both land on
  // the same path. A custom scheme has no real authority component.
  const rest = url.slice(scheme.length + 1).replace(/^\/+/, '');
  const [pathAndQuery] = rest.split('#');
  const [rawPath, rawQuery = ''] = pathAndQuery.split('?');
  const path = rawPath.replace(/\/+$/, '').toLowerCase();

  if (path !== CALLBACK_PATH) return null;

  const params = new URLSearchParams(rawQuery);
  return {
    code: params.get('code') ?? undefined,
    error: params.get('error') ?? undefined,
  };
}
