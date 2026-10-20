'use client';

/**
 * The report a caller and a manager open at the end of a day.
 *
 * Three things on one page: today's KPIs against their targets, the same
 * numbers over a chosen range, and the end-of-day summary. The backend
 * already computed all of it — until now nothing displayed it.
 *
 * Who the numbers are about is decided by the server, not here: a manager may
 * pick a person, and anyone else is pinned to their own figures whatever this
 * page asks for.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Loader2,
  RefreshCw,
  Settings2,
  Target,
  TrendingUp,
} from 'lucide-react';
import api from '@/lib/api';
import UserReportPanel from '@/components/reports/UserReportPanel';
import { KpiDefinition, formatKpiValue, kpiProgress, visibleKpis } from '@/lib/kpi-view';

interface KpiConfigResponse {
  enabled: string[];
  targets: Record<string, number>;
  definitions: KpiDefinition[];
}

interface TeamMember {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) =>
  new Date(Date.now() - n * 24 * 3600 * 1000).toISOString().slice(0, 10);

export default function RapoartePage() {
  const [config, setConfig] = useState<KpiConfigResponse | null>(null);
  const [kpis, setKpis] = useState<Record<string, any> | null>(null);
  const [trend, setTrend] = useState<any | null>(null);
  const [eod, setEod] = useState<any | null>(null);

  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState(daysAgoIso(13));
  const [to, setTo] = useState(todayIso());
  const [userId, setUserId] = useState('');
  const [team, setTeam] = useState<TeamMember[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, daily, tr, report] = await Promise.all([
        api.get<KpiConfigResponse>('/workspaces/current/kpis'),
        api.get('/analytics/kpis/daily', { params: { date, userId: userId || undefined } }),
        api.get('/analytics/kpis/trend', { params: { startDate: from, endDate: to } }),
        api.get('/analytics/eod-report', { params: { date } }),
      ]);
      setConfig(cfg.data);
      setKpis(daily.data);
      setTrend(tr.data);
      setEod(report.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca rapoartele.');
    } finally {
      setLoading(false);
    }
  }, [date, from, to, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only a manager may retarget the team, and only a manager may pick a
  // person. Discovered by asking, so the UI matches what the server allows.
  useEffect(() => {
    api
      .get<TeamMember[]>('/users')
      .then((res) => {
        setTeam(Array.isArray(res.data) ? res.data : []);
        setCanConfigure(true);
      })
      .catch(() => setCanConfigure(false));
  }, []);

  const cards = useMemo(
    () => visibleKpis(config?.enabled, config?.definitions ?? []),
    [config],
  );

  const memberName = (m: TeamMember) =>
    `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.email || 'Utilizator';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white">
            <BarChart3 className="h-6 w-6 text-indigo-600" /> Rapoarte
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Cifrele zilei, față de ținte, și raportul de final de zi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
          >
            <RefreshCw className="h-4 w-4" /> Reîncarcă
          </button>
          {canConfigure && (
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300"
            >
              <Settings2 className="h-4 w-4" /> Setează KPI
            </button>
          )}
        </div>
      </div>

      <UserReportPanel />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </label>

        {canConfigure && team.length > 0 && (
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">Toată echipa</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {memberName(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <button onClick={load} className="ml-3 underline">
            Încearcă din nou
          </button>
        </div>
      )}

      {showConfig && config && (
        <KpiConfigPanel
          config={config}
          onSaved={(saved) => {
            setConfig({ ...config, ...saved });
            setShowConfig(false);
          }}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Today's KPIs against their targets */}
          {!cards.length ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
              <Target className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                Niciun KPI ales. Apasă „Setează KPI" ca să alegi ce se măsoară.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((def) => {
                const value = kpis?.[def.key];
                const target = config?.targets?.[def.key];
                const progress = kpiProgress(value, target);
                return (
                  <div
                    key={def.key}
                    className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {def.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                      {formatKpiValue(value, def.unit)}
                    </p>
                    {progress !== null && (
                      <>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                          <div
                            className={`h-full rounded-full ${
                              progress >= 100 ? 'bg-green-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">
                          Țintă: {formatKpiValue(target, def.unit)}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* The same numbers over a range */}
          <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                <TrendingUp className="h-4 w-4" /> Evoluție
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
                />
                <span className="text-gray-400">→</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
            </div>

            {!trend?.data?.length ? (
              <p className="p-6 text-center text-sm text-gray-500">
                Nicio zi în intervalul ales.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500 dark:border-gray-700">
                      <th className="px-4 py-2 font-semibold">Zi</th>
                      {cards.map((def) => (
                        <th key={def.key} className="px-4 py-2 font-semibold">
                          {def.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {trend.data.map((row: any) => (
                      <tr key={row.date}>
                        <td className="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-gray-300">
                          {row.date}
                        </td>
                        {cards.map((def) => (
                          <td
                            key={def.key}
                            className="px-4 py-2 font-medium text-gray-900 dark:text-white"
                          >
                            {formatKpiValue(row[def.key], def.unit)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* End of day. Scoped by the server: a caller sees only their own. */}
          {eod && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Cine a făcut ce — {eod.date ?? date}
                </h2>
                {!eod.teamPerformance?.length ? (
                  <p className="text-sm text-gray-500">Nicio activitate în ziua asta.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500 dark:border-gray-700">
                          <th className="py-2 pr-3 font-semibold">Persoană</th>
                          <th className="py-2 pr-3 font-semibold">Activități</th>
                          <th className="py-2 pr-3 font-semibold">Vândute</th>
                          <th className="py-2 font-semibold">Încasat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {eod.teamPerformance.map((row: any) => (
                          <tr key={row.userId ?? row.userName}>
                            <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white">
                              {row.userName ?? '—'}
                            </td>
                            <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">
                              {formatKpiValue(row.activitiesCompleted, 'count')}
                            </td>
                            <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">
                              {formatKpiValue(row.dealsWon, 'count')}
                            </td>
                            <td className="py-2 font-medium text-gray-900 dark:text-white">
                              {formatKpiValue(row.revenueGenerated, 'currency')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Ce a rămas de făcut
                  </h2>
                  <dl className="space-y-2 text-sm">
                    {[
                      ['Taskuri întârziate', eod.actionItems?.overdueTasks],
                      ['Revenri necesare', eod.actionItems?.followUpsNeeded],
                      ['Oportunități de urmărit', eod.actionItems?.dealsRequiringAttention],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex items-center justify-between">
                        <dt className="text-gray-600 dark:text-gray-300">{label}</dt>
                        <dd className="font-semibold text-gray-900 dark:text-white">
                          {formatKpiValue(value as number, 'count')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Pipeline
                  </h2>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-600 dark:text-gray-300">Valoare totală</dt>
                      <dd className="font-semibold text-gray-900 dark:text-white">
                        {formatKpiValue(eod.pipeline?.totalValue, 'currency')}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-600 dark:text-gray-300">Oportunități deschise</dt>
                      <dd className="font-semibold text-gray-900 dark:text-white">
                        {formatKpiValue(eod.pipeline?.totalDeals, 'count')}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-600 dark:text-gray-300">Aproape de închidere</dt>
                      <dd className="font-semibold text-gray-900 dark:text-white">
                        {formatKpiValue(eod.pipeline?.hotDeals, 'count')}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Choosing what gets measured, and the daily target for each. */
function KpiConfigPanel({
  config,
  onSaved,
}: {
  config: KpiConfigResponse;
  onSaved: (saved: { enabled: string[]; targets: Record<string, number> }) => void;
}) {
  const [enabled, setEnabled] = useState<string[]>(config.enabled);
  const [targets, setTargets] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(config.targets ?? {}).map(([k, v]) => [k, String(v)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggle = (key: string) =>
    setEnabled((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      // Only send targets that are real positive numbers; a cleared field
      // means "no target", not zero.
      const payload: Record<string, number> = {};
      for (const [key, raw] of Object.entries(targets)) {
        const value = Number(String(raw).replace(',', '.'));
        if (raw !== '' && Number.isFinite(value) && value > 0) payload[key] = value;
      }
      const res = await api.put('/workspaces/current/kpis', { enabled, targets: payload });
      onSaved(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-a putut salva configurarea.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
      <h2 className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
        Ce se măsoară
      </h2>
      <p className="mb-3 text-xs text-gray-500">
        Alegerea e pentru tot workspace-ul. Ținta e pe zi; lasă câmpul gol dacă nu vrei țintă.
      </p>

      <div className="space-y-1.5">
        {config.definitions.map((def) => {
          const on = enabled.includes(def.key);
          return (
            <div
              key={def.key}
              className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2 dark:bg-gray-800"
            >
              <label className="flex min-w-[12rem] flex-1 items-center gap-2 text-sm">
                <input type="checkbox" checked={on} onChange={() => toggle(def.key)} />
                <span className="text-gray-900 dark:text-gray-100">{def.label}</span>
              </label>
              {def.targetable && on && (
                <input
                  type="number"
                  min="0"
                  placeholder="țintă/zi"
                  value={targets[def.key] ?? ''}
                  onChange={(e) =>
                    setTargets((prev) => ({ ...prev, [def.key]: e.target.value }))
                  }
                  className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          onClick={save}
          disabled={saving || !enabled.length}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Se salvează…' : 'Salvează'}
        </button>
        {!enabled.length && (
          <span className="self-center text-xs text-gray-500">Alege cel puțin un KPI.</span>
        )}
      </div>
    </div>
  );
}
