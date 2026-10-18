/**
 * The team's free hours as the schedule dialog shows them: each hour carries
 * the closers free at it, and each closer keeps one colour for the whole day
 * so a setter can read the grid at a glance.
 */

export interface TeamSlotHost {
  userId: string;
  meetingTypeId?: string;
  name: string;
}

export interface TeamSlot {
  startTime: string;
  endTime: string;
  duration: number;
  hosts: TeamSlotHost[];
}

export interface HostColor {
  userId: string;
  name: string;
  /** Solid colour for dots, chips and the selected state. */
  color: string;
}

/**
 * Distinct enough side by side and readable as a small dot on white or on the
 * dark dialog. Past eight closers the colours repeat; the name still tells
 * them apart.
 */
export const HOST_PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#ea580c', // orange
  '#9333ea', // purple
  '#db2777', // pink
  '#0891b2', // cyan
  '#ca8a04', // amber
  '#dc2626', // red
];

/**
 * One colour per closer, ordered by name so the same person keeps the same
 * colour from one day to the next rather than by who happens to be free first.
 */
export function hostColors(slots: TeamSlot[]): HostColor[] {
  const byId = new Map<string, string>();
  for (const slot of slots) {
    for (const host of slot.hosts ?? []) {
      if (!byId.has(host.userId)) byId.set(host.userId, host.name);
    }
  }
  return [...byId.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'ro') || a[0].localeCompare(b[0]))
    .map(([userId, name], i) => ({ userId, name, color: HOST_PALETTE[i % HOST_PALETTE.length] }));
}

/** The hours a filter leaves: all of them, or only those the chosen closer is free at. */
export function slotsForHost(slots: TeamSlot[], userId: string | null): TeamSlot[] {
  if (!userId) return slots;
  return slots.filter((slot) => slot.hosts.some((h) => h.userId === userId));
}

/**
 * Who takes the hour once it is picked. Exactly one person free decides it;
 * with several, a closer already chosen (by the filter or a previous pick)
 * stays chosen if they are free at the new hour, otherwise the setter picks.
 */
export function resolveHost(slot: TeamSlot | null, current: string | null): string | null {
  if (!slot) return null;
  if (slot.hosts.length === 1) return slot.hosts[0].userId;
  if (current && slot.hosts.some((h) => h.userId === current)) return current;
  return null;
}
