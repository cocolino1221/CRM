/**
 * The "Notițe" box on a lead reads `contact.notes`. Anything a person writes
 * about someone belongs there, newest first.
 *
 * Two places were writing elsewhere instead: a call disposition kept its note
 * on the activity, and the Sheets sync parked the sheet's notes column in
 * `customFields.sheetNotes`, which no screen shows.
 */

/**
 * @returns the field's new contents, or null when there is nothing to do —
 * which the caller must tell apart from "the notes are now empty", so it can
 * leave the field untouched.
 */
export function appendDatedNote(
  existing: string | null | undefined,
  note: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const incoming = String(note ?? '').trim().replace(/\s+/g, ' ');
  if (!incoming) return null;

  const current = String(existing ?? '').trim();
  // A disposition can be saved again and the sheet sync re-reads the same row
  // every ten minutes; neither may stack the same sentence twice.
  if (current.includes(incoming)) return null;

  const day = new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const entry = `${day} — ${incoming}`;

  return current ? `${entry}\n\n${current}` : entry;
}
