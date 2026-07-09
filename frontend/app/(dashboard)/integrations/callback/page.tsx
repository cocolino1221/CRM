'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, X, Loader2, Facebook } from 'lucide-react';
import api from '@/lib/api';

interface PageOption {
  id: string;
  name: string;
  connectedHere: boolean;
  connectedElsewhere: boolean;
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'pick-pages'>('loading');
  const [message, setMessage] = useState('Processing integration...');
  const [pages, setPages] = useState<PageOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const integrationId = searchParams.get('integration');

  useEffect(() => {
    const handleCallback = async () => {
      const success = searchParams.get('success');
      const error = searchParams.get('error');
      const integrationName = searchParams.get('name');
      const pendingPages = searchParams.get('pendingPages');

      if (error) {
        setStatus('error');
        setMessage(`Integration failed: ${decodeURIComponent(error)}`);
        setTimeout(() => router.push('/integrations'), 3000);
        return;
      }

      if (success === '1' && integrationId && pendingPages === '1') {
        // The Meta grant covers several pages — ask which ones belong to this
        // workspace before anything gets attached.
        try {
          const res = await api.get(`/integrations/${integrationId}/social-pages`);
          const options: PageOption[] = res.data?.pages || [];
          setPages(options);
          setSelected(new Set(options.filter((p) => p.connectedHere).map((p) => p.id)));
          setStatus('pick-pages');
          return;
        } catch (err: any) {
          setStatus('error');
          setMessage(err?.response?.data?.message || 'Could not load the page list');
          setTimeout(() => router.push('/integrations'), 3000);
          return;
        }
      }

      if (success === '1' && integrationId) {
        setStatus('success');
        setMessage(`${integrationName || 'Integration'} connected successfully!`);
        setTimeout(() => router.push('/integrations'), 2000);
        return;
      }

      // No valid callback parameters
      setStatus('error');
      setMessage('Invalid callback parameters');
      setTimeout(() => router.push('/integrations'), 3000);
    };

    handleCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  const togglePage = useCallback((page: PageOption) => {
    if (page.connectedElsewhere) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(page.id)) {
        next.delete(page.id);
      } else {
        next.add(page.id);
      }
      return next;
    });
  }, []);

  const confirmSelection = useCallback(async () => {
    if (!integrationId || selected.size === 0) return;
    setSaving(true);
    setPickError(null);
    try {
      await api.post(`/integrations/${integrationId}/social-pages/select`, {
        pageIds: Array.from(selected),
      });
      setStatus('success');
      setMessage(`${selected.size} page${selected.size > 1 ? 's' : ''} connected to this workspace!`);
      setTimeout(() => router.push('/integrations'), 2000);
    } catch (err: any) {
      setPickError(err?.response?.data?.message || 'Could not save the page selection');
    } finally {
      setSaving(false);
    }
  }, [integrationId, selected, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center animate-scale-in">
        {status === 'loading' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connecting Integration</h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'pick-pages' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <Facebook className="h-8 w-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose pages for this workspace</h2>
            <p className="text-gray-600 mb-4 text-sm">
              Your Facebook login covers several pages. Only the pages you pick here will show up in
              this workspace&apos;s inbox.
            </p>
            <div className="space-y-2 text-left mb-4">
              {pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => togglePage(page)}
                  disabled={page.connectedElsewhere}
                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 transition ${
                    page.connectedElsewhere
                      ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : selected.has(page.id)
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-gray-200 hover:border-blue-300 text-gray-800'
                  }`}
                >
                  <span className="font-medium truncate">{page.name}</span>
                  {page.connectedElsewhere ? (
                    <span className="text-xs whitespace-nowrap ml-2">in another workspace</span>
                  ) : selected.has(page.id) ? (
                    <Check className="h-5 w-5 shrink-0 text-blue-600" />
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full border border-gray-300" />
                  )}
                </button>
              ))}
            </div>
            {pickError && <p className="text-sm text-red-600 mb-3">{pickError}</p>}
            <button
              type="button"
              onClick={confirmSelection}
              disabled={saving || selected.size === 0}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Connecting…' : `Connect ${selected.size || ''} page${selected.size === 1 ? '' : 's'}`}
            </button>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Check className="h-8 w-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Success!</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting back to integrations...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                <X className="h-8 w-8 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connection Failed</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting back to integrations...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function IntegrationCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="glass-effect rounded-2xl p-8 max-w-md w-full text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading...</h2>
            <p className="text-gray-600">Please wait</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
