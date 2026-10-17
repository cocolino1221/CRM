import { create } from 'zustand';
import api from '../lib/api';
import type { Contact, Pipeline, User } from '../types';

interface LeadsState {
  contacts: Contact[];
  pipelines: Pipeline[];
  users: User[];
  selectedPipeline: Pipeline | null;
  selectedStage: string;
  isLoading: boolean;
  fetchError: string;
  search: string;
  setSearch: (s: string) => void;
  fetchPipelines: () => Promise<void>;
  fetchContacts: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  selectPipeline: (p: Pipeline) => void;
  selectStage: (s: string) => void;
  createContact: (data: Partial<Contact>) => Promise<string | null>;
  updateContact: (id: string, data: Partial<Contact>) => Promise<string | null>;
  deleteContact: (id: string) => Promise<string | null>;
  assignContact: (id: string, ownerId: string) => Promise<string | null>;
}

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
};

const asStageName = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (value && typeof value === 'object' && 'name' in value) {
    const maybeName = (value as { name?: unknown }).name;
    return asText(maybeName);
  }
  return undefined;
};

const normalizeContact = (raw: unknown): Contact | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = asText(value.id);
  if (!id) return null;

  return {
    ...(value as unknown as Partial<Contact>),
    id,
    firstName: asText(value.firstName) || 'Lead',
    lastName: asText(value.lastName) || '',
    email: asText(value.email),
    phone: asText(value.phone),
    pipelineStage: asStageName(value.pipelineStage),
    createdAt: asText(value.createdAt) || new Date().toISOString(),
    status: asText(value.status) || 'NEW',
  };
};

export const useLeadsStore = create<LeadsState>((set, get) => ({
  contacts: [],
  pipelines: [],
  users: [],
  selectedPipeline: null,
  selectedStage: '',
  isLoading: true,
  fetchError: '',
  search: '',

  setSearch: (s) => set({ search: s }),

  fetchPipelines: async () => {
    try {
      const res = await api.get('/pipelines');
      const pipelines: Pipeline[] = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.pipelines)
          ? res.data.pipelines
          : [];
      const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0] || null;
      // Keep the user's pick across refreshes; only fall back if it was deleted.
      const current = get().selectedPipeline;
      const kept = current ? pipelines.find(p => p.id === current.id) || null : null;
      set({
        pipelines,
        selectedPipeline: kept || defaultPipeline,
        selectedStage: kept && (get().selectedStage === 'All' || (kept.stages || []).some((st: any) => (typeof st === 'string' ? st : st?.name) === get().selectedStage))
          ? get().selectedStage
          : 'All',
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
    set({ isLoading: true });
    try {
      const params: any = { pipelineId: selectedPipeline.id, limit: 200, page: 1 };
      if (search) params.search = search;
      const res = await api.get('/contacts', { params });
      const rawContacts: unknown[] = Array.isArray(res.data?.contacts)
        ? res.data.contacts
        : Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
      const contacts = rawContacts
        .map(normalizeContact)
        .filter((contact): contact is Contact => Boolean(contact));
      set({ contacts, isLoading: false, fetchError: '' });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load leads';
      set({ isLoading: false, fetchError: msg });
    }
  },

  selectPipeline: (p) => set({ selectedPipeline: p, selectedStage: 'All' }),
  selectStage: (s) => set({ selectedStage: s }),

  fetchUsers: async () => {
    try {
      const res = await api.get('/users');
      const users: User[] = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.users)
          ? res.data.users
          : [];
      set({ users });
    } catch {
      // silently fail - users list is non-critical
    }
  },

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

  assignContact: async (id, ownerId) => {
    try {
      await api.put(`/contacts/${id}`, { ownerId });
      get().fetchContacts();
      return null;
    } catch (err: any) {
      return err?.response?.data?.message || 'Failed to assign lead';
    }
  },
}));
