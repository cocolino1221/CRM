import { create } from 'zustand';
import api from '../lib/api';
import type { Document } from '../types';

interface DocumentsState {
  documents: Document[];
  isLoading: boolean;
  fetchError: string;
  fetchDocuments: () => Promise<void>;
}

export const useDocumentsStore = create<DocumentsState>((set) => ({
  documents: [],
  isLoading: false,
  fetchError: '',

  fetchDocuments: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/documents?limit=100');
      const rows = Array.isArray(res.data?.documents)
        ? res.data.documents
        : Array.isArray(res.data)
          ? res.data
          : [];
      set({ documents: rows, isLoading: false, fetchError: '' });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load documents';
      set({ isLoading: false, fetchError: msg });
    }
  },
}));
