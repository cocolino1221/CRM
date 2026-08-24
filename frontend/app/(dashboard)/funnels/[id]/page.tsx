'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { Funnel, FunnelEnrollment, FunnelStatus } from '@/types/funnel';

// Convert an ISO timestamp into the `YYYY-MM-DDTHH:mm` shape a
// datetime-local input expects, in the viewer's local timezone.
function toDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function FunnelDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [enrollments, setEnrollments] = useState<FunnelEnrollment[]>([]);
  const [loadError, setLoadError] = useState('');

  // Edit form state
  const [name, setName] = useState('');
  const [status, setStatus] = useState<FunnelStatus>('draft');
  const [anchorDate, setAnchorDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  const hydrateForm = (f: Funnel) => {
    setName(f.name);
    setStatus(f.status);
    setAnchorDate(toDatetimeLocal(f.anchorDate));
  };

  useEffect(() => {
    api.get<Funnel>(`/funnels/${id}`)
      .then((res) => {
        setFunnel(res.data);
        hydrateForm(res.data);
      })
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

  const handleSave = async () => {
    if (!name) return;
    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      const res = await api.patch<Funnel>(`/funnels/${id}`, {
        name,
        status,
        anchorDate: anchorDate ? new Date(anchorDate).toISOString() : undefined,
      });
      setFunnel(res.data);
      hydrateForm(res.data);
      setSaved(true);
    } catch (error) {
      console.error('Failed to update funnel:', error);
      setSaveError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

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

  const dirty = name !== funnel.name || status !== funnel.status || anchorDate !== toDatetimeLocal(funnel.anchorDate);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">{funnel.name}</h1>
      {loadError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</div>
      )}

      <div className="mb-8 max-w-lg border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-600 mb-3">Funnel settings</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
              placeholder="Webinar August 2026"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as FunnelStatus); setSaved(false); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Anchor date (e.g. webinar date/time)</label>
            <input
              type="datetime-local"
              value={anchorDate}
              onChange={(e) => { setAnchorDate(e.target.value); setSaved(false); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Reset this each time you reuse the funnel for a new webinar.</p>
          </div>
          {saveError && <div className="text-sm text-red-600">{saveError}</div>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !name || !dirty}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && !dirty && <span className="text-sm text-green-600">Saved.</span>}
          </div>
        </div>
      </div>

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
