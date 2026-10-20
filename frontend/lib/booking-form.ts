/**
 * The questions and age check before the booking calendar. The rules mirror
 * backend/src/scheduling/booking-form.ts — the server holds them too.
 */

export type BookingQuestionType = 'text' | 'choice' | 'yesno';

export interface BookingQuestion {
  id: string;
  label: string;
  type: BookingQuestionType;
  options?: string[];
  required: boolean;
}

export interface BookingForm {
  ageGate: { enabled: boolean; minAge: 16 | 18; blockedMessage: string };
  questions: BookingQuestion[];
}

export const MAX_QUESTIONS = 5;

export const EMPTY_BOOKING_FORM: BookingForm = {
  ageGate: {
    enabled: false,
    minAge: 18,
    blockedMessage: 'Ne pare rău, programările sunt disponibile doar persoanelor care au împlinit vârsta minimă.',
  },
  questions: [],
};

export function formOf(value: unknown): BookingForm {
  const raw: any = value && typeof value === 'object' ? value : {};
  return {
    ageGate: { ...EMPTY_BOOKING_FORM.ageGate, ...(raw.ageGate ?? {}) },
    questions: Array.isArray(raw.questions) ? raw.questions : [],
  };
}

/** The first unanswered required question, or a choice off the list. */
export function answersError(form: BookingForm, answers: Record<string, string>): string | null {
  for (const q of form.questions) {
    const value = String(answers[q.id] ?? '').trim();
    if (q.required && !value) return `Răspunde la: „${q.label}”.`;
    if (value && q.type === 'choice' && !q.options?.includes(value)) return `Alege una dintre variante la „${q.label}”.`;
  }
  return null;
}

/** What goes to the server as customAnswers. */
export function customAnswersFor(form: BookingForm, answers: Record<string, string>, ageConfirmed: boolean) {
  const out: Record<string, string | boolean> = {};
  for (const q of form.questions) {
    const value = String(answers[q.id] ?? '').trim();
    if (value) out[q.id] = value;
  }
  if (form.ageGate.enabled && ageConfirmed) out.ageConfirmed = true;
  return out;
}

/**
 * The WooCommerce order a thank-you page linked from: `?order=4892&key=wc_order_…`
 * (or `order_id=`). Only the id and WooCommerce's own key travel in the link.
 */
export function wooOrderFromQuery(params: URLSearchParams): { order: string; key: string } | null {
  const order = (params.get('order') || params.get('order_id') || '').replace(/\D/g, '');
  const key = (params.get('key') || '').trim();
  if (!order || !/^wc_order_[A-Za-z0-9]+$/.test(key)) return null;
  return { order, key };
}

/**
 * How the booking page can ask the CRM who the lead is, if the link allows:
 * a WooCommerce order (`order` + `key`) or a signed pass from a form the CRM
 * served (`t`). Null when the link carries neither.
 */
export function prefillQuery(params: URLSearchParams): URLSearchParams | null {
  const token = (params.get('t') || '').trim();
  if (/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+){2}$/.test(token)) return new URLSearchParams({ t: token });
  const woo = wooOrderFromQuery(params);
  return woo ? new URLSearchParams({ order: woo.order, key: woo.key }) : null;
}

/** A new question with an id nobody else in the list has. */
export function newQuestion(existing: BookingQuestion[]): BookingQuestion {
  let n = existing.length + 1;
  const ids = new Set(existing.map((q) => q.id));
  while (ids.has(`q${n}`)) n += 1;
  return { id: `q${n}`, label: '', type: 'text', required: true };
}

/** A named version of the booking page, with its own questions (`?v=<id>`). */
export interface BookingVariant {
  id: string;
  name: string;
  form: BookingForm;
}

export const MAX_VARIANTS = 10;

/** "Cumpărători carte!" → "cumparatori-carte" — the same rule the server uses. */
export function variantIdFrom(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

/** The booking link for a variant; the main page when there is none. */
export function variantLink(base: string, variantId?: string | null): string {
  return variantId ? `${base}?v=${encodeURIComponent(variantId)}` : base;
}

