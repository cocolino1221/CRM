import { create } from 'zustand';
import api from '../lib/api';
import type { Notification } from '../types';

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchError: string;
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  fetchError: '',

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/notifications');
      const rows = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.notifications)
          ? res.data.notifications
          : [];
      const unreadCount = rows.filter((item: Notification) => !item.isRead).length;
      set({ notifications: rows, unreadCount, isLoading: false, fetchError: '' });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load notifications';
      set({ isLoading: false, fetchError: msg });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      set({ unreadCount: res.data.count || 0 });
    } catch {}
  },

  markAsRead: async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      set(s => ({
        notifications: s.notifications.map(n => n.id === id ? { ...n, isRead: true } : n),
        unreadCount: Math.max(0, s.notifications.filter(n => !n.isRead && n.id !== id).length),
      }));
    } catch {}
  },

  markAllAsRead: async () => {
    try {
      await api.post('/notifications/mark-all-read');
      set(s => ({
        notifications: s.notifications.map(n => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
    } catch {}
  },
}));
