'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { Building2, Users, UserCheck, ChevronDown, ChevronRight, Shield, Search } from 'lucide-react';
import api from '@/lib/api';

interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface WorkspaceFeatures {
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
}

interface WorkspaceCompany {
  id: string;
  name: string;
  domain: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  users: WorkspaceUser[];
  contactCount: number;
  features: WorkspaceFeatures;
}

interface OverviewData {
  totals: { workspaces: number; users: number; contacts: number };
  companies: WorkspaceCompany[];
}

type WorkspacePlan = 'trial' | 'starter' | 'professional' | 'enterprise';

interface CreateWorkspacePayload {
  name: string;
  domain?: string;
  plan: WorkspacePlan;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  adminPassword: string;
}

const roleBadgeColors: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  closer: 'bg-green-100 text-green-700',
  setter: 'bg-amber-100 text-amber-700',
  caller: 'bg-cyan-100 text-cyan-700',
  sales_rep: 'bg-indigo-100 text-indigo-700',
  support_agent: 'bg-gray-100 text-gray-700',
};

const planBadgeColors: Record<string, string> = {
  trial: 'bg-indigo-100 text-indigo-700',
  free: 'bg-gray-100 text-gray-600',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
};

const featureLabels: Array<{ key: keyof WorkspaceFeatures; label: string }> = [
  { key: 'whatsappEnabled', label: 'WhatsApp' },
  { key: 'contactsEnabled', label: 'Contacts' },
  { key: 'leadsEnabled', label: 'Leads' },
  { key: 'calendarEnabled', label: 'Calendar' },
  { key: 'pipelineEnabled', label: 'Pipeline' },
  { key: 'tasksEnabled', label: 'Tasks' },
  { key: 'automationEnabled', label: 'Automation' },
  { key: 'marketingEnabled', label: 'Marketing' },
  { key: 'mobileAppEnabled', label: 'Mobile App' },
  { key: 'aiEnabled', label: 'AI' },
  { key: 'emailIntegration', label: 'Email' },
  { key: 'slackIntegration', label: 'Slack' },
];

export default function AdminPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [savingWorkspaceId, setSavingWorkspaceId] = useState<string | null>(null);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [createWorkspaceSuccess, setCreateWorkspaceSuccess] = useState<string | null>(null);
  const [createWorkspaceForm, setCreateWorkspaceForm] = useState<CreateWorkspacePayload>({
    name: '',
    domain: '',
    plan: 'trial',
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    adminPassword: '',
  });

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get<OverviewData>('/platform-admin/overview');
      setData(res.data);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setError('Access denied. Super admin role required.');
      } else {
        setError('Failed to load admin data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveWorkspaceFeatures = async (workspaceId: string, features: WorkspaceFeatures) => {
    try {
      setSavingWorkspaceId(workspaceId);
      const res = await api.patch(`/platform-admin/workspaces/${workspaceId}/features`, features);
      const updatedFeatures = res.data?.features || features;
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          companies: prev.companies.map((company) => (
            company.id === workspaceId
              ? { ...company, features: updatedFeatures }
              : company
          )),
        };
      });
    } catch {
      setError('Failed to update workspace features');
    } finally {
      setSavingWorkspaceId(null);
    }
  };

  const handleCreateWorkspace = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsCreatingWorkspace(true);
      setCreateWorkspaceError(null);
      setCreateWorkspaceSuccess(null);

      await api.post('/platform-admin/workspaces', {
        ...createWorkspaceForm,
        domain: createWorkspaceForm.domain?.trim() || undefined,
      });

      setCreateWorkspaceForm({
        name: '',
        domain: '',
        plan: 'trial',
        adminEmail: '',
        adminFirstName: '',
        adminLastName: '',
        adminPassword: '',
      });
      setCreateWorkspaceSuccess('Workspace created successfully.');
      await fetchOverview();
    } catch (err: any) {
      const message = Array.isArray(err?.response?.data?.message)
        ? err.response.data.message.join(', ')
        : err?.response?.data?.message || 'Failed to create workspace';
      setCreateWorkspaceError(message);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="h-12 w-12 text-red-400" />
        <p className="text-lg font-semibold text-red-600">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const filtered = data.companies.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.domain || '').toLowerCase().includes(q) ||
      c.users.some((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Manage all workspaces across the platform</p>
      </div>

      <form
        onSubmit={handleCreateWorkspace}
        className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">Create New Company</h2>
          <p className="text-xs text-gray-500 mt-1">Creates a new workspace and initial admin user.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input
            type="text"
            value={createWorkspaceForm.name}
            onChange={(event) => setCreateWorkspaceForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Company / Workspace name"
            required
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={createWorkspaceForm.domain || ''}
            onChange={(event) => setCreateWorkspaceForm((prev) => ({ ...prev, domain: event.target.value.toLowerCase() }))}
            placeholder="Domain (optional, ex: acme-corp)"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={createWorkspaceForm.plan}
            onChange={(event) => setCreateWorkspaceForm((prev) => ({ ...prev, plan: event.target.value as WorkspacePlan }))}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="trial">Trial</option>
            <option value="starter">Starter</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <input
            type="email"
            value={createWorkspaceForm.adminEmail}
            onChange={(event) => setCreateWorkspaceForm((prev) => ({ ...prev, adminEmail: event.target.value }))}
            placeholder="Admin email"
            required
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={createWorkspaceForm.adminFirstName}
            onChange={(event) => setCreateWorkspaceForm((prev) => ({ ...prev, adminFirstName: event.target.value }))}
            placeholder="Admin first name"
            required
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={createWorkspaceForm.adminLastName}
            onChange={(event) => setCreateWorkspaceForm((prev) => ({ ...prev, adminLastName: event.target.value }))}
            placeholder="Admin last name"
            required
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="password"
            value={createWorkspaceForm.adminPassword}
            onChange={(event) => setCreateWorkspaceForm((prev) => ({ ...prev, adminPassword: event.target.value }))}
            placeholder="Admin password (min 12 chars, uppercase, lowercase, number, special char)"
            minLength={12}
            required
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={isCreatingWorkspace}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-indigo-300"
          >
            {isCreatingWorkspace ? 'Creating...' : 'Create Company'}
          </button>
        </div>

        {createWorkspaceError && (
          <p className="text-sm text-red-600">{createWorkspaceError}</p>
        )}
        {createWorkspaceSuccess && (
          <p className="text-sm text-green-600">{createWorkspaceSuccess}</p>
        )}
      </form>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100">
              <Building2 className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data.totals.workspaces}</p>
              <p className="text-xs text-gray-500">Workspaces</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data.totals.users}</p>
              <p className="text-xs text-gray-500">Total Users</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
              <UserCheck className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data.totals.contacts}</p>
              <p className="text-xs text-gray-500">Total Contacts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search workspaces, users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Workspaces Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Workspace</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Domain</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Plan</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Users</th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contacts</th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Created</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => {
                const isExpanded = expandedWorkspaces.has(company.id);
                return (
                  <WorkspaceRow
                    key={company.id}
                    company={company}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpand(company.id)}
                    onSaveFeatures={handleSaveWorkspaceFeatures}
                    isSaving={savingWorkspaceId === company.id}
                  />
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                    No workspaces found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function WorkspaceRow({
  company,
  isExpanded,
  onToggle,
  onSaveFeatures,
  isSaving,
}: {
  company: WorkspaceCompany;
  isExpanded: boolean;
  onToggle: () => void;
  onSaveFeatures: (workspaceId: string, features: WorkspaceFeatures) => Promise<void>;
  isSaving: boolean;
}) {
  const date = new Date(company.createdAt);
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const plan = company.plan || 'free';
  const [featureDraft, setFeatureDraft] = useState<WorkspaceFeatures>(company.features);

  useEffect(() => {
    setFeatureDraft(company.features);
  }, [company.features]);

  const hasFeatureChanges = JSON.stringify(featureDraft) !== JSON.stringify(company.features);

  return (
    <>
      <tr
        className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-3 px-4">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs shrink-0">
              {company.name.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-900 truncate">{company.name}</span>
          </div>
        </td>
        <td className="py-3 px-4 hidden sm:table-cell">
          <span className="text-sm text-gray-500">{company.domain || '—'}</span>
        </td>
        <td className="py-3 px-4 hidden md:table-cell">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${planBadgeColors[plan] || planBadgeColors.free}`}>
            {plan}
          </span>
        </td>
        <td className="py-3 px-4 text-right">
          <span className="text-sm font-semibold text-gray-900">{company.userCount}</span>
        </td>
        <td className="py-3 px-4 text-right">
          <span className="text-sm font-semibold text-gray-900">{company.contactCount.toLocaleString()}</span>
        </td>
        <td className="py-3 px-4 hidden lg:table-cell">
          <span className="text-sm text-gray-500">{formatted}</span>
        </td>
        <td className="py-3 px-4 text-center hidden md:table-cell">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${company.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
        </td>
      </tr>

      {/* Expanded user list */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-gray-50/80 px-4 py-3">
            <div className="ml-8 space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Feature Access</p>
                  <button
                    type="button"
                    onClick={() => onSaveFeatures(company.id, featureDraft)}
                    disabled={isSaving || !hasFeatureChanges}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 disabled:bg-indigo-300"
                  >
                    {isSaving ? 'Saving...' : 'Save Features'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {featureLabels.map((feature) => (
                    <button
                      type="button"
                      key={feature.key}
                      onClick={() => setFeatureDraft((prev) => ({ ...prev, [feature.key]: !prev[feature.key] }))}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs ${
                        featureDraft[feature.key]
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-gray-200 bg-white text-gray-500'
                      }`}
                    >
                      <span>{feature.label}</span>
                      <span className="font-semibold">{featureDraft[feature.key] ? 'ON' : 'OFF'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {company.users.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Team Members</p>
                  {company.users.map((user) => (
                    <div key={user.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] shrink-0">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                          <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${roleBadgeColors[user.role] || 'bg-gray-100 text-gray-600'}`}>
                          {user.role.replace(/_/g, ' ')}
                        </span>
                        <span className={`inline-flex h-2 w-2 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No users in this workspace</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
