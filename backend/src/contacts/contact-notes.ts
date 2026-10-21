/**
 * Answers a lead gave on the way in — on the booking page, on the shop's
 * thank-you page — added to the contact's Notes as bullet points, under a
 * heading that says where and when, so the caller reads them on the card.
 */
export interface NoteAnswer {
  question: string;
  answer: string;
}

const clean = (value: unknown, max: number) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function withAnswerNotes(
  existing: string | null | undefined,
  heading: string,
  answers: NoteAnswer[],
  when: Date = new Date(),
): string | null {
  const lines = answers
    .map((a) => ({ q: clean(a.question, 300), a: clean(a.answer, 2000) }))
    .filter((a) => a.a)
    .map((a) => (a.q ? `• ${a.q} — ${a.a}` : `• ${a.a}`));
  if (!lines.length) return null;

  const date = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', dateStyle: 'short' }).format(when);
  const block = `${heading} (${date}):\n${lines.join('\n')}`;
  const before = String(existing ?? '').trim();
  // The same answers twice (a retried webhook) are not written twice.
  if (before.includes(lines.join('\n'))) return null;
  return before ? `${before}\n\n${block}` : block;
}
