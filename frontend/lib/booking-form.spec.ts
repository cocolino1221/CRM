import { describe, expect, it } from 'vitest';
import { answersError, customAnswersFor, formOf, newQuestion, wooOrderFromQuery } from './booking-form';

const form = formOf({
  ageGate: { enabled: true, minAge: 18 },
  questions: [
    { id: 'goal', label: 'Obiectiv', type: 'choice', options: ['Slăbire', 'Masă'], required: true },
    { id: 'note', label: 'Altceva?', type: 'text', required: false },
  ],
});

describe('answersError', () => {
  it('asks for a required answer and refuses an off-list choice', () => {
    expect(answersError(form, {})).toMatch(/Obiectiv/);
    expect(answersError(form, { goal: 'X' })).toMatch(/variante/);
    expect(answersError(form, { goal: 'Masă' })).toBeNull();
  });
});

describe('customAnswersFor', () => {
  it('sends only what was answered, and the age confirmation when the gate is on', () => {
    expect(customAnswersFor(form, { goal: 'Masă', note: ' ' }, true)).toEqual({ goal: 'Masă', ageConfirmed: true });
    expect(customAnswersFor(formOf({}), {}, true)).toEqual({});
  });
});

describe('wooOrderFromQuery', () => {
  it('reads the order and its WooCommerce key', () => {
    expect(wooOrderFromQuery(new URLSearchParams('order=4892&key=wc_order_AbC123'))).toEqual({
      order: '4892',
      key: 'wc_order_AbC123',
    });
    expect(wooOrderFromQuery(new URLSearchParams('order_id=4892&key=wc_order_x1'))?.order).toBe('4892');
  });

  // Without the key anyone could walk order numbers and read buyers' details.
  it('ignores an order without a proper key', () => {
    expect(wooOrderFromQuery(new URLSearchParams('order=4892'))).toBeNull();
    expect(wooOrderFromQuery(new URLSearchParams('order=4892&key=abc'))).toBeNull();
  });
});

describe('newQuestion', () => {
  it('never reuses an id', () => {
    expect(newQuestion([{ id: 'q2', label: 'a', type: 'text', required: true }]).id).toBe('q3');
  });
});
