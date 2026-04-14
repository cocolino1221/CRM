import { create } from 'zustand';
import api from '@/lib/api';
import type { User, AuthResponse } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithCode: (code: string) => Promise<boolean>;
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
      const raw = err?.response?.data?.message;
      // Normalize backend error messages to user-friendly text
      let msg = 'Email or password is incorrect';
      if (typeof raw === 'string') {
        const lower = raw.toLowerCase();
        if (lower.includes('suspended') || lower.includes('inactive')) {
          msg = 'This account has been suspended.';
        } else if (lower.includes('locked')) {
          msg = 'Account temporarily locked due to too many failed attempts.';
        } else if (lower.includes('pending')) {
          msg = 'Your account is pending approval.';
        }
        // Any other 401 (wrong pass, invalid credentials, refresh token errors) → generic message
      }
      set({ isLoading: false, error: msg });
      return false;
    }
  },

  loginWithCode: async (code) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<AuthResponse>('/auth/oauth/exchange', { code });
      const { user, accessToken } = res.data;
      localStorage.setItem('user', JSON.stringify(user));
      if (accessToken) localStorage.setItem('accessToken', accessToken);
      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Google authentication failed';
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
