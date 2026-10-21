/**
 * The rules behind the tag box on a lead.
 *
 * They sit here, not in the component, because *.dom.spec.tsx cannot run in
 * this monorepo yet (see vitest.config.ts) — this way the behaviour a closer
 * depends on is actually covered.
 */

/** Same shape the API gives a tag, so what is typed survives a reload. */
export function normalizeTag(raw: string): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Folds every candidate in one pass, so a pasted "vip, de sunat" lands as two
 * tags and neither can slip in twice. Always returns a full list; the caller
 * compares lengths to tell whether anything was added.
 */
export function addTags(existing: string[], raws: string[]): string[] {
  const next = [...existing];
  const seen = new Set(next.map((tag) => normalizeTag(tag).toLowerCase()));

  for (const raw of raws) {
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

/**
 * Splits what is in the box at commas: tags are stored comma-joined, so a
 * comma can never live inside one — it ends the tag instead. Whatever follows
 * the last comma is still being typed.
 */
export function splitDraft(text: string): { tags: string[]; draft: string } {
  if (!text.includes(',')) return { tags: [], draft: text };
  const parts = text.split(',');
  const draft = parts.pop() ?? '';
  return { tags: parts, draft };
}
