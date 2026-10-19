import { create } from 'zustand';
import { buildContactQuery } from '../lib/lead-filters';
import { bookedContactIds } from '../lib/lead-stage';
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
  /** '' means every source. */
  source: string;
  setSource: (s: string) => void;
  /** The open tab — '' for every lead. */
  bucket: string;
  setBucket: (b: string) => void;
  /** Sets the lead's closer or caller; null clears it. */
  assignTeam: (id: string, change: { closerId?: string | null; callerId?: string | null }) => Promise<string | null>;
  /** 0-indexed; null means every month. */
  month: number | null;
  year: number;
  setMonth: (m: number | null) => void;
  setYear: (y: number) => void;
  page: number;
  total: number;
  hasMore: boolean;
  /** Contacts with an appointment ahead of them, for the row badge. */
  bookedIds: Set<string>;
  loadMore: () => Promise<void>;
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

/** The contacts endpoint has answered with three different shapes over time. */
function readContacts(data: any): { contacts: Contact[]; total: number } {
  const raw: unknown[] = Array.isArray(data?.contacts)
    ? data.contacts
    : Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [];
  const contacts = raw
    .map(normalizeContact)
    .filter((contact): contact is Contact => Boolean(contact));
  return {
    contacts,
    total: typeof data?.total === 'number' ? data.total : contacts.length,
  };
}

export const useLeadsStore = create<LeadsState>((set, get) => ({
  contacts: [],
  pipelines: [],
  users: [],
  selectedPipeline: null,
  selectedStage: '',
  isLoading: true,
  fetchError: '',
  search: '',
  source: '',
  bucket: '',
  month: null,
  year: new Date().getFullYear(),
  page: 1,
  total: 0,
  hasMore: false,
  bookedIds: new Set<string>(),

  setSearch: (s) => set({ search: s, page: 1 }),
  setSource: (s) => set({ source: s, page: 1 }),
  setBucket: (b) => set({ bucket: b, page: 1 }),
  setMonth: (m) => set({ month: m, page: 1 }),
  setYear: (y) => set({ year: y, page: 1 }),

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
    const { search, source, month, year, bucket } = get();
    set({ isLoading: true, page: 1 });
    try {
      // Deliberately unscoped by pipeline, exactly as on the web: a closer
      // must see every lead in the workspace, not the slice belonging to one
      // of several duplicate default pipelines. The screen used to load
      // nothing at all when no pipeline was selected.
      const params = buildContactQuery({ search, source, month, year, bucket, page: 1, limit: 100 });
      // The bookings queue rides along so each row can say whether the
      // person is booked. Fetched beside the page rather than added to the
      // contacts query, which would have meant a new entity in a module
      // whose metadata is delicate.
      const [res, bookedRes] = await Promise.allSettled([
        api.get('/contacts', { params }),
        api.get('/activities/queues/booked'),
      ]);

      if (res.status !== 'fulfilled') throw res.reason;

      const { contacts, total } = readContacts(res.value.data);
      set({
        contacts,
        total,
        hasMore: contacts.length < total,
        // A failed bookings call costs the badges, not the list.
        bookedIds:
          bookedRes.status === 'fulfilled'
            ? bookedContactIds(bookedRes.value.data?.data ?? bookedRes.value.data)
            : new Set<string>(),
        isLoading: false,
        fetchError: '',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load leads';
      set({ isLoading: false, fetchError: msg });
    }
  },

  loadMore: async () => {
    const { search, source, month, year, bucket, page, contacts, hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    const next = page + 1;
    try {
      const params = buildContactQuery({ search, source, month, year, bucket, page: next, limit: 100 });
      const res = await api.get('/contacts', { params });
      const { contacts: more, total } = readContacts(res.data);
      const merged = [...contacts, ...more];
      set({ contacts: merged, page: next, total, hasMore: merged.length < total });
    } catch {
      // A failed page must not empty the list the caller is already working.
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

  assignTeam: async (id, change) => {
    const before = get().contacts.find((c) => c.id === id);
    const pick = (userId: string | null | undefined) => {
      if (!userId) return null;
      const u = get().users.find((x) => x.id === userId);
      return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName } : null;
    };
    const patch: Partial<Contact> = {};
    if (change.closerId !== undefined) {
      patch.closerId = change.closerId;
      patch.closer = pick(change.closerId);
    }
    if (change.callerId !== undefined) {
      patch.callerId = change.callerId;
      patch.caller = pick(change.callerId);
    }
    // Shown at once: the tag is what the person just tapped.
    set({ contacts: get().contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    try {
      await api.put(`/pipelines/contacts/${id}`, change);
      return null;
    } catch (err: any) {
      if (before) set({ contacts: get().contacts.map((c) => (c.id === id ? before : c)) });
      return err?.response?.data?.message || 'Nu s-a putut salva.';
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
