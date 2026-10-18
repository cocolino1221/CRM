import { describe, expect, it } from 'vitest';
import { formatKpiValue, kpiProgress, visibleKpis } from './kpi-view';

const defs = [
  { key: 'callsMade', label: 'Apeluri date', unit: 'count' as const, targetable: true },
  { key: 'revenue', label: 'Încasări', unit: 'currency' as const, targetable: true },
  { key: 'conversionRate', label: 'Rată de conversie', unit: 'percent' as const, targetable: true },
];

describe('formatKpiValue', () => {
  it('shows a count as a plain whole number', () => {
    expect(formatKpiValue(42, 'count')).toBe('42');
  });

  it('rounds a count rather than showing a fraction of a call', () => {
    expect(formatKpiValue(41.6, 'count')).toBe('42');
  });

  it('shows money with its currency', () => {
    expect(formatKpiValue(2500, 'currency')).toContain('2.500');
    expect(formatKpiValue(2500, 'currency')).toMatch(/RON|lei/i);
  });

  it('shows a percentage with one decimal', () => {
    expect(formatKpiValue(33.333, 'percent')).toBe('33,3%');
  });

  it('shows a dash rather than NaN or null', () => {
    expect(formatKpiValue(undefined, 'count')).toBe('—');
    expect(formatKpiValue(null, 'currency')).toBe('—');
    expect(formatKpiValue(Number.NaN, 'percent')).toBe('—');
  });

  it('shows a real zero as zero, not as missing', () => {
    expect(formatKpiValue(0, 'count')).toBe('0');
  });
});

describe('kpiProgress', () => {
  it('is null when no target was set, so no bar is drawn', () => {
    expect(kpiProgress(20, undefined)).toBeNull();
  });

  it('reports the share of the target reached', () => {
    expect(kpiProgress(20, 40)).toBe(50);
  });

  it('caps at 100 so the bar cannot overflow its box', () => {
    expect(kpiProgress(80, 40)).toBe(100);
  });

  it('treats a missing value as no progress rather than as an error', () => {
    expect(kpiProgress(undefined, 40)).toBe(0);
  });

  // A target of zero would divide by zero and render Infinity.
  it('ignores a zero or negative target', () => {
    expect(kpiProgress(20, 0)).toBeNull();
    expect(kpiProgress(20, -5)).toBeNull();
  });
});

describe('visibleKpis', () => {
  it('returns the enabled KPIs in the order the workspace chose', () => {
    const out = visibleKpis(['revenue', 'callsMade'], defs);

    expect(out.map((k) => k.key)).toEqual(['revenue', 'callsMade']);
  });

  it('skips an enabled key the server has no definition for', () => {
    const out = visibleKpis(['callsMade', 'vibes'], defs);

    expect(out.map((k) => k.key)).toEqual(['callsMade']);
  });

  it('returns nothing rather than throwing when the config is empty', () => {
    expect(visibleKpis([], defs)).toEqual([]);
    expect(visibleKpis(undefined, defs)).toEqual([]);
  });
});

describe('kpiProgress bounds', () => {
  // A negative KPI drew a bar with a negative width, which the browser drops
  // — so it looked like an empty bar rather than a number below zero.
  it('never goes below zero', () => {
    expect(kpiProgress(-50, 100)).toBe(0);
  });
});
