import { create } from 'zustand';
import api from '@/lib/api';
import type { User, AuthResponse } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<AuthResponse>('/auth/login', { email, password });
      const { user, accessToken, pendingApproval } = res.data;
      if (pendingApproval) {
        set({ isLoading: false, error: 'Your account is pending approval.' });
        return false;
      }
      localStorage.setItem('user', JSON.stringify(user));
      if (accessToken) localStorage.setItem('accessToken', accessToken);
      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Login failed';
      set({ isLoading: false, error: msg });
      return false;
    }
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: () => {
    try {
      const saved = localStorage.getItem('user');
      if (saved) {
        const user = JSON.parse(saved);
        set({ user, isAuthenticated: true });
      }
    } catch {}
  },
}));
