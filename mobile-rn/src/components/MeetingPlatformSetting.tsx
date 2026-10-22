import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Video } from 'lucide-react-native';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth-store';

/**
 * "Platforma mea de întâlniri" — which link a closer's bookings get.
 *
 * The same setting as the one on the web's Disponibilitate page, saved on the
 * same user preference, so a closer who lives on the phone does not have to
 * open a laptop to change it. Whoever books can still pick another platform
 * for a single meeting; this is only the default.
 */

type Provider = 'google_meet' | 'zoom' | 'none';

interface ProvidersInfo {
  google_meet: boolean;
  zoom: boolean;
  preference: Provider | null;
}

const OPTIONS: Array<{ value: Provider | ''; label: string }> = [
  { value: '', label: 'Automat' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'none', label: 'Fără link' },
];

export default function MeetingPlatformSetting() {
  const [info, setInfo] = useState<ProvidersInfo | null>(null);
  const [value, setValue] = useState<Provider | ''>('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<ProvidersInfo>('/bookings/meeting-providers')
      .then((res) => {
        if (cancelled) return;
        setInfo(res.data);
        setValue(res.data.preference ?? '');
      })
      .catch(() => {
        if (!cancelled) setError('Nu s-au putut încărca platformele.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (next: Provider | '') => {
    const before = value;
    setValue(next);
    setError('');
    try {
      await api.patch('/auth/me', { preferences: { meetingProvider: next || null } });
      // The store is what the rest of the app reads; leaving it stale would
      // show the old platform until the next sign-in.
      const current = useAuthStore.getState().user;
      if (current) {
        useAuthStore.setState({
          user: {
            ...current,
            preferences: { ...(current.preferences ?? {}), meetingProvider: next || null },
          },
        });
      }
    } catch (err: any) {
      setValue(before);
      setError(err?.response?.data?.message || 'Nu s-a salvat. Încearcă din nou.');
    }
  };

  /** A platform nobody connected cannot be chosen, but it is still shown. */
  const unavailable = (option: Provider | '') =>
    (option === 'google_meet' && info !== null && !info.google_meet) ||
    (option === 'zoom' && info !== null && !info.zoom);

  return (
    <View className="bg-white rounded-2xl mt-3 border border-slate-100 px-4 py-3.5">
      <View className="flex-row items-center gap-2">
        <Video size={16} color="#6366f1" />
        <Text className="text-sm text-slate-700">Platforma mea de întâlniri</Text>
      </View>
      <Text className="text-xs text-slate-500 mt-1">
        La fiecare programare cu tine se creează un link și se trimite pe email ție și leadului.
      </Text>

      {info === null && !error ? (
        <View className="py-3">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {OPTIONS.map((o) => {
            const off = unavailable(o.value);
            const on = value === o.value;
            return (
              <TouchableOpacity
                key={o.value || 'auto'}
                disabled={off}
                onPress={() => void choose(o.value)}
                className={`rounded-full border px-3.5 py-2 ${
                  on ? 'border-indigo-500 bg-indigo-50' : off ? 'border-slate-200 bg-slate-50' : 'border-gray-300'
                }`}
              >
                <Text
                  className={`text-sm ${
                    on ? 'text-indigo-800 font-semibold' : off ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {o.label}
                  {off ? ' · neconectat' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {error ? <Text className="text-xs text-rose-600 mt-2">{error}</Text> : null}
    </View>
  );
}
