'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, RefreshCw, Save, CheckCircle2, AlertTriangle, Plus, Trash2, Pencil } from 'lucide-react';
import api from '@/lib/api';

// 2-way Google Sheets ↔ CRM contact sync configuration.
// Rendered on the Integrations page once Google is connected.
// A workspace can connect multiple sheets (e.g. one per lead source),
// each with its own mapping, pipeline and sync direction.

const CRM_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'email', label: 'Email (matching key)' },
  { key: 'phone', label: 'Phone (matching key)' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'company', label: 'Company' },
  { key: 'stage', label: 'Pipeline stage (by name)' },
  { key: 'notes', label: 'Notes' },
  { key: 'preluat', label: 'Preluat (checkmark)' },
];

type SpreadsheetItem = { id: string; name: string };
type Pipeline = { id: string; name: string; stages?: Array<{ id: string; name: string }> };

export default function GoogleSheetsSync({ autoOpen = false }: { autoOpen?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [googleMissing, setGoogleMissing] = useState(false);
  const [configs, setConfigs] = useState<any[]>([]);
  // null = list view; 'new' = adding a sheet; a config id = editing that sheet
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetItem[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [tabs, setTabs] = useState<string[]>([]);
  const [headersByTab, setHeadersByTab] = useState<Record<string, string[]>>({});
  const [headerRowByTab, setHeaderRowByTab] = useState<Record<string, number>>({});
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
      setConfigs(Array.isArray(res.data?.configs) ? res.data.configs : []);
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
    if (autoOpen && !loading && !googleMissing && editingId === null && !autoOpened) {
      setAutoOpened(true);
      void startSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, loading, googleMissing]);

  const resetForm = () => {
    setSpreadsheetId('');
    setTabs([]);
    setSheetName('');
    setMapping({});
    setPipelineId('');
    setPipelineStageId('');
    setDirection('two-way');
  };

  // Pass an existing config to edit it in place; omit to connect a new sheet.
  const startSetup = async (existing?: any) => {
    resetForm();
    setEditingId(existing?.id || 'new');
    setBusy('spreadsheets');
    setMessage(null);
    try {
      const [sheetsRes, pipesRes] = await Promise.all([
        api.get('/integrations/google-sheets/spreadsheets'),
        api.get('/pipelines').catch(() => ({ data: [] })),
      ]);
      const list = Array.isArray(sheetsRes.data) ? sheetsRes.data : sheetsRes.data?.files || [];
      setSpreadsheets(list.map((f: any) => ({ id: f.id, name: f.name })));
      if (!list.length) {
        setMessage({
          kind: 'err',
          text: 'No spreadsheets found in the connected Google account. Create one in Google Sheets, or reconnect with the account that owns your sheet.',
        });
      }
      setPipelines(Array.isArray(pipesRes.data) ? pipesRes.data : pipesRes.data?.data || []);
      if (existing) {
        setSpreadsheetId(existing.spreadsheetId || '');
        setSheetName(existing.sheetName || '');
        setMapping(existing.mapping || {});
        setPipelineId(existing.pipelineId || '');
        setPipelineStageId(existing.pipelineStageId || '');
        setDirection(existing.direction || 'two-way');
        if (existing.spreadsheetId) await loadSpreadsheetInfo(existing.spreadsheetId);
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
      setHeaderRowByTab(res.data?.headerRowByTab || {});
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
    if (!mapping.email && !mapping.phone) { setMessage({ kind: 'err', text: 'Map the Email or Phone column — one of them is the matching key.' }); return; }
    setBusy('save');
    setMessage(null);
    try {
      const res = await api.put('/integrations/google-sheets/config', {
        id: editingId && editingId !== 'new' ? editingId : undefined,
        enabled: true,
        spreadsheetId,
        spreadsheetName: spreadsheets.find((s) => s.id === spreadsheetId)?.name,
        sheetName,
        headerRow: headerRowByTab[sheetName] || 1,
        mapping,
        pipelineId: pipelineId || undefined,
        pipelineStageId: pipelineStageId || undefined,
        direction,
      });
      setConfigs(Array.isArray(res.data?.configs) ? res.data.configs : []);
      setEditingId(null);
      setMessage({ kind: 'ok', text: 'Sync configured. It runs automatically every ~10 minutes.' });
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Could not save the configuration.' });
    } finally {
      setBusy('');
    }
  };

  const removeConfig = async (id: string) => {
    if (!confirm('Disconnect this sheet? It stops syncing but nothing already imported into the CRM is removed.')) return;
    setBusy(`delete-${id}`);
    setMessage(null);
    try {
      const res = await api.delete(`/integrations/google-sheets/config/${id}`);
      setConfigs(Array.isArray(res.data?.configs) ? res.data.configs : []);
    } catch (err: any) {
      setMessage({ kind: 'err', text: err?.response?.data?.message || 'Could not disconnect that sheet.' });
    } finally {
      setBusy('');
    }
  };

  const syncNow = async (id?: string) => {
    setBusy(id ? `sync-${id}` : 'sync-all');
    setMessage(null);
    try {
      const res = await api.post('/integrations/google-sheets/sync-now', null, { params: id ? { configId: id } : undefined });
      if (id) {
        const r = res.data || {};
        setMessage({ kind: 'ok', text: `Synced — ${r.fromSheet ?? 0} from sheet, ${r.toSheet ?? 0} to sheet${r.skipped ? `, ${r.skipped} skipped` : ''}.` });
      } else {
        const results = res.data?.results || [];
        const totalFrom = results.reduce((n: number, r: any) => n + (r.fromSheet || 0), 0);
        const totalTo = results.reduce((n: number, r: any) => n + (r.toSheet || 0), 0);
        setMessage({ kind: 'ok', text: `Synced ${results.length} sheet${results.length === 1 ? '' : 's'} — ${totalFrom} from sheet, ${totalTo} to sheet.` });
      }
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
            {configs.length
              ? `${configs.length} sheet${configs.length === 1 ? '' : 's'} connected. Each syncs its own mapping and pipeline every ~10 minutes.`
              : '2-way sync: sheet rows become contacts in a pipeline; CRM contacts get written back to the sheet. Connect as many sheets as you need — one per lead source, for example.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {configs.length > 1 && (
            <button onClick={() => syncNow()} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {busy === 'sync-all' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync all
            </button>
          )}
          <button onClick={() => startSetup()} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            {busy === 'spreadsheets' && editingId === 'new' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Connect another sheet
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

      {configs.length > 0 && (
        <div className="mt-4 space-y-2">
          {configs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">
                  {c.spreadsheetName || c.spreadsheetId} <span className="text-slate-400">· tab „{c.sheetName}” · {c.direction}</span>
                </div>
                {c.lastSyncAt ? (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Last sync: {new Date(c.lastSyncAt).toLocaleString('ro-RO')}
                    {c.lastResult?.error ? ` — error: ${c.lastResult.error}` : c.lastResult ? ` — ↓${c.lastResult.fromSheet} ↑${c.lastResult.toSheet}` : ''}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">Not synced yet</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => syncNow(c.id)} disabled={!!busy} title="Sync now"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-60">
                  {busy === `sync-${c.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
                <button onClick={() => startSetup(c)} disabled={!!busy} title="Edit"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:opacity-60">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => removeConfig(c.id)} disabled={!!busy} title="Disconnect"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 transition hover:bg-rose-50 disabled:opacity-60">
                  {busy === `delete-${c.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId && (
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
              <p className="mt-1.5 text-xs text-slate-400">
                Map „Preluat (checkmark)” to a column and that column updates in the sheet the instant a setter/closer taps the preluat checkmark on a lead — no need to wait for the ~10-minute sync.
              </p>
              <p className="mt-1 text-xs text-slate-400">A „CRM ID” column is managed automatically for exact matching — don't delete it.</p>
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
            <button onClick={() => setEditingId(null)} disabled={!!busy}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
