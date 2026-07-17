'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, RefreshCw, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';

// 2-way Google Sheets ↔ CRM contact sync configuration.
// Rendered on the Integrations page once Google is connected.

const CRM_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'email', label: 'Email', required: true },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'stage', label: 'Pipeline stage (by name)' },
  { key: 'notes', label: 'Notes' },
];

type SpreadsheetItem = { id: string; name: string };
type Pipeline = { id: string; name: string; stages?: Array<{ id: string; name: string }> };

export default function GoogleSheetsSync({ autoOpen = false }: { autoOpen?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [googleMissing, setGoogleMissing] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [tabs, setTabs] = useState<string[]>([]);
  const [headersByTab, setHeadersByTab] = useState<Record<string, string[]>>({});
  const [sheetName, setSheetName] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [pipelineStageId, setPipelineStageId] = useState('');
  const [direction, setDirection] = useState('two-way');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/integrations/google-sheets/config');
      setConfig(res.data?.config || null);
      setGoogleMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) setGoogleMissing(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  // When opened from the integrations card, jump straight into the setup form.
  useEffect(() => {
    if (autoOpen && !loading && !googleMissing && !editing && !autoOpened) {
      setAutoOpened(true);
      void startSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, loading, googleMissing]);

  const startSetup = async () => {
    setEditing(true);
    setBusy('spreadsheets');
    setMessage(null);
    try {
      const [sheetsRes, pipesRes] = await Promise.all([
        api.get('/integrations/google-sheets/spreadsheets'),
        api.get('/pipelines').catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(sheetsRes.data) ? sheetsRes.data : sheetsRes.data?.files || [];
      setSpreadsheets(list.map((f: any) => ({ id: f.id, name: f.name })));
      setPipelines(Array.isArray(pipesRes.data) ? pipesRes.data : pipesRes.data?.data || []);
      // prefill from existing config
      if (config) {
        setSpreadsheetId(config.spreadsheetId || '');
        setSheetName(config.sheetName || '');
        setMapping(config.mapping || {});
        setPipelineId(config.pipelineId || '');
        setPipelineStageId(config.pipelineStageId || '');
        setDirection(config.direction || 'two-way');
        if (config.spreadsheetId) await loadSpreadsheetInfo(config.spreadsheetId);
      }
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Could not load spreadsheets.' });
    } finally {
      setBusy('');
    }
  };

  const loadSpreadsheetInfo = async (id: string) => {
    setBusy('info');
    try {
      const res = await api.get(`/integrations/google-sheets/spreadsheets/${id}`);
      setTabs(res.data?.tabs || []);
      setHeadersByTab(res.data?.headersByTab || {});
      if ((res.data?.tabs || []).length === 1) setSheetName(res.data.tabs[0]);
    } catch (err: any) {
      setMessage({ kind: 'err', text: 'Could not read that spreadsheet.' });
    } finally {
      setBusy('');
    }
  };

  const headers = headersByTab[sheetName] || [];
  const selectedPipeline = pipelines.find((p) => p.id === pipelineId);

  const save = async () => {
    if (!spreadsheetId || !sheetName) { setMessage({ kind: 'err', text: 'Pick a spreadsheet and a tab first.' }); return; }
    if (!mapping.email) { setMessage({ kind: 'err', text: 'Map the Email column — it is the matching key.' }); return; }
    setBusy('save');
    setMessage(null);
    try {
      const res = await api.put('/integrations/google-sheets/config', {
        enabled: true,
        spreadsheetId,
        spreadsheetName: spreadsheets.find((s) => s.id === spreadsheetId)?.name,
        sheetName,
        mapping,
        pipelineId: pipelineId || undefined,
        pipelineStageId: pipelineStageId || undefined,
        direction,
      });
      setConfig(res.data?.config || null);
      setEditing(false);
      setMessage({ kind: 'ok', text: 'Sync configured. It runs automatically every ~10 minutes.' });
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Could not save the configuration.' });
    } finally {
      setBusy('');
    }
  };

  const syncNow = async () => {
    setBusy('sync');
    setMessage(null);
    try {
      const res = await api.post('/integrations/google-sheets/sync');
      const r = res.data || {};
      setMessage({ kind: 'ok', text: `Synced — ${r.fromSheet ?? 0} from sheet, ${r.toSheet ?? 0} to sheet${r.skipped ? `, ${r.skipped} skipped` : ''}.` });
      await loadConfig();
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Sync failed.' });
    } finally {
      setBusy('');
    }
  };

  // Launch the same Google OAuth flow the Google card uses; the callback
  // returns to /integrations, and reopening the card lands in the setup.
  const connectGoogle = async () => {
    setBusy('google');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
      const accessToken = localStorage.getItem('accessToken');
      const me = await fetch(`${apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => r.json());
      if (!me?.id || !me?.workspaceId) throw new Error('no session');
      window.location.href = `${apiUrl}/integrations/oauth/google?workspace_id=${me.workspaceId}&user_id=${me.id}`;
    } catch {
      setMessage({ kind: 'err', text: 'Could not start Google connect — please log in again.' });
      setBusy('');
    }
  };

  if (loading) return null;
  if (googleMissing) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 font-semibold text-slate-900"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Google Sheets sync</div>
        <p className="mt-1.5 text-sm text-slate-500">
          Step 1: connect your Google account. Step 2: pick the spreadsheet and map your columns.
        </p>
        <button
          onClick={connectGoogle}
          disabled={!!busy}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {busy === 'google' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Connect Google account
        </button>
        {message && <p className="mt-2 text-sm text-rose-600">{message.text}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Google Sheets sync
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {config
              ? <>Linked to <span className="font-medium text-slate-700">{config.spreadsheetName || config.spreadsheetId}</span> · tab „{config.sheetName}” · {config.direction}</>
              : '2-way sync: sheet rows become contacts in a pipeline; CRM contacts get written back to the sheet.'}
          </p>
          {config?.lastSyncAt && (
            <p className="mt-0.5 text-xs text-slate-400">
              Last sync: {new Date(config.lastSyncAt).toLocaleString('ro-RO')}
              {config.lastResult?.error ? ` — error: ${config.lastResult.error}` : config.lastResult ? ` — ↓${config.lastResult.fromSheet} ↑${config.lastResult.toSheet}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <button onClick={syncNow} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {busy === 'sync' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </button>
          )}
          <button onClick={startSetup} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            {busy === 'spreadsheets' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {config ? 'Edit setup' : 'Set up sync'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {message.text}
          {message.kind === 'err' && (
            <button onClick={connectGoogle} className="font-semibold underline underline-offset-2">
              Reconnect Google
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="mt-4 space-y-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-500">Spreadsheet</label>
              <select value={spreadsheetId}
                onChange={(e) => { setSpreadsheetId(e.target.value); setSheetName(''); if (e.target.value) void loadSpreadsheetInfo(e.target.value); }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400">
                <option value="">Choose a spreadsheet…</option>
                {spreadsheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Tab {busy === 'info' && '(loading…)'}</label>
              <select value={sheetName} onChange={(e) => setSheetName(e.target.value)} disabled={!tabs.length}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 disabled:opacity-50">
                <option value="">Choose a tab…</option>
                {tabs.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {sheetName && (
            <div>
              <label className="text-xs font-semibold text-slate-500">Column mapping (CRM field → sheet column)</label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {CRM_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className={`w-40 shrink-0 text-sm ${f.required ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                      {f.label}{f.required && ' *'}
                    </span>
                    <select value={mapping[f.key] || ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400">
                      <option value="">— not mapped —</option>
                      {headers.map((h) => h && <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">A „CRM ID” column is managed automatically for exact matching — don't delete it.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Pipeline (target)</label>
              <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setPipelineStageId(''); }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400">
                <option value="">— none —</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Default stage (new rows)</label>
              <select value={pipelineStageId} onChange={(e) => setPipelineStageId(e.target.value)} disabled={!selectedPipeline?.stages?.length}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 disabled:opacity-50">
                <option value="">— first stage —</option>
                {(selectedPipeline?.stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Direction</label>
              <select value={direction} onChange={(e) => setDirection(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400">
                <option value="two-way">Two-way</option>
                <option value="sheet-to-crm">Sheet → CRM only</option>
                <option value="crm-to-sheet">CRM → Sheet only</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60">
              {busy === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save configuration
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
