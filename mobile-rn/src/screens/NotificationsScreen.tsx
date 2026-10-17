import { useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { Bell, MessageCircle, Users, Calendar, CheckCircle, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotificationsStore } from '../stores/notifications-store';
import type { Notification } from '../types';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getIcon(type: string) {
  const size = 20;
  const normalized = String(type || '').trim().toLowerCase();
  switch (normalized) {
    case 'whatsapp': return <MessageCircle size={size} color="#14b8a6" />;
    case 'lead': return <Users size={size} color="#0284c7" />;
    case 'meeting': return <Calendar size={size} color="#6366f1" />;
    case 'task': return <CheckCircle size={size} color="#f59e0b" />;
    default: return <Bell size={size} color="#94a3b8" />;
  }
}

function isPaymentFailed(notification: Notification): boolean {
  const raw = `${notification.title} ${notification.message}`.toLowerCase();
  return raw.includes('plata esuata') || raw.includes('nu a platit') || raw.includes('failed') || raw.includes('insuficiente');
}

function isPaymentSuccess(notification: Notification): boolean {
  const raw = `${notification.title} ${notification.message}`.toLowerCase();
  return raw.includes('plata confirmata') || raw.includes('a platit') || raw.includes('paid');
}

export default function NotificationsScreen() {
  const {
    notifications, isLoading, fetchError, fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead,
  } = useNotificationsStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    const iv = setInterval(() => {
      fetchNotifications();
      fetchUnreadCount();
    }, 20000);
    return () => clearInterval(iv);
  }, [fetchNotifications, fetchUnreadCount]);

  const unread = notifications.filter(n => !n.isRead).length;
  const onRefresh = useCallback(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  const renderItem = ({ item: n }: { item: Notification }) => {
    const icon = isPaymentFailed(n)
      ? <AlertTriangle size={20} color="#dc2626" />
      : isPaymentSuccess(n)
        ? <CheckCircle size={20} color="#16a34a" />
        : getIcon(n.type);

    return (
    <TouchableOpacity
      onPress={() => { if (!n.isRead) markAsRead(n.id); }}
      className={`bg-white/90 border rounded-2xl p-3.5 mb-2.5 flex-row items-start gap-3 ${
        !n.isRead ? 'border-sky-200' : 'border-slate-100'
      }`}
      activeOpacity={0.7}
    >
      <View className="mt-0.5">{icon}</View>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-start justify-between">
          <Text className={`text-sm flex-1 ${!n.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'}`} numberOfLines={1}>
            {n.title}
          </Text>
          {!n.isRead && (
            <View className="h-2 w-2 bg-sky-500 rounded-full ml-2 mt-1.5" />
          )}
        </View>
        <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={2}>{n.message}</Text>
        <Text className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</Text>
      </View>
    </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-4 pb-4 bg-slate-700" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-slate-300">Activity</Text>
            <Text className="text-2xl font-extrabold text-white">Notifications</Text>
          </View>
          {unread > 0 && (
            <TouchableOpacity onPress={markAllAsRead} className="px-3 py-1.5 rounded-full border border-white/30 bg-white/10">
              <Text className="text-xs font-semibold text-white">Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>
        <View className="mt-3">
          <View className="self-start bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{unread} unread</Text>
          </View>
        </View>
      </View>

      {/* Error */}
      {fetchError && !isLoading && (
        <View className="mx-3 mt-3 flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff size={20} color="#f87171" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-rose-700">Connection error</Text>
            <Text className="text-xs text-rose-500 mt-0.5" numberOfLines={1}>{fetchError}</Text>
          </View>
          <TouchableOpacity onPress={fetchNotifications} className="p-2 rounded-lg bg-rose-100">
            <RefreshCw size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#475569" />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-20">
              <View className="h-14 w-14 rounded-2xl bg-white border border-slate-200 items-center justify-center">
                <Bell size={28} color="#94a3b8" />
              </View>
              <Text className="text-sm font-medium text-slate-500 mt-3">No notifications</Text>
              <Text className="text-xs text-slate-400 mt-1">You are all caught up.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
