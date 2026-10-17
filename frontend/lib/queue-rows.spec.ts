import { describe, expect, it } from 'vitest';
import { contactDisplayName, formatQueueTime, whatsappDigits } from './queue-rows';

describe('contactDisplayName', () => {
  it('uses the full name when there is one', () => {
    expect(contactDisplayName({ firstName: 'Ionela', lastName: 'Pop' })).toBe('Ionela Pop');
  });

  it('copes with only one half of the name', () => {
    expect(contactDisplayName({ firstName: 'Ionela' })).toBe('Ionela');
    expect(contactDisplayName({ lastName: 'Pop' })).toBe('Pop');
  });

  // Meta leads arrive with no name at all, which is most of this list.
  it('falls back to the phone, then the email', () => {
    expect(contactDisplayName({ phone: '+40722000111' })).toBe('+40722000111');
    expect(contactDisplayName({ email: 'ionela@example.com' })).toBe('ionela@example.com');
  });

  it('never renders blank or the word undefined', () => {
    expect(contactDisplayName({})).toBe('Contact');
    expect(contactDisplayName({ firstName: '  ', lastName: '  ' })).toBe('Contact');
    expect(contactDisplayName(null)).toBe('Contact');
  });
});

describe('formatQueueTime', () => {
  // A booking at 09:00 in Bucharest must not read 06:00 because the browser
  // sits elsewhere — the workspace timezone is the one that matters.
  it('renders the time in the given timezone, not the browser one', () => {
    const out = formatQueueTime('2026-10-20T06:00:00.000Z', 'Europe/Bucharest');

    expect(out).toContain('09:00');
  });

  it('renders a different timezone differently', () => {
    const bucharest = formatQueueTime('2026-10-20T06:00:00.000Z', 'Europe/Bucharest');
    const london = formatQueueTime('2026-10-20T06:00:00.000Z', 'Europe/London');

    expect(bucharest).not.toBe(london);
  });

  it('says nothing rather than "Invalid Date" for a missing or broken value', () => {
    expect(formatQueueTime(undefined, 'Europe/Bucharest')).toBe('—');
    expect(formatQueueTime('not a date', 'Europe/Bucharest')).toBe('—');
  });

  it('survives a timezone the browser does not know', () => {
    expect(formatQueueTime('2026-10-20T06:00:00.000Z', 'Mars/Olympus')).not.toBe('—');
  });
});

describe('whatsappDigits', () => {
  // The list is mostly Romanian handsets typed in local form.
  it('gives a local 07 number its country code', () => {
    expect(whatsappDigits('0722000111')).toBe('40722000111');
    expect(whatsappDigits('0722 000 111')).toBe('40722000111');
  });

  it('keeps a number that already carries its country code', () => {
    expect(whatsappDigits('+40722000111')).toBe('40722000111');
    expect(whatsappDigits('40722000111')).toBe('40722000111');
  });

  it('turns a 00 prefix into the country code', () => {
    expect(whatsappDigits('0040722000111')).toBe('40722000111');
  });

  // A foreign number must not be given +40 on its way to WhatsApp.
  it('leaves an international number alone', () => {
    expect(whatsappDigits('+34612345678')).toBe('34612345678');
  });

  it('returns null when there is nothing to dial', () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits('')).toBeNull();
    expect(whatsappDigits('   ')).toBeNull();
    expect(whatsappDigits('n/a')).toBeNull();
  });
});
