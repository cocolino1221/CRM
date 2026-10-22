/**
 * What a Meta access token has to look like before it is worth storing.
 *
 * A dataset's events endpoint answers a malformed token with Graph's own
 * low-level error — "Bad signature" — which surfaces as a failed event hours
 * later, long after the paste that caused it. Catching the shape at save time
 * turns that into a sentence the person can act on while they still have the
 * Events Manager tab open.
 *
 * Observed in production: 2.7 KB of something in the token field, Graph
 * answering "Bad signature" on every pipeline stage change.
 */

/** A system-user token is ~200–250 chars; these bounds only catch the absurd. */
const MIN_LENGTH = 30;
const MAX_LENGTH = 512;

/** Meta writes tokens URL-safe, and an app token as `{app-id}|{app-secret}`. */
const TOKEN_CHARACTERS = /^[A-Za-z0-9_|-]+$/;

const WHERE_TO_FIND_IT = 'Events Manager → Settings → Conversions API';

/**
 * The token with all whitespace removed. Tokens are long enough to get wrapped
 * by whatever the person copied them out of, and an embedded newline is enough
 * on its own for Graph to reject the token.
 */
export function cleanAccessToken(token?: unknown): string {
  return String(token ?? '').replace(/\s+/g, '');
}

/**
 * Why `token` cannot be a Meta access token, as a sentence to show the person,
 * or null when it looks like one. Expects an already-cleaned token.
 */
export function accessTokenProblem(token: string): string | null {
  if (!token) {
    return `The access token is missing. Generate one in ${WHERE_TO_FIND_IT} and paste it here.`;
  }

  if (token.length > MAX_LENGTH) {
    return (
      `That is ${token.length} characters long, and a Meta access token is about 200. ` +
      `Paste only the token from ${WHERE_TO_FIND_IT} — not the cURL command or the JSON snippet shown next to it.`
    );
  }

  if (token.length < MIN_LENGTH) {
    return (
      `That is only ${token.length} characters long, which is too short for a Meta access token (about 200). ` +
      `Copy the whole token from ${WHERE_TO_FIND_IT}.`
    );
  }

  if (!TOKEN_CHARACTERS.test(token)) {
    return (
      'A Meta access token is only letters, digits, "_" and "-". ' +
      `Paste only the token from ${WHERE_TO_FIND_IT} — not the cURL command or the JSON snippet shown next to it.`
    );
  }

  return null;
}

/** Longest run of token characters that can still be a word, not a credential. */
const TOKEN_LIKE = /[A-Za-z0-9_-]{20,}/g;
const MAX_MESSAGE_LENGTH = 300;

/**
 * Meta's error with the credential taken out of it.
 *
 * Graph echoes the token back in some errors — a bad one answers 400 with
 * `{"error":{"message":"Malformed access token EAA…"}}` — and that message is
 * both shown to the person and written to the log. Neither is a place for a
 * live token, so the value is removed, along with anything else shaped like
 * one in case Graph echoes only part of it.
 */
export function redactToken(message: string, token: string): string {
  const withoutToken = token ? message.split(token).join('[token]') : message;
  const masked = withoutToken.replace(TOKEN_LIKE, '[token]');
  return masked.length > MAX_MESSAGE_LENGTH ? `${masked.slice(0, MAX_MESSAGE_LENGTH - 1)}…` : masked;
}
