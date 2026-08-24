'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { Funnel, FunnelEnrollment } from '@/types/funnel';

export default function FunnelDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [enrollments, setEnrollments] = useState<FunnelEnrollment[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.get<Funnel>(`/funnels/${id}`)
      .then((res) => setFunnel(res.data))
      .catch((error) => {
        console.error('Failed to fetch funnel:', error);
        setLoadError('Failed to load this funnel.');
      });
    api.get<FunnelEnrollment[]>(`/funnels/${id}/enrollments`)
      .then((res) => setEnrollments(res.data))
      .catch((error) => {
        console.error('Failed to fetch enrollments:', error);
        setLoadError('Failed to load enrollments for this funnel.');
      });
  }, [id]);

  const toggleAttended = async (enrollmentId: string, current?: boolean) => {
    try {
      const res = await api.patch<FunnelEnrollment>(`/funnels/enrollments/${enrollmentId}/attended`, { attended: !current });
      setEnrollments((prev) => prev.map((e) => (e.id === enrollmentId ? res.data : e)));
    } catch (error) {
      console.error('Failed to update attended status:', error);
    }
  };

  if (loadError && !funnel) return <div className="p-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg mx-6 mt-6 px-3 py-2">{loadError}</div>;
  if (!funnel) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-1">{funnel.name}</h1>
      {loadError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</div>
      )}
      {funnel.anchorDate && <p className="text-sm text-gray-500 mb-6">Anchor: {new Date(funnel.anchorDate).toLocaleString()}</p>}

      <h2 className="text-sm font-medium text-gray-600 mb-2">Enrollments ({enrollments.length})</h2>
      <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">WhatsApp</th>
            <th className="text-left px-3 py-2">Step</th>
            <th className="text-left px-3 py-2">Enrolled</th>
            <th className="text-left px-3 py-2">Attended</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e) => (
            <tr key={e.id} className="border-t border-gray-100">
              <td className="px-3 py-2">{e.waId}</td>
              <td className="px-3 py-2">{e.currentStepId || '—'}</td>
              <td className="px-3 py-2">{new Date(e.enrolledAt).toLocaleString()}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => toggleAttended(e.id, e.attendedManual)}
                  className={`text-xs px-2 py-1 rounded-full ${e.attendedManual ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  {e.attendedManual ? 'Attended' : 'Mark attended'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
