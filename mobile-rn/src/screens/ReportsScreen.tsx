import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import {
  customPeriod,
  formatRate,
  formatRevenue,
  formatTypedDate,
  periodFor,
  periodLabel,
  shiftPeriod,
  type Period,
  type PeriodKind,
} from '../lib/report-period';

/**
 * Rapoarte: what each caller and closer did in a day, a week, a month or a
 * custom range — calls, bookings, meetings, sales, losses and follow-ups.
 * A manager sees the team and can pick one person; everyone else sees only
 * their own numbers (the server enforces it, this screen just doesn't offer
 * the picker).
 */

type ReportRow = {
  userId: string;
  name: string;
  role: string | null;
  calls: { total: number; answered: number; notAnswered: number; refused: number; booked: number };
  bookings: { set: number; received: number; held: number; noShow: number; cancelled: number };
  sales: { won: number; lost: number; revenue: number; revenueByCurrency: Record<string, number> };
  followUps: { created: number; done: number; overdue: number };
  rates: { answer: number | null; booking: number | null; show: number | null; close: number | null };
};

type Report = { users: ReportRow[]; totals: ReportRow };

const KINDS: Array<{ kind: PeriodKind; label: string }> = [
  { kind: 'day', label: 'Zi' },
  { kind: 'week', label: 'Săptămână' },
  { kind: 'month', label: 'Lună' },
  { kind: 'custom', label: 'Interval' },
];

const ROLE_LABELS: Record<string, string> = {
  closer: 'Closer',
  caller: 'Caller',
  setter: 'Setter',
  admin: 'Admin',
  manager: 'Manager',
  sales_rep: 'Vânzări',
};

function Tile({ label, value, hint, tone = 'slate' }: { label: string; value: string | number; hint?: string; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const color = {
    slate: 'text-slate-900',
    green: 'text-emerald-700',
    red: 'text-rose-700',
    amber: 'text-amber-700',
    blue: 'text-indigo-700',
  }[tone];
  return (
    <View className="w-[48%] bg-white rounded-2xl border border-slate-100 p-3 mb-2.5">
      <Text className="text-[11px] text-slate-500">{label}</Text>
      <Text className={`text-xl font-extrabold mt-0.5 ${color}`} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {!!hint && <Text className="text-[10px] text-slate-400 mt-0.5">{hint}</Text>}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-2">
      <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">{title}</Text>
      <View className="flex-row flex-wrap justify-between">{children}</View>
    </View>
  );
}

function KpiBlock({ row }: { row: ReportRow }) {
  return (
    <>
      <Section title="Vânzări">
        <Tile label="Vândut (win)" value={row.sales.won} tone="green" />
        <Tile label="Pierdut (lost)" value={row.sales.lost + row.calls.refused} hint={`${row.calls.refused} refuzuri la telefon`} tone="red" />
        <Tile label="Încasări" value={formatRevenue(row.sales.revenueByCurrency)} tone="green" />
        <Tile label="Rată închidere" value={formatRate(row.rates.close)} hint="vândut / întâlniri ținute" tone="blue" />
      </Section>
      <Section title="Apeluri">
        <Tile label="Apeluri date" value={row.calls.total} />
        <Tile label="Au răspuns" value={row.calls.answered} hint={`Rată răspuns ${formatRate(row.rates.answer)}`} />
        <Tile label="N-au răspuns" value={row.calls.notAnswered} hint="inclusiv mesagerie, ocupat" tone="amber" />
        <Tile label="Programat din apel" value={row.calls.booked} hint={`${formatRate(row.rates.booking)} din răspunsuri`} tone="blue" />
      </Section>
      <Section title="Programări și întâlniri">
        <Tile label="Programări făcute" value={row.bookings.set} hint="pentru leadurile tale" />
        <Tile label="Programări primite" value={row.bookings.received} hint="în calendarul tău" />
        <Tile label="Întâlniri ținute" value={row.bookings.held} tone="green" hint={`Prezență ${formatRate(row.rates.show)}`} />
        <Tile label="No-show / anulate" value={`${row.bookings.noShow} / ${row.bookings.cancelled}`} tone="red" />
      </Section>
      <Section title="Follow-up">
        <Tile label="Follow-up create" value={row.followUps.created} />
        <Tile label="Follow-up făcute" value={row.followUps.done} tone="green" />
        <Tile label="Întârziate acum" value={row.followUps.overdue} tone={row.followUps.overdue ? 'red' : 'slate'} />
      </Section>
    </>
  );
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const role = useAuthStore((s) => (s.user as any)?.role as string | undefined);
  const isManager = role === 'admin' || role === 'manager';

  const [period, setPeriod] = useState<Period>(() => periodFor('day'));
  const [fromText, setFromText] = useState(formatTypedDate(new Date()));
  const [toText, setToText] = useState(formatTypedDate(new Date()));
  const [customError, setCustomError] = useState('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/analytics/user-report', {
        params: {
          from: period.from.toISOString(),
          to: period.to.toISOString(),
          ...(isManager && selectedUser ? { userId: selectedUser } : {}),
        },
      });
      setReport(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Raportul nu a putut fi încărcat.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [period, selectedUser, isManager]);

  useEffect(() => {
    void load();
  }, [load]);

  // The people a manager can pick: everyone in the team-wide report.
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!isManager || selectedUser) return;
    if (report?.users) setPeople(report.users.map((u) => ({ id: u.userId, name: u.name })));
  }, [report, isManager, selectedUser]);

  const chooseKind = (kind: PeriodKind) => {
    setCustomError('');
    if (kind === 'custom') {
      setPeriod({ kind: 'custom', from: period.from, to: period.to });
      setFromText(formatTypedDate(period.from));
      setToText(formatTypedDate(period.to));
      return;
    }
    setPeriod(periodFor(kind));
  };

  const applyCustom = () => {
    const next = customPeriod(fromText, toText);
    if ('error' in next) {
      setCustomError(next.error);
      return;
    }
    setCustomError('');
    setPeriod(next);
  };

  const shown = useMemo(() => {
    if (!report) return null;
    if (selectedUser || !isManager) return report.users[0] ?? report.totals;
    return report.totals;
  }, [report, selectedUser, isManager]);

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pb-4 bg-indigo-800" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 rounded-xl bg-white/15 border border-white/20">
            <ArrowLeft size={18} color="#fff" />
          </TouchableOpacity>
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-indigo-200">KPI</Text>
            <Text className="text-2xl font-extrabold text-white">Rapoarte</Text>
          </View>
        </View>

        <View className="flex-row gap-1.5 mt-3">
          {KINDS.map((k) => (
            <TouchableOpacity
              key={k.kind}
              onPress={() => chooseKind(k.kind)}
              className={`flex-1 items-center py-2 rounded-xl ${period.kind === k.kind ? 'bg-white' : 'bg-white/15'}`}
            >
              <Text className={`text-xs font-semibold ${period.kind === k.kind ? 'text-indigo-800' : 'text-white'}`}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <TouchableOpacity onPress={() => setPeriod(shiftPeriod(period, -1))} className="p-2 rounded-xl bg-white/15 border border-white/20">
            <ChevronLeft size={16} color="#fff" />
          </TouchableOpacity>
          <Text className="text-sm font-semibold text-white">{periodLabel(period)}</Text>
          <TouchableOpacity onPress={() => setPeriod(shiftPeriod(period, 1))} className="p-2 rounded-xl bg-white/15 border border-white/20">
            <ChevronRight size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {period.kind === 'custom' && (
          <View className="mt-3">
            <View className="flex-row gap-2">
              <TextInput
                value={fromText}
                onChangeText={setFromText}
                placeholder="01.10.2026"
                placeholderTextColor="#a5b4fc"
                keyboardType="numbers-and-punctuation"
                className="flex-1 rounded-xl bg-white/15 border border-white/25 px-3 py-2 text-white"
              />
              <TextInput
                value={toText}
                onChangeText={setToText}
                placeholder="31.10.2026"
                placeholderTextColor="#a5b4fc"
                keyboardType="numbers-and-punctuation"
                className="flex-1 rounded-xl bg-white/15 border border-white/25 px-3 py-2 text-white"
              />
              <TouchableOpacity onPress={applyCustom} className="rounded-xl bg-white px-3 justify-center">
                <Text className="text-xs font-bold text-indigo-800">Aplică</Text>
              </TouchableOpacity>
            </View>
            {!!customError && <Text className="text-[11px] text-rose-200 mt-1">{customError}</Text>}
          </View>
        )}
      </View>

      {isManager && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-14 bg-white border-b border-slate-100" contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          <TouchableOpacity
            onPress={() => setSelectedUser('')}
            className={`px-3 py-1.5 rounded-full border ${!selectedUser ? 'bg-slate-900 border-slate-900' : 'border-slate-200'}`}
          >
            <Text className={`text-xs font-semibold ${!selectedUser ? 'text-white' : 'text-slate-600'}`}>Toată echipa</Text>
          </TouchableOpacity>
          {people.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setSelectedUser(p.id)}
              className={`px-3 py-1.5 rounded-full border ${selectedUser === p.id ? 'bg-slate-900 border-slate-900' : 'border-slate-200'}`}
            >
              <Text className={`text-xs font-semibold ${selectedUser === p.id ? 'text-white' : 'text-slate-600'}`}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={loading && !!report} onRefresh={load} tintColor="#4338ca" />}
      >
        {loading && !report ? (
          <View className="items-center py-20">
            <ActivityIndicator size="large" color="#4338ca" />
          </View>
        ) : error ? (
          <View className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
            <Text className="text-sm text-rose-700">{error}</Text>
          </View>
        ) : shown ? (
          <>
            <Text className="text-base font-bold text-slate-900 px-1">
              {shown.userId === 'total' ? 'Toată echipa' : shown.name}
              {shown.role ? <Text className="text-xs font-normal text-slate-500">  {ROLE_LABELS[shown.role] || shown.role}</Text> : null}
            </Text>
            <KpiBlock row={shown} />

            {isManager && !selectedUser && report && report.users.length > 0 && (
              <View className="mt-4">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">Pe oameni</Text>
                {report.users.map((u) => (
                  <TouchableOpacity
                    key={u.userId}
                    onPress={() => setSelectedUser(u.userId)}
                    className="bg-white rounded-2xl border border-slate-100 p-3 mb-2"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-slate-900">{u.name}</Text>
                      <Text className="text-[11px] text-slate-500">{u.role ? ROLE_LABELS[u.role] || u.role : ''}</Text>
                    </View>
                    <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-1.5">
                      <Text className="text-[12px] text-slate-600">📞 {u.calls.total}</Text>
                      <Text className="text-[12px] text-slate-600">📅 {u.bookings.set + u.bookings.received}</Text>
                      <Text className="text-[12px] text-emerald-700">✓ {u.sales.won}</Text>
                      <Text className="text-[12px] text-rose-700">✗ {u.sales.lost + u.calls.refused}</Text>
                      <Text className="text-[12px] text-amber-700">↻ {u.followUps.created}</Text>
                      <Text className="text-[12px] text-slate-600">{formatRevenue(u.sales.revenueByCurrency)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {isManager && !selectedUser && report && report.users.length === 0 && (
              <Text className="text-sm text-slate-500 text-center mt-6">Nimeni n-a avut activitate în perioada asta.</Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
