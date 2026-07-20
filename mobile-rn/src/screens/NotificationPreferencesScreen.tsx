import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, CreditCard, MessageCircle, Moon, Phone, UserPlus, X, CheckSquare } from 'lucide-react-native';
import api from '../lib/api';
import { useToastStore } from '../stores/toast-store';

// Category keys must match the backend push gate exactly
// (backend/src/notifications/push-notification.service.ts).
type QuietHours = { enabled: boolean; start: string; end: string; timezone: string };
type Prefs = { push: Record<string, boolean>; quietHours?: QuietHours };

const GROUPS: { title: string; icon: any; color: string; items: { key: string; label: string }[] }[] = [
  {
    title: 'New leads',
    icon: UserPlus,
    color: '#0d9488',
    items: [
      { key: 'lead:typeform', label: 'From Typeform' },
      { key: 'lead:social', label: 'From social networks' },
      { key: 'lead:sheets', label: 'From Google Sheets' },
      { key: 'lead:manual', label: 'Added manually' },
    ],
  },
  {
    title: 'Payments & contracts',
    icon: CreditCard,
    color: '#7c3aed',
    items: [
      { key: 'payment:received', label: 'Payment received' },
      { key: 'payment:failed', label: 'Payment failed' },
      { key: 'payment:contract', label: 'Contract signed' },
    ],
  },
  {
    title: 'Messages',
    icon: MessageCircle,
    color: '#2563eb',
    items: [
      { key: 'message:whatsapp', label: 'WhatsApp' },
      { key: 'message:instagram', label: 'Instagram' },
      { key: 'message:facebook', label: 'Facebook Messenger' },
    ],
  },
  {
    title: 'Work',
    icon: CheckSquare,
    color: '#f59e0b',
    items: [
      { key: 'task', label: 'Tasks' },
      { key: 'call', label: 'Calls' },
    ],
  },
];

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export default function NotificationPreferencesScreen({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const showToast = useToastStore((s) => s.show);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [push, setPush] = useState<Record<string, boolean>>({});
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('08:00');

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bucharest',
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications/preferences');
      const data: Prefs = res.data || { push: {} };
      setPush(data.push || {});
      if (data.quietHours) {
        setQuietEnabled(!!data.quietHours.enabled);
        if (data.quietHours.start) setQuietStart(data.quietHours.start);
        if (data.quietHours.end) setQuietEnd(data.quietHours.end);
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Could not load notification settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  // Missing key = enabled (backend default); only explicit false mutes.
  const isOn = (key: string) => push[key] !== false;

  const toggle = async (key: string) => {
    const nextValue = !isOn(key);
    const previous = push;
    setPush({ ...push, [key]: nextValue }); // optimistic
    try {
      await api.put('/notifications/preferences', { push: { [key]: nextValue } });
    } catch {
      setPush(previous); // revert
      showToast('Could not save. Check your connection.', 'error');
    }
  };

  const saveQuietHours = async (enabled: boolean, start = quietStart, end = quietEnd) => {
    if (enabled && (!TIME_RE.test(start) || !TIME_RE.test(end))) {
      showToast('Use HH:MM format for quiet hours (e.g. 22:00).', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/notifications/preferences', {
        quietHours: { enabled, start, end, timezone },
      });
      setQuietEnabled(enabled);
    } catch (error: any) {
      showToast('Could not save quiet hours.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-50">
        <View className="px-4 pb-4 bg-slate-600 flex-row items-end justify-between" style={{ paddingTop: insets.top + 12 }}>
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-slate-300">Settings</Text>
            <Text className="text-2xl font-extrabold text-white">Notifications</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            className="h-10 w-10 rounded-2xl bg-white/15 items-center justify-center"
            activeOpacity={0.8}
          >
            <X size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#0f766e" />
            <Text className="mt-3 text-sm text-slate-500">Loading your preferences…</Text>
          </View>
        ) : (
          <ScrollView className="flex-1 px-4 py-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <View className="flex-row items-center gap-2 mb-1">
              <Bell size={14} color="#64748b" />
              <Text className="text-xs text-slate-500">
                Turn off any notification type you don't want. Changes save instantly.
              </Text>
            </View>

            {GROUPS.map((group) => (
              <View key={group.title} className="bg-white rounded-2xl mt-3 border border-slate-100 overflow-hidden">
                <View className="flex-row items-center gap-2 px-4 pt-3.5 pb-2">
                  <group.icon size={15} color={group.color} />
                  <Text className="text-[13px] font-bold text-slate-900">{group.title}</Text>
                </View>
                {group.items.map((item, idx) => (
                  <View
                    key={item.key}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      idx < group.items.length - 1 ? 'border-b border-slate-100' : ''
                    }`}
                  >
                    <Text className="text-sm text-slate-700">{item.label}</Text>
                    <Switch
                      value={isOn(item.key)}
                      onValueChange={() => void toggle(item.key)}
                      trackColor={{ false: '#cbd5e1', true: group.color }}
                      thumbColor="#ffffff"
                    />
                  </View>
                ))}
              </View>
            ))}

            {/* Quiet hours */}
            <View className="bg-white rounded-2xl mt-3 border border-slate-100 overflow-hidden">
              <View className="flex-row items-center justify-between px-4 py-3.5">
                <View className="flex-row items-center gap-2">
                  <Moon size={15} color="#475569" />
                  <View>
                    <Text className="text-[13px] font-bold text-slate-900">Quiet hours</Text>
                    <Text className="text-[11px] text-slate-500">No push during this window ({timezone})</Text>
                  </View>
                </View>
                <Switch
                  value={quietEnabled}
                  onValueChange={(value) => void saveQuietHours(value)}
                  trackColor={{ false: '#cbd5e1', true: '#475569' }}
                  thumbColor="#ffffff"
                  disabled={saving}
                />
              </View>
              {quietEnabled && (
                <View className="flex-row items-center gap-3 px-4 pb-4">
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold text-slate-500 mb-1">From</Text>
                    <TextInput
                      value={quietStart}
                      onChangeText={setQuietStart}
                      onBlur={() => void saveQuietHours(true)}
                      placeholder="22:00"
                      keyboardType="numbers-and-punctuation"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[11px] font-semibold text-slate-500 mb-1">Until</Text>
                    <TextInput
                      value={quietEnd}
                      onChangeText={setQuietEnd}
                      onBlur={() => void saveQuietHours(true)}
                      placeholder="08:00"
                      keyboardType="numbers-and-punctuation"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900"
                    />
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
