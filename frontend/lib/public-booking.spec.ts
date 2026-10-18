import { describe, expect, it } from 'vitest';
import {
  buildBookingPayload,
  dateParam,
  formatSlotTime,
  guestError,
  nextDays,
} from './public-booking';

describe('dateParam', () => {
  it('gives the date as the workspace reads it, not as UTC does', () => {
    // 22:30 UTC is already the next day in Bucharest.
    expect(dateParam(new Date('2026-10-19T22:30:00Z'))).toBe('2026-10-20');
  });

  it('keeps a plain midday date intact', () => {
    expect(dateParam(new Date('2026-10-20T12:00:00Z'))).toBe('2026-10-20');
  });
});

describe('nextDays', () => {
  it('returns consecutive days starting from the given one', () => {
    const days = nextDays(new Date('2026-10-19T09:00:00Z'), 3);

    expect(days.map((d) => d.param)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });

  it('labels them in Romanian', () => {
    const [first] = nextDays(new Date('2026-10-19T09:00:00Z'), 1);

    expect(first.label.toLowerCase()).toContain('oct');
  });

  it('crosses a month boundary without repeating a day', () => {
    const days = nextDays(new Date('2026-10-30T09:00:00Z'), 3);

    expect(days.map((d) => d.param)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('formatSlotTime', () => {
  it('shows the hour in the workspace clock', () => {
    // 07:00 UTC is 10:00 in Bucharest in October.
    expect(formatSlotTime('2026-10-20T07:00:00Z')).toBe('10:00');
  });

  it('does not throw on a value that is not a date', () => {
    expect(formatSlotTime('not a date')).toBe('—');
  });
});

describe('guestError', () => {
  const guest = { name: 'Vlad Popescu', email: 'vlad@example.com' };

  it('passes a filled-in form', () => {
    expect(guestError(guest)).toBeNull();
    expect(guestError({ ...guest, phone: '+40 722 000 111' })).toBeNull();
  });

  it('asks for a name', () => {
    expect(guestError({ ...guest, name: '   ' })).toMatch(/cheamă/);
  });

  it('catches an address that is not one', () => {
    expect(guestError({ ...guest, email: 'vlad@' })).toMatch(/email/);
    expect(guestError({ ...guest, email: 'vlad example.com' })).toMatch(/email/);
  });

  // The DTO refuses letters in a phone, so the form should say so first.
  it('catches a phone the backend would refuse', () => {
    expect(guestError({ ...guest, phone: 'sună-mă' })).toMatch(/telefon/);
  });

  it('treats a blank phone as simply not given', () => {
    expect(guestError({ ...guest, phone: '  ' })).toBeNull();
  });
});

describe('buildBookingPayload', () => {
  const base = {
    meetingTypeId: 'mt-1',
    startTime: '2026-10-20T07:00:00.000Z',
    guest: { name: '  Vlad Popescu ', email: ' vlad@example.com ' },
  };

  it('trims what the guest typed', () => {
    const payload = buildBookingPayload(base);

    expect(payload.guestName).toBe('Vlad Popescu');
    expect(payload.guestEmail).toBe('vlad@example.com');
  });

  // An empty string fails the DTO's phone pattern; leaving it out does not.
  it('omits an empty phone rather than sending it blank', () => {
    expect(buildBookingPayload({ ...base, guest: { ...base.guest, phone: '  ' } }).guestPhone).toBeUndefined();
    expect(buildBookingPayload({ ...base, notes: '   ' }).notes).toBeUndefined();
  });

  it('always carries a timezone, since the DTO requires one', () => {
    expect(buildBookingPayload(base).timezone).toBe('Europe/Bucharest');
    expect(buildBookingPayload({ ...base, timeZone: 'Europe/Madrid' }).timezone).toBe('Europe/Madrid');
  });
});
