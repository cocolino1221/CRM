'use client';

import { useState, useEffect } from 'react';
import { Plus, FileText, Eye, Edit, Trash2, Copy, BarChart3, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Form, FormStatus } from '@/types/form';

export default function FormsPage() {
  const router = useRouter();
  const [forms, setForms] = useState<Form[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FormStatus | 'all'>('all');

  useEffect(() => {
    fetchForms();
  }, [filterStatus]);

  const fetchForms = async () => {
    try {
      setIsLoading(true);
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const response = await api.get<Form[]>('/forms', { params });
      setForms(response.data);
    } catch (error) {
      console.error('Failed to fetch forms:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this form?')) return;

    try {
      await api.delete(`/forms/${id}`);
      setForms(forms.filter((form) => form.id !== id));
    } catch (error) {
      console.error('Failed to delete form:', error);
    }
  };

  const copyFormUrl = (slug: string) => {
    const url = `${window.location.origin}/forms/public/${slug}`;
    navigator.clipboard.writeText(url);
    alert('Form URL copied to clipboard!');
  };

  const getStatusColor = (status: FormStatus) => {
    switch (status) {
      case FormStatus.ACTIVE:
        return 'bg-green-100 text-green-800';
      case FormStatus.DRAFT:
        return 'bg-gray-100 text-gray-800';
      case FormStatus.ARCHIVED:
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConversionRate = (form: Form) => {
    if (form.viewCount === 0) return 0;
    return ((form.submissionCount / form.viewCount) * 100).toFixed(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage custom forms for lead capture
          </p>
        </div>
        <button
          onClick={() => router.push('/forms/new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Form
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            filterStatus === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          All Forms
        </button>
        <button
          onClick={() => setFilterStatus(FormStatus.ACTIVE)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            filterStatus === FormStatus.ACTIVE
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilterStatus(FormStatus.DRAFT)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            filterStatus === FormStatus.DRAFT
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Draft
        </button>
        <button
          onClick={() => setFilterStatus(FormStatus.ARCHIVED)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            filterStatus === FormStatus.ARCHIVED
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Archived
        </button>
      </div>

      {/* Forms Grid */}
      {forms.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No forms yet</h3>
          <p className="text-gray-600 mb-4">
            Get started by creating your first form
          </p>
          <button
            onClick={() => router.push('/forms/new')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Form
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {forms.map((form) => (
            <div
              key={form.id}
              className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-all group"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {form.name}
                    </h3>
                    {form.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {form.description}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                      form.status
                    )}`}
                  >
                    {form.status}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4 py-3 border-t border-b border-gray-100">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {form.submissionCount}
                    </div>
                    <div className="text-xs text-gray-500">Submissions</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{form.viewCount}</div>
                    <div className="text-xs text-gray-500">Views</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {getConversionRate(form)}%
                    </div>
                    <div className="text-xs text-gray-500">Conv. Rate</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/forms/${form.id}/submissions`)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                  <button
                    onClick={() => router.push(`/forms/${form.id}/edit`)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => copyFormUrl(form.slug)}
                    className="px-3 py-2 text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Copy form URL"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => router.push(`/forms/${form.id}/analytics`)}
                    className="px-3 py-2 text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    title="View analytics"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(form.id)}
                    className="px-3 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    title="Delete form"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {form.status === FormStatus.ACTIVE && (
                  <a
                    href={`/forms/public/${form.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open public form
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
