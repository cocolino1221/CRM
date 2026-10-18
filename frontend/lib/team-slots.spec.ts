import { describe, expect, it } from 'vitest';
import { HOST_PALETTE, hostColors, resolveHost, slotsForHost, type TeamSlot } from './team-slots';

const ana = { userId: 'u-ana', name: 'Ana Pop' };
const bogdan = { userId: 'u-bog', name: 'Bogdan Ionescu' };

const slot = (time: string, hosts = [ana]): TeamSlot => ({
  startTime: `2030-01-07T${time}:00.000Z`,
  endTime: `2030-01-07T${time}:30.000Z`,
  duration: 30,
  hosts,
});

describe('hostColors', () => {
  it('gives each closer one colour, ordered by name', () => {
    const colors = hostColors([slot('09', [bogdan]), slot('10', [ana, bogdan])]);
    expect(colors).toEqual([
      { userId: 'u-ana', name: 'Ana Pop', color: HOST_PALETTE[0] },
      { userId: 'u-bog', name: 'Bogdan Ionescu', color: HOST_PALETTE[1] },
    ]);
  });

  // The same person must not change colour because someone else is free earlier.
  it('does not depend on who is free first', () => {
    const a = hostColors([slot('09', [ana]), slot('10', [bogdan])]);
    const b = hostColors([slot('09', [bogdan]), slot('10', [ana])]);
    expect(a).toEqual(b);
  });

  it('is empty for a day nobody is free', () => {
    expect(hostColors([])).toEqual([]);
  });
});

describe('slotsForHost', () => {
  const day = [slot('09', [ana]), slot('10', [bogdan]), slot('11', [ana, bogdan])];

  it('keeps every hour without a filter', () => {
    expect(slotsForHost(day, null)).toHaveLength(3);
  });

  it('keeps only the hours the chosen closer is free at', () => {
    expect(slotsForHost(day, 'u-bog').map((s) => s.startTime.slice(11, 13))).toEqual(['10', '11']);
  });
});

describe('resolveHost', () => {
  it('picks the only closer free at the hour', () => {
    expect(resolveHost(slot('09', [ana]), 'u-bog')).toBe('u-ana');
  });

  it('keeps an earlier choice when that closer is free at the new hour', () => {
    expect(resolveHost(slot('11', [ana, bogdan]), 'u-bog')).toBe('u-bog');
  });

  // Silently booking someone the setter did not choose is the failure to avoid.
  it('asks when several are free and none was chosen', () => {
    expect(resolveHost(slot('11', [ana, bogdan]), null)).toBeNull();
    expect(resolveHost(slot('11', [ana, bogdan]), 'u-gone')).toBeNull();
  });

  it('has nobody without an hour', () => {
    expect(resolveHost(null, 'u-ana')).toBeNull();
  });
});
