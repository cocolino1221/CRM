import { describe, expect, it } from 'vitest';
import { LEAD_MOVES, bookingProviderOf, buildMovePayloads, isOnlineMeeting, moveById } from './lead-moves';

const contact = { id: 'c-1', firstName: 'Ionela', lastName: 'Pop' };
const base = { contact, notes: '', clientRequestId: 'req-1' };

describe('the moves offered', () => {
  it('offers the states a caller moves a lead between', () => {
    expect(LEAD_MOVES.map((m) => m.id)).toEqual([
      'scheduled',
      'won',
      'lost',
      'callback',
      'note',
    ]);
  });

  it('labels them in Romanian', () => {
    for (const move of LEAD_MOVES) {
      expect(move.label.length).toBeGreaterThan(0);
      expect(move.label).not.toBe(move.id);
    }
  });

  it('says which ones need something more before they can be saved', () => {
    expect(moveById('scheduled')?.needs).toBe('datetime');
    expect(moveById('won')?.needs).toBe('amount');
    expect(moveById('callback')?.needs).toBe('datetime');
    expect(moveById('lost')?.needs).toBeUndefined();
    expect(moveById('note')?.needs).toBeUndefined();
  });
});

describe('buildMovePayloads', () => {
  // The badge on the row comes from real bookings. A "Programat" that only
  // wrote an outcome would leave the row unchanged — the caller would tick it
  // and watch nothing happen.
  it('books a real appointment when moving to Programat', () => {
    const out = buildMovePayloads({
      ...base,
      move: 'scheduled',
      meetingKind: 'zoom',
      at: '2026-10-20T09:00:00.000Z',
      hostId: 'user-1',
    });

    expect(out.booking).toEqual({
      hostId: 'user-1',
      contactId: 'c-1',
      startTime: '2026-10-20T09:00:00.000Z',
      duration: 30,
      notes: undefined,
      meetingProvider: 'zoom',
    });
    expect(out.disposition.outcome).toBe('scheduled');
  });

  // A phone appointment must not make the server create a Zoom or Meet link.
  it('books a phone call without a meeting link', () => {
    const out = buildMovePayloads({
      ...base,
      move: 'scheduled',
      meetingKind: 'call',
      at: '2026-10-20T09:00:00.000Z',
      hostId: 'user-1',
    });

    expect(out.booking?.meetingProvider).toBe('phone');
  });

  it('asks whether it is a call or Zoom before anything else', () => {
    const out = buildMovePayloads({ ...base, move: 'scheduled', at: '2026-10-20T09:00:00.000Z', hostId: 'user-1' });

    expect(out.booking).toBeNull();
    expect(out.error).toMatch(/apel sau Zoom/);
  });

  it('refuses to book without a time', () => {
    const out = buildMovePayloads({ ...base, move: 'scheduled', meetingKind: 'call', hostId: 'user-1' });

    expect(out.booking).toBeNull();
    expect(out.error).toBeTruthy();
  });

  it('refuses to book without a host, rather than inventing one', () => {
    const out = buildMovePayloads({ ...base, move: 'scheduled', meetingKind: 'call', at: '2026-10-20T09:00:00.000Z' });

    expect(out.booking).toBeNull();
    expect(out.error).toBeTruthy();
  });

  it('records a sale with its amount', () => {
    const out = buildMovePayloads({ ...base, move: 'won', amount: '1250' });

    expect(out.disposition.outcome).toBe('successful');
    expect(out.disposition.deal).toEqual({ value: 1250, currency: 'RON' });
  });

  it('takes an amount typed with a comma', () => {
    const out = buildMovePayloads({ ...base, move: 'won', amount: '1250,50' });

    expect(out.disposition.deal).toEqual({ value: 1250.5, currency: 'RON' });
  });

  it('refuses a sale with no amount, which would record a win worth nothing', () => {
    for (const amount of ['', '0', 'abc', undefined]) {
      const out = buildMovePayloads({ ...base, move: 'won', amount });
      expect(out.error).toBeTruthy();
    }
  });

  it('records a loss without asking for anything', () => {
    const out = buildMovePayloads({ ...base, move: 'lost' });

    expect(out.disposition.outcome).toBe('failed');
    expect(out.error).toBeUndefined();
    expect(out.booking).toBeNull();
  });

  it('sets a callback as a follow-up, not a booking', () => {
    const out = buildMovePayloads({
      ...base,
      move: 'callback',
      at: '2026-10-19T14:00:00.000Z',
    });

    expect(out.booking).toBeNull();
    expect(out.disposition.followUp).toEqual({
      at: '2026-10-19T14:00:00.000Z',
      title: 'Revenire — Ionela Pop',
    });
  });

  it('hands the callback to the colleague picked', () => {
    const out = buildMovePayloads({
      ...base,
      move: 'callback',
      at: '2026-10-19T14:00:00.000Z',
      assigneeId: 'closer-9',
    });

    expect(out.disposition.followUp.assigneeId).toBe('closer-9');
  });

  // A note is the one move that changes no state, so it must still be
  // allowed to carry only text.
  it('saves a note on its own', () => {
    const out = buildMovePayloads({ ...base, move: 'note', notes: 'a cerut sa revenim in ianuarie' });

    expect(out.error).toBeUndefined();
    expect(out.disposition.notes).toBe('a cerut sa revenim in ianuarie');
    expect(out.disposition.outcome).toBe('successful');
  });

  it('refuses an empty note, which would write nothing at all', () => {
    expect(buildMovePayloads({ ...base, move: 'note', notes: '   ' }).error).toBeTruthy();
  });

  it('carries the contact and the request id on every move', () => {
    for (const move of ['lost', 'note'] as const) {
      const out = buildMovePayloads({ ...base, move, notes: 'x' });
      expect(out.disposition.contactId).toBe('c-1');
      expect(out.disposition.clientRequestId).toBe('req-1');
    }
  });
});

describe('platforma întâlnirii', () => {
  it('trimite Google Meet ca google_meet, nu ca phone', () => {
    const out = buildMovePayloads({
      move: 'scheduled',
      contact,
      meetingKind: 'meet',
      at: '2026-11-02T10:00:00.000Z',
      hostId: 'closer-1',
      clientRequestId: 'r-meet',
    });
    expect(out.error).toBeUndefined();
    expect(out.booking?.meetingProvider).toBe('google_meet');
  });

  it('cere o oră liberă pentru ambele întâlniri online, nu și pentru apel', () => {
    expect(isOnlineMeeting('meet')).toBe(true);
    expect(isOnlineMeeting('zoom')).toBe(true);
    expect(isOnlineMeeting('call')).toBe(false);
    expect(isOnlineMeeting(null)).toBe(false);
  });

  it('nu cere link pentru un apel', () => {
    expect(bookingProviderOf('call')).toBe('phone');
    expect(bookingProviderOf(null)).toBe('phone');
  });
});
