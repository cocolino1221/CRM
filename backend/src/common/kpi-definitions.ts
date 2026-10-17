/**
 * The KPIs a workspace can put on its report, and which of them it starts
 * with.
 *
 * Every key here must be a field getDailyKPIs() actually returns — a key that
 * reaches the screen with nothing behind it renders as a card reading "0" and
 * looks like a business problem rather than a bug. The list is deliberately
 * shared with the frontend by duplication rather than by a package: this
 * monorepo's `shared/` workspace is an orphan no client depends on, so an
 * import from it would not reach either build.
 */

export type KpiUnit = 'count' | 'currency' | 'percent';

export interface KpiDefinition {
  key: string;
  /** Romanian: this is UI copy. */
  label: string;
  unit: KpiUnit;
  /** True when a caller can be held to it — those are the ones worth a target. */
  targetable: boolean;
}

export const KPI_DEFINITIONS: KpiDefinition[] = [
  { key: 'callsMade', label: 'Apeluri date', unit: 'count', targetable: true },
  { key: 'newContacts', label: 'Leaduri noi', unit: 'count', targetable: true },
  { key: 'newDeals', label: 'Oportunități create', unit: 'count', targetable: true },
  { key: 'dealsWon', label: 'Vânzări încheiate', unit: 'count', targetable: true },
  { key: 'dealsLost', label: 'Pierdute', unit: 'count', targetable: false },
  { key: 'revenue', label: 'Încasări', unit: 'currency', targetable: true },
  { key: 'pipelineValue', label: 'Valoare pipeline', unit: 'currency', targetable: false },
  { key: 'conversionRate', label: 'Rată de conversie', unit: 'percent', targetable: true },
  { key: 'meetingsHeld', label: 'Întâlniri', unit: 'count', targetable: true },
  { key: 'emailsSent', label: 'Emailuri trimise', unit: 'count', targetable: false },
  { key: 'activitiesCompleted', label: 'Activități', unit: 'count', targetable: false },
  { key: 'tasksCompleted', label: 'Taskuri închise', unit: 'count', targetable: true },
];

export const KPI_KEYS: string[] = KPI_DEFINITIONS.map((k) => k.key);

export interface KpiConfig {
  enabled: string[];
  targets: Record<string, number>;
}

/** What a workspace sees before anyone configures anything. */
export const DEFAULT_KPI_CONFIG: KpiConfig = {
  enabled: ['callsMade', 'newContacts', 'dealsWon', 'revenue', 'conversionRate', 'meetingsHeld'],
  targets: {},
};

export function isKpiKey(value: unknown): value is string {
  return typeof value === 'string' && KPI_KEYS.includes(value);
}
