/**
 * The rules behind the tag chips on a lead.
 *
 * `tags` is a simple-array column, so it reaches the app as an array on some
 * routes and as a comma-joined string on others — parseTags is what the lead
 * list and the lead sheet were each doing inline.
 */

/** Same shape the API gives a tag, so what is typed survives a reload. */
export function normalizeTag(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function parseTags(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return parts.map(normalizeTag).filter(Boolean);
}

/**
 * Folds every candidate in one pass, so a tag typed with a comma in it lands
 * as two and neither can slip in twice. A comma can never live inside a tag:
 * the column is comma-joined, so it would split on the way back out.
 */
export function addTags(existing: string[], raws: string[]): string[] {
  const next = [...existing];
  const seen = new Set(next.map((tag) => normalizeTag(tag).toLowerCase()));

  for (const raw of raws.flatMap((candidate) => String(candidate ?? '').split(','))) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(tag);
  }

  return next;
}

export function removeTag(existing: string[], tag: string): string[] {
  return existing.filter((candidate) => candidate !== tag);
}
