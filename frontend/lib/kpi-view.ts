/**
 * Turning KPI numbers into something readable.
 *
 * Separate from the report screen because these are the parts that fail
 * quietly: a missing number rendering as "NaN", a real zero rendering as
 * missing, and a target of zero rendering a progress bar of Infinity.
 */

export type KpiUnit = 'count' | 'currency' | 'percent';

export interface KpiDefinition {
  key: string;
  label: string;
  unit: KpiUnit;
  targetable: boolean;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatKpiValue(value: number | null | undefined, unit: KpiUnit): string {
  // A real zero is a fact worth showing; only an absent number is a dash.
  if (!isNumber(value)) return '—';

  if (unit === 'currency') {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (unit === 'percent') {
    return `${new Intl.NumberFormat('ro-RO', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value)}%`;
  }

  // Nobody made 41.6 calls.
  return String(Math.round(value));
}

/**
 * How far along a KPI is against its target, 0-100.
 *
 * Null means "draw no bar": either nothing was targeted, or the target is a
 * value that cannot be divided by.
 */
export function kpiProgress(
  value: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (!isNumber(target) || target <= 0) return null;
  if (!isNumber(value)) return 0;
  return Math.min(100, (value / target) * 100);
}

/** The enabled KPIs, in the order the workspace chose, with their definitions. */
export function visibleKpis(
  enabled: string[] | undefined,
  definitions: KpiDefinition[],
): KpiDefinition[] {
  if (!enabled?.length) return [];
  return enabled
    .map((key) => definitions.find((d) => d.key === key))
    .filter((d): d is KpiDefinition => Boolean(d));
}
