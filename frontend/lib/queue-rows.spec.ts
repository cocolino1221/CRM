import { describe, expect, it } from 'vitest';
import { contactDisplayName, formatQueueTime } from './queue-rows';

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
