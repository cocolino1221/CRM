/**
 * `tags` columns are declared `@Column({ type: 'simple-array' })`, which in
 * Postgres is a plain `text` column holding the values comma-joined — not
 * `text[]`. Two consequences, one for reading and one for writing.
 *
 * Reading: Postgres array operators do not merely return the wrong rows, they
 * fail the whole statement:
 *
 *   contact.tags && :tags      -> operator does not exist: text && unknown
 *   :tag = ANY(task.tags)      -> op ANY/ALL (array) requires array on right side
 *
 * Writing: the join escapes nothing, so a tag that itself contains a comma is
 * stored as two tags and reads back as two tags. Splitting on write is what
 * makes what was stored and what comes back agree — a form title like
 * "Consultatie, Bihor" arriving as a tag from Typeform would otherwise be one
 * tag going in and two coming out.
 */

/** Trim and collapse inner whitespace. One tag, comma handling aside. */
function trimTag(tag: unknown): string {
  return String(tag ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * The key two spellings of one tag share. Tags are compared case-insensitively
 * throughout — a closer searching for `vip` must find `VIP` — so only one
 * spelling of a tag is ever stored.
 */
export function tagKey(tag: unknown): string {
  return trimTag(tag).toLowerCase();
}

/** Every tag in one input value, commas split out and blanks dropped. */
function splitTag(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map(trimTag)
    .filter(tag => tag.length > 0);
}

/**
 * The tags to store: commas split out, whitespace normalized, and duplicates
 * dropped case-insensitively, keeping the first spelling given.
 */
export function normalizeTags(tags?: unknown): string[] {
  const list = Array.isArray(tags) ? tags : tags === undefined || tags === null ? [] : [tags];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of list) {
    for (const tag of splitTag(value)) {
      const key = tagKey(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(tag);
    }
  }

  return result;
}

/** The tags a contact should carry once `incoming` is added to `existing`. */
export function mergeTags(existing?: unknown, incoming?: unknown): string[] {
  const left = Array.isArray(existing) ? existing : existing === undefined || existing === null ? [] : [existing];
  const right = Array.isArray(incoming) ? incoming : incoming === undefined || incoming === null ? [] : [incoming];
  return normalizeTags([...left, ...right]);
}

/**
 * The tags to match on, lowercased. An empty result means the caller asked for
 * nothing and the filter should be skipped — never applied with an empty array,
 * which would match no row at all.
 */
export function normalizeTagFilter(tags?: unknown): string[] {
  return normalizeTags(tags).map(tag => tag.toLowerCase());
}

/**
 * A WHERE fragment that is true when the comma-joined `column` contains any of
 * the tags bound to `paramName` (which must be a lowercased string array, as
 * returned by `normalizeTagFilter`).
 */
export function tagsOverlapCondition(column: string, paramName = 'tags'): string {
  return `string_to_array(lower(${column}), ',') && CAST(:${paramName} AS text[])`;
}
