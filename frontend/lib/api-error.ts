/**
 * The message to show for a failed API call.
 *
 * NestJS answers a validation failure with `message` as an ARRAY of sentences.
 * Rendered straight into JSX those run together with no spaces between them,
 * so the one thing the person needs to read is the one thing they cannot.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as any)?.response?.data?.message;

  if (Array.isArray(message)) {
    const joined = message
      .map((line) => String(line ?? '').trim())
      .filter(Boolean)
      .join(' ');
    return joined || fallback;
  }

  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  return fallback;
}
