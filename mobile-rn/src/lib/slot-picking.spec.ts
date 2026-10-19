import { describe, expect, it } from 'vitest';
import { canPickOwnHour, groupSlotsByDay, hostChoiceFor, labelForSlot, ownHourIso } from './slot-picking';

/**
 * The sheet offered four fixed labels — "Mâine 10:00" and friends — that were
 * computed, not looked up, so it could book an hour nobody was free for. The
 * server now answers with the real hours and who is free at each.
 */
const slot = (startTime: string, hosts: any[]) => ({ startTime, endTime: startTime, duration: 30, hosts });

const ana = { userId: 'u-ana', meetingTypeId: 'mt-1', name: 'Ana Pop' };
const ion = { userId: 'u-ion', meetingTypeId: 'mt-2', name: 'Ion Rus' };

describe('hostChoiceFor', () => {
  it('picks the only person free, with nothing to ask', () => {
    const choice = hostChoiceFor(slot('2026-10-20T12:00:00+03:00', [ana]) as any);

    expect(choice.mustAsk).toBe(false);
    expect(choice.hosts).toHaveLength(1);
    expect(choice.hosts[0].userId).toBe('u-ana');
  });

  // The ask the user wanted: two people free, so say which.
  it('asks when more than one person is free', () => {
    const choice = hostChoiceFor(slot('2026-10-20T12:00:00+03:00', [ana, ion]) as any);

    expect(choice.mustAsk).toBe(true);
    expect(choice.hosts.map((h) => h.name)).toEqual(['Ana Pop', 'Ion Rus']);
  });

  it('treats an hour with nobody free as unbookable', () => {
    const choice = hostChoiceFor(slot('2026-10-20T12:00:00+03:00', []) as any);

    expect(choice.hosts).toHaveLength(0);
    expect(choice.mustAsk).toBe(false);
  });

  it('survives a slot with no hosts field at all', () => {
    expect(hostChoiceFor({ startTime: 'x' } as any).hosts).toEqual([]);
  });
});

describe('labelForSlot', () => {
  it('reads an hour the way someone says it out loud', () => {
    expect(labelForSlot('2026-10-20T12:30:00+03:00', 'Europe/Bucharest')).toBe('12:30');
  });

  it('says nothing rather than "Invalid Date" for a broken value', () => {
    expect(labelForSlot('not a time', 'Europe/Bucharest')).toBe('');
  });
});

describe('groupSlotsByDay', () => {
  it('keeps each day together, in order', () => {
    const grouped = groupSlotsByDay(
      [
        slot('2026-10-21T09:00:00+03:00', [ana]),
        slot('2026-10-20T15:00:00+03:00', [ion]),
        slot('2026-10-20T12:00:00+03:00', [ana]),
      ] as any,
      'Europe/Bucharest',
    );

    expect(grouped.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-21']);
    expect(grouped[0].slots.map((s) => s.startTime)).toEqual([
      '2026-10-20T12:00:00+03:00',
      '2026-10-20T15:00:00+03:00',
    ]);
  });

  it('drops an hour nobody is free for rather than showing a dead button', () => {
    const grouped = groupSlotsByDay([slot('2026-10-20T12:00:00+03:00', [])] as any, 'Europe/Bucharest');

    expect(grouped).toEqual([]);
  });

  it('copes with nothing at all', () => {
    expect(groupSlotsByDay([], 'Europe/Bucharest')).toEqual([]);
    expect(groupSlotsByDay(undefined as any, 'Europe/Bucharest')).toEqual([]);
  });
});

describe('closer picking their own hour', () => {
  it('is only for closers', () => {
    expect(canPickOwnHour('closer')).toBe(true);
    expect(canPickOwnHour('CLOSER')).toBe(true);
    expect(canPickOwnHour('caller')).toBe(false);
    expect(canPickOwnHour('setter')).toBe(false);
    expect(canPickOwnHour(undefined)).toBe(false);
  });

  it('lands on the chosen day and minute on the phone clock', () => {
    const now = new Date(2026, 9, 19, 9, 40);
    const iso = ownHourIso(2, 18, 15, now);
    const d = new Date(iso);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(15);
  });

  it('rolls over the end of the month', () => {
    const d = new Date(ownHourIso(1, 10, 0, new Date(2026, 9, 31, 12, 0)));
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(1);
  });
});
