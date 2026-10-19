/**
 * Turning the team's free hours into something pickable on a phone.
 *
 * The sheet used to offer four computed labels — "Mâine 10:00" and friends —
 * which were not looked up anywhere, so it could cheerfully book an hour
 * nobody was free for. These hours come from the server, each carrying the
 * people free at it.
 */

export interface SlotHost {
  userId: string;
  meetingTypeId: string;
  name: string;
}

export interface TeamSlot {
  startTime: string;
  endTime: string;
  duration: number;
  hosts: SlotHost[];
}

export interface SlotDay {
  /** YYYY-MM-DD in the workspace's zone, for the day heading. */
  date: string;
  label: string;
  slots: TeamSlot[];
}

export interface HostChoice {
  hosts: SlotHost[];
  /** True when the caller has to say which colleague takes it. */
  mustAsk: boolean;
}

export function hostChoiceFor(slot: TeamSlot | null | undefined): HostChoice {
  const hosts = Array.isArray(slot?.hosts) ? slot!.hosts : [];
  return { hosts, mustAsk: hosts.length > 1 };
}

export function labelForSlot(startTime: string, timeZone: string): string {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ro-RO', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '';
  }
}

function dayKey(startTime: string, timeZone: string): string | null {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dayLabel(startTime: string, timeZone: string): string {
  const date = new Date(startTime);
  try {
    return new Intl.DateTimeFormat('ro-RO', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return '';
  }
}

export function groupSlotsByDay(
  slots: TeamSlot[] | null | undefined,
  timeZone: string,
): SlotDay[] {
  if (!Array.isArray(slots)) return [];

  const byDay = new Map<string, SlotDay>();
  for (const slot of slots) {
    // An hour nobody is free for is a button that cannot do anything.
    if (!slot?.hosts?.length) continue;
    const key = dayKey(slot.startTime, timeZone);
    if (!key) continue;

    const existing = byDay.get(key);
    if (existing) existing.slots.push(slot);
    else byDay.set(key, { date: key, label: dayLabel(slot.startTime, timeZone), slots: [slot] });
  }

  return [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      ...day,
      slots: day.slots.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
}

/**
 * A closer may put a meeting in their own diary at any hour, free slot or not;
 * the server still refuses one that overlaps. Callers and setters book only
 * the hours the team declared.
 */
export function canPickOwnHour(role: string | null | undefined): boolean {
  return String(role || '').toLowerCase() === 'closer';
}

/** The instant for "in N days at HH:MM" on the phone's own clock. */
export function ownHourIso(dayOffset: number, hour: number, minute: number, now = new Date()): string {
  const when = new Date(now);
  when.setDate(when.getDate() + dayOffset);
  when.setHours(hour, minute, 0, 0);
  return when.toISOString();
}

export const OWN_HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07–21
export const OWN_MINUTES = [0, 15, 30, 45];
