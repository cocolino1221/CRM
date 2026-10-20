import { answersAsNotes, bookingFormError, normalizeBookingForm, DEFAULT_BLOCKED_MESSAGE } from './booking-form';

describe('normalizeBookingForm', () => {
  it('starts with the gate off and no questions', () => {
    expect(normalizeBookingForm(undefined)).toEqual({
      ageGate: { enabled: false, minAge: 18, blockedMessage: DEFAULT_BLOCKED_MESSAGE },
      questions: [],
    });
  });

  it('keeps 16 or 18 and nothing else', () => {
    expect(normalizeBookingForm({ ageGate: { enabled: true, minAge: 16 } }).ageGate.minAge).toBe(16);
    expect(normalizeBookingForm({ ageGate: { enabled: true, minAge: 21 } }).ageGate.minAge).toBe(18);
  });

  it('drops empty questions, choices without options, and caps at five', () => {
    const form = normalizeBookingForm({
      questions: [
        { label: '' },
        { label: 'Obiectiv', type: 'choice', options: ['Slăbire'] },
        ...Array.from({ length: 7 }, (_, i) => ({ label: `Q${i}`, type: 'text' })),
      ],
    });
    expect(form.questions).toHaveLength(5);
    expect(form.questions.every((q) => q.type === 'text')).toBe(true);
  });

  it('keeps answer keys unique', () => {
    const form = normalizeBookingForm({ questions: [{ id: 'a', label: 'X' }, { id: 'a', label: 'Y' }] });
    expect(new Set(form.questions.map((q) => q.id)).size).toBe(2);
  });

  it('ignores unknown keys', () => {
    expect(normalizeBookingForm({ evil: 1 } as any)).not.toHaveProperty('evil');
  });
});

describe('bookingFormError', () => {
  const form = normalizeBookingForm({
    ageGate: { enabled: true, minAge: 18 },
    questions: [
      { id: 'goal', label: 'Obiectiv', type: 'choice', options: ['Slăbire', 'Masă'], required: true },
      { id: 'tried', label: 'Ai mai încercat?', type: 'yesno', required: false },
    ],
  });

  // The page can be skipped; the server must still keep minors out.
  it('refuses a booking that did not confirm the age', () => {
    expect(bookingFormError(form, { goal: 'Slăbire' })).toMatch(/18 ani/);
  });

  it('refuses a missing required answer and an option that is not on the list', () => {
    expect(bookingFormError(form, { ageConfirmed: true })).toMatch(/Obiectiv/);
    expect(bookingFormError(form, { ageConfirmed: true, goal: 'Altceva' })).toMatch(/variante/);
  });

  it('accepts a complete form', () => {
    expect(bookingFormError(form, { ageConfirmed: true, goal: 'Masă', tried: 'Nu' })).toBeNull();
  });

  it('asks nothing of a workspace that set nothing', () => {
    expect(bookingFormError(normalizeBookingForm({}), undefined)).toBeNull();
  });
});

describe('answersAsNotes', () => {
  it('writes the answers as lines for the closer', () => {
    const form = normalizeBookingForm({ ageGate: { enabled: true, minAge: 16 }, questions: [{ id: 'goal', label: 'Obiectiv' }] });
    expect(answersAsNotes(form, { ageConfirmed: true, goal: 'Slăbire' })).toBe('Vârstă: 16+ confirmat\nObiectiv: Slăbire');
  });
});
