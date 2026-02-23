'use client';

import { FormEvent, useMemo, useState } from 'react';

type CompanyOverview = {
  id: string;
  name: string;
  domain: string;
  plan: string;
  isActive: boolean;
  createdAt: string;
  userCount: number;
  users: Array<{ id: string; name: string }>;
  contactCount: number;
};

type OverviewResponse = {
  totals: { workspaces: number; users: number; contacts: number };
  companies: CompanyOverview[];
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

export default function PlatformAdminPage() {
  const [key, setKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);

  const activeCompanies = useMemo(
    () => overview?.companies.filter((company) => company.isActive).length || 0,
    [overview],
  );

  const handleLoad = async (event: FormEvent) => {
    event.preventDefault();
    if (!key.trim()) return;
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/platform-admin/overview`, {
        headers: { 'x-platform-admin-key': key.trim() },
      });
      if (!res.ok) {
        throw new Error('Access denied');
      }
      const data = (await res.json()) as OverviewResponse;
      setOverview(data);
    } catch (err: any) {
      setOverview(null);
      setError(err?.message || 'Failed to load platform overview');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
          <h1 className="text-2xl font-bold text-slate-900">Platform Admin</h1>
          <p className="text-sm text-slate-500 mt-1">Hidden owner view for SaaS companies, users, and contact counts.</p>

          <form onSubmit={handleLoad} className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="password"
              placeholder="Platform admin key"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={isLoading || !key.trim()}
              className="rounded-xl bg-sky-700 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {isLoading ? 'Loading...' : 'Load'}
            </button>
          </form>

          {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
        </div>

        {overview && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs uppercase tracking-widest text-slate-500">Companies</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{overview.totals.workspaces}</p>
                <p className="text-xs text-slate-500 mt-1">{activeCompanies} active</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs uppercase tracking-widest text-slate-500">Users</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{overview.totals.users}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs uppercase tracking-widest text-slate-500">Contacts</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{overview.totals.contacts}</p>
              </div>
            </div>

            <div className="space-y-3">
              {overview.companies.map((company) => (
                <div key={company.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{company.name}</h2>
                      <p className="text-xs text-slate-500">{company.domain} • {company.plan}</p>
                    </div>
                    <div className="text-xs text-slate-600">
                      {company.userCount} users • {company.contactCount} contacts
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {company.users.map((user) => (
                      <span key={user.id} className="px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700">
                        {user.name}
                      </span>
                    ))}
                    {company.users.length === 0 && (
                      <span className="text-xs text-slate-400">No users</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

