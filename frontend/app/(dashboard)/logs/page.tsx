'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Download, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';

type LogSource = 'activity' | 'notification' | 'integration';
type LogLevel = 'info' | 'warn' | 'error';

interface CurrentUser {
  role: string;
}

interface SystemLog {
  id: string;
  source: LogSource;
  level: LogLevel;
  category: string;
  message: string;
  createdAt: string;
  workspaceId?: string;
  workspaceName?: string;
  actor?: string;
}

interface SystemLogsResponse {
  logs: SystemLog[];
  total: number;
  sources: Record<LogSource, number>;
}

const levelStyle: Record<LogLevel, string> = {
  info: 'bg-blue-100 text-blue-700',
  warn: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

const sourceStyle: Record<LogSource, string> = {
  activity: 'bg-indigo-100 text-indigo-700',
  notification: 'bg-emerald-100 text-emerald-700',
  integration: 'bg-fuchsia-100 text-fuchsia-700',
};

export default function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [sources, setSources] = useState<Record<LogSource, number>>({
    activity: 0,
    notification: 0,
    integration: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<'all' | LogSource>('all');
  const [selectedLevel, setSelectedLevel] = useState<'all' | LogLevel>('all');
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const userRes = await api.get<CurrentUser>('/auth/me');
      const role = userRes.data.role?.toLowerCase();
      const superAdminRole = role === 'super_admin';
      const adminRole = role === 'admin';
      const canAccessLogs = superAdminRole || adminRole;

      // Logs page is always workspace-scoped to prevent cross-company visibility.
      setIsSuperAdmin(false);
      setIsAuthorized(canAccessLogs);

      if (!canAccessLogs) {
        setLogs([]);
        setSources({ activity: 0, notification: 0, integration: 0 });
        return;
      }

      const logsRes = await api.get<SystemLogsResponse>('/analytics/system-logs', {
        params: { limit: 200 },
      });

      setLogs(logsRes.data.logs || []);
      setSources(logsRes.data.sources || { activity: 0, notification: 0, integration: 0 });
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setIsAuthorized(false);
        setLogs([]);
        return;
      }

      const message = axios.isAxiosError(err)
        ? (Array.isArray(err.response?.data?.message)
            ? err.response?.data?.message.join(', ')
            : err.response?.data?.message) || 'Nu am putut incarca logurile'
        : 'Nu am putut incarca logurile';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const workspaceOptions = useMemo(() => {
    if (!isSuperAdmin) return [];
    const seen = new Set<string>();
    const list: Array<{ value: string; label: string }> = [];
    for (const log of logs) {
      const workspaceValue = (log.workspaceId || '').trim();
      if (!workspaceValue || seen.has(workspaceValue)) continue;
      seen.add(workspaceValue);
      list.push({
        value: workspaceValue,
        label: log.workspaceName || workspaceValue,
      });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [logs, isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
      setSelectedWorkspace('all');
      return;
    }

    if (selectedWorkspace !== 'all' && !workspaceOptions.some((option) => option.value === selectedWorkspace)) {
      setSelectedWorkspace('all');
    }
  }, [isSuperAdmin, selectedWorkspace, workspaceOptions]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return logs.filter((log) => {
      if (selectedSource !== 'all' && log.source !== selectedSource) return false;
      if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
      if (isSuperAdmin && selectedWorkspace !== 'all' && log.workspaceId !== selectedWorkspace) return false;

      if (!query) return true;
      const haystack = [
        log.category,
        log.message,
        log.actor || '',
        log.source,
        log.level,
        log.workspaceName || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [logs, search, selectedSource, selectedLevel, selectedWorkspace, isSuperAdmin]);

  const filteredSourceCounts = useMemo(() => {
    const next: Record<LogSource, number> = {
      activity: 0,
      notification: 0,
      integration: 0,
    };

    for (const log of filteredLogs) {
      next[log.source] += 1;
    }

    return next;
  }, [filteredLogs]);

  const downloadFilteredCsv = () => {
    if (!filteredLogs.length) return;

    const escapeCsv = (value: unknown) => {
      const text = String(value ?? '');
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const headers = isSuperAdmin
      ? ['time', 'workspace', 'source', 'level', 'category', 'message', 'actor']
      : ['time', 'source', 'level', 'category', 'message', 'actor'];

    const rows = filteredLogs.map((log) => {
      const base = [
        new Date(log.createdAt).toISOString(),
      ];

      if (isSuperAdmin) {
        base.push(log.workspaceName || log.workspaceId || '');
      }

      base.push(
        log.source,
        log.level,
        log.category || '',
        log.message || '',
        log.actor || '',
      );

      return base.map(escapeCsv).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `system-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <div className="flex items-center gap-3 text-amber-800">
          <ShieldAlert className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Acces permis doar pentru admin/super admin</h1>
        </div>
        <p className="mt-3 text-sm text-amber-700">
          Pagina de loguri este restrictionata doar utilizatorilor cu rol admin sau super admin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">System Logs</h1>
          <p className="mt-1 text-sm text-gray-600">
            {isSuperAdmin
              ? 'Evenimente globale din toate workspaces'
              : 'Evenimente din workspace-ul curent'}
          </p>
        </div>
        <button
          onClick={() => void loadLogs()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
        <button
          onClick={downloadFilteredCsv}
          disabled={filteredLogs.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Activity</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filteredSourceCounts.activity}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Notifications</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filteredSourceCounts.notification}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Integrations</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filteredSourceCounts.integration}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <select
            value={selectedSource}
            onChange={(event) => setSelectedSource(event.target.value as 'all' | LogSource)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All sources</option>
            <option value="activity">Activity</option>
            <option value="notification">Notification</option>
            <option value="integration">Integration</option>
          </select>

          <select
            value={selectedLevel}
            onChange={(event) => setSelectedLevel(event.target.value as 'all' | LogLevel)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>

          {isSuperAdmin && (
            <select
              value={selectedWorkspace}
              onChange={(event) => setSelectedWorkspace(event.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All workspaces</option>
              {workspaceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search logs..."
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Showing {filteredLogs.length} of {logs.length} logs
          {sources.activity + sources.notification + sources.integration > logs.length ? ' (limited by API fetch size)' : ''}.
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <p className="text-sm">{error}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Time</th>
                {isSuperAdmin && (
                  <th className="px-4 py-3 font-semibold text-gray-600">Workspace</th>
                )}
                <th className="px-4 py-3 font-semibold text-gray-600">Source</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Level</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Category</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Message</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actor</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 7 : 6} className="px-4 py-10 text-center text-gray-500">
                    Nu exista loguri pentru filtrele selectate.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-t border-gray-100 align-top hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{new Date(log.createdAt).toLocaleString()}</td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-gray-700">{log.workspaceName || log.workspaceId || '-'}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sourceStyle[log.source]}`}>
                        {log.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${levelStyle[log.level]}`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{log.category}</td>
                    <td className="max-w-[420px] px-4 py-3 text-gray-900">{log.message}</td>
                    <td className="px-4 py-3 text-gray-600">{log.actor || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
