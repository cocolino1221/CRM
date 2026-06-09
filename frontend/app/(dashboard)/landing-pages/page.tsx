'use client';

import { useState, useEffect } from 'react';
import { Plus, Layout, Eye, Edit, Trash2, Copy, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { LandingPage, LandingPageStatus } from '@/types/landing-page';

export default function LandingPagesPage() {
  const router = useRouter();
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<LandingPageStatus | 'all'>('all');

  useEffect(() => {
    fetchPages();
  }, [filterStatus]);

  const fetchPages = async () => {
    try {
      setIsLoading(true);
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const response = await api.get<LandingPage[]>('/landing-pages', { params });
      setPages(response.data);
    } catch (error) {
      console.error('Failed to fetch landing pages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this landing page?')) return;
    try {
      await api.delete(`/landing-pages/${id}`);
      setPages(pages.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Failed to delete landing page:', error);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await api.post<LandingPage>(`/landing-pages/${id}/duplicate`);
      setPages([res.data, ...pages]);
    } catch (error) {
      console.error('Failed to duplicate landing page:', error);
    }
  };

  const copyPublicUrl = (slug: string) => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    alert('Public URL copied!');
  };

  const statusColor = (status: LandingPageStatus) => {
    switch (status) {
      case LandingPageStatus.ACTIVE:
        return 'bg-green-100 text-green-700';
      case LandingPageStatus.DRAFT:
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing Pages</h1>
          <p className="text-gray-500">Public pages that capture leads into your CRM.</p>
        </div>
        <button
          onClick={() => router.push('/landing-pages/new')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          <Plus size={18} /> New Landing Page
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {(['all', 'active', 'draft', 'archived'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s as any)}
            className={`rounded-full px-3 py-1 text-sm capitalize ${
              filterStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          <Layout className="mx-auto mb-3" />
          No landing pages yet. Create your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColor(p.status)}`}>
                  {p.status}
                </span>
              </div>
              <p className="mb-3 text-sm text-gray-400">/p/{p.slug}</p>
              <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="font-semibold text-gray-900">{p.uniqueViewCount || p.viewCount}</div>
                  <div className="text-gray-400">Views</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{p.submissionCount}</div>
                  <div className="text-gray-400">Leads</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {(p.conversionRate ?? 0).toFixed(1)}%
                  </div>
                  <div className="text-gray-400">Conv.</div>
                </div>
              </div>
              {p.publishedAt && (
                <p className="mb-3 text-xs text-gray-400">
                  Published {new Date(p.publishedAt).toLocaleDateString()}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push(`/landing-pages/${p.id}/edit`)}
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
                >
                  <Edit size={14} /> Edit
                </button>
                <button onClick={() => copyPublicUrl(p.slug)} title="Copy URL" className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200">
                  <ExternalLink size={14} />
                </button>
                <button onClick={() => handleDuplicate(p.id)} title="Duplicate" className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200">
                  <Copy size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} title="Delete" className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
