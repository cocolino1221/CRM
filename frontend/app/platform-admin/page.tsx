'use client';

import { FormEvent, useCallback, useMemo, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type FeatureFlags = {
  aiEnabled: boolean;
  slackIntegration: boolean;
  emailIntegration: boolean;
  whatsappEnabled: boolean;
  contactsEnabled: boolean;
  leadsEnabled: boolean;
  calendarEnabled: boolean;
  pipelineEnabled: boolean;
  tasksEnabled: boolean;
  automationEnabled: boolean;
  marketingEnabled: boolean;
  mobileAppEnabled: boolean;
};

type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt?: string;
  createdAt?: string;
};

type CompanyOverview = {
  id: string;
  name: string;
  domain: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  users: WorkspaceUser[];
  contactCount: number;
  features: FeatureFlags;
};

type OverviewResponse = {
  totals: { workspaces: number; users: number; contacts: number };
  companies: CompanyOverview[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

const PLANS = ['trial', 'starter', 'professional', 'enterprise'] as const;

const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
  aiEnabled: 'AI Features',
  slackIntegration: 'Slack Integration',
  emailIntegration: 'Email Integration',
  whatsappEnabled: 'WhatsApp',
  contactsEnabled: 'Contacts',
  leadsEnabled: 'Leads',
  calendarEnabled: 'Calendar',
  pipelineEnabled: 'Pipeline',
  tasksEnabled: 'Tasks',
  automationEnabled: 'Automation',
  marketingEnabled: 'Marketing / Email Campaigns',
  mobileAppEnabled: 'Mobile App',
};

const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as Array<keyof FeatureFlags>;

// ── Helper ────────────────────────────────────────────────────────────────────

function planBadgeClass(plan: string) {
  switch (plan) {
    case 'enterprise': return 'bg-violet-100 text-violet-700';
    case 'professional': return 'bg-sky-100 text-sky-700';
    case 'starter': return 'bg-emerald-100 text-emerald-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlatformAdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // ── Local edit state for selected workspace ────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editFeatures, setEditFeatures] = useState<FeatureFlags | null>(null);
  const [confirmDeleteWs, setConfirmDeleteWs] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // ── Create workspace form ──────────────────────────────────────────────────
  const [createForm, setCreateForm] = useState({
    name: '', adminFirstName: '', adminLastName: '',
    adminEmail: '', adminPassword: '', plan: 'trial', domain: '',
  });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'x-platform-admin-key': adminKey.trim(),
  }), [adminKey]);

  const activeCount = useMemo(
    () => overview?.companies.filter((c) => c.isActive).length || 0,
    [overview],
  );

  const selectedWorkspace = useMemo(
    () => overview?.companies.find((c) => c.id === selectedId) || null,
    [overview, selectedId],
  );

  // ── API helpers ────────────────────────────────────────────────────────────

  const loadOverview = useCallback(async (key: string) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/platform-admin/overview`, {
        headers: { 'x-platform-admin-key': key.trim() },
      });
      if (!res.ok) throw new Error('Access denied or server error');
      const data = (await res.json()) as OverviewResponse;
      setOverview(data);
    } catch (err: any) {
      setOverview(null);
      setError(err?.message || 'Failed to load platform overview');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleLoad = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) return;
    await loadOverview(adminKey);
  };

  const openWorkspace = (company: CompanyOverview) => {
    setSelectedId(company.id);
    setEditName(company.name);
    setEditPlan(company.plan);
    setEditActive(company.isActive);
    setEditFeatures({ ...company.features });
    setConfirmDeleteWs(false);
    setConfirmDeleteUserId(null);
    setSaveError('');
  };

  const closePanel = () => {
    setSelectedId(null);
    setConfirmDeleteWs(false);
    setConfirmDeleteUserId(null);
    setSaveError('');
  };

  const handleSaveWorkspace = async () => {
    if (!selectedId) return;
    setSaving(true);
    setSaveError('');
    try {
      // Update name/plan/active
      await fetch(`${API_BASE_URL}/platform-admin/workspaces/${selectedId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name: editName, plan: editPlan, isActive: editActive }),
      });
      // Update feature flags
      if (editFeatures) {
        await fetch(`${API_BASE_URL}/platform-admin/workspaces/${selectedId}/features`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(editFeatures),
        });
      }
      await loadOverview(adminKey);
      closePanel();
    } catch (err: any) {
      setSaveError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!selectedId) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_BASE_URL}/platform-admin/workspaces/${selectedId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message || 'Delete failed');
      }
      await loadOverview(adminKey);
      closePanel();
    } catch (err: any) {
      setSaveError(err?.message || 'Delete failed');
    } finally {
      setSaving(false);
      setConfirmDeleteWs(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_BASE_URL}/platform-admin/users/${userId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message || 'Delete failed');
      }
      await loadOverview(adminKey);
      // Refresh selectedWorkspace after reload
      setConfirmDeleteUserId(null);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to delete user');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWorkspace = async (e: FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError('');
    try {
      const res = await fetch(`${API_BASE_URL}/platform-admin/workspaces`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: createForm.name,
          adminFirstName: createForm.adminFirstName,
          adminLastName: createForm.adminLastName,
          adminEmail: createForm.adminEmail,
          adminPassword: createForm.adminPassword,
          plan: createForm.plan,
          domain: createForm.domain || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message || 'Create failed');
      }
      setShowCreate(false);
      setCreateForm({ name: '', adminFirstName: '', adminLastName: '', adminEmail: '', adminPassword: '', plan: 'trial', domain: '' });
      await loadOverview(adminKey);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create workspace');
    } finally {
      setCreateLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header + auth */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h1 className="text-2xl font-bold text-slate-900">Platform Admin</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage all workspaces, users, and feature access.</p>

          <form onSubmit={handleLoad} className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="password"
              placeholder="Platform admin key"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={isLoading || !adminKey.trim()}
              className="rounded-xl bg-sky-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {isLoading ? 'Loading…' : overview ? 'Refresh' : 'Load'}
            </button>
          </form>

          {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
        </div>

        {overview && (
          <>
            {/* Totals */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Workspaces', value: overview.totals.workspaces, sub: `${activeCount} active` },
                { label: 'Users', value: overview.totals.users, sub: '' },
                { label: 'Contacts', value: overview.totals.contacts, sub: '' },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
                  {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Add workspace button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700"
              >
                + New workspace
              </button>
            </div>

            {/* Workspace list */}
            <div className="space-y-2">
              {overview.companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => openWorkspace(company)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-400 hover:shadow-sm transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${planBadgeClass(company.plan)}`}>
                        {company.plan}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${company.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <h2 className="text-sm font-semibold text-slate-900">{company.name}</h2>
                      <span className="text-xs text-slate-400">{company.domain}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {company.userCount} users · {company.contactCount} contacts
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {FEATURE_KEYS.filter((k) => company.features[k]).map((k) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600">
                        {FEATURE_LABELS[k]}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Edit workspace panel (slide-over) ───────────────────────────── */}
      {selectedWorkspace && (
        <div className="fixed inset-0 z-50 flex">
          {/* backdrop */}
          <div className="flex-1 bg-black/40" onClick={closePanel} />

          <div className="w-full max-w-xl bg-white flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Edit workspace</h2>
              <button type="button" onClick={closePanel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* Basic info */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Info</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500">Name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Plan</label>
                    <select
                      value={editPlan}
                      onChange={(e) => setEditPlan(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-slate-700">Active</label>
                    <Toggle checked={editActive} onChange={setEditActive} />
                  </div>
                </div>
              </section>

              {/* Feature flags */}
              {editFeatures && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Features & Tabs</h3>
                  <div className="space-y-2.5">
                    {FEATURE_KEYS.map((k) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="text-sm text-slate-700">{FEATURE_LABELS[k]}</span>
                        <Toggle
                          checked={editFeatures[k]}
                          onChange={(v) => setEditFeatures((prev) => prev ? { ...prev, [k]: v } : prev)}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Users */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                  Users ({selectedWorkspace.users.length})
                </h3>
                <div className="space-y-2">
                  {selectedWorkspace.users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{user.name}</p>
                        <p className="text-xs text-slate-400">{user.email} · {user.role}</p>
                      </div>
                      {confirmDeleteUserId === user.id ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-xs text-rose-600 font-semibold hover:underline disabled:opacity-40"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteUserId(null)}
                            className="text-xs text-slate-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteUserId(user.id)}
                          className="text-xs text-rose-400 hover:text-rose-600"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                  {selectedWorkspace.users.length === 0 && (
                    <p className="text-xs text-slate-400">No users</p>
                  )}
                </div>
              </section>

              {/* Danger zone */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-rose-400 mb-3">Danger zone</h3>
                {confirmDeleteWs ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 space-y-3">
                    <p className="text-sm text-rose-700 font-medium">
                      Delete <strong>{selectedWorkspace.name}</strong> and all its data? This cannot be undone.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleDeleteWorkspace}
                        className="rounded-lg bg-rose-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
                      >
                        {saving ? 'Deleting…' : 'Yes, delete everything'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWs(false)}
                        className="text-sm text-slate-600 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteWs(true)}
                    className="rounded-lg border border-rose-300 text-rose-600 px-4 py-2 text-sm font-semibold hover:bg-rose-50"
                  >
                    Delete workspace
                  </button>
                )}
              </section>

              {saveError && <p className="text-sm text-rose-600">{saveError}</p>}
            </div>

            {/* Footer save */}
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
              <button type="button" onClick={closePanel} className="text-sm text-slate-500 hover:underline">
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveWorkspace}
                className="rounded-xl bg-sky-700 text-white px-5 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create workspace modal ──────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">New workspace</h2>

            <form onSubmit={handleCreateWorkspace} className="space-y-3">
              {[
                { label: 'Company name', key: 'name', type: 'text', required: true },
                { label: 'Admin first name', key: 'adminFirstName', type: 'text', required: true },
                { label: 'Admin last name', key: 'adminLastName', type: 'text', required: true },
                { label: 'Admin email', key: 'adminEmail', type: 'email', required: true },
                { label: 'Admin password', key: 'adminPassword', type: 'password', required: true },
                { label: 'Domain (optional)', key: 'domain', type: 'text', required: false },
              ].map(({ label, key, type, required }) => (
                <div key={key}>
                  <label className="text-xs text-slate-500">{label}</label>
                  <input
                    type={type}
                    required={required}
                    value={(createForm as any)[key]}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              ))}

              <div>
                <label className="text-xs text-slate-500">Plan</label>
                <select
                  value={createForm.plan}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, plan: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {PLANS.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>

              {createError && <p className="text-xs text-rose-600">{createError}</p>}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="text-sm text-slate-500 hover:underline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-xl bg-emerald-600 text-white px-5 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  {createLoading ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
