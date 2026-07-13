export interface QuietHours {
  enabled: boolean;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  timezone: string; // IANA, e.g. "Europe/Bucharest"
}

function minutesInTz(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hh * 60 + mm;
}

function parseHm(hm: string): number {
  const [h, m] = String(hm || '').split(':').map((n) => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function isWithinQuietHours(q: QuietHours | undefined | null, now: Date = new Date()): boolean {
  if (!q || !q.enabled) return false;
  let cur: number;
  try {
    cur = minutesInTz(now, q.timezone);
  } catch {
    return false; // bad timezone → don't suppress
  }
  const start = parseHm(q.start);
  const end = parseHm(q.end);
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;      // same-day window
  return cur >= start || cur < end;                        // overnight window
}
