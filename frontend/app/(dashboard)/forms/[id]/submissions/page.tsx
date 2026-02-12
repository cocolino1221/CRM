'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Clock, XCircle, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Form, FormSubmission } from '@/types/form';

export default function FormSubmissionsPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<Form | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);

  useEffect(() => {
    fetchData();
  }, [formId]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [formRes, submissionsRes] = await Promise.all([
        api.get<Form>(`/forms/${formId}`),
        api.get<FormSubmission[]>(`/forms/${formId}/submissions`),
      ]);
      setForm(formRes.data);
      setSubmissions(submissionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'reviewed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'converted':
        return <CheckCircle className="h-5 w-5 text-purple-500" />;
      case 'spam':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-100 text-blue-800';
      case 'reviewed':
        return 'bg-green-100 text-green-800';
      case 'converted':
        return 'bg-purple-100 text-purple-800';
      case 'spam':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!form) {
    return <div>Form not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/forms')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{form.name} - Submissions</h1>
          <p className="mt-1 text-sm text-gray-500">
            {submissions.length} total submission{submissions.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {submissions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-600">No submissions yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {submissions.map((submission) => (
                  <tr
                    key={submission.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedSubmission(submission)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(submission.status)}
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            submission.status
                          )}`}
                        >
                          {submission.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(submission.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="max-w-md truncate">
                        {Object.entries(submission.data)
                          .slice(0, 2)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(', ')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubmission(submission);
                        }}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedSubmission(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Submission Details</h2>
                <button
                  onClick={() => setSelectedSubmission(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <span
                  className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(
                    selectedSubmission.status
                  )}`}
                >
                  {selectedSubmission.status}
                </span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Submitted At
                </label>
                <p className="text-sm text-gray-900">
                  {new Date(selectedSubmission.createdAt).toLocaleString()}
                </p>
              </div>

              {selectedSubmission.ipAddress && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IP Address
                  </label>
                  <p className="text-sm text-gray-900">{selectedSubmission.ipAddress}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Form Data
                </label>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {Object.entries(selectedSubmission.data).map(([key, value]) => (
                    <div key={key} className="border-b border-gray-200 pb-2 last:border-0">
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        {form.fields.find((f) => f.id === key)?.label || key}
                      </div>
                      <div className="text-sm text-gray-900">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
