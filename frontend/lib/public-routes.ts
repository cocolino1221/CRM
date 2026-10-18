/**
 * Which paths a visitor may open without signing in.
 *
 * This used to be a Set inside AuthGuard, and it was missing `/p` — so every
 * landing page redirected an anonymous visitor to the login screen. A page
 * whose entire purpose is to receive strangers from an ad was reachable only
 * by people who already had an account.
 *
 * It lives here, tested, because the cost of the two mistakes is wildly
 * asymmetric: a route missing from this list silently destroys a campaign,
 * and a route wrongly added exposes the CRM. Neither shows up in a type
 * check.
 */

/** Matched exactly, or as a path prefix (`/p` also matches `/p/<slug>`). */
const PUBLIC_PREFIXES = [
  '/login',
  '/signin',
  '/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/platform-admin',
  '/privacy',
  '/terms',
  '/help',
  '/support',
  '/data-deletion',
  '/forms/public',
  // OAuth callback must stay public so tokens can be exchanged.
  '/auth/callback',
  // Landing pages. Every visitor here is a stranger by definition.
  '/p',
  // The booking page a Typeform lead is sent to. Same reasoning: whoever
  // opens it has no account and never will.
  '/book',
];

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  // A dot-segment resolves somewhere else than it reads: "/p/../dashboard"
  // looks public to a prefix test and lands in the CRM. Browsers do not
  // normalise the encoded forms, so those are checked too.
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is not something to grant access on.
    return false;
  }
  const segments = decoded.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) return false;
  if (decoded !== pathname && /%2f/i.test(pathname)) return false;

  if (pathname === '/') return true;

  // Compare segment by segment: a bare `startsWith` would let `/p` open
  // `/payments` and `/pipeline`, and `/platform-admin` open
  // `/platform-admin-secret`.
  return PUBLIC_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export const PUBLIC_ROUTE_PREFIXES = PUBLIC_PREFIXES;
