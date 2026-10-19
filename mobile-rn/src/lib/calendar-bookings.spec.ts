import { describe, expect, it } from 'vitest';
import { toCalendarBooking, toCalendarBookings } from './calendar-bookings';

const row = {
  id: 'b1',
  startTime: '2026-10-19T13:30:00.000Z',
  endTime: '2026-10-19T14:00:00.000Z',
  status: 'confirmed',
  locationType: 'zoom',
  location: 'https://us06web.zoom.us/j/891',
  guestName: 'Ana Pop',
  host: { firstName: 'Maria', lastName: 'T' },
};

describe('bookings in the calendar', () => {
  it('shows the lead, the closer and the Zoom link', () => {
    expect(toCalendarBooking(row)).toMatchObject({
      leadName: 'Ana Pop',
      hostName: 'Maria T',
      link: 'https://us06web.zoom.us/j/891',
      platform: 'Zoom',
    });
  });

  it('recognises a Google Meet link', () => {
    expect(toCalendarBooking({ ...row, locationType: 'google_meet', location: 'https://meet.google.com/abc' })?.platform).toBe('Google Meet');
  });

  it('falls back to the contact name, then the phone', () => {
    expect(toCalendarBooking({ ...row, guestName: '', contact: { firstName: 'Ion', lastName: 'Ionescu' } })?.leadName).toBe('Ion Ionescu');
    expect(toCalendarBooking({ ...row, guestName: '', guestPhone: '0722' })?.leadName).toBe('0722');
  });

  it('leaves out cancelled bookings and broken rows', () => {
    expect(toCalendarBooking({ ...row, status: 'cancelled' })).toBeNull();
    expect(toCalendarBooking({ ...row, startTime: 'nope' })).toBeNull();
    expect(toCalendarBookings('nope')).toEqual([]);
  });

  it('has no link when the location is not a URL', () => {
    expect(toCalendarBooking({ ...row, location: 'Birou' })).toMatchObject({ link: undefined, platform: null });
  });

  it('sorts by start time', () => {
    const later = { ...row, id: 'b2', startTime: '2026-10-19T15:00:00.000Z' };
    expect(toCalendarBookings([later, row]).map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('carries the details the popup shows, without placeholder emails', () => {
    const b = toCalendarBooking({
      ...row,
      guestPhone: '',
      contactId: 'c1',
      contact: { id: 'c1', phone: '+40722000000', email: 'm.1@meta.placeholder.invalid' },
      notes: ' vrea dimineața ',
    });
    expect(b).toMatchObject({ phone: '+40722000000', email: undefined, contactId: 'c1', notes: 'vrea dimineața' });
    expect(toCalendarBooking({ ...row, guestEmail: 'ana@client.ro' })?.email).toBe('ana@client.ro');
  });
});
