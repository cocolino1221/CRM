/**
 * How much warning a booking has to give.
 *
 * Booking at nine in the evening for nine the next morning leaves the closer
 * no time to prepare and the lead no warning at all. Past 18:00 the next day
 * does not open until midday; before that, anything still ahead is fair game.
 *
 * The hours are read in the workspace's own zone, because "after six" means
 * six where the team is, not in UTC.
 */

/** Past this hour, tomorrow morning is closed. */
const EVENING_FROM = 18;

/** How early tomorrow may start when booked in the evening. */
const NEXT_DAY_OPENS_AT = 12;

function partsIn(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // 24:00 is how en-GB spells midnight at the end of a day.
    hour: Number(parts.hour) % 24,
  };
}

/** The same wall-clock moment, as an instant, in the given zone. */
function instantAt(
  reference: Date,
  timeZone: string,
  dayOffset: number,
  hour: number,
): Date {
  const { year, month, day } = partsIn(reference, timeZone);
  // Built in UTC first, then corrected by the zone's offset at that moment.
  const naive = Date.UTC(year, month - 1, day + dayOffset, hour, 0, 0, 0);
  const guess = new Date(naive);
  const guessed = partsIn(guess, timeZone);
  const offsetHours = guessed.hour - hour;
  return new Date(naive - offsetHours * 3_600_000);
}

/** The first instant a new booking may be placed at. */
export function earliestBookableFrom(now: Date, timeZone = 'Europe/Bucharest'): Date {
  const { hour } = partsIn(now, timeZone);
  if (hour < EVENING_FROM) return now;
  return instantAt(now, timeZone, 1, NEXT_DAY_OPENS_AT);
}

export function isSlotBookable(
  slotStart: Date,
  now: Date = new Date(),
  timeZone = 'Europe/Bucharest',
): boolean {
  // An hour that has already passed is never bookable, whatever the rule.
  if (slotStart.getTime() <= now.getTime()) return false;
  return slotStart.getTime() >= earliestBookableFrom(now, timeZone).getTime();
}
