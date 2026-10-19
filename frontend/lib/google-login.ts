import api from '@/lib/api';

/**
 * Google sign-in for the web.
 *
 * The login is bound to the tab that started it. The binding used to ride in
 * a cookie set by the API, but the API is on another domain, so the browser
 * never sent it back on the exchange and every Google login ended in
 * "Failed to complete authentication". The tab now keeps the binding itself.
 */
const KEY = 'oauth_binding';

export async function startGoogleLogin(): Promise<void> {
  try {
    const { data } = await api.post('/auth/oauth/start', { source: 'web' });
    if (data?.authUrl && data?.binding) {
      try {
        sessionStorage.setItem(KEY, data.binding);
      } catch {
        // Storage refused (private mode): the cookie fallback may still work.
      }
      window.location.href = data.authUrl;
      return;
    }
  } catch {
    // Fall through to the older route rather than leave the button dead.
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  window.location.href = `${apiUrl}/auth/google`;
}

/** The binding for the exchange, read once: a code is good for one login. */
export function takeOAuthBinding(): string | undefined {
  try {
    const value = sessionStorage.getItem(KEY) || undefined;
    sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return undefined;
  }
}
