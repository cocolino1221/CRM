/**
 * Day boundaries in a workspace's own timezone.
 *
 * The server clock is UTC, so `setHours(0,0,0,0)` puts a 23:30 call in
 * Bucharest onto the following day's report. Daily KPIs and the end-of-day
 * report are read by people in one place; the day has to be theirs.
 *
 * Uses Intl rather than a date library so DST transitions are handled by the
 * platform's own tz database.
 */

/** Milliseconds the zone is ahead of UTC at this instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Intl renders midnight as hour 24 in some locales/engines.
  const hour = read('hour') % 24;

  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    hour,
    read('minute'),
    read('second'),
  );

  // Drop sub-second precision on both sides so the difference is a clean offset.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function dayRangeInTimeZone(
  date: Date,
  timeZone: string,
): { start: Date; end: Date } {
  let offset: number;
  let localParts: { year: number; month: number; day: number };

  try {
    offset = zoneOffsetMs(date, timeZone);
    const local = new Date(date.getTime() + offset);
    localParts = {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
    };
  } catch {
    // Unknown zone: behave as UTC rather than throwing inside a report.
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    return { start, end: new Date(start.getTime() + 86_400_000 - 1) };
  }

  const midnightGuess = Date.UTC(localParts.year, localParts.month - 1, localParts.day) - offset;
  // The offset at midnight can differ from the offset now (a DST change during
  // the day), so resolve it once more at the boundary itself.
  const midnightOffset = zoneOffsetMs(new Date(midnightGuess), timeZone);
  const start = new Date(
    Date.UTC(localParts.year, localParts.month - 1, localParts.day) - midnightOffset,
  );

  const nextMidnightGuess = Date.UTC(localParts.year, localParts.month - 1, localParts.day + 1);
  const nextOffset = zoneOffsetMs(new Date(nextMidnightGuess - midnightOffset), timeZone);
  const end = new Date(nextMidnightGuess - nextOffset - 1);

  return { start, end };
}
