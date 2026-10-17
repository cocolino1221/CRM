import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, BarChart3, PhoneCall, Target, TrendingUp, Users, XCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';

type AnalyticsOverview = {
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  averageLeadScore: number;
  highTicketLeads: number;
  lowTicketLeads: number;
  followUpNeeded: number;
  lostLeads: number;
  conversionRate: number;
  recentlyAdded: number;
};

type TagAnalytics = {
  tag: string;
  count: number;
  averageLeadScore: number;
  conversionRate: number;
};

type FunnelStage = {
  stage: string;
  count: number;
  percentage: number;
  dropoffRate: number;
};

type FunnelResponse = {
  stages: FunnelStage[];
  totalEntered: number;
  totalConverted: number;
  overallConversionRate: number;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeOverview = (raw: any): AnalyticsOverview => ({
  total: toNumber(raw?.total),
  byStatus: raw?.byStatus && typeof raw.byStatus === 'object' ? raw.byStatus : {},
  bySource: raw?.bySource && typeof raw.bySource === 'object' ? raw.bySource : {},
  averageLeadScore: toNumber(raw?.averageLeadScore),
  highTicketLeads: toNumber(raw?.highTicketLeads),
  lowTicketLeads: toNumber(raw?.lowTicketLeads),
  followUpNeeded: toNumber(raw?.followUpNeeded),
  lostLeads: toNumber(raw?.lostLeads),
  conversionRate: toNumber(raw?.conversionRate),
  recentlyAdded: toNumber(raw?.recentlyAdded),
});

const normalizeTags = (raw: unknown): TagAnalytics[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      const tag = String(entry?.tag || '').trim();
      if (!tag) return null;
      return {
        tag,
        count: toNumber(entry?.count),
        averageLeadScore: toNumber(entry?.averageLeadScore),
        conversionRate: toNumber(entry?.conversionRate),
      };
    })
    .filter((entry): entry is TagAnalytics => Boolean(entry));
};

const normalizeFunnel = (raw: any): FunnelResponse => ({
  stages: Array.isArray(raw?.stages)
    ? raw.stages
      .map((stage: any) => {
        const key = String(stage?.stage || '').trim();
        if (!key) return null;
        return {
          stage: key,
          count: toNumber(stage?.count),
          percentage: Math.max(0, Math.min(100, toNumber(stage?.percentage))),
          dropoffRate: Math.max(0, Math.min(100, toNumber(stage?.dropoffRate))),
        };
      })
      .filter((entry: FunnelStage | null): entry is FunnelStage => Boolean(entry))
    : [],
  totalEntered: toNumber(raw?.totalEntered),
  totalConverted: toNumber(raw?.totalConverted),
  overallConversionRate: toNumber(raw?.overallConversionRate),
});

const stageAccent = (stage: string): string => {
  const key = stage.toLowerCase();
  if (key === 'lead') return '#64748b';
  if (key === 'prospect') return '#0284c7';
  if (key === 'qualified') return '#16a34a';
  if (key === 'customer') return '#7c3aed';
  return '#0f172a';
};

const sourceColor = (index: number): string => {
  const palette = ['#0369a1', '#0f766e', '#7c3aed', '#ea580c', '#be185d', '#0891b2'];
  return palette[index % palette.length];
};

export default function AnalyticsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [tags, setTags] = useState<TagAnalytics[]>([]);
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadAnalytics = useCallback(async () => {
    setError('');
    try {
      const [overviewRes, tagsRes, funnelRes] = await Promise.all([
        api.get('/contacts/analytics/overview'),
        api.get('/contacts/analytics/by-tags'),
        api.get('/contacts/analytics/conversion-funnel'),
      ]);

      setOverview(normalizeOverview(overviewRes.data));
      setTags(normalizeTags(tagsRes.data));
      setFunnel(normalizeFunnel(funnelRes.data));
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.message || 'Could not load analytics');
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadAnalytics().finally(() => setIsLoading(false));
  }, [loadAnalytics]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAnalytics();
    setIsRefreshing(false);
  }, [loadAnalytics]);

  const statCards = useMemo(() => {
    if (!overview) return [];
    return [
      { id: 'total', label: 'Total Leads', value: overview.total, icon: Users, accent: '#0284c7' },
      { id: 'hot', label: 'High Ticket', value: overview.highTicketLeads, icon: TrendingUp, accent: '#16a34a' },
      { id: 'follow', label: 'Follow-up Needed', value: overview.followUpNeeded, icon: PhoneCall, accent: '#ea580c' },
      { id: 'lost', label: 'Lost Leads', value: overview.lostLeads, icon: XCircle, accent: '#e11d48' },
      { id: 'score', label: 'Avg Lead Score', value: overview.averageLeadScore, icon: BarChart3, accent: '#7c3aed', suffix: '/100' },
      { id: 'conversion', label: 'Conversion Rate', value: overview.conversionRate, icon: Target, accent: '#0f766e', suffix: '%' },
    ];
  }, [overview]);

  const topSources = useMemo(
    () => Object.entries(overview?.bySource || {}).sort((a, b) => toNumber(b[1]) - toNumber(a[1])).slice(0, 6),
    [overview?.bySource],
  );

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0f172a" />}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <View className="bg-indigo-900 px-4 pb-5" style={{ paddingTop: insets.top + 12 }}>
          <View className="flex-row items-center justify-between">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              className="h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/10"
            >
              <ArrowLeft size={18} color="#fff" />
            </TouchableOpacity>
            <View className="items-end">
              <Text className="text-[11px] uppercase tracking-widest text-indigo-200">Workspace Health</Text>
              <Text className="text-2xl font-extrabold text-white">Analytics</Text>
            </View>
          </View>

          <View className="mt-4 rounded-3xl border border-white/10 bg-white/10 px-4 py-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Overview</Text>
            <Text className="mt-1 text-xl font-bold text-white">
              {overview ? `${overview.total} leads · ${overview.conversionRate}% conversion` : 'Loading metrics'}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-slate-300">
              This view mirrors the key lead and funnel metrics from the web dashboard, adapted for mobile.
            </Text>
          </View>
        </View>

        {isLoading && !overview ? (
          <View className="py-24 items-center justify-center">
            <ActivityIndicator size="large" color="#0f172a" />
          </View>
        ) : error ? (
          <View className="mx-4 mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4">
            <Text className="text-sm font-semibold text-rose-700">Analytics unavailable</Text>
            <Text className="mt-1 text-xs leading-5 text-rose-600">{error}</Text>
          </View>
        ) : (
          <>
            <View className="mx-4 mt-4 flex-row flex-wrap justify-between">
              {statCards.map((stat) => {
                const Icon = stat.icon;
                return (
                  <View
                    key={stat.id}
                    className="mb-3 w-[48.5%] rounded-3xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: `${stat.accent}18` }}
                    >
                      <Icon size={18} color={stat.accent} />
                    </View>
                    <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</Text>
                    <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                      {stat.value}
                      {'suffix' in stat && stat.suffix ? <Text className="text-sm text-slate-500">{stat.suffix}</Text> : null}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View className="mx-4 mt-1 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <Text className="text-lg font-bold text-slate-900">Lead Status Distribution</Text>
              <View className="mt-4">
                {Object.entries(overview?.byStatus || {}).map(([status, count]) => {
                  const safeCount = toNumber(count);
                  const percentage = overview && overview.total > 0 ? Math.round((safeCount / overview.total) * 100) : 0;
                  const accent = stageAccent(status);
                  return (
                    <View key={status} className="mb-3">
                      <View className="mb-1.5 flex-row items-center justify-between">
                        <Text className="text-sm font-semibold capitalize text-slate-800">{status.replace(/_/g, ' ')}</Text>
                        <Text className="text-xs text-slate-500">{safeCount} · {percentage}%</Text>
                      </View>
                      <View className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <View
                          className="h-full rounded-full"
                          style={{ width: `${percentage}%`, backgroundColor: accent }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <View className="mx-4 mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <Text className="text-lg font-bold text-slate-900">Top Sources</Text>
              {topSources.length === 0 ? (
                <Text className="mt-3 text-sm text-slate-500">No source analytics available.</Text>
              ) : (
                <View className="mt-4 flex-row flex-wrap">
                  {topSources.map(([source, count], index) => (
                    <View key={source} className="mb-3 mr-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <View className="flex-row items-center gap-2">
                        <View
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: sourceColor(index) }}
                        />
                        <Text className="text-sm font-semibold capitalize text-slate-800">{source}</Text>
                      </View>
                      <Text className="mt-2 text-xs text-slate-500">{toNumber(count)} contacts</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View className="mx-4 mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <Text className="text-lg font-bold text-slate-900">Tag Performance</Text>
              {tags.length === 0 ? (
                <Text className="mt-3 text-sm text-slate-500">No tag analytics available.</Text>
              ) : (
                <View className="mt-3">
                  {tags.slice(0, 6).map((tag, index) => (
                    <View
                      key={`${tag.tag}-${index}`}
                      className={`${index < Math.min(tags.length, 6) - 1 ? 'border-b border-slate-100' : ''} py-3`}
                    >
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-slate-900">{tag.tag}</Text>
                          <Text className="mt-1 text-xs text-slate-500">
                            {tag.count} leads · avg score {tag.averageLeadScore}
                          </Text>
                        </View>
                        <View className="rounded-full bg-sky-100 px-2.5 py-1">
                          <Text className="text-[10px] font-bold text-sky-700">{tag.conversionRate}% conv.</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View className="mx-4 mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <Text className="text-lg font-bold text-slate-900">Conversion Funnel</Text>
              <Text className="mt-1 text-xs text-slate-500">
                {funnel?.totalConverted || 0} converted from {funnel?.totalEntered || 0} total · {funnel?.overallConversionRate || 0}% overall
              </Text>

              <View className="mt-4">
                {(funnel?.stages || []).map((stage, index) => {
                  const accent = stageAccent(stage.stage);
                  return (
                    <View
                      key={`${stage.stage}-${index}`}
                      className={`${index < (funnel?.stages.length || 0) - 1 ? 'border-b border-slate-100' : ''} py-3`}
                    >
                      <View className="mb-1.5 flex-row items-center justify-between">
                        <Text className="text-sm font-semibold capitalize text-slate-900">{stage.stage.replace(/_/g, ' ')}</Text>
                        <Text className="text-xs text-slate-500">{stage.count} · {stage.percentage}%</Text>
                      </View>
                      <View className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <View
                          className="h-full rounded-full"
                          style={{ width: `${stage.percentage}%`, backgroundColor: accent }}
                        />
                      </View>
                      {index > 0 && (
                        <Text className="mt-1.5 text-[11px] text-slate-500">Dropoff from previous stage: {stage.dropoffRate}%</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
