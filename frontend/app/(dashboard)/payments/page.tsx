'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

type PaymentStatus = 'paid' | 'failed' | 'pending';

interface PaymentItem {
  documentId: string;
  documentName: string;
  documentStatus: string;
  createdAt: string;
  signedAt?: string;
  contact?: {
    id: string;
    name: string;
    email?: string;
    status?: string;
  };
  deal?: {
    id: string;
    title: string;
    stage?: string;
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
    paymentReference?: string;
  };
}

interface PaymentsResponse {
  payments: PaymentItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  rawStatus?: string;
  failureReason?: string;
  amount?: number;
  currency?: string;
  customerName?: string;
  customerEmail?: string;
  subscriptionId?: string;
  paymentLinkName?: string;
  paymentUrl?: string;
  createdAt?: string;
  paidAt?: string;
}

interface PayfunnelSubscriptionItem {
  id: string;
  status?: string;
  customerName?: string;
  customerEmail?: string;
  planName?: string;
  interval?: string;
  amount?: number;
  currency?: string;
  startedAt?: string;
  nextBillingAt?: string;
  canceledAt?: string;
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
  links: PayfunnelLinkItem[];
}

const statusOptions: Array<{ value: 'all' | PaymentStatus; label: string }> = [
  { value: 'all', label: 'Toate' },
  { value: 'paid', label: 'Platite' },
  { value: 'pending', label: 'In asteptare' },
  { value: 'failed', label: 'Esuate' },
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

function getStatusClasses(status: PaymentStatus): string {
  if (status === 'paid') {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (status === 'failed') {
    return 'bg-rose-100 text-rose-700';
  }
  return 'bg-amber-100 text-amber-700';
}

export default function PaymentsPage() {
  const [rows, setRows] = useState<PaymentItem[]>([]);
  const [summary, setSummary] = useState<PaymentsResponse['summary']>({
    total: 0,
    paid: 0,
    failed: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | PaymentStatus>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [payfunnelData, setPayfunnelData] = useState<PayfunnelDashboardResponse>({
    connected: false,
    apiEnabled: false,
    payments: [],
    subscriptions: [],
    links: [],
  });
  const [loadingPayfunnel, setLoadingPayfunnel] = useState(true);
  const [payfunnelError, setPayfunnelError] = useState('');

  const queryStatus = status === 'all' ? undefined : status;

  const fetchPayments = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setError('');
    try {
      const response = await api.get<PaymentsResponse>('/documents/payments', {
        params: {
          page,
          limit: 25,
          search: search || undefined,
          status: queryStatus,
        },
      });

      const data = response.data;
      setRows(Array.isArray(data.payments) ? data.payments : []);
      setSummary(
        data.summary || {
          total: 0,
          paid: 0,
          failed: 0,
          pending: 0,
        },
      );
      setTotal(Number(data.total || 0));
      setTotalPages(Math.max(Number(data.totalPages || 1), 1));
    } catch (err: any) {
      setRows([]);
      setSummary({ total: 0, paid: 0, failed: 0, pending: 0 });
      setTotal(0);
      setTotalPages(1);
      setError(err?.response?.data?.message || 'Nu am putut incarca platile din PayFunnels.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const fetchPayfunnelDashboard = async (silent = false) => {
    if (!silent) {
      setLoadingPayfunnel(true);
    }
    setPayfunnelError('');

    try {
      const response = await api.get<PayfunnelDashboardResponse>('/documents/payfunnel/dashboard');
      const data = response.data || ({} as PayfunnelDashboardResponse);
      setPayfunnelData({
        connected: data.connected === true,
        apiEnabled: data.apiEnabled === true,
        message: data.message,
        errors: Array.isArray(data.errors) ? data.errors : [],
        payments: Array.isArray(data.payments) ? data.payments : [],
        subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
        links: Array.isArray(data.links) ? data.links : [],
      });
    } catch (err: any) {
      setPayfunnelData({
        connected: false,
        apiEnabled: false,
        payments: [],
        subscriptions: [],
        links: [],
      });
      setPayfunnelError(err?.response?.data?.message || 'Nu am putut citi datele din PayFunnels.');
    } finally {
      if (!silent) {
        setLoadingPayfunnel(false);
      }
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [page, queryStatus, search]);

  useEffect(() => {
    fetchPayfunnelDashboard();
  }, []);

  const statusLabel = useMemo<Record<PaymentStatus, string>>(
    () => ({
      paid: 'Platit',
      failed: 'Esuat',
      pending: 'In asteptare',
    }),
    [],
  );

  const onSearchSubmit = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-600 mt-1">Plati sincronizate din fluxul documentelor + PayFunnels webhook.</p>
        </div>
        <button
          onClick={() => {
            fetchPayments();
            fetchPayfunnelDashboard();
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-indigo-900">PayFunnels Dashboard Import</h2>
            <p className="text-xs text-indigo-700 mt-1">
              Plati, subscriptions si payment links aduse direct din integrarea PayFunnels conectata.
            </p>
          </div>
          <button
            onClick={() => fetchPayfunnelDashboard()}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition-colors"
          >
            Sync PayFunnels
          </button>
        </div>

        {payfunnelError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {payfunnelError}
          </div>
        )}

        {payfunnelData.message && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            {payfunnelData.message}
          </div>
        )}

        {Array.isArray(payfunnelData.errors) && payfunnelData.errors.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
            {payfunnelData.errors.map((item, index) => (
              <div key={`${item}-${index}`}>- {item}</div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-indigo-100 bg-white p-3">
            <div className="text-xs text-gray-500">PayFunnels payments</div>
            <div className="text-xl font-bold text-gray-900">{loadingPayfunnel ? '...' : payfunnelData.payments.length}</div>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-white p-3">
            <div className="text-xs text-gray-500">Subscriptions</div>
            <div className="text-xl font-bold text-gray-900">{loadingPayfunnel ? '...' : payfunnelData.subscriptions.length}</div>
          </div>
          <div className="rounded-lg border border-indigo-100 bg-white p-3">
            <div className="text-xs text-gray-500">Payment links</div>
            <div className="text-xl font-bold text-gray-900">{loadingPayfunnel ? '...' : payfunnelData.links.length}</div>
          </div>
        </div>

        {!loadingPayfunnel && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
                Tranzactii ({payfunnelData.payments.length})
              </div>
              <div className="max-h-80 overflow-auto">
                {payfunnelData.payments.length === 0 ? (
                  <div className="p-3 text-xs text-gray-500">Nu exista tranzactii returnate de PayFunnels.</div>
                ) : (
                  payfunnelData.payments.map((item) => (
                    <div key={item.id} className="p-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-gray-900 truncate">{item.customerName || item.customerEmail || item.id}</div>
                        <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold ${getStatusClasses(item.status)}`}>
                          {statusLabel[item.status]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{formatCurrency(item.amount, item.currency)}</div>
                      <div className="text-[11px] text-gray-500 mt-1">ID: {item.id}</div>
                      {item.rawStatus && <div className="text-[11px] text-gray-500">Raw status: {item.rawStatus}</div>}
                      {item.failureReason && <div className="text-[11px] text-rose-600">Fail reason: {item.failureReason}</div>}
                      <div className="text-[11px] text-gray-500">Created: {formatDate(item.createdAt)}</div>
                      {item.paidAt && <div className="text-[11px] text-emerald-700">Paid: {formatDate(item.paidAt)}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
                Subscriptions ({payfunnelData.subscriptions.length})
              </div>
              <div className="max-h-80 overflow-auto">
                {payfunnelData.subscriptions.length === 0 ? (
                  <div className="p-3 text-xs text-gray-500">Nu exista subscriptions returnate de PayFunnels.</div>
                ) : (
                  payfunnelData.subscriptions.map((item) => (
                    <div key={item.id} className="p-3 border-b border-gray-100 last:border-b-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{item.planName || item.id}</div>
                      <div className="text-[11px] text-gray-500 mt-1">{item.customerName || item.customerEmail || '-'}</div>
                      <div className="text-[11px] text-gray-500">{formatCurrency(item.amount, item.currency)}</div>
                      <div className="text-[11px] text-gray-500">Status: {item.status || '-'}</div>
                      <div className="text-[11px] text-gray-500">Next billing: {formatDate(item.nextBillingAt)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
                Payment Links ({payfunnelData.links.length})
              </div>
              <div className="max-h-80 overflow-auto">
                {payfunnelData.links.length === 0 ? (
                  <div className="p-3 text-xs text-gray-500">Nu exista links in PayFunnels.</div>
                ) : (
                  payfunnelData.links.map((item) => (
                    <div key={`${item.id}-${item.url}`} className="p-3 border-b border-gray-100 last:border-b-0">
                      <div className="text-xs font-semibold text-gray-900 truncate">{item.name}</div>
                      <div className="text-[11px] text-gray-500 mt-1">Status: {item.status || '-'}</div>
                      <div className="text-[11px] text-gray-500">Source: {item.source}</div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-blue-600 hover:text-blue-800 break-all"
                      >
                        {item.url}
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">Total payments</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.total}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs text-emerald-700">Paid</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{summary.paid}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs text-amber-700">Pending</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{summary.pending}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs text-rose-700">Failed</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">{summary.failed}</div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearchSubmit();
              }
            }}
            placeholder="Cauta dupa document, lead, email sau reference"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          />
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as 'all' | PaymentStatus);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={onSearchSubmit}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Cauta
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Se incarca platile...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Nu exista plati sincronizate.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Contract</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Suma</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status plata</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actualizat</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={`${row.documentId}-${row.payment.paymentReference || row.createdAt}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm font-semibold text-gray-900">{row.contact?.name || '-'}</div>
                      <div className="text-xs text-gray-500">{row.contact?.email || '-'}</div>
                      {row.contact?.status && (
                        <div className="text-[11px] text-gray-500 mt-1">Lead: {row.contact.status}</div>
                      )}
                      {row.deal?.stage && (
                        <div className="text-[11px] text-gray-500">Deal: {row.deal.stage}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-sm font-semibold text-gray-900">{row.documentName}</div>
                      <div className="text-xs text-gray-500 mt-1">Doc status: {row.documentStatus}</div>
                      {row.payment.paymentReference && (
                        <div className="text-xs text-gray-500 mt-1">Ref: {row.payment.paymentReference}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-gray-900">
                      {formatCurrency(row.payment.amount, row.payment.currency)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`px-2 py-1 text-xs rounded-full font-semibold ${getStatusClasses(row.payment.status)}`}>
                        {statusLabel[row.payment.status]}
                      </span>
                      {row.payment.failureReason && (
                        <div className="text-xs text-rose-600 mt-1">{row.payment.failureReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-600">
                      <div>Creat: {formatDate(row.createdAt)}</div>
                      <div>Semnat: {formatDate(row.signedAt)}</div>
                      <div>Platit: {formatDate(row.payment.paidAt)}</div>
                      <div>Esuat: {formatDate(row.payment.failedAt)}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <a
                          href={`/documents`}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Vezi documente
                        </a>
                        {row.payment.paymentLink && (
                          <a
                            href={row.payment.paymentLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-600 hover:text-emerald-800"
                          >
                            Deschide link plata
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          Pagina {page} / {totalPages} • {total} rezultate
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-50"
          >
            Inapoi
          </button>
          <button
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-300 disabled:opacity-50"
          >
            Inainte
          </button>
        </div>
      </div>
    </div>
  );
}
