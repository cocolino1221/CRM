import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Linking,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CreditCard,
  RefreshCw,
  WifiOff,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Clock3,
  ChevronRight,
  ChevronDown,
  Trash2,
} from 'lucide-react-native';
import api from '../lib/api';

type PaymentStatus = 'paid' | 'failed' | 'pending';
type TransactionFilter = 'all' | PaymentStatus;
type SubscriptionTab = 'active' | 'overdue';
type PaymentSectionKey =
  | 'overview'
  | 'filters'
  | 'payfunnelTransactions'
  | 'payfunnelSubscriptions'
  | 'payfunnelLinks'
  | 'crmPayments';

interface PaymentItem {
  documentId: string;
  documentName: string;
  createdAt: string;
  signedAt?: string;
  contact?: {
    name?: string;
    email?: string;
  };
  payment: {
    status: PaymentStatus;
    rawStatus?: string;
    amount?: number;
    currency?: string;
    paymentLink?: string;
    paidAt?: string;
    failedAt?: string;
    failureReason?: string;
  };
}

interface PaymentsResponse {
  payments: PaymentItem[];
  summary: {
    total: number;
    paid: number;
    failed: number;
    pending: number;
  };
}

interface PayfunnelPaymentItem {
  id: string;
  status: PaymentStatus;
  title?: string;
  description?: string;
  rawStatus?: string;
  failureReason?: string;
  amount?: number;
  currency?: string;
  taxAmount?: number;
  processingFeeAmount?: number;
  setupFeeAmount?: number;
  refundAmount?: number;
  quantity?: number;
  customerName?: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentMethodType?: string;
  cardLast4?: string;
  productNames?: string[];
  subscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionPlanName?: string;
  subscriptionStartedAt?: string;
  subscriptionEndsAt?: string;
  subscriptionPaidPayments?: number;
  subscriptionRemainingPayments?: number;
  subscriptionTotalPayments?: number;
  paymentLinkId?: string;
  paymentLinkName?: string;
  paymentUrl?: string;
  createdAt?: string;
  paidAt?: string;
}

interface PayfunnelSubscriptionItem {
  id: string;
  status?: string;
  title?: string;
  customerName?: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  planName?: string;
  interval?: string;
  paymentType?: string;
  amount?: number;
  chargeAmount?: number;
  currency?: string;
  totalCollectedAmount?: number;
  totalSubscriptionAmount?: number;
  totalDueAmount?: number;
  totalMaxPayment?: number;
  startedAt?: string;
  nextBillingAt?: string;
  currentPeriodStartAt?: string;
  currentPeriodEndAt?: string;
  trialEndsAt?: string;
  expiresAt?: string;
  lastPaymentAt?: string;
  canceledAt?: string;
  paidPayments?: number;
  failedPayments?: number;
  remainingPayments?: number;
  totalPayments?: number;
}

interface PayfunnelLinkItem {
  id: string;
  name: string;
  url: string;
  status?: string;
  createdAt?: string;
  source: 'integration_config' | 'payfunnel_api' | 'crm_documents';
}

interface PayfunnelDashboardResponse {
  connected: boolean;
  apiEnabled: boolean;
  message?: string;
  errors?: string[];
  payments: PayfunnelPaymentItem[];
  subscriptions: PayfunnelSubscriptionItem[];
  riskSubscriptions?: PayfunnelSubscriptionItem[];
  links: PayfunnelLinkItem[];
}

const defaultSummary: PaymentsResponse['summary'] = {
  total: 0,
  paid: 0,
  failed: 0,
  pending: 0,
};

const TRANSACTION_FILTERS: Array<{ value: TransactionFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
];

const SUBSCRIPTION_TABS: Array<{ value: SubscriptionTab; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'overdue', label: 'Overdue' },
];

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatCurrency(amount?: number, currency?: string): string {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '-';
  try {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: String(currency || 'EUR').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${String(currency || 'EUR').toUpperCase()}`;
  }
}

function matchesTransactionFilter(status: PaymentStatus, filter: TransactionFilter): boolean {
  return filter === 'all' || status === filter;
}

function paymentStatusStyles(status: PaymentStatus): { bg: string; text: string } {
  if (status === 'paid') return { bg: '#dcfce7', text: '#166534' };
  if (status === 'failed') return { bg: '#fee2e2', text: '#b91c1c' };
  return { bg: '#fef3c7', text: '#92400e' };
}

function subscriptionStatusStyles(rawStatus?: string): { bg: string; text: string } {
  const status = String(rawStatus || '').toLowerCase();
  if (status.includes('active') || status.includes('trial')) {
    return { bg: '#dcfce7', text: '#166534' };
  }
  if (status.includes('cancel') || status.includes('expired') || status.includes('ended')) {
    return { bg: '#fee2e2', text: '#b91c1c' };
  }
  if (status.includes('past_due') || status.includes('due') || status.includes('unpaid')) {
    return { bg: '#fef3c7', text: '#92400e' };
  }
  return { bg: '#e2e8f0', text: '#475569' };
}

function asDateTs(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function getSubscriptionExpiry(item: PayfunnelSubscriptionItem): string | undefined {
  return item.expiresAt || item.currentPeriodEndAt || item.canceledAt;
}

function getSubscriptionNextPayment(item: PayfunnelSubscriptionItem): string | undefined {
  return item.nextBillingAt || item.currentPeriodEndAt;
}

function getPaymentEndDate(item: PayfunnelPaymentItem): string | undefined {
  return item.subscriptionEndsAt || item.paidAt;
}

function isRiskSubscription(item: PayfunnelSubscriptionItem): boolean {
  const status = String(item.status || '').toLowerCase();
  const failedPayments = Number(item.failedPayments || 0);
  const dueAmount = Number(item.totalDueAmount || 0);
  const nextBillingTs = asDateTs(item.nextBillingAt || item.currentPeriodEndAt);
  const nowTs = Date.now();
  const hasRiskStatus = [
    'failed',
    'declined',
    'insufficient',
    'overdue',
    'past_due',
    'unpaid',
    'late',
    'chargeback',
    'error',
    'rejected',
    'refused',
  ].some((token) => status.includes(token));

  // Keep active installments in Active tab; mark as overdue only when the due date has passed.
  const isDueAndPastDeadline = dueAmount > 0 && nextBillingTs > 0 && nextBillingTs <= nowTs;

  return hasRiskStatus || failedPayments > 0 || isDueAndPastDeadline;
}

function formatCount(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return String(Math.max(Math.trunc(value), 0));
}

function normalizePhoneDigits(value?: string): string {
  return String(value || '').replace(/\D+/g, '');
}

async function openExternalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    // no-op
  }
}

export default function PaymentsScreen() {
  const insets = useSafeAreaInsets();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [summary, setSummary] = useState<PaymentsResponse['summary']>(defaultSummary);
  const [payfunnelData, setPayfunnelData] = useState<PayfunnelDashboardResponse>({
    connected: false,
    apiEnabled: false,
    payments: [],
    subscriptions: [],
    riskSubscriptions: [],
    links: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [payfunnelError, setPayfunnelError] = useState('');
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all');
  const [subscriptionTab, setSubscriptionTab] = useState<SubscriptionTab>('active');
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<PaymentSectionKey, boolean>>({
    overview: true,
    filters: true,
    payfunnelTransactions: false,
    payfunnelSubscriptions: false,
    payfunnelLinks: false,
    crmPayments: false,
  });
  const [expandedPayfunnelPayments, setExpandedPayfunnelPayments] = useState<Record<string, boolean>>({});
  const [expandedPayfunnelSubscriptions, setExpandedPayfunnelSubscriptions] = useState<Record<string, boolean>>({});
  const [expandedCrmPayments, setExpandedCrmPayments] = useState<Record<string, boolean>>({});
  const [removingRiskById, setRemovingRiskById] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setFetchError('');
    setPayfunnelError('');

    const [paymentsResult, payfunnelResult] = await Promise.allSettled([
      api.get<PaymentsResponse>('/documents/payments', { params: { page: 1, limit: 50 } }),
      api.get<PayfunnelDashboardResponse>('/documents/payfunnel/dashboard'),
    ]);

    if (paymentsResult.status === 'fulfilled') {
      const rows = Array.isArray(paymentsResult.value.data?.payments)
        ? paymentsResult.value.data.payments
        : [];
      setPayments(rows);
      setSummary(paymentsResult.value.data?.summary || defaultSummary);
    } else {
      const message =
        (paymentsResult.reason as any)?.response?.data?.message ||
        'Nu am putut incarca platile.';
      setFetchError(message);
      setPayments([]);
      setSummary(defaultSummary);
    }

    if (payfunnelResult.status === 'fulfilled') {
      const payload = payfunnelResult.value.data || ({} as PayfunnelDashboardResponse);
      setPayfunnelData({
        connected: payload.connected === true,
        apiEnabled: payload.apiEnabled === true,
        message: payload.message,
        errors: Array.isArray(payload.errors) ? payload.errors : [],
        payments: Array.isArray(payload.payments) ? payload.payments : [],
        subscriptions: Array.isArray(payload.subscriptions) ? payload.subscriptions : [],
        riskSubscriptions: Array.isArray((payload as any).riskSubscriptions) ? (payload as any).riskSubscriptions : [],
        links: Array.isArray(payload.links) ? payload.links : [],
      });
    } else {
      const message =
        (payfunnelResult.reason as any)?.response?.data?.message ||
        'Nu am putut incarca datele de plata.';
      setPayfunnelError(message);
      setPayfunnelData({
        connected: false,
        apiEnabled: false,
        payments: [],
        subscriptions: [],
        riskSubscriptions: [],
        links: [],
      });
    }

    if (!silent) setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchData(true);
    setIsRefreshing(false);
  }, [fetchData]);

  const payfunnelPayments = useMemo(
    () =>
      [...payfunnelData.payments].sort((a, b) => {
        const bTs = asDateTs(b.paidAt || b.createdAt);
        const aTs = asDateTs(a.paidAt || a.createdAt);
        return bTs - aTs;
      }),
    [payfunnelData.payments],
  );

  const payfunnelSubscriptions = useMemo(
    () =>
      [...payfunnelData.subscriptions].sort((a, b) => {
        const bTs = asDateTs(b.nextBillingAt || b.currentPeriodEndAt || b.startedAt);
        const aTs = asDateTs(a.nextBillingAt || a.currentPeriodEndAt || a.startedAt);
        return bTs - aTs;
      }),
    [payfunnelData.subscriptions],
  );

  const riskSubscriptions = useMemo(
    () => {
      const explicitRows = Array.isArray(payfunnelData.riskSubscriptions) ? payfunnelData.riskSubscriptions : [];
      const sourceRows = explicitRows.length > 0 ? explicitRows : payfunnelSubscriptions;
      return sourceRows
        .filter(isRiskSubscription)
        .sort((a, b) => {
          const bTs = asDateTs(b.nextBillingAt || b.currentPeriodEndAt || b.expiresAt || b.lastPaymentAt || b.startedAt);
          const aTs = asDateTs(a.nextBillingAt || a.currentPeriodEndAt || a.expiresAt || a.lastPaymentAt || a.startedAt);
          return bTs - aTs;
        });
    },
    [payfunnelData.riskSubscriptions, payfunnelSubscriptions],
  );

  const filteredCrmPayments = useMemo(
    () => payments.filter((row) => matchesTransactionFilter(row.payment.status, transactionFilter)),
    [payments, transactionFilter],
  );

  const filteredPayfunnelPayments = useMemo(
    () => payfunnelPayments.filter((row) => matchesTransactionFilter(row.status, transactionFilter)),
    [payfunnelPayments, transactionFilter],
  );

  const filteredPayfunnelSubscriptions = useMemo(
    () => {
      const query = subscriptionSearch.trim().toLowerCase();
      const queryPhone = normalizePhoneDigits(subscriptionSearch);
      return payfunnelSubscriptions.filter((row) => {
        if (isRiskSubscription(row)) {
          return false;
        }

        if (!query && !queryPhone) {
          return true;
        }

        const textMatch = [
          row.planName,
          row.title,
          row.customerName,
          row.customerEmail,
          row.customerId,
          row.id,
          row.customerPhone,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

        const phoneMatch = queryPhone.length > 0
          ? normalizePhoneDigits(row.customerPhone).includes(queryPhone)
          : false;

        return textMatch || phoneMatch;
      });
    },
    [payfunnelSubscriptions, subscriptionSearch],
  );

  const filteredRiskSubscriptions = useMemo(
    () => {
      const query = subscriptionSearch.trim().toLowerCase();
      const queryPhone = normalizePhoneDigits(subscriptionSearch);
      return riskSubscriptions.filter((row) => {
        if (!query && !queryPhone) {
          return true;
        }

        const textMatch = [
          row.planName,
          row.title,
          row.customerName,
          row.customerEmail,
          row.customerId,
          row.id,
          row.customerPhone,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

        const phoneMatch = queryPhone.length > 0
          ? normalizePhoneDigits(row.customerPhone).includes(queryPhone)
          : false;

        return textMatch || phoneMatch;
      });
    },
    [riskSubscriptions, subscriptionSearch],
  );

  const displayedSubscriptions = subscriptionTab === 'overdue'
    ? filteredRiskSubscriptions
    : filteredPayfunnelSubscriptions;

  const payfunnelPaymentSummary = useMemo(() => {
    return payfunnelPayments.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === 'paid') acc.paid += 1;
        else if (row.status === 'failed') acc.failed += 1;
        else acc.pending += 1;
        return acc;
      },
      { total: 0, paid: 0, failed: 0, pending: 0 },
    );
  }, [payfunnelPayments]);

  const payfunnelSubscriptionSummary = useMemo(() => {
    return {
      total: payfunnelSubscriptions.length,
      active: filteredPayfunnelSubscriptions.length,
      overdue: filteredRiskSubscriptions.length,
    };
  }, [payfunnelSubscriptions.length, filteredPayfunnelSubscriptions.length, filteredRiskSubscriptions.length]);

  const toggleSection = useCallback((key: PaymentSectionKey) => {
    if (key === 'overview' || key === 'filters') {
      return;
    }
    setExpandedSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const togglePayfunnelPaymentRow = useCallback((rowKey: string) => {
    setExpandedPayfunnelPayments((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }, []);

  const togglePayfunnelSubscriptionRow = useCallback((rowKey: string) => {
    setExpandedPayfunnelSubscriptions((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }, []);

  const toggleCrmPaymentRow = useCallback((rowKey: string) => {
    setExpandedCrmPayments((prev) => ({
      ...prev,
      [rowKey]: !prev[rowKey],
    }));
  }, []);

  const dismissRiskSubscription = useCallback(async (subscriptionId: string) => {
    const normalizedId = String(subscriptionId || '').trim();
    if (!normalizedId) {
      return;
    }

    setRemovingRiskById((prev) => ({ ...prev, [normalizedId]: true }));
    try {
      await api.delete(`/documents/payfunnel/subscriptions/${encodeURIComponent(normalizedId)}`);
      setPayfunnelData((prev) => ({
        ...prev,
        riskSubscriptions: Array.isArray(prev.riskSubscriptions)
          ? prev.riskSubscriptions.filter((item) => String(item.id || '').trim() !== normalizedId)
          : prev.riskSubscriptions,
      }));
    } catch (error: any) {
      setPayfunnelError(error?.response?.data?.message || error?.message || 'Nu am putut sterge subscription-ul.');
    } finally {
      setRemovingRiskById((prev) => {
        const next = { ...prev };
        delete next[normalizedId];
        return next;
      });
    }
  }, []);

  const renderSectionHeader = (
    key: PaymentSectionKey,
    title: string,
    countLabel?: string,
  ) => {
    const isAlwaysExpanded = key === 'overview' || key === 'filters';
    const isExpanded = isAlwaysExpanded ? true : expandedSections[key];
    return (
      <TouchableOpacity
        onPress={() => toggleSection(key)}
        disabled={isAlwaysExpanded}
        className="flex-row items-center justify-between"
        activeOpacity={0.8}
      >
        <View className="flex-row items-center gap-2">
          {!isAlwaysExpanded
            ? (isExpanded ? <ChevronDown size={16} color="#334155" /> : <ChevronRight size={16} color="#334155" />)
            : null}
          <Text className="text-sm font-semibold text-slate-900">{title}</Text>
        </View>
        {countLabel ? <Text className="text-[11px] text-slate-500">{countLabel}</Text> : null}
      </TouchableOpacity>
    );
  };

  const renderCrmPaymentItem = ({ item }: { item: PaymentItem }) => {
    const rowKey = `${item.documentId}:${item.createdAt}`;
    const isExpanded = expandedCrmPayments[rowKey] === true;
    const chip = paymentStatusStyles(item.payment.status);
    const contactLabel = item.contact?.name || item.contact?.email || '-';
    const paymentLink = String(item.payment.paymentLink || '').trim();
    const startedAt = item.createdAt;
    const endedAt = item.payment.paidAt || item.payment.failedAt || item.signedAt;

    return (
      <TouchableOpacity
        onPress={() => toggleCrmPaymentRow(rowKey)}
        activeOpacity={0.85}
        className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-2.5"
      >
        <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
          {item.documentName}
        </Text>
        <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
          {contactLabel}
        </Text>

        <View className="flex-row items-center gap-2 mt-2.5">
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: chip.bg }}>
            <Text className="text-[10px] font-semibold" style={{ color: chip.text }}>
              {item.payment.status}
            </Text>
          </View>
          <Text className="text-xs font-semibold text-slate-700">{formatCurrency(item.payment.amount, item.payment.currency)}</Text>
          <Text className="text-[11px] text-slate-400 ml-auto">{isExpanded ? '▲' : '▼'}</Text>
        </View>

        <View className="mt-2">
          <Text className="text-[11px] text-slate-500">Start: {formatDate(startedAt)}</Text>
          <Text className="text-[11px] text-slate-500">End: {formatDate(endedAt)}</Text>
        </View>

        {isExpanded ? (
          <View className="mt-2">
            <Text className="text-[11px] text-slate-500">Signed: {formatDate(item.signedAt)}</Text>
            <Text className="text-[11px] text-slate-500">Paid: {formatDate(item.payment.paidAt)}</Text>
            <Text className="text-[11px] text-slate-500">Failed: {formatDate(item.payment.failedAt)}</Text>

            {item.payment.failureReason ? (
              <Text className="text-xs text-rose-600 mt-2" numberOfLines={2}>
                {item.payment.failureReason}
              </Text>
            ) : null}

            {paymentLink ? (
              <TouchableOpacity
                onPress={() => openExternalUrl(paymentLink)}
                className="self-start flex-row items-center gap-1.5 mt-3 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50"
              >
                <ExternalLink size={14} color="#4338ca" />
                <Text className="text-xs font-semibold text-indigo-700">Open Payment Link</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-3">
        {renderSectionHeader('overview', 'Overview')}
        <View className="mt-3">
            <View className="flex-row gap-2 mb-3">
              <View className="flex-1 bg-white border border-slate-100 rounded-2xl px-3 py-2.5">
                <Text className="text-[11px] text-slate-500">CRM Paid</Text>
                <Text className="text-lg font-extrabold text-emerald-700">{summary.paid}</Text>
              </View>
              <View className="flex-1 bg-white border border-slate-100 rounded-2xl px-3 py-2.5">
                <Text className="text-[11px] text-slate-500">CRM Failed</Text>
                <Text className="text-lg font-extrabold text-rose-700">{summary.failed}</Text>
              </View>
              <View className="flex-1 bg-white border border-slate-100 rounded-2xl px-3 py-2.5">
                <Text className="text-[11px] text-slate-500">CRM Pending</Text>
                <Text className="text-lg font-extrabold text-amber-700">{summary.pending}</Text>
              </View>
            </View>

            <View className="bg-white border border-slate-100 rounded-2xl p-3.5">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-sm font-semibold text-slate-900">Import plati</Text>
                  <Text className="text-[11px] text-slate-500 mt-0.5">
                    {payfunnelData.connected ? 'Connected' : 'Not connected'} • {payfunnelData.apiEnabled ? 'API' : 'Webhook-only'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => fetchData()} className="px-2.5 py-1.5 rounded-lg bg-slate-100">
                  <Text className="text-[11px] font-semibold text-slate-700">Sync</Text>
                </TouchableOpacity>
              </View>

              {payfunnelError ? (
                <Text className="text-xs text-rose-600 mt-2">{payfunnelError}</Text>
              ) : null}

              {payfunnelData.message ? (
                <Text className="text-xs text-amber-700 mt-2">{payfunnelData.message}</Text>
              ) : null}

              {Array.isArray(payfunnelData.errors) && payfunnelData.errors.length > 0 ? (
                <View className="mt-2 rounded-xl bg-amber-50 border border-amber-100 px-2.5 py-2">
                  {payfunnelData.errors.map((row, index) => (
                    <Text key={`${row}-${index}`} className="text-[11px] text-amber-800">• {row}</Text>
                  ))}
                </View>
              ) : null}

              <View className="flex-row flex-wrap gap-2 mt-2.5">
                <View className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
                  <Text className="text-[11px] font-semibold text-emerald-700">Paid {payfunnelPaymentSummary.paid}</Text>
                </View>
                <View className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100">
                  <Text className="text-[11px] font-semibold text-rose-700">Failed {payfunnelPaymentSummary.failed}</Text>
                </View>
                <View className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-100">
                  <Text className="text-[11px] font-semibold text-amber-700">Pending {payfunnelPaymentSummary.pending}</Text>
                </View>
                <View className="px-2.5 py-1 rounded-full bg-sky-50 border border-sky-100">
                  <Text className="text-[11px] font-semibold text-sky-700">Subscriptions {payfunnelSubscriptionSummary.total}</Text>
                </View>
                <View className="px-2.5 py-1 rounded-full bg-violet-50 border border-violet-100">
                  <Text className="text-[11px] font-semibold text-violet-700">Active subs {payfunnelSubscriptionSummary.active}</Text>
                </View>
                <View className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-100">
                  <Text className="text-[11px] font-semibold text-amber-700">Overdue subs {payfunnelSubscriptionSummary.overdue}</Text>
                </View>
                <View className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200">
                  <Text className="text-[11px] font-semibold text-slate-700">Links {payfunnelData.links.length}</Text>
                </View>
              </View>
            </View>
          </View>
      </View>

      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-3">
        {renderSectionHeader('filters', 'Filters')}
        <View className="mt-3">
            <Text className="text-[11px] text-slate-500 mt-1">Transactions</Text>
            <View className="flex-row flex-wrap gap-2 mt-2">
              {TRANSACTION_FILTERS.map((option) => {
                const isActive = option.value === transactionFilter;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setTransactionFilter(option.value)}
                    className="px-2.5 py-1 rounded-full border"
                    style={{
                      backgroundColor: isActive ? '#0f766e' : '#ffffff',
                      borderColor: isActive ? '#0f766e' : '#cbd5e1',
                    }}
                  >
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: isActive ? '#ffffff' : '#334155' }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text className="text-[11px] text-slate-500 mt-3">Subscriptions</Text>
            <View className="flex-row gap-2 mt-2">
              {SUBSCRIPTION_TABS.map((option) => {
                const isActive = option.value === subscriptionTab;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setSubscriptionTab(option.value)}
                    className="px-2.5 py-1 rounded-full border"
                    style={{
                      backgroundColor: isActive ? '#334155' : '#ffffff',
                      borderColor: isActive ? '#334155' : '#cbd5e1',
                    }}
                  >
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: isActive ? '#ffffff' : '#334155' }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              value={subscriptionSearch}
              onChangeText={setSubscriptionSearch}
              placeholder="Cauta subscription dupa nume sau telefon"
              placeholderTextColor="#94a3b8"
              className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
              autoCapitalize="none"
              autoCorrect={false}
              blurOnSubmit={false}
              returnKeyType="search"
            />
          </View>
      </View>

      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-3">
        {renderSectionHeader('payfunnelTransactions', 'Transactions', String(filteredPayfunnelPayments.length))}
        {expandedSections.payfunnelTransactions ? (
          filteredPayfunnelPayments.length === 0 ? (
            <Text className="text-xs text-slate-500 mt-2">Nu exista tranzactii pentru filtrul selectat.</Text>
          ) : (
            filteredPayfunnelPayments.map((row) => {
              const rowKey = `${row.id}:${row.createdAt || ''}:${row.status}`;
              const isExpanded = expandedPayfunnelPayments[rowKey] === true;
              const chip = paymentStatusStyles(row.status);
              const isPaid = row.status === 'paid';
              const isFailed = row.status === 'failed';
              const Icon = isPaid ? CheckCircle : isFailed ? AlertTriangle : Clock3;
              const iconColor = isPaid ? '#16a34a' : isFailed ? '#dc2626' : '#d97706';
              const endDate = getPaymentEndDate(row);
              return (
                <TouchableOpacity
                  key={rowKey}
                  onPress={() => togglePayfunnelPaymentRow(rowKey)}
                  activeOpacity={0.85}
                  className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2.5"
                >
                  <View className="flex-row items-center gap-2">
                    <Icon size={14} color={iconColor} />
                    <Text className="text-xs font-semibold text-slate-900 flex-1" numberOfLines={1}>
                      {row.customerName || row.customerEmail || row.id}
                    </Text>
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: chip.bg }}>
                      <Text className="text-[10px] font-semibold" style={{ color: chip.text }}>{row.status}</Text>
                    </View>
                    <Text className="text-[11px] text-slate-400">{isExpanded ? '▲' : '▼'}</Text>
                  </View>

                  <View className="mt-1">
                    <Text className="text-[11px] text-slate-600">{formatCurrency(row.amount, row.currency)}</Text>
                    <Text className="text-[11px] text-slate-500">Start: {formatDate(row.createdAt)}</Text>
                    <Text className="text-[11px] text-slate-500">End: {formatDate(endDate)}</Text>
                  </View>

                  {isExpanded ? (
                    <View className="mt-1">
                      {row.title ? <Text className="text-[11px] text-slate-500">Title: {row.title}</Text> : null}
                      {row.customerId ? <Text className="text-[11px] text-slate-500">Customer ID: {row.customerId}</Text> : null}
                      <Text className="text-[11px] text-slate-500">Paid: {formatDate(row.paidAt)}</Text>
                      {row.rawStatus ? <Text className="text-[11px] text-slate-500">Raw: {row.rawStatus}</Text> : null}
                      {row.paymentMethodType ? <Text className="text-[11px] text-slate-500">Method: {row.paymentMethodType}</Text> : null}
                      {row.cardLast4 ? <Text className="text-[11px] text-slate-500">Card: **** {row.cardLast4}</Text> : null}
                      {row.subscriptionId ? <Text className="text-[11px] text-slate-500">Subscription ID: {row.subscriptionId}</Text> : null}
                      {row.subscriptionPlanName ? <Text className="text-[11px] text-slate-500">Plan: {row.subscriptionPlanName}</Text> : null}
                      {row.subscriptionStatus ? <Text className="text-[11px] text-slate-500">Subscription status: {row.subscriptionStatus}</Text> : null}
                      <Text className="text-[11px] text-slate-500">Subscription start: {formatDate(row.subscriptionStartedAt)}</Text>
                      <Text className="text-[11px] text-slate-500">Subscription end: {formatDate(row.subscriptionEndsAt)}</Text>
                      <Text className="text-[11px] text-slate-500">
                        Subscription payments: {formatCount(row.subscriptionPaidPayments)} / {formatCount(row.subscriptionTotalPayments)}
                      </Text>
                      <Text className="text-[11px] text-slate-500">
                        Remaining payments: {formatCount(row.subscriptionRemainingPayments)}
                      </Text>
                      {row.quantity !== undefined ? (
                        <Text className="text-[11px] text-slate-500">Quantity: {formatCount(row.quantity)}</Text>
                      ) : null}
                      {row.productNames && row.productNames.length > 0 ? (
                        <Text className="text-[11px] text-slate-500">Products: {row.productNames.join(', ')}</Text>
                      ) : null}
                      {(row.taxAmount !== undefined || row.processingFeeAmount !== undefined || row.setupFeeAmount !== undefined || row.refundAmount !== undefined) ? (
                        <Text className="text-[11px] text-slate-500">
                          Tax: {formatCurrency(row.taxAmount, row.currency)} | Proc fee: {formatCurrency(row.processingFeeAmount, row.currency)} | Setup fee: {formatCurrency(row.setupFeeAmount, row.currency)} | Refund: {formatCurrency(row.refundAmount, row.currency)}
                        </Text>
                      ) : null}
                      {row.paymentLinkName ? <Text className="text-[11px] text-slate-500">Link: {row.paymentLinkName}</Text> : null}

                      {row.failureReason ? (
                        <Text className="text-[11px] text-rose-600 mt-1" numberOfLines={2}>
                          {row.failureReason}
                        </Text>
                      ) : null}

                      {row.paymentUrl ? (
                        <TouchableOpacity
                          onPress={() => openExternalUrl(row.paymentUrl || '')}
                          className="self-start mt-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 flex-row items-center gap-1"
                        >
                          <ExternalLink size={12} color="#4338ca" />
                          <Text className="text-[11px] font-semibold text-indigo-700">Open payment</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })
          )
        ) : null}
      </View>

      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-3">
        {renderSectionHeader(
          'payfunnelSubscriptions',
          subscriptionTab === 'overdue' ? 'Overdue' : 'Active',
          String(displayedSubscriptions.length),
        )}
        {expandedSections.payfunnelSubscriptions ? (
          displayedSubscriptions.length === 0 ? (
            <Text className="text-xs text-slate-500 mt-2">
              {subscriptionTab === 'overdue'
                ? 'Nu exista subscriptions failed/overdue.'
                : 'Nu exista subscriptions active.'}
            </Text>
          ) : (
            displayedSubscriptions.map((sub) => {
              const rowKey = sub.id;
              const isExpanded = expandedPayfunnelSubscriptions[rowKey] === true;
              const chip = subscriptionStatusStyles(sub.status);
              const nextPaymentAt = getSubscriptionNextPayment(sub);
              const expiresAt = getSubscriptionExpiry(sub);
              const normalizedId = String(sub.id || '').trim();
              const isRemoving = removingRiskById[normalizedId] === true;
              return (
                <TouchableOpacity
                  key={sub.id}
                  onPress={() => togglePayfunnelSubscriptionRow(rowKey)}
                  activeOpacity={0.85}
                  className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2.5"
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs font-semibold text-slate-900 flex-1" numberOfLines={1}>
                      {sub.planName || sub.title || sub.id}
                    </Text>
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: chip.bg }}>
                      <Text className="text-[10px] font-semibold" style={{ color: chip.text }}>{sub.status || 'unknown'}</Text>
                    </View>
                    <Text className="text-[11px] text-slate-400">{isExpanded ? '▲' : '▼'}</Text>
                  </View>

                  <Text className="text-[11px] text-slate-500 mt-1" numberOfLines={1}>
                    {sub.customerName || sub.customerEmail || '-'}
                  </Text>
                  {subscriptionTab === 'overdue' ? (
                    <View className="mt-1.5 flex-row">
                      <TouchableOpacity
                        onPress={() => dismissRiskSubscription(normalizedId)}
                        disabled={isRemoving}
                        className="self-start px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 flex-row items-center gap-1"
                      >
                        <Trash2 size={12} color="#be123c" />
                        <Text className="text-[11px] font-semibold text-rose-700">
                          {isRemoving ? 'Stergere...' : 'Sterge din lista'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  {sub.customerPhone ? <Text className="text-[11px] text-slate-500">Phone: {sub.customerPhone}</Text> : null}
                  {sub.customerId ? <Text className="text-[11px] text-slate-500">Customer ID: {sub.customerId}</Text> : null}
                  <Text className="text-[11px] text-slate-600">{formatCurrency(sub.amount, sub.currency)}{sub.interval ? ` / ${sub.interval}` : ''}</Text>
                  {sub.chargeAmount !== undefined ? <Text className="text-[11px] text-slate-500">Charge amount: {formatCurrency(sub.chargeAmount, sub.currency)}</Text> : null}
                  <Text className="text-[11px] text-slate-500">Started: {formatDate(sub.startedAt)}</Text>
                  <Text className="text-[11px] text-slate-500">Expires: {formatDate(expiresAt)}</Text>

                  {isExpanded ? (
                    <View className="mt-1">
                      {sub.paymentType ? <Text className="text-[11px] text-slate-500">Payment type: {sub.paymentType}</Text> : null}
                      <Text className="text-[11px] text-slate-500">Next payment: {formatDate(nextPaymentAt)}</Text>
                      <Text className="text-[11px] text-slate-500">Current period start: {formatDate(sub.currentPeriodStartAt)}</Text>
                      <Text className="text-[11px] text-slate-500">Current period end: {formatDate(sub.currentPeriodEndAt)}</Text>
                      <Text className="text-[11px] text-slate-500">Trial ends: {formatDate(sub.trialEndsAt)}</Text>
                      <Text className="text-[11px] text-slate-500">Last payment: {formatDate(sub.lastPaymentAt)}</Text>
                      <Text className="text-[11px] text-slate-500">Canceled: {formatDate(sub.canceledAt)}</Text>
                      <Text className="text-[11px] text-slate-500">
                        Payments made: {formatCount(sub.paidPayments)} / {formatCount(sub.totalPayments ?? sub.totalMaxPayment)}
                      </Text>
                      <Text className="text-[11px] text-slate-500">Payments failed: {formatCount(sub.failedPayments)}</Text>
                      <Text className="text-[11px] text-slate-500">Payments remaining: {formatCount(sub.remainingPayments)}</Text>
                      {(sub.totalCollectedAmount !== undefined || sub.totalSubscriptionAmount !== undefined || sub.totalDueAmount !== undefined) ? (
                        <Text className="text-[11px] text-slate-500">
                          Collected: {formatCurrency(sub.totalCollectedAmount, sub.currency)} | Total: {formatCurrency(sub.totalSubscriptionAmount, sub.currency)} | Due: {formatCurrency(sub.totalDueAmount, sub.currency)}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })
          )
        ) : null}
      </View>

      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-3">
        {renderSectionHeader('payfunnelLinks', 'Payment Links', String(payfunnelData.links.length))}
        {expandedSections.payfunnelLinks ? (
          payfunnelData.links.length === 0 ? (
            <Text className="text-xs text-slate-500 mt-2">Nu exista link-uri returnate.</Text>
          ) : (
            payfunnelData.links.map((link) => (
              <View key={`${link.id}:${link.url}`} className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2.5">
                <Text className="text-xs font-semibold text-slate-900" numberOfLines={1}>{link.name || link.id}</Text>
                <Text className="text-[11px] text-slate-500 mt-1">Status: {link.status || '-'}</Text>
                <Text className="text-[11px] text-slate-500">Source: {link.source}</Text>
                <Text className="text-[11px] text-slate-500">Created: {formatDate(link.createdAt)}</Text>
                <TouchableOpacity
                  onPress={() => openExternalUrl(link.url)}
                  className="self-start mt-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 flex-row items-center gap-1"
                >
                  <ExternalLink size={12} color="#4338ca" />
                  <Text className="text-[11px] font-semibold text-indigo-700" numberOfLines={1}>Open link</Text>
                </TouchableOpacity>
              </View>
            ))
          )
        ) : null}
      </View>

      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-3">
        {renderSectionHeader('crmPayments', 'CRM Payments', String(filteredCrmPayments.length))}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pb-4 bg-emerald-800" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-emerald-200">Revenue</Text>
            <Text className="text-2xl font-extrabold text-white">Payments</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{summary.total} total</Text>
          </View>
        </View>
      </View>

      {fetchError && !isLoading ? (
        <View className="mx-3 mt-3 flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff size={20} color="#f87171" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-rose-700">Connection error</Text>
            <Text className="text-xs text-rose-500 mt-0.5" numberOfLines={1}>{fetchError}</Text>
          </View>
          <TouchableOpacity onPress={() => fetchData()} className="p-2 rounded-lg bg-rose-100">
            <RefreshCw size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={expandedSections.crmPayments ? filteredCrmPayments : []}
        keyExtractor={(item) => item.documentId}
        renderItem={renderCrmPaymentItem}
        ListHeaderComponent={renderHeader()}
        contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#475569" />}
        ListEmptyComponent={
          !isLoading && expandedSections.crmPayments ? (
            <View className="items-center justify-center py-20">
              <View className="h-14 w-14 rounded-2xl bg-white border border-slate-200 items-center justify-center">
                <CreditCard size={28} color="#94a3b8" />
              </View>
              <Text className="text-sm font-medium text-slate-500 mt-3">
                {payments.length > 0 ? 'No CRM payments for selected filter' : 'No CRM payments yet'}
              </Text>
              <Text className="text-xs text-slate-400 mt-1">Datele de plata sunt vizibile in sectiunile de mai sus.</Text>
            </View>
          ) : null
        }
      />

      {isLoading ? (
        <View className="absolute inset-0 items-center justify-center">
          <View className="bg-black/20 rounded-2xl px-4 py-3">
            <ActivityIndicator size="small" color="#ffffff" />
          </View>
        </View>
      ) : null}
    </View>
  );
}
