import { describe, expect, it } from 'vitest';
import {
  guestFromQuery,
  buildCallbackPayload,
  callbackError,
  hostsLabel,
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

describe('callbackError', () => {
  const form = { name: 'Vlad Popescu', phone: '0722000111' };

  it('passes a name and a usable number', () => {
    expect(callbackError(form)).toBeNull();
    expect(callbackError({ ...form, phone: '+40 722 000 111' })).toBeNull();
  });

  it('asks for a name', () => {
    expect(callbackError({ ...form, name: '  ' })).toMatch(/cheamă/);
  });

  // A callback with no reachable number is a promise nobody can keep.
  it('insists on a real number', () => {
    expect(callbackError({ ...form, phone: '' })).toMatch(/telefon/);
    expect(callbackError({ ...form, phone: '0722' })).toMatch(/telefon/);
  });

  it('checks the address only when one was given', () => {
    expect(callbackError({ ...form, email: '' })).toBeNull();
    expect(callbackError({ ...form, email: 'nope' })).toMatch(/email/);
  });
});

describe('buildCallbackPayload', () => {
  it('trims, and omits what was left blank', () => {
    const payload = buildCallbackPayload({
      name: ' Vlad ',
      phone: ' 0722000111 ',
      email: '   ',
      notes: '  ',
    });

    expect(payload).toEqual({ name: 'Vlad', phone: '0722000111', email: undefined, notes: undefined });
  });
});

describe('hostsLabel', () => {
  it('names one, offers a choice of two, counts the rest', () => {
    expect(hostsLabel([{ name: 'Andrei' }])).toBe('Andrei');
    expect(hostsLabel([{ name: 'Andrei' }, { name: 'Ioana' }])).toBe('Andrei sau Ioana');
    expect(hostsLabel([{ name: 'A' }, { name: 'B' }, { name: 'C' }])).toBe('A și încă 2');
  });

  it('says something sensible when nobody is named', () => {
    expect(hostsLabel([])).toBe('Cineva din echipă');
  });
});

describe('guestFromQuery', () => {
  const q = (s: string) => guestFromQuery(new URLSearchParams(s));

  // A redirect typed with {nume} as plain text instead of Typeform's recall
  // filled the form with "{nume}", "{email}", "{telefon}".
  it('ignores placeholders the form never filled in', () => {
    for (const raw of ['{nume}', '{{nume}}', '[nume]', '<nume>', '@nume']) {
      const { guest, complete } = q(`name=${encodeURIComponent(raw)}&email=%7Bemail%7D&phone=%7Btelefon%7D`);
      expect(guest).toEqual({ name: '', email: '', phone: '' });
      expect(complete).toBe(false);
    }
  });

  it('reads what Typeform put in the link', () => {
    expect(q('name=Oana%20Tocos&email=TocosOana@gmail.com&phone=%2B40749767923')).toEqual({
      guest: { name: 'Oana Tocos', email: 'tocosoana@gmail.com', phone: '+40749767923' },
      complete: true,
    });
  });

  it('joins a first and last name sent separately', () => {
    expect(q('first_name=Oana&last_name=Tocos&email=a@b.ro').guest.name).toBe('Oana Tocos');
  });

  // An answer Typeform could not recall arrives as the raw placeholder.
  it('treats an unfilled recall as missing', () => {
    const { guest, complete } = q('name=%7B%7Bfield%3Aabc%7D%7D&email=a@b.ro');
    expect(guest.name).toBe('');
    expect(complete).toBe(false);
  });

  it('is incomplete when the email is not an email', () => {
    expect(q('name=Oana&email=nope').complete).toBe(false);
  });

  it('is empty for a plain link', () => {
    expect(q('')).toEqual({ guest: { name: '', email: '', phone: '' }, complete: false });
  });
});
