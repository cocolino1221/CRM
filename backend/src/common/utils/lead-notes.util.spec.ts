import { appendDatedNote } from './lead-notes.util';

const DAY = new Date('2026-10-21T09:00:00Z');

/**
 * The "Notițe" box on a lead reads contact.notes. Two things a person writes
 * were going somewhere else instead: a call note stayed on the activity, and
 * the sheet's notes column was parked in customFields.sheetNotes, which no
 * screen shows. Reported from the field on 21.10.2026 as "nu apare ce notam
 * despre oameni, vreau sa apara in notite".
 */
describe('appendDatedNote', () => {
  it('writes a dated entry when the lead had no notes', () => {
    expect(appendDatedNote('', 'Revine marti', DAY)).toBe('21.10.2026 — Revine marti');
  });

  it('treats a missing field as empty', () => {
    expect(appendDatedNote(undefined, 'Revine marti', DAY)).toBe('21.10.2026 — Revine marti');
    expect(appendDatedNote(null, 'Revine marti', DAY)).toBe('21.10.2026 — Revine marti');
  });

  it('puts the newest entry first and keeps what was there', () => {
    const result = appendDatedNote('WooCommerce order #4967: 1× Ghid', 'E deja in echipa', DAY);

    expect(result).toBe('21.10.2026 — E deja in echipa\n\nWooCommerce order #4967: 1× Ghid');
  });

  // Nothing to add must be distinguishable from "the notes are now empty",
  // so the caller can leave the field alone.
  it('reports nothing to do for a blank note', () => {
    expect(appendDatedNote('Nota existenta', '   ', DAY)).toBeNull();
    expect(appendDatedNote('Nota existenta', undefined, DAY)).toBeNull();
  });

  // The call disposition can be saved again, and the sheet sync re-reads the
  // same row every ten minutes.
  it('reports nothing to do when that note is already on the lead', () => {
    expect(appendDatedNote('20.10.2026 — E deja in echipa', 'E deja in echipa', DAY)).toBeNull();
  });

  it('trims the note and collapses its inner whitespace', () => {
    expect(appendDatedNote('', '  Revine   marti  ', DAY)).toBe('21.10.2026 — Revine marti');
  });

  it('dates in Bucharest time, so a late evening note is not filed a day early', () => {
    // 23:30 UTC on the 21st is 02:30 on the 22nd in Bucharest.
    expect(appendDatedNote('', 'Tarziu', new Date('2026-10-21T23:30:00Z'))).toBe(
      '22.10.2026 — Tarziu',
    );
  });
});
