import { describe, expect, it } from 'vitest';
import {
  customPeriod,
  formatRate,
  formatRevenue,
  parseTypedDate,
  periodFor,
  periodLabel,
  shiftPeriod,
} from './report-period';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12);

describe('report periods', () => {
  it('a week runs Monday to Sunday, also when today is Sunday', () => {
    const p = periodFor('week', d(2026, 10, 25)); // a Sunday
    expect(p.from.getDay()).toBe(1);
    expect(p.from.getDate()).toBe(19);
    expect(p.to.getDate()).toBe(25);
    expect(p.to.getHours()).toBe(23);
  });

  it('a month ends on its last day, February included', () => {
    const p = periodFor('month', d(2028, 2, 10));
    expect(p.from.getDate()).toBe(1);
    expect(p.to.getDate()).toBe(29);
  });

  it('steps back and forward', () => {
    expect(shiftPeriod(periodFor('month', d(2026, 1, 15)), -1).from.getMonth()).toBe(11);
    expect(shiftPeriod(periodFor('day', d(2026, 10, 31)), 1).from.getDate()).toBe(1);
    const custom = customPeriod('01.10.2026', '10.10.2026') as any;
    const next = shiftPeriod(custom, 1);
    expect([next.from.getDate(), next.to.getDate()]).toEqual([11, 20]);
  });

  it('reads dates the way they are typed on a phone, and rejects impossible ones', () => {
    expect(parseTypedDate('20.10.2026')?.getDate()).toBe(20);
    expect(parseTypedDate('2026-10-20')?.getMonth()).toBe(9);
    expect(parseTypedDate('31.02.2026')).toBeNull();
    expect(parseTypedDate('mâine')).toBeNull();
  });

  it('refuses a custom period that runs backwards', () => {
    expect(customPeriod('10.10.2026', '01.10.2026')).toHaveProperty('error');
    expect(customPeriod('x', '01.10.2026')).toHaveProperty('error');
  });

  it('labels periods for the header', () => {
    const now = d(2026, 10, 20);
    expect(periodLabel(periodFor('day', now), now)).toBe('Azi');
    expect(periodLabel(periodFor('day', d(2026, 10, 19)), now)).toBe('Ieri');
    expect(periodLabel(periodFor('week', now), now)).toBe('19–25 oct.');
    expect(periodLabel(periodFor('month', now), now)).toBe('Octombrie 2026');
  });

  it('formats rates and revenue without mixing currencies', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(66.7)).toBe('67%');
    expect(formatRevenue({ RON: 2000, EUR: 500 })).toBe('2.000 RON · 500 EUR');
    expect(formatRevenue({})).toBe('0');
  });
});
