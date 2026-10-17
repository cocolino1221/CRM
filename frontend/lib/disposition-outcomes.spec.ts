import { describe, expect, it } from 'vitest';
import {
  OUTCOMES,
  buildDispositionPayload,
  defaultFollowUpFor,
  dispositionEndpoint,
  outcomeByKey,
} from './disposition-outcomes';

const ctx = { contactId: 'contact-1', contactName: 'Ionela Pop', durationSeconds: 92 };

describe('the outcome table', () => {
  it('has exactly the seven outcomes from the spec', () => {
    expect(OUTCOMES.map((o) => o.label)).toEqual([
      'A răspuns — interesat',
      'A răspuns — nu acum',
      'A răspuns — refuz',
      'N-a răspuns',
      'Mesagerie vocală',
      'Ocupat',
      'Programat',
    ]);
  });

  it('maps each row to the ActivityOutcome the spec names', () => {
    expect(OUTCOMES.map((o) => o.outcome)).toEqual([
      'successful',
      'successful',
      'failed',
      'no_answer',
      'voicemail',
      'busy',
      'scheduled',
    ]);
  });

  it('is selectable by the number keys 1 to 7', () => {
    expect(OUTCOMES.map((o) => o.key)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(outcomeByKey('4')?.outcome).toBe('no_answer');
    expect(outcomeByKey('8')).toBeUndefined();
  });
});

describe('default follow-ups', () => {
  const now = new Date('2026-10-17T09:00:00Z');

  it('gives Ocupat a callback one hour out', () => {
    const at = defaultFollowUpFor('busy', now);
    expect(at).toBe(new Date('2026-10-17T10:00:00Z').toISOString());
  });

  it('gives "nu acum" three days out', () => {
    const at = defaultFollowUpFor('not_now', now);
    expect(at).toBe(new Date('2026-10-20T09:00:00Z').toISOString());
  });

  // The spec: "Reason, no follow-up".
  it('gives a refusal no follow-up at all', () => {
    expect(defaultFollowUpFor('refused', now)).toBeNull();
  });

  it('leaves no answer and voicemail for the caller to choose', () => {
    expect(defaultFollowUpFor('no_answer', now)).toBeNull();
    expect(defaultFollowUpFor('voicemail', now)).toBeNull();
  });
});

describe('the payload', () => {
  it('carries the outcome and the request id', () => {
    const p = buildDispositionPayload({
      row: OUTCOMES[2],
      notes: 'nu e interesat',
      clientRequestId: 'req-1',
      ...ctx,
    });

    expect(p.outcome).toBe('failed');
    expect(p.clientRequestId).toBe('req-1');
    expect(p.notes).toBe('nu e interesat');
  });

  it('omits an empty note rather than sending blank text', () => {
    const p = buildDispositionPayload({
      row: OUTCOMES[2],
      notes: '   ',
      clientRequestId: 'req-1',
      ...ctx,
    });

    expect('notes' in p).toBe(false);
  });

  it('sends a deal only for the interested outcome', () => {
    const interested = buildDispositionPayload({
      row: OUTCOMES[0],
      amount: '2500',
      clientRequestId: 'req-1',
      ...ctx,
    });
    const refused = buildDispositionPayload({
      row: OUTCOMES[2],
      amount: '2500',
      clientRequestId: 'req-1',
      ...ctx,
    });

    expect(interested.deal).toEqual({ value: 2500, currency: 'RON' });
    expect(refused.deal).toBeUndefined();
  });

  // A caller who tabs past the amount field must not create a 0 RON deal.
  it('sends no deal for a blank, zero or junk amount', () => {
    for (const amount of ['', '  ', '0', 'abc', '-50']) {
      const p = buildDispositionPayload({
        row: OUTCOMES[0],
        amount,
        clientRequestId: 'req-1',
        ...ctx,
      });
      expect(p.deal).toBeUndefined();
    }
  });

  it('accepts an amount typed with a comma, as a Romanian keyboard gives it', () => {
    const p = buildDispositionPayload({
      row: OUTCOMES[0],
      amount: '1250,50',
      clientRequestId: 'req-1',
      ...ctx,
    });

    expect(p.deal).toEqual({ value: 1250.5, currency: 'RON' });
  });

  it('names the contact in the follow-up task so the caller knows who to ring', () => {
    const p = buildDispositionPayload({
      row: OUTCOMES[5],
      followUpAt: '2026-10-17T10:00:00.000Z',
      clientRequestId: 'req-1',
      ...ctx,
    });

    expect(p.followUp).toEqual({
      at: '2026-10-17T10:00:00.000Z',
      title: 'Revenire apel — Ionela Pop',
    });
  });

  it('adds contact and duration only when there is no activity to attach to', () => {
    const manual = buildDispositionPayload({
      row: OUTCOMES[5],
      clientRequestId: 'req-1',
      ...ctx,
    });
    const attached = buildDispositionPayload({
      row: OUTCOMES[5],
      activityId: 'activity-1',
      clientRequestId: 'req-1',
      ...ctx,
    });

    expect(manual.contactId).toBe('contact-1');
    expect(manual.durationSeconds).toBe(92);
    expect(attached.contactId).toBeUndefined();
    expect(attached.durationSeconds).toBeUndefined();
  });

  it('marks a booking as sent only when the caller ticked it', () => {
    const ticked = buildDispositionPayload({
      row: OUTCOMES[6],
      bookingSent: true,
      clientRequestId: 'req-1',
      ...ctx,
    });
    const not = buildDispositionPayload({ row: OUTCOMES[6], clientRequestId: 'req-1', ...ctx });

    expect(ticked.bookingSent).toBe(true);
    expect(not.bookingSent).toBeUndefined();
  });
});

describe('the endpoint', () => {
  it('attaches to an existing activity when there is one', () => {
    expect(dispositionEndpoint('activity-1')).toBe('/activities/activity-1/disposition');
  });

  it('creates the activity when the call was never logged', () => {
    expect(dispositionEndpoint(undefined)).toBe('/activities/disposition');
  });
});
