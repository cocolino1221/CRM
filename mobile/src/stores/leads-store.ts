import { create } from 'zustand';
import api from '@/lib/api';
import type { Contact, Pipeline } from '@/types';

interface LeadsState {
  contacts: Contact[];
  pipelines: Pipeline[];
  selectedPipeline: Pipeline | null;
  selectedStage: string;
  isLoading: boolean;
  fetchError: string;
  search: string;
  setSearch: (s: string) => void;
  fetchPipelines: () => Promise<void>;
  fetchContacts: () => Promise<void>;
  selectPipeline: (p: Pipeline) => void;
  selectStage: (s: string) => void;
  createContact: (data: Partial<Contact>) => Promise<string | null>;
  updateContact: (id: string, data: Partial<Contact>) => Promise<string | null>;
  deleteContact: (id: string) => Promise<string | null>;
}

export const useLeadsStore = create<LeadsState>((set, get) => ({
  contacts: [],
  pipelines: [],
  selectedPipeline: null,
  selectedStage: '',
  isLoading: true,
  fetchError: '',
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
        fetchError: '',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load pipelines';
      set({ fetchError: msg });
    }
  },

  fetchContacts: async () => {
    const { selectedPipeline, search } = get();
    if (!selectedPipeline) { set({ isLoading: false }); return; }
    try {
      const params: any = { pipelineId: selectedPipeline.id, limit: 200, page: 1 };
      if (search) params.search = search;
      const res = await api.get('/contacts', { params });
      set({ contacts: res.data.contacts || res.data || [], isLoading: false, fetchError: '' });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load leads';
      set({ isLoading: false, fetchError: msg });
    }
  },

  selectPipeline: (p) => set({ selectedPipeline: p, selectedStage: p.stages?.[0] || '' }),
  selectStage: (s) => set({ selectedStage: s }),

  createContact: async (data) => {
    try {
      await api.post('/contacts', { ...data, type: 'LEAD' });
      get().fetchContacts();
      return null;
    } catch (err: any) {
      return err?.response?.data?.message || 'Failed to create lead';
    }
  },

  updateContact: async (id, data) => {
    try {
      await api.put(`/contacts/${id}`, data);
      get().fetchContacts();
      return null;
    } catch (err: any) {
      return err?.response?.data?.message || 'Failed to update lead';
    }
  },

  deleteContact: async (id) => {
    try {
      await api.delete(`/contacts/${id}`);
      get().fetchContacts();
      return null;
    } catch (err: any) {
      return err?.response?.data?.message || 'Failed to delete lead';
    }
  },
}));
