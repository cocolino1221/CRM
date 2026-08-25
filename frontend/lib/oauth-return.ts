/**
 * OAuth "returnTo" continuation for the MCP authorize flow.
 *
 * The MCP OAuth authorize endpoint (on the backend origin) redirects an
 * unauthenticated browser to this frontend's /login with a `returnTo` back to
 * itself. After the user authenticates here, we send them back to that URL to
 * finish the flow (consent → code → AI client).
 *
 * Because the frontend (Netlify) and backend (Fly) are on different origins,
 * the backend session cookie is NOT reliably sent on the cross-site top-level
 * navigation to authorize (Safari/ITP, embedded browsers). So we append the
 * access token as `?token=` — a param the backend's JwtStrategy already
 * accepts — making the continuation cookie-independent.
 *
 * The returnTo is validated to point ONLY at the backend API origin's MCP
 * authorize path, so this can never be used as an open redirect.
 */
export function buildOauthReturnUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  if (!returnTo) return null;

  try {
    const target = new URL(returnTo);
    const apiBase = new URL(
      process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1',
    );
    if (target.origin !== apiBase.origin || !target.pathname.includes('/oauth/mcp/authorize')) {
      return null;
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : null;
    if (token) {
      target.searchParams.set('token', token);
    }
    return target.toString();
  } catch {
    return null;
  }
}
