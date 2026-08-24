'use client';

import { useState, useEffect } from 'react';
import { Plus, Workflow, Trash2, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Funnel } from '@/types/funnel';

export default function FunnelsPage() {
  const router = useRouter();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFunnels();
  }, []);

  const fetchFunnels = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<Funnel[]>('/funnels');
      setFunnels(response.data);
    } catch (error) {
      console.error('Failed to fetch funnels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this funnel?')) return;
    try {
      await api.delete(`/funnels/${id}`);
      setFunnels(funnels.filter((f) => f.id !== id));
    } catch (error) {
      console.error('Failed to delete funnel:', error);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Workflow className="w-6 h-6" /> Funnels</h1>
        <button
          onClick={() => router.push('/funnels/new')}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
        >
          <Plus className="w-4 h-4" /> New Funnel
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : funnels.length === 0 ? (
        <div className="text-sm text-gray-500">No funnels yet. Create one to auto-enroll landing page leads into a WhatsApp/email sequence.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {funnels.map((funnel) => (
            <div key={funnel.id} className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{funnel.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${funnel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {funnel.status}
                </span>
              </div>
              {funnel.anchorDate && (
                <div className="text-xs text-gray-500 mb-3">Anchor: {new Date(funnel.anchorDate).toLocaleString()}</div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => router.push(`/funnels/${funnel.id}`)} className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Edit className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => handleDelete(funnel.id)} className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
