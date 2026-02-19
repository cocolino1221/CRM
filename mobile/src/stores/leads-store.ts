import { create } from 'zustand';
import api from '@/lib/api';
import type { Contact, Pipeline } from '@/types';

interface LeadsState {
  contacts: Contact[];
  pipelines: Pipeline[];
  selectedPipeline: Pipeline | null;
  selectedStage: string;
  isLoading: boolean;
  search: string;
  setSearch: (s: string) => void;
  fetchPipelines: () => Promise<void>;
  fetchContacts: () => Promise<void>;
  selectPipeline: (p: Pipeline) => void;
  selectStage: (s: string) => void;
  createContact: (data: Partial<Contact>) => Promise<boolean>;
  updateContact: (id: string, data: Partial<Contact>) => Promise<boolean>;
  deleteContact: (id: string) => Promise<boolean>;
}

export const useLeadsStore = create<LeadsState>((set, get) => ({
  contacts: [],
  pipelines: [],
  selectedPipeline: null,
  selectedStage: '',
  isLoading: true,
  search: '',

  setSearch: (s) => set({ search: s }),

  fetchPipelines: async () => {
    try {
      const res = await api.get('/pipelines');
      const pipelines: Pipeline[] = res.data || [];
      const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0] || null;
      set({
        pipelines,
        selectedPipeline: defaultPipeline,
        selectedStage: defaultPipeline?.stages?.[0] || '',
      });
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
    }
  },

  fetchContacts: async () => {
    const { selectedPipeline, search } = get();
    if (!selectedPipeline) { set({ isLoading: false }); return; }
    try {
      const params: any = { pipelineId: selectedPipeline.id, limit: 200, page: 1 };
      if (search) params.search = search;
      const res = await api.get('/contacts', { params });
      set({ contacts: res.data.contacts || res.data || [], isLoading: false });
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      set({ isLoading: false });
    }
  },

  selectPipeline: (p) => set({ selectedPipeline: p, selectedStage: p.stages?.[0] || '' }),
  selectStage: (s) => set({ selectedStage: s }),

  createContact: async (data) => {
    try {
      await api.post('/contacts', { ...data, type: 'LEAD' });
      get().fetchContacts();
      return true;
    } catch { return false; }
  },

  updateContact: async (id, data) => {
    try {
      await api.put(`/contacts/${id}`, data);
      get().fetchContacts();
      return true;
    } catch { return false; }
  },

  deleteContact: async (id) => {
    try {
      await api.delete(`/contacts/${id}`);
      get().fetchContacts();
      return true;
    } catch { return false; }
  },
}));
