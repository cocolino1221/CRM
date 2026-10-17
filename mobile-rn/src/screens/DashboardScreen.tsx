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
import { useNavigation } from '@react-navigation/native';
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileText,
  MessageCircle,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react-native';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth-store';

type DashboardData = {
  contacts: { total: number };
  deals: { total: number; open: number; closed: number; totalValue: number };
  companies: { total: number };
  tasks: { total: number; open: number; completed: number };
};

type MyLead = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status?: string;
  leadScore?: number;
};

type MyTask = {
  id: string;
  title: string;
  dueDate?: string;
  priority?: string;
  status?: string;
  type?: string;
  contact?: { firstName?: string; lastName?: string } | null;
};

type MyDeal = {
  id: string;
  title: string;
  value?: number;
  stage?: string;
};

type QuickAction = {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof BarChart3;
  accent: string;
  onPress: () => void;
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeList = <T,>(value: unknown, mapper: (entry: any) => T | null): T[] => {
  const rows: any[] = Array.isArray(value)
    ? value
    : Array.isArray((value as any)?.data)
      ? (value as any).data
      : Array.isArray((value as any)?.contacts)
        ? (value as any).contacts
        : Array.isArray((value as any)?.tasks)
          ? (value as any).tasks
          : Array.isArray((value as any)?.deals)
            ? (value as any).deals
            : [];

  return rows
    .map(mapper)
    .filter((entry): entry is T => Boolean(entry));
};

const normalizeLead = (value: any): MyLead | null => {
  const id = String(value?.id || '').trim();
  if (!id) return null;
  return {
    id,
    firstName: String(value?.firstName || '').trim() || 'Lead',
    lastName: String(value?.lastName || '').trim(),
    phone: String(value?.phone || '').trim() || undefined,
    status: String(value?.status || '').trim() || undefined,
    leadScore: asNumber(value?.leadScore, 0),
  };
};

const normalizeTask = (value: any): MyTask | null => {
  const id = String(value?.id || '').trim();
  if (!id) return null;
  return {
    id,
    title: String(value?.title || '').trim() || 'Untitled task',
    dueDate: String(value?.dueDate || '').trim() || undefined,
    priority: String(value?.priority || '').trim() || undefined,
    status: String(value?.status || '').trim() || undefined,
    type: String(value?.type || '').trim() || undefined,
    contact: value?.contact && typeof value.contact === 'object'
      ? {
          firstName: String(value.contact.firstName || '').trim() || undefined,
          lastName: String(value.contact.lastName || '').trim() || undefined,
        }
      : null,
  };
};

const normalizeDeal = (value: any): MyDeal | null => {
  const id = String(value?.id || '').trim();
  if (!id) return null;
  return {
    id,
    title: String(value?.title || '').trim() || 'Untitled deal',
    value: asNumber(value?.value, 0),
    stage: String(value?.stage || '').trim() || undefined,
  };
};

const currency = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
};

const dueLabel = (value?: string): string => {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const scoreColor = (score?: number): string => {
  if ((score || 0) >= 80) return '#16a34a';
  if ((score || 0) >= 50) return '#f59e0b';
  return '#e11d48';
};

const stageColor = (stage?: string): { bg: string; text: string } => {
  const key = String(stage || '').toLowerCase();
  if (key.includes('won') || key.includes('customer')) return { bg: '#dcfce7', text: '#166534' };
  if (key.includes('lost')) return { bg: '#fee2e2', text: '#b91c1c' };
  if (key.includes('proposal') || key.includes('qualified')) return { bg: '#dbeafe', text: '#1d4ed8' };
  return { bg: '#ede9fe', text: '#6d28d9' };
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [myLeads, setMyLeads] = useState<MyLead[]>([]);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [myDeals, setMyDeals] = useState<MyDeal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const firstName = String(user?.firstName || '').trim() || 'Team';

  const loadDashboard = useCallback(async () => {
    setError('');
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();
      const userId = String(user?.id || '').trim();

      const [dashboardRes, leadsRes, tasksRes, dealsRes] = await Promise.allSettled([
        api.get<DashboardData>('/analytics/dashboard'),
        userId
          ? api.get(`/contacts?ownerId=${userId}&limit=6&sortBy=updatedAt&sortOrder=DESC`)
          : Promise.resolve({ data: [] }),
        userId
          ? api.get(`/tasks?assigneeId=${userId}&dueDateFrom=${encodeURIComponent(todayStart)}&dueDateTo=${encodeURIComponent(todayEnd)}&limit=6`)
          : Promise.resolve({ data: [] }),
        userId
          ? api.get(`/deals?ownerId=${userId}&limit=8`)
          : Promise.resolve({ data: [] }),
      ]);

      if (dashboardRes.status === 'fulfilled') {
        setDashboard(dashboardRes.value.data);
      }

      if (leadsRes.status === 'fulfilled') {
        setMyLeads(normalizeList<MyLead>(leadsRes.value.data, normalizeLead).slice(0, 5));
      } else {
        setMyLeads([]);
      }

      if (tasksRes.status === 'fulfilled') {
        setMyTasks(normalizeList<MyTask>(tasksRes.value.data, normalizeTask).slice(0, 5));
      } else {
        setMyTasks([]);
      }

      if (dealsRes.status === 'fulfilled') {
        const deals = normalizeList<MyDeal>(dealsRes.value.data, normalizeDeal)
          .filter((deal) => !['closed_won', 'closed_lost'].includes(String(deal.stage || '').toLowerCase()))
          .slice(0, 5);
        setMyDeals(deals);
      } else {
        setMyDeals([]);
      }

      if (dashboardRes.status !== 'fulfilled') {
        throw dashboardRes.reason;
      }
    } catch (fetchError: any) {
      setError(fetchError?.response?.data?.message || 'Could not load dashboard');
    }
  }, [user?.id]);

  useEffect(() => {
    setIsLoading(true);
    loadDashboard().finally(() => setIsLoading(false));
  }, [loadDashboard]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadDashboard();
    setIsRefreshing(false);
  }, [loadDashboard]);

  const stats = useMemo(() => {
    if (!dashboard) return [];
    return [
      {
        id: 'contacts',
        label: 'Contacts',
        value: dashboard.contacts.total.toLocaleString(),
        detail: `${dashboard.companies.total} companies`,
        icon: Users,
        accent: '#0284c7',
        onPress: () => navigation.navigate('Leads'),
      },
      {
        id: 'deals',
        label: 'Open Deals',
        value: dashboard.deals.open.toLocaleString(),
        detail: currency(dashboard.deals.totalValue),
        icon: Briefcase,
        accent: '#0f766e',
        onPress: () => navigation.navigate('Leads'),
      },
      {
        id: 'tasks',
        label: 'Open Tasks',
        value: dashboard.tasks.open.toLocaleString(),
        detail: `${dashboard.tasks.completed} completed`,
        icon: CheckSquare,
        accent: '#7c3aed',
        onPress: () => navigation.navigate('Workspace', { screen: 'Calendar' }),
      },
      {
        id: 'analytics',
        label: 'Pipeline',
        value: `${dashboard.deals.closed.toLocaleString()} closed`,
        detail: `${dashboard.deals.total.toLocaleString()} total deals`,
        icon: TrendingUp,
        accent: '#ea580c',
        onPress: () => navigation.navigate('Workspace', { screen: 'Analytics' }),
      },
    ];
  }, [dashboard, navigation]);

  const quickActions = useMemo<QuickAction[]>(() => [
    {
      id: 'whatsapp',
      title: 'Messages',
      subtitle: 'WhatsApp, Messenger, Instagram',
      icon: MessageCircle,
      accent: '#0f766e',
      onPress: () => navigation.navigate('Messages'),
    },
    {
      id: 'analytics',
      title: 'Analytics',
      subtitle: 'Leads, tags, conversion funnel',
      icon: BarChart3,
      accent: '#4338ca',
      onPress: () => navigation.navigate('Workspace', { screen: 'Analytics' }),
    },
    {
      id: 'calendar',
      title: 'Calendar',
      subtitle: 'Today tasks and due items',
      icon: CalendarDays,
      accent: '#0f766e',
      onPress: () => navigation.navigate('Workspace', { screen: 'Calendar' }),
    },
    {
      id: 'documents',
      title: 'Documents',
      subtitle: 'Contracts, signatures, status',
      icon: FileText,
      accent: '#0369a1',
      onPress: () => navigation.navigate('Workspace', { screen: 'Documents' }),
    },
    {
      id: 'payments',
      title: 'Payments',
      subtitle: 'Collections and risk follow-up',
      icon: CreditCard,
      accent: '#b45309',
      onPress: () => navigation.navigate('Workspace', { screen: 'Payments' }),
    },
    {
      id: 'automations',
      title: 'Automations',
      subtitle: 'Workflows and execution status',
      icon: Sparkles,
      accent: '#be185d',
      onPress: () => navigation.navigate('Workspace', { screen: 'Automations' }),
    },
  ], [navigation]);

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#0f172a" />}
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <View className="bg-slate-900 px-4 pb-5" style={{ paddingTop: insets.top + 12 }}>
          <Text className="text-[11px] uppercase tracking-widest text-sky-200">Mobile CRM</Text>
          <Text className="mt-1 text-3xl font-extrabold text-white">Dashboard</Text>
          <Text className="mt-2 text-sm text-slate-300">
            Welcome back, {firstName}. Here is the live pulse of your workspace.
          </Text>

          <View className="mt-4 rounded-3xl border border-white/10 bg-white/10 px-4 py-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-sky-200">Focus Today</Text>
                <Text className="mt-1 text-xl font-bold text-white">
                  {myTasks.length} tasks, {myDeals.length} open deals
                </Text>
                <Text className="mt-1 text-xs leading-5 text-slate-300">
                  Use the quick actions below to move between inbox, analytics, calendar and collections.
                </Text>
              </View>
              <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
                <TrendingUp size={24} color="#fff" />
              </View>
            </View>
          </View>
        </View>

        {isLoading && !dashboard ? (
          <View className="py-24 items-center justify-center">
            <ActivityIndicator size="large" color="#0f172a" />
          </View>
        ) : error ? (
          <View className="mx-4 mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-4">
            <Text className="text-sm font-semibold text-rose-700">Dashboard unavailable</Text>
            <Text className="mt-1 text-xs leading-5 text-rose-600">{error}</Text>
          </View>
        ) : (
          <>
            <View className="mx-4 mt-4 flex-row flex-wrap justify-between">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <TouchableOpacity
                    key={stat.id}
                    onPress={stat.onPress}
                    activeOpacity={0.85}
                    className="mb-3 w-[48.5%] rounded-3xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: `${stat.accent}18` }}
                    >
                      <Icon size={18} color={stat.accent} />
                    </View>
                    <Text className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {stat.label}
                    </Text>
                    <Text className="mt-1 text-2xl font-extrabold text-slate-900">{stat.value}</Text>
                    <Text className="mt-1 text-xs text-slate-500">{stat.detail}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="mx-4 mt-1 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-lg font-bold text-slate-900">Quick Access</Text>
                  <Text className="mt-0.5 text-xs text-slate-500">Core workspace modules in one place</Text>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('Workspace')}>
                  <ArrowRight size={18} color="#0f172a" />
                </TouchableOpacity>
              </View>

              <View className="mt-4 flex-row flex-wrap justify-between">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <TouchableOpacity
                      key={action.id}
                      onPress={action.onPress}
                      activeOpacity={0.85}
                      className="mb-3 w-[48.5%] rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3.5"
                    >
                      <View
                        className="h-9 w-9 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: `${action.accent}18` }}
                      >
                        <Icon size={16} color={action.accent} />
                      </View>
                      <Text className="mt-3 text-sm font-bold text-slate-900">{action.title}</Text>
                      <Text className="mt-1 text-xs leading-5 text-slate-500">{action.subtitle}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="mx-4 mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-slate-900">Your Tasks Today</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Workspace', { screen: 'Calendar' })}>
                  <Text className="text-xs font-semibold text-sky-700">Open calendar</Text>
                </TouchableOpacity>
              </View>

              {myTasks.length === 0 ? (
                <Text className="mt-4 text-sm text-slate-500">No tasks due today. Good space to push the pipeline forward.</Text>
              ) : (
                <View className="mt-3">
                  {myTasks.map((task, index) => (
                    <View
                      key={task.id}
                      className={`py-3 ${index < myTasks.length - 1 ? 'border-b border-slate-100' : ''}`}
                    >
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-slate-900">{task.title}</Text>
                          <Text className="mt-1 text-xs text-slate-500">
                            {task.contact?.firstName ? `${task.contact.firstName} ${task.contact.lastName || ''}`.trim() : (task.type || 'task')} · {dueLabel(task.dueDate)}
                          </Text>
                        </View>
                        <View className="rounded-full bg-amber-100 px-2 py-1">
                          <Text className="text-[10px] font-bold uppercase text-amber-700">
                            {String(task.priority || 'medium').replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View className="mx-4 mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-slate-900">My Pipeline</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Leads')}>
                  <Text className="text-xs font-semibold text-sky-700">Open leads</Text>
                </TouchableOpacity>
              </View>

              <View className="mt-3">
                {myLeads.length === 0 ? (
                  <Text className="text-sm text-slate-500">No assigned leads yet.</Text>
                ) : (
                  myLeads.map((lead, index) => (
                    <TouchableOpacity
                      key={lead.id}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('Leads', {
                        screen: 'LeadDetail',
                        params: { contactId: lead.id },
                      })}
                      className={`${index < myLeads.length - 1 ? 'border-b border-slate-100' : ''} py-3`}
                    >
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-slate-900">
                            {lead.firstName} {lead.lastName}
                          </Text>
                          <Text className="mt-1 text-xs text-slate-500">
                            {lead.phone || 'No phone'} · {lead.status || 'lead'}
                          </Text>
                        </View>
                        <View
                          className="h-9 w-9 items-center justify-center rounded-full"
                          style={{ backgroundColor: scoreColor(lead.leadScore) }}
                        >
                          <Text className="text-[10px] font-bold text-white">{lead.leadScore || 0}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>

            <View className="mx-4 mt-4 rounded-3xl border border-slate-200 bg-white px-4 py-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-slate-900">Open Deals</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Workspace', { screen: 'Analytics' })}>
                  <Text className="text-xs font-semibold text-sky-700">See metrics</Text>
                </TouchableOpacity>
              </View>

              <View className="mt-3">
                {myDeals.length === 0 ? (
                  <Text className="text-sm text-slate-500">No open deals assigned right now.</Text>
                ) : (
                  myDeals.map((deal, index) => {
                    const chip = stageColor(deal.stage);
                    return (
                      <View
                        key={deal.id}
                        className={`${index < myDeals.length - 1 ? 'border-b border-slate-100' : ''} py-3`}
                      >
                        <View className="flex-row items-center justify-between gap-3">
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-slate-900">{deal.title}</Text>
                            <Text className="mt-1 text-xs text-slate-500">{currency(asNumber(deal.value, 0))}</Text>
                          </View>
                          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: chip.bg }}>
                            <Text className="text-[10px] font-bold uppercase" style={{ color: chip.text }}>
                              {String(deal.stage || 'open').replace(/_/g, ' ')}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
