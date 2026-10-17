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
];

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;

  // Compare segment by segment: a bare `startsWith` would let `/p` open
  // `/payments` and `/pipeline`, and `/platform-admin` open
  // `/platform-admin-secret`.
  return PUBLIC_PREFIXES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export const PUBLIC_ROUTE_PREFIXES = PUBLIC_PREFIXES;
