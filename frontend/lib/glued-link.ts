/**
 * A form redirect set up as ".../book/<slug>{{email}}{{phone}}" — without
 * "?email=" — glues the answers onto the slug. Once the server has said which
 * real slug the path starts with, this rebuilds the link as it should have
 * been, the answers as ?email= and ?phone=, so the page loads with them
 * filled in. Null when the path was not glued.
 */
export function unglueBookingLink(rawSlug: string, realSlug: string, search: string): string | null {
  let raw = rawSlug;
  try {
    raw = decodeURIComponent(rawSlug);
  } catch {
    /* already decoded */
  }
  if (!realSlug || raw === realSlug || !raw.startsWith(realSlug)) return null;

  let rest = raw.slice(realSlug.length);
  const params = new URLSearchParams(search);
  let email = rest.match(/[A-Za-z0-9._%-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/)?.[0];
  if (email) {
    rest = rest.replace(email, ' ');
    // A phone glued just before the email reads as the start of its address:
    // seven digits or more opening the address are the phone, not the name.
    const lead = email.match(/^(\+?\d{7,})(.+)$/);
    if (lead) {
      rest = `${lead[1]} ${rest}`;
      email = lead[2];
    }
    if (!params.get('email')) params.set('email', email.toLowerCase());
  }
  const phone = rest.match(/\+?\d[\d\s().-]{5,}\d/)?.[0]?.trim();
  if (phone && !params.get('phone')) params.set('phone', phone);

  const qs = params.toString();
  return `/book/${realSlug}${qs ? `?${qs}` : ''}`;
}
