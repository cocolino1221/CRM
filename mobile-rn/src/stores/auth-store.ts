import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';
import { unregisterPushNotifications } from '../lib/push-notifications';
import type { User, AuthResponse } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithOAuthCode: (code: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

function getLoginErrorMessage(err: any): string {
  const status = Number(err?.response?.status || 0);
  const rawMessage = err?.response?.data?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.find((entry: unknown) => typeof entry === 'string') || ''
    : typeof rawMessage === 'string'
      ? rawMessage
      : '';

  if ((status === 400 || status === 401) && (!message || /bad request/i.test(message))) {
    return 'Invalid email or password.';
  }

  return message || 'Login failed';
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
      await AsyncStorage.setItem('user', JSON.stringify(user));
      if (accessToken) await AsyncStorage.setItem('accessToken', accessToken);
      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (err: any) {
      const msg = getLoginErrorMessage(err);
      set({ isLoading: false, error: msg });
      return false;
    }
  },

  loginWithOAuthCode: async (code) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<AuthResponse>('/auth/oauth/exchange', { code });
      const { user, accessToken, pendingApproval } = res.data;
      if (pendingApproval) {
        set({ isLoading: false, error: 'Your account is pending approval.' });
        return false;
      }
      await AsyncStorage.setItem('user', JSON.stringify(user));
      if (accessToken) await AsyncStorage.setItem('accessToken', accessToken);
      set({ user, isAuthenticated: true, isLoading: false });
      return true;
    } catch (err: any) {
      const rawMessage = err?.response?.data?.message;
      const message = Array.isArray(rawMessage)
        ? rawMessage.find((entry: unknown) => typeof entry === 'string') || ''
        : typeof rawMessage === 'string'
          ? rawMessage
          : '';
      const status = Number(err?.response?.status || 0);
      const oauthMessage =
        status === 401
          ? 'Google sign-in session expired. Please try again.'
          : message || 'Google sign-in failed';
      set({ isLoading: false, error: oauthMessage });
      return false;
    }
  },

  logout: async () => {
    await unregisterPushNotifications();
    try { await api.post('/auth/logout'); } catch {}
    await AsyncStorage.multiRemove(['user', 'accessToken']);
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const saved = await AsyncStorage.getItem('user');
      if (saved) {
        const user = JSON.parse(saved);
        set({ user, isAuthenticated: true });
      }
    } catch {}
  },
}));
