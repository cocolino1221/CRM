import { earliestBookableFrom, isSlotBookable } from './booking-lead-time';

/**
 * Booking late in the evening for first thing the next morning leaves nobody
 * time to prepare — and the lead no warning. Past 18:00, tomorrow does not
 * open until midday.
 */
const at = (iso: string) => new Date(iso);

describe('earliestBookableFrom', () => {
  it('allows anything from now during the working day', () => {
    const now = at('2026-10-19T10:00:00+03:00');

    expect(earliestBookableFrom(now).getTime()).toBe(now.getTime());
  });

  it('pushes to tomorrow midday once the evening starts', () => {
    const earliest = earliestBookableFrom(at('2026-10-19T18:30:00+03:00'));

    expect(earliest.toISOString()).toBe(at('2026-10-20T12:00:00+03:00').toISOString());
  });

  it('treats exactly 18:00 as the evening', () => {
    const earliest = earliestBookableFrom(at('2026-10-19T18:00:00+03:00'));

    expect(earliest.toISOString()).toBe(at('2026-10-20T12:00:00+03:00').toISOString());
  });

  it('still applies just before midnight, for the same next day', () => {
    const earliest = earliestBookableFrom(at('2026-10-19T23:50:00+03:00'));

    expect(earliest.toISOString()).toBe(at('2026-10-20T12:00:00+03:00').toISOString());
  });

  it('does not apply in the early morning, which is a new day', () => {
    const now = at('2026-10-20T07:00:00+03:00');

    expect(earliestBookableFrom(now).getTime()).toBe(now.getTime());
  });
});

describe('isSlotBookable', () => {
  const evening = at('2026-10-19T19:00:00+03:00');

  it('refuses tomorrow morning when booked in the evening', () => {
    expect(isSlotBookable(at('2026-10-20T09:00:00+03:00'), evening)).toBe(false);
    expect(isSlotBookable(at('2026-10-20T11:59:00+03:00'), evening)).toBe(false);
  });

  it('allows tomorrow from midday', () => {
    expect(isSlotBookable(at('2026-10-20T12:00:00+03:00'), evening)).toBe(true);
    expect(isSlotBookable(at('2026-10-20T15:00:00+03:00'), evening)).toBe(true);
  });

  it('allows the day after, at any hour', () => {
    expect(isSlotBookable(at('2026-10-21T09:00:00+03:00'), evening)).toBe(true);
  });

  // Whatever the rule, an hour that has already passed is never bookable.
  it('refuses an hour in the past', () => {
    expect(isSlotBookable(at('2026-10-19T08:00:00+03:00'), evening)).toBe(false);
    expect(
      isSlotBookable(at('2026-10-19T09:00:00+03:00'), at('2026-10-19T10:00:00+03:00')),
    ).toBe(false);
  });

  it('allows a later hour the same working day', () => {
    expect(
      isSlotBookable(at('2026-10-19T15:00:00+03:00'), at('2026-10-19T10:00:00+03:00')),
    ).toBe(true);
  });
});
