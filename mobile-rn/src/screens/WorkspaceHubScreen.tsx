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
import {
  BarChart3,
  Bot,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  FolderKanban,
  Mic,
  Video,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';

type DashboardSnapshot = {
  contacts: { total: number };
  deals: { total: number; open: number; closed: number; totalValue: number };
  companies: { total: number };
  tasks: { total: number; open: number; completed: number };
};

type WorkspaceCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof FolderKanban;
  accent: string;
  route: 'Analytics' | 'Calendar' | 'Documents' | 'Payments' | 'Automations' | 'Availability';
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default function WorkspaceHubScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const cards = useMemo<WorkspaceCard[]>(() => [
    {
      id: 'analytics',
      title: 'Analytics',
      subtitle: 'Lead quality, tags, funnel and sources',
      icon: BarChart3,
      accent: '#4338ca',
      route: 'Analytics',
    },
    {
      id: 'payments',
      title: 'Payments',
      // Both providers now, which is why it sits with Analytics rather than
      // after Documents: it is a money report, not a document.
      subtitle: 'PayFunnels și Payflow, într-un singur loc',
      icon: CreditCard,
      accent: '#b45309',
      route: 'Payments',
    },
    {
      id: 'calendar',
      title: 'Calendar',
      subtitle: 'Tasks, due dates and quick planning',
      icon: CalendarDays,
      accent: '#0f766e',
      route: 'Calendar',
    },
    {
      id: 'availability',
      title: 'Disponibilitate',
      // The hours a closer is free; without them they are never offered as a
      // host when a lead is scheduled.
      subtitle: 'Orele în care ești liber pentru programări',
      icon: CalendarClock,
      accent: '#0f766e',
      route: 'Availability',
    },
    {
      id: 'documents',
      title: 'Documents',
      subtitle: 'Contracts, signatures and status sync',
      icon: FileText,
      accent: '#0369a1',
      route: 'Documents',
    },
    {
      id: 'automations',
      title: 'Automations',
      subtitle: 'Workflow rules and execution control',
      icon: Bot,
      accent: '#be185d',
      route: 'Automations',
    },
  ], []);

  const loadSnapshot = useCallback(async () => {
    setError('');
    try {
      const response = await api.get<DashboardSnapshot>('/analytics/dashboard');
      setSnapshot(response.data);
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.message || 'Could not load workspace overview');
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    loadSnapshot().finally(() => setIsLoading(false));
  }, [loadSnapshot]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadSnapshot();
    setIsRefreshing(false);
  }, [loadSnapshot]);

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0f172a" />}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <View className="bg-emerald-900 px-4 pb-5" style={{ paddingTop: insets.top + 12 }}>
          <Text className="text-[11px] uppercase tracking-widest text-emerald-200">Control Center</Text>
          <Text className="mt-1 text-3xl font-extrabold text-white">Workspace</Text>
          <Text className="mt-2 text-sm text-emerald-50/85">
            All the operational modules that matter on mobile, grouped cleanly in one place.
          </Text>

          <View className="mt-4 rounded-3xl border border-white/10 bg-white/10 px-4 py-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Snapshot</Text>
            <Text className="mt-1 text-xl font-bold text-white">
              {snapshot ? `${snapshot.tasks.open} open tasks · ${snapshot.deals.open} open deals` : 'Loading workspace'}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-emerald-50/75">
              We now expose mobile workflows beyond inbox and leads, with analytics and reusable WhatsApp media support.
            </Text>
          </View>
        </View>

        {isLoading && !snapshot ? (
          <View className="py-24 items-center justify-center">
            <ActivityIndicator size="large" color="#0f172a" />
          </View>
        ) : (
          <>
            {error ? (
              <View className="mx-4 mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4">
                <Text className="text-sm font-semibold text-rose-700">Workspace snapshot unavailable</Text>
                <Text className="mt-1 text-xs leading-5 text-rose-600">{error}</Text>
              </View>
            ) : (
              <View className="mx-4 mt-4 flex-row flex-wrap justify-between">
                <View className="mb-3 w-[48.5%] rounded-3xl border border-slate-200 bg-white px-4 py-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contacts</Text>
                  <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                    {asNumber(snapshot?.contacts.total).toLocaleString()}
                  </Text>
                </View>
                <View className="mb-3 w-[48.5%] rounded-3xl border border-slate-200 bg-white px-4 py-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Tasks</Text>
                  <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                    {asNumber(snapshot?.tasks.open).toLocaleString()}
                  </Text>
                </View>
                <View className="mb-3 w-[48.5%] rounded-3xl border border-slate-200 bg-white px-4 py-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Deals</Text>
                  <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                    {asNumber(snapshot?.deals.open).toLocaleString()}
                  </Text>
                </View>
                <View className="mb-3 w-[48.5%] rounded-3xl border border-slate-200 bg-white px-4 py-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-slate-500">Companies</Text>
                  <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                    {asNumber(snapshot?.companies.total).toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            <View className="mx-4 mt-1 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <Text className="text-lg font-bold text-slate-900">Workspace Modules</Text>
              <Text className="mt-1 text-xs text-slate-500">
                This is the growing mobile surface for features that used to live only on web.
              </Text>

              <View className="mt-4">
                {cards.map((card, index) => {
                  const Icon = card.icon;
                  return (
                    <TouchableOpacity
                      key={card.id}
                      onPress={() => navigation.navigate(card.route)}
                      activeOpacity={0.85}
                      className={`${index < cards.length - 1 ? 'mb-3' : ''} rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4`}
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className="h-11 w-11 items-center justify-center rounded-2xl"
                          style={{ backgroundColor: `${card.accent}18` }}
                        >
                          <Icon size={20} color={card.accent} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-slate-900">{card.title}</Text>
                          <Text className="mt-1 text-xs leading-5 text-slate-500">{card.subtitle}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="mx-4 mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <Text className="text-lg font-bold text-slate-900">New Mobile Capabilities</Text>
              <View className="mt-4">
                <View className="mb-3 flex-row items-start gap-3">
                  <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100">
                    <Video size={16} color="#166534" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">Reusable template media</Text>
                    <Text className="mt-1 text-xs leading-5 text-slate-500">
                      If a template video, image or document was already sent from web, mobile can now reuse it without asking again for a fresh Meta media ID.
                    </Text>
                  </View>
                </View>

                <View className="mb-3 flex-row items-start gap-3">
                  <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-2xl bg-sky-100">
                    <Mic size={16} color="#0369a1" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">Voice notes from mobile</Text>
                    <Text className="mt-1 text-xs leading-5 text-slate-500">
                      Recorded audio is marked and converted for better WhatsApp compatibility, closer to the normal voice-note experience.
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-start gap-3">
                  <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-2xl bg-violet-100">
                    <CheckCircle2 size={16} color="#6d28d9" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-slate-900">Broader mobile operating surface</Text>
                    <Text className="mt-1 text-xs leading-5 text-slate-500">
                      Analytics, calendar, documents, payments and automations are now grouped into a dedicated workspace flow instead of being scattered.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
