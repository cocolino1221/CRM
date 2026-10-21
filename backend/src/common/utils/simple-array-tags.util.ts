/**
 * `tags` columns are declared `@Column({ type: 'simple-array' })`, which in
 * Postgres is a plain `text` column holding the values comma-joined — not
 * `text[]`. Postgres array operators therefore do not merely return the wrong
 * rows, they fail the whole statement:
 *
 *   contact.tags && :tags      -> operator does not exist: text && unknown
 *   :tag = ANY(task.tags)      -> op ANY/ALL (array) requires array on right side
 *
 * Split the stored string back into an array instead, so a filter matches a
 * whole tag: a naive `LIKE '%vip%'` would also match `vip-mare`, and `sunat`
 * would match `de sunat`.
 *
 * Matching is case-insensitive because that is how tags are deduplicated when
 * written (`dedupeTags` keys on the lowercased tag), so `VIP` and `vip` are the
 * same tag and only one of the two spellings is ever stored.
 */

/** Trim and collapse inner whitespace, mirroring how a tag is normalized on write. */
function normalizeTag(tag: unknown): string {
  return String(tag ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * The tags to match on, lowercased and with blanks dropped. An empty result
 * means the caller asked for nothing and the filter should be skipped — never
 * applied with an empty array, which would match no row at all.
 */
export function normalizeTagFilter(tags?: unknown): string[] {
  const list = Array.isArray(tags) ? tags : tags === undefined || tags === null ? [] : [tags];
  const seen = new Set<string>();

  for (const tag of list) {
    const normalized = normalizeTag(tag).toLowerCase();
    if (normalized) seen.add(normalized);
  }

  return [...seen];
}

/**
 * A WHERE fragment that is true when the comma-joined `column` contains any of
 * the tags bound to `paramName` (which must be a lowercased string array, as
 * returned by `normalizeTagFilter`).
 */
export function tagsOverlapCondition(column: string, paramName = 'tags'): string {
  return `string_to_array(lower(${column}), ',') && CAST(:${paramName} AS text[])`;
}
