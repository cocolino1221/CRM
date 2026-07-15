import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LogOut, Shield, Bell, MessageCircle, Calendar, UserCog, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth-store';
import Avatar from '../components/Avatar';
import NotificationPreferencesScreen from './NotificationPreferencesScreen';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [showNotificationPrefs, setShowNotificationPrefs] = useState(false);

  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`.trim();

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-4 pb-4 bg-slate-600" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-[11px] uppercase tracking-widest text-slate-300">Account</Text>
        <Text className="text-2xl font-extrabold text-white">Settings</Text>
      </View>

      <View className="flex-1 px-4 py-4">
        {/* Profile card */}
        <View className="bg-white rounded-3xl p-5 flex-row items-center gap-4 shadow-sm border border-slate-100">
          <Avatar name={name} size="lg" />
          <View className="flex-1 min-w-0">
            <Text className="text-lg font-bold text-slate-900" numberOfLines={1}>{name}</Text>
            <Text className="text-sm text-slate-500" numberOfLines={1}>{user.email}</Text>
            <View className="flex-row items-center gap-1 mt-1.5 self-start bg-sky-100 px-2 py-0.5 rounded-full">
              <Shield size={12} color="#0369a1" />
              <Text className="text-[11px] font-semibold text-sky-700">{user.role}</Text>
            </View>
          </View>
        </View>

        {/* Settings list */}
        <View className="bg-white rounded-2xl mt-3 border border-slate-100 overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <View className="flex-row items-center gap-2">
              <UserCog size={16} color="#64748b" />
              <Text className="text-sm text-slate-700">Account</Text>
            </View>
            <Text className="text-xs text-slate-500">{user.email}</Text>
          </View>
          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <View className="flex-row items-center gap-2">
              <MessageCircle size={16} color="#14b8a6" />
              <Text className="text-sm text-slate-700">Messages hub</Text>
            </View>
            <Text className="text-xs font-semibold text-emerald-600">Connected</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowNotificationPrefs(true)}
            className="flex-row items-center justify-between px-4 py-3.5 border-b border-slate-100"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center gap-2">
              <Bell size={16} color="#f59e0b" />
              <Text className="text-sm text-slate-700">Push notifications</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-slate-500">Customize</Text>
              <ChevronRight size={14} color="#94a3b8" />
            </View>
          </TouchableOpacity>
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <View className="flex-row items-center gap-2">
              <Calendar size={16} color="#6366f1" />
              <Text className="text-sm text-slate-700">Calendar sync</Text>
            </View>
            <Text className="text-xs text-slate-500">Active</Text>
          </View>
        </View>

        <View className="bg-white rounded-2xl mt-3 border border-slate-100 overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <Text className="text-sm text-slate-700">Role</Text>
            <Text className="text-xs text-slate-500 capitalize">{user.role.toLowerCase().replace('_', ' ')}</Text>
          </View>
          <View className="flex-row items-center justify-between px-4 py-3.5">
            <Text className="text-sm text-slate-700">App Version</Text>
            <Text className="text-xs text-slate-500">1.0.0</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={logout}
          className="bg-white rounded-2xl mt-3 px-4 py-3.5 flex-row items-center justify-center gap-2 border border-slate-100"
          activeOpacity={0.7}
        >
          <LogOut size={16} color="#dc2626" />
          <Text className="text-sm font-semibold text-rose-600">Sign Out</Text>
        </TouchableOpacity>
      </View>

      <NotificationPreferencesScreen
        visible={showNotificationPrefs}
        onClose={() => setShowNotificationPrefs(false)}
      />
    </View>
  );
}
