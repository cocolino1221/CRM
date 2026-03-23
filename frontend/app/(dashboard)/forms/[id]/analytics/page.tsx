'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCheck2,
  MousePointerClick,
} from 'lucide-react';
import api from '@/lib/api';
import { Form, FormStatus } from '@/types/form';

interface FormAnalyticsResponse {
  totalSubmissions: number;
  totalViews: number;
  conversionRate: number;
  statusBreakdown: Record<string, number>;
  lastSubmittedAt?: string;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  new: { bg: 'bg-blue-100', text: 'text-blue-700' },
  reviewed: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  converted: { bg: 'bg-violet-100', text: 'text-violet-700' },
  spam: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const toStatusLabel = (value: string) =>
  value
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');

export default function FormAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<Form | null>(null);
  const [analytics, setAnalytics] = useState<FormAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError('');

        const [formResponse, analyticsResponse] = await Promise.all([
          api.get<Form>(`/forms/${formId}`),
          api.get<FormAnalyticsResponse>(`/forms/${formId}/analytics`),
        ]);

        setForm(formResponse.data);
        setAnalytics(analyticsResponse.data);
      } catch (err: any) {
        console.error('Failed to load form analytics:', err);
        setError(err?.response?.data?.message || 'Failed to load analytics');
      } finally {
        setIsLoading(false);
      }
    };

    if (formId) {
      fetchData();
    }
  }, [formId]);

  const statusRows = useMemo(() => {
    if (!analytics?.statusBreakdown) {
      return [];
    }

    const total = Math.max(
      analytics.totalSubmissions || 0,
      Object.values(analytics.statusBreakdown).reduce((acc, count) => acc + Number(count || 0), 0),
    );

    return Object.entries(analytics.statusBreakdown)
      .map(([status, count]) => {
        const safeCount = Number(count || 0);
        const percent = total > 0 ? Math.round((safeCount / total) * 100) : 0;
        return {
          status,
          count: safeCount,
          percent,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [analytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!form || !analytics) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/forms')}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Forms
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error || 'Form analytics unavailable.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => router.push('/forms')}
            className="mt-1 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              {form.name} - Analytics
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Performance overview for this form.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/forms/${form.id}/submissions`)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            View submissions
          </button>
          {form.status === FormStatus.ACTIVE ? (
            <a
              href={`/forms/public/${form.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Open form
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Views</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2">
            <Eye className="h-5 w-5 text-sky-600" />
            {analytics.totalViews || 0}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Submissions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-emerald-600" />
            {analytics.totalSubmissions || 0}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Conversion</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2">
            <MousePointerClick className="h-5 w-5 text-violet-600" />
            {Number(analytics.conversionRate || 0).toFixed(1)}%
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Last Submission</p>
          <p className="text-sm font-semibold text-gray-900 mt-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {analytics.lastSubmittedAt ? new Date(analytics.lastSubmittedAt).toLocaleString() : 'No submissions yet'}
          </p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Submission Status Breakdown</h2>
        {statusRows.length === 0 ? (
          <p className="text-sm text-gray-500">No submissions yet for this form.</p>
        ) : (
          <div className="space-y-3">
            {statusRows.map((row) => {
              const styles = statusStyles[row.status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
              return (
                <div key={row.status} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles.bg} ${styles.text}`}>
                      {toStatusLabel(row.status)}
                    </span>
                    <span className="text-gray-600">
                      {row.count} ({row.percent}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.max(2, row.percent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
