import { describe, expect, it } from 'vitest';
import { isPastBooking, pastStats, toCalendarBookings, toPastBookings } from './calendar-bookings';

const now = new Date('2026-10-21T12:00:00Z');
const row = (id: string, start: string, extra: Record<string, unknown> = {}) => ({
  id,
  startTime: start,
  endTime: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
  status: 'confirmed',
  guestName: id,
  ...extra,
});

describe('past bookings', () => {
  const rows = [
    row('ieri', '2026-10-20T10:00:00Z', { status: 'completed', location: 'https://zoom.us/j/1' }),
    row('nemarcat', '2026-10-20T15:00:00Z', { location: 'https://meet.google.com/x' }),
    row('noshow', '2026-10-19T10:00:00Z', { status: 'no_show' }),
    row('anulat', '2026-10-18T10:00:00Z', { status: 'cancelled' }),
    row('acum', '2026-10-21T11:45:00Z'), // ends 12:15, still running
    row('maine', '2026-10-22T10:00:00Z'),
  ];

  it('leaves meetings already over out of the calendar', () => {
    expect(toCalendarBookings(rows, now).map((b) => b.id)).toEqual(['acum', 'maine']);
  });

  it('keeps past confirmed bookings when not asked to hide the past', () => {
    expect(toCalendarBookings(rows).map((b) => b.id)).toEqual(['nemarcat', 'acum', 'maine']);
  });

  it('lists the past newest first, whatever became of them', () => {
    expect(toPastBookings(rows, now).map((b) => [b.id, b.status])).toEqual([
      ['nemarcat', 'confirmed'],
      ['ieri', 'completed'],
      ['noshow', 'no_show'],
      ['anulat', 'cancelled'],
    ]);
  });

  it('counts what happened', () => {
    expect(pastStats(toPastBookings(rows, now))).toEqual({
      total: 4,
      held: 2,
      unmarked: 1,
      noShow: 1,
      cancelled: 1,
      online: 2,
    });
  });

  it('uses the duration when there is no end time', () => {
    expect(isPastBooking({ startTime: '2026-10-21T11:30:00Z', duration: 45 }, now)).toBe(false);
    expect(isPastBooking({ startTime: '2026-10-21T11:00:00Z', duration: 45 }, now)).toBe(true);
  });
});
