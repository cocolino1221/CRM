import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AlarmClock } from 'lucide-react-native';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import { REMINDER_OPTIONS, currentReminderMinutes } from '../lib/reminder-lead';

/** How long before a meeting or a follow-up this person gets their push. */
export default function ReminderLeadSetting() {
  const user = useAuthStore((state) => state.user);
  const [value, setValue] = useState(() => currentReminderMinutes(user?.preferences));
  const [error, setError] = useState('');

  const choose = async (minutes: number) => {
    const before = value;
    setValue(minutes);
    setError('');
    try {
      await api.patch('/auth/me', { preferences: { reminderMinutesBefore: minutes } });
      const current = useAuthStore.getState().user;
      if (current) {
        useAuthStore.setState({
          user: { ...current, preferences: { ...(current.preferences ?? {}), reminderMinutesBefore: minutes } },
        });
      }
    } catch (err: any) {
      setValue(before);
      setError(err?.response?.data?.message || 'Nu s-a salvat. Încearcă din nou.');
    }
  };

  return (
    <View className="bg-white rounded-2xl mt-3 border border-slate-100 px-4 py-3.5">
      <View className="flex-row items-center gap-2">
        <AlarmClock size={16} color="#6366f1" />
        <Text className="text-sm text-slate-700">Memento înainte</Text>
      </View>
      <Text className="text-xs text-slate-500 mt-1">
        Push înainte de întâlnirile tale și de revenirile puse pe numele tău.
      </Text>
      <View className="flex-row flex-wrap gap-2 mt-3">
        {REMINDER_OPTIONS.map((o) => {
          const on = value === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => void choose(o.value)}
              className={`rounded-full border px-3.5 py-2 ${on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}
            >
              <Text className={`text-sm ${on ? 'text-indigo-800 font-semibold' : 'text-slate-700'}`}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <Text className="text-xs text-rose-600 mt-2">{error}</Text> : null}
    </View>
  );
}
