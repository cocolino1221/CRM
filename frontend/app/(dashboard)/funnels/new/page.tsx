'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function NewFunnelPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [flows, setFlows] = useState<Array<{ id: string; name: string }>>([]);
  const [flowId, setFlowId] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [anchorDate, setAnchorDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    // There's no single "get the WhatsApp integration" endpoint — the generic
    // integrations list (filtered by type) gives us the integration id, and
    // conversation flows are fetched separately (workspace-implicit, no
    // integrationId needed) from the same flow editor used on /whatsapp.
    Promise.all([
      api.get('/integrations', { params: { type: 'whatsapp' } }),
      api.get('/integrations/whatsapp/flows'),
    ])
      .then(([integrationsRes, flowsRes]) => {
        const integrations = integrationsRes.data?.integrations || [];
        setIntegrationId(integrations[0]?.id || '');
        setFlows(flowsRes.data || []);
        if (!integrations[0]?.id) {
          setLoadError('No WhatsApp integration found for this workspace. Connect WhatsApp on the Integrations page first.');
        }
      })
      .catch((error) => {
        console.error('Failed to load WhatsApp integration/flows:', error);
        setLoadError('Failed to load WhatsApp integration/flows.');
      });
  }, []);

  const handleSave = async () => {
    if (!name || !flowId || !integrationId) return;
    setSaving(true);
    try {
      const res = await api.post('/funnels', {
        name,
        flowId,
        integrationId,
        status: 'active',
        anchorDate: anchorDate ? new Date(anchorDate).toISOString() : undefined,
      });
      router.push(`/funnels/${res.data.id}`);
    } catch (error) {
      console.error('Failed to create funnel:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">New Funnel</h1>
      {loadError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{loadError}</div>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Webinar August 2026" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">WhatsApp flow</label>
          <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white">
            <option value="">Choose a flow…</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">Build/edit steps for this flow on the WhatsApp integration page.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Anchor date (e.g. webinar date/time)</label>
          <input type="datetime-local" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
        </div>
        <button onClick={handleSave} disabled={saving || !name || !flowId || !integrationId} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Funnel'}
        </button>
      </div>
    </div>
  );
}
