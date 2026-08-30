'use client';

import { useCallback, useEffect, useState } from 'react';
import { Target, LoaderCircle, Save, CheckCircle2, AlertTriangle, Trash2, Send } from 'lucide-react';
import api from '@/lib/api';

// Reports pipeline stage changes to Meta's Conversions API for CRM, so
// Meta's ad algorithm can optimize toward audiences that actually convert
// to real customers. Per-workspace — each customer connects their own
// dataset, same as Google Sheets sync.

interface MetaCapiConfig {
  datasetId: string;
  enabled: boolean;
  hasAccessToken: boolean;
  lastEventAt?: string;
  lastError?: string;
}

export default function MetaConversionsSettings({ autoOpen = false }: { autoOpen?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<MetaCapiConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [datasetId, setDatasetId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/integrations/meta-capi/config');
      setConfig(res.data?.config || null);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  useEffect(() => {
    if (autoOpen && !loading && !config && !editing) {
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, loading, config]);

  const startEdit = () => {
    setDatasetId(config?.datasetId || '');
    setAccessToken('');
    setEditing(true);
    setMessage(null);
  };

  const save = async () => {
    if (!datasetId.trim()) { setMessage({ kind: 'err', text: 'Dataset ID is required.' }); return; }
    if (!config?.hasAccessToken && !accessToken.trim()) {
      setMessage({ kind: 'err', text: 'Access token is required to connect.' });
      return;
    }
    setBusy('save');
    setMessage(null);
    try {
      const res = await api.put('/integrations/meta-capi/config', {
        datasetId: datasetId.trim(),
        accessToken: accessToken.trim() || undefined,
        enabled: true,
      });
      setConfig(res.data?.config || null);
      setEditing(false);
      setAccessToken('');
      setMessage({ kind: 'ok', text: 'Connected. Stage changes will now report to Meta.' });
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Could not save the configuration.' });
    } finally {
      setBusy('');
    }
  };

  const toggleEnabled = async () => {
    if (!config) return;
    setBusy('toggle');
    setMessage(null);
    try {
      const res = await api.put('/integrations/meta-capi/config', {
        datasetId: config.datasetId,
        enabled: !config.enabled,
      });
      setConfig(res.data?.config || null);
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Could not update.' });
    } finally {
      setBusy('');
    }
  };

  const sendTestEvent = async () => {
    setBusy('test');
    setMessage(null);
    try {
      await api.post('/integrations/meta-capi/test-event', {});
      setMessage({ kind: 'ok', text: 'Test event sent — check Events Manager → Test Events tab.' });
      await loadConfig();
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Test event failed to send.' });
    } finally {
      setBusy('');
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Meta Conversions API? Stage changes will stop reporting to Meta.')) return;
    setBusy('disconnect');
    try {
      await api.delete('/integrations/meta-capi/config');
      setConfig(null);
      setEditing(false);
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Could not disconnect.' });
    } finally {
      setBusy('');
    }
  };

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Target className="h-4 w-4 text-blue-600" /> Meta Conversions API
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {config
              ? <>Reporting pipeline stage changes to dataset <span className="font-medium text-slate-700">{config.datasetId}</span></>
              : 'Report pipeline stage changes to Meta so ad delivery optimizes toward leads that actually convert.'}
          </p>
          {config?.lastEventAt && (
            <p className="mt-0.5 text-xs text-slate-400">
              Last event: {new Date(config.lastEventAt).toLocaleString('ro-RO')}
              {config.lastError ? ` — error: ${config.lastError}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <>
              <button onClick={toggleEnabled} disabled={!!busy}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition disabled:opacity-60 ${config.enabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {busy === 'toggle' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {config.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button onClick={sendTestEvent} disabled={!!busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
                {busy === 'test' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send test event
              </button>
            </>
          )}
          <button onClick={config ? startEdit : () => setEditing(true)} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            {config ? 'Edit' : 'Connect'}
          </button>
          {config && (
            <button onClick={disconnect} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[13px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-60">
              {busy === 'disconnect' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {editing && (
        <div className="mt-4 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <div>
            <label className="text-xs font-semibold text-slate-500">Dataset ID</label>
            <input
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              placeholder="e.g. 975950368711042"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
            <p className="mt-1 text-xs text-slate-400">Events Manager → your dataset → Settings.</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Access token {config?.hasAccessToken && '(leave blank to keep the current one)'}
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={config?.hasAccessToken ? '••••••••••••' : 'Generated in Events Manager → Settings → Conversions API'}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60">
              {busy === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
            <button onClick={() => setEditing(false)} disabled={!!busy}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
