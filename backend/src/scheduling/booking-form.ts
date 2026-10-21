/**
 * What the public booking page asks before it shows the calendar: an optional
 * age check and a few questions the workspace writes itself. Stored on
 * workspace.settings.bookingForm — one page for the whole team, so one set of
 * questions, whichever closer the lead ends up with.
 */

export type BookingQuestionType = 'text' | 'choice' | 'yesno';

export interface BookingQuestion {
  id: string;
  label: string;
  type: BookingQuestionType;
  /** For "choice": what the lead picks from. */
  options?: string[];
  required: boolean;
}

export interface BookingAgeGate {
  enabled: boolean;
  /** The youngest who may book. */
  minAge: 16 | 18;
  /** Shown instead of the calendar to someone under minAge. */
  blockedMessage: string;
}

export interface BookingForm {
  ageGate: BookingAgeGate;
  questions: BookingQuestion[];
}

export const MAX_QUESTIONS = 5;
export const DEFAULT_BLOCKED_MESSAGE =
  'Ne pare rău, programările sunt disponibile doar persoanelor care au împlinit vârsta minimă.';

export const EMPTY_BOOKING_FORM: BookingForm = {
  ageGate: { enabled: false, minAge: 18, blockedMessage: DEFAULT_BLOCKED_MESSAGE },
  questions: [],
};

const text = (value: unknown, max: number): string => String(value ?? '').trim().slice(0, max);

/** Whatever comes in, what is stored: known keys, sane lengths, at most five questions. */
export function normalizeBookingForm(input: unknown): BookingForm {
  const raw: any = input && typeof input === 'object' ? input : {};
  const gate: any = raw.ageGate && typeof raw.ageGate === 'object' ? raw.ageGate : {};

  const questions: BookingQuestion[] = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((q: any, i: number): BookingQuestion | null => {
      const label = text(q?.label, 200);
      if (!label) return null;
      const type: BookingQuestionType = q?.type === 'choice' || q?.type === 'yesno' ? q.type : 'text';
      const options =
        type === 'choice'
          ? Array.from(
              new Set<string>((Array.isArray(q?.options) ? q.options : []).map((o: unknown) => text(o, 100)).filter(Boolean)),
            ).slice(0, 10)
          : undefined;
      // A choice with nothing to choose from is a text question in disguise.
      if (type === 'choice' && (!options || options.length < 2)) return null;
      const id = text(q?.id, 40).replace(/[^a-zA-Z0-9_-]/g, '') || `q${i + 1}`;
      return { id, label, type, ...(options ? { options } : {}), required: q?.required !== false };
    })
    .filter((q: BookingQuestion | null): q is BookingQuestion => !!q)
    .slice(0, MAX_QUESTIONS);

  // Ids must be unique: answers are keyed by them.
  const seen = new Set<string>();
  for (const q of questions) {
    while (seen.has(q.id)) q.id = `${q.id}_`;
    seen.add(q.id);
  }

  return {
    ageGate: {
      enabled: gate.enabled === true,
      minAge: Number(gate.minAge) === 16 ? 16 : 18,
      blockedMessage: text(gate.blockedMessage, 400) || DEFAULT_BLOCKED_MESSAGE,
    },
    questions,
  };
}

/**
 * Holds a booking's answers to the form. The page enforces the same rules, but
 * the request can be sent without the page — the age gate in particular has
 * to hold on the server.
 *
 * @returns the reason it is refused, or null.
 */
export function bookingFormError(form: BookingForm, answers: Record<string, any> | null | undefined): string | null {
  const given = answers && typeof answers === 'object' ? answers : {};
  if (form.ageGate.enabled && given.ageConfirmed !== true) {
    return `Programarea este disponibilă doar de la ${form.ageGate.minAge} ani.`;
  }
  for (const q of form.questions) {
    const value = text(given[q.id], 2000);
    if (q.required && !value) return `Răspunde la întrebarea: „${q.label}”.`;
    if (value && q.type === 'choice' && !q.options?.includes(value)) return `Alege una dintre variante la „${q.label}”.`;
    if (value && q.type === 'yesno' && value !== 'Da' && value !== 'Nu') return `Răspunde cu Da sau Nu la „${q.label}”.`;
  }
  return null;
}

/** Question and answer pairs, in the form's order — for the contact's Notes. */
export function answeredPairs(
  form: BookingForm,
  answers: Record<string, any> | null | undefined,
): Array<{ question: string; answer: string }> {
  const given = answers && typeof answers === 'object' ? answers : {};
  const pairs = form.questions
    .map((q) => ({ question: q.label, answer: text(given[q.id], 2000) }))
    .filter((p) => p.answer);
  if (form.ageGate.enabled && given.ageConfirmed === true) {
    pairs.unshift({ question: 'Vârstă', answer: `${form.ageGate.minAge}+ confirmat` });
  }
  return pairs;
}

/** The answers as lines a closer reads in the booking's notes. */
export function answersAsNotes(form: BookingForm, answers: Record<string, any> | null | undefined): string {
  const given = answers && typeof answers === 'object' ? answers : {};
  const lines = form.questions
    .map((q) => ({ q, a: text(given[q.id], 2000) }))
    .filter(({ a }) => a)
    .map(({ q, a }) => `${q.label}: ${a}`);
  if (form.ageGate.enabled && given.ageConfirmed === true) lines.unshift(`Vârstă: ${form.ageGate.minAge}+ confirmat`);
  return lines.join('\n');
}

/**
 * Named versions of the booking page: the same team calendar, each with its
 * own questions and age check — e.g. "Carte" with questions for book buyers,
 * while the main page (no variant) goes straight to the calendar for Typeform.
 * Picked by `?v=<id>` on the booking link.
 */
export interface BookingVariant {
  id: string;
  name: string;
  form: BookingForm;
}

export const MAX_VARIANTS = 10;

/** "Cumpărători carte!" → "cumparatori-carte". */
export function variantIdFrom(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export function normalizeBookingVariants(input: unknown): BookingVariant[] {
  const list: any[] = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: BookingVariant[] = [];
  for (const raw of list) {
    const name = String(raw?.name ?? '').trim().slice(0, 60);
    if (!name) continue;
    let id = variantIdFrom(raw?.id || name) || 'varianta';
    while (seen.has(id)) id = `${id}-2`.slice(0, 34);
    seen.add(id);
    out.push({ id, name, form: normalizeBookingForm(raw?.form) });
    if (out.length >= MAX_VARIANTS) break;
  }
  return out;
}

/**
 * The variant a link asks for, or none.
 *
 * Exact id first. Failing that, the longest id the value starts with: a
 * Typeform redirect written as `?v=carte{{field:…}}` (answers pasted on with
 * no `&name=`) arrives as `v=carteAna Pop…`, and that lead still belongs on
 * "carte", not on the main page.
 */
export function findVariant(variants: BookingVariant[], variantId?: string | null): BookingVariant | null {
  const id = String(variantId || '').trim().toLowerCase();
  if (!id) return null;
  const exact = variants.find((v) => v.id === id);
  if (exact) return exact;
  return (
    variants
      .filter((v) => id.startsWith(v.id))
      .sort((a, b) => b.id.length - a.id.length)[0] ?? null
  );
}

/** The form a link asks for: its variant's, or the main one when there is no such variant. */
export function formForVariant(main: BookingForm, variants: BookingVariant[], variantId?: string | null): BookingForm {
  return findVariant(variants, variantId)?.form ?? main;
}
