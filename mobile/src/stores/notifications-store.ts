import { create } from 'zustand';
import api from '@/lib/api';
import type { Notification } from '@/types';

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get('/notifications');
      set({ notifications: res.data || [], isLoading: false });
    } catch {
      set({ isLoading: false });
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
        unreadCount: Math.max(0, s.unreadCount - 1),
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
