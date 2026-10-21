'use client';

/**
 * Where the TeamRa2 Thank You plugin sends the buyer's answer. Shown on
 * request: the secret signs every answer, so it is not on screen by default.
 */

import { useState } from 'react';
import { Check, Copy, Eye, Loader2, MessageSquareQuote } from 'lucide-react';
import api from '@/lib/api';

export default function WooThankYouSetup({ integrationId }: { integrationId: string }) {
  const [setup, setSetup] = useState<{ url: string; secret: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const reveal = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/integrations/woocommerce/${integrationId}/thankyou-setup`);
      setSetup(data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-au putut încărca datele.');
    } finally {
      setLoading(false);
    }
  };

  const copy = (value: string) =>
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(value);
      setTimeout(() => setCopied(''), 1500);
    });

  const row = (label: string, value: string) => (
    <div className="mt-2">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">
          {value}
        </code>
        <button
          type="button"
          onClick={() => copy(value)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        >
          {copied === value ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === value ? 'Copiat' : 'Copiază'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        <MessageSquareQuote className="h-4 w-4" /> Răspunsul de pe pagina de mulțumire
      </h4>
      <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-300/80">
        Ce scrie cumpărătorul la întrebarea de pe pagina de mulțumire (pluginul TeamRa2 Thank You) apare la
        <strong> Notes</strong> pe contactul lui. În WordPress → TeamRa2 Thank You → setări, pune aceste două valori la
        „URL webhook CRM” și „Secret webhook”.
      </p>
      {setup ? (
        <>
          {row('URL webhook CRM', setup.url)}
          {row('Secret webhook', setup.secret)}
        </>
      ) : (
        <button
          type="button"
          onClick={() => void reveal()}
          disabled={loading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-gray-800 dark:text-emerald-300"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Arată URL-ul și secretul
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
