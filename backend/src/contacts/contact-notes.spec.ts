import { withAnswerNotes } from './contact-notes';

const WHEN = new Date('2026-10-21T09:00:00Z');

describe('withAnswerNotes', () => {
  it('adds the answers as bullet points under a dated heading', () => {
    expect(
      withAnswerNotes('Lead created from Typeform', 'Răspunsuri programare', [
        { question: 'Care e obiectivul tău?', answer: 'Slăbire' },
        { question: 'Ai mai încercat?', answer: 'Nu' },
      ], WHEN),
    ).toBe('Lead created from Typeform\n\nRăspunsuri programare (21.10.2026):\n• Care e obiectivul tău? — Slăbire\n• Ai mai încercat? — Nu');
  });

  it('starts the notes when there were none', () => {
    expect(withAnswerNotes(null, 'Pagina de mulțumire', [{ question: 'Q', answer: 'A' }], WHEN)).toBe(
      'Pagina de mulțumire (21.10.2026):\n• Q — A',
    );
  });

  it('writes nothing when nothing was answered', () => {
    expect(withAnswerNotes('x', 'H', [{ question: 'Q', answer: '  ' }], WHEN)).toBeNull();
  });

  // A webhook delivered again must not repeat the same lines.
  it('does not add the same answers twice', () => {
    const once = withAnswerNotes('', 'H', [{ question: 'Q', answer: 'A' }], WHEN)!;
    expect(withAnswerNotes(once, 'H', [{ question: 'Q', answer: 'A' }], WHEN)).toBeNull();
  });

  it('keeps a long answer on one line', () => {
    expect(withAnswerNotes('', 'H', [{ question: 'Q', answer: 'rândul unu\nrândul doi' }], WHEN)).toContain('• Q — rândul unu rândul doi');
  });
});
