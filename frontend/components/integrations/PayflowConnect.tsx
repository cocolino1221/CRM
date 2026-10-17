'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

interface PayflowStatus {
  connected: boolean;
  keyPrefix: string | null;
  keyCreatedAt: string | null;
  lastSyncAt: string | null;
}

// Address Payflow calls — the CRM backend origin, without the /api/v1 suffix.
const crmApiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/api\/v1\/?$/, '');

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 break-all">{value}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }).catch(() => {});
          }}
          className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 flex-shrink-0"
          title={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-600" />}
        </button>
      </div>
    </div>
  );
}

export default function PayflowConnect({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<PayflowStatus | null>(null);
  const [key, setKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<PayflowStatus>('/integrations/payflow/status')
      .then((res) => setStatus(res.data))
      .catch(() => setStatus(null))
      .finally(() => setIsLoading(false));
  }, []);

  const generateKey = async () => {
    if (status?.connected && !confirm('Create a new key? The old key stops working, so you will need to paste the new one into Payflow.')) return;
    setIsGenerating(true);
    setError('');
    try {
      const res = await api.post<{ key: string }>('/integrations/payflow/connect');
      setKey(res.data.key);
      const refreshed = await api.get<PayflowStatus>('/integrations/payflow/status');
      setStatus(refreshed.data);
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not create the key. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Payflow sends every paying customer to this CRM as a contact, and every payment as a deal
        (won when paid, lost when a payment fails or a subscription is cancelled).
      </p>

      {status?.connected && !key && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">Connected</p>
          <p className="mt-1">
            Key <code>{status.keyPrefix}…</code>
            {status.keyCreatedAt && <> created {new Date(status.keyCreatedAt).toLocaleDateString()}</>}
            {' · '}
            {status.lastSyncAt ? <>last sync {new Date(status.lastSyncAt).toLocaleString()}</> : 'nothing synced yet'}
          </p>
        </div>
      )}

      {key ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-4">
          <p className="text-sm font-semibold text-indigo-900">Your connection key — copy it now, it is shown only once.</p>
          <CopyField label="Connection key" value={key} />
          <ol className="list-decimal list-inside space-y-1 text-sm text-indigo-900">
            <li>Open Payflow → <strong>Integrations</strong> → <strong>ET CRM</strong>.</li>
            <li>Paste the key into <strong>CRM connection key</strong> and click <strong>Save</strong>.</li>
            <li>Click <strong>Test connection</strong>, then pick the pipeline stage new customers should land in.</li>
          </ol>
          <details className="text-xs text-indigo-800">
            <summary className="cursor-pointer font-semibold">Payflow asks for a CRM URL?</summary>
            <div className="mt-2"><CopyField label="CRM URL" value={crmApiOrigin} /></div>
          </details>
        </div>
      ) : (
        <button
          type="button"
          onClick={generateKey}
          disabled={isGenerating}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 text-sm font-semibold text-white shadow hover:shadow-lg disabled:opacity-60"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : status?.connected ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          {status?.connected ? 'Create a new connection key' : 'Create connection key'}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
