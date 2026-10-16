/**
 * Synthetic addresses this product writes when a channel gives us no real one.
 * They are not identities: hundreds of contacts share these shapes, so matching
 * on them would collapse unrelated people into one another.
 */
const PLACEHOLDER_DOMAIN = /\.placeholder\.invalid$/i;

/** Unrendered merge tags, e.g. ManyChat storing the literal "{{email}}". */
const UNRENDERED_TEMPLATE = /^\{\{.*\}\}$/;

/** Local parts people type when they are not giving a real address. */
const THROWAWAY_LOCAL_PARTS = new Set([
  'test',
  'tests',
  'asd',
  'asdf',
  'aaa',
  'qwe',
  'qwerty',
  'nu',
  'x',
  'xx',
  'xxx',
  'fgg',
  'noemail',
  'none',
]);

/**
 * Domains that only ever appear on throwaway entries in this workspace.
 * example.com/.org are deliberately NOT here: they are reserved documentation
 * domains that do not appear as shared junk in this data, and excluding them
 * would silently skip duplicate detection for anything using one.
 */
const THROWAWAY_DOMAINS = new Set(['test.test', 'test.com']);

/**
 * Normalize an email for use as an *identity* — the thing duplicate detection
 * and cross-channel matching key on.
 *
 * Returns null when the value cannot identify a person. That is deliberately
 * stricter than "is this a valid email": a syntactically perfect
 * `40755998877@whatsapp.placeholder.invalid` identifies a channel handle, not
 * a human, and treating it as an identity breaks contact creation for every
 * channel that generates one.
 */
export function normalizeIdentityEmail(value?: string | null): string | null {
  if (!value) return null;

  const email = String(value).trim().toLowerCase();
  if (!email) return null;

  if (UNRENDERED_TEMPLATE.test(email)) return null;

  const atIndex = email.indexOf('@');
  if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) return null;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (!localPart || !domain) return null;
  if (!domain.includes('.')) return null;
  if (domain.startsWith('.') || domain.endsWith('.')) return null;

  if (PLACEHOLDER_DOMAIN.test(domain)) return null;
  if (THROWAWAY_DOMAINS.has(domain)) return null;
  if (THROWAWAY_LOCAL_PARTS.has(localPart)) return null;

  return email;
}
