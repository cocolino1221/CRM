import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { History, Video, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../lib/api';
import { PAST_STATUS_LABEL, pastStats, toPastBookings, type PastBooking } from '../lib/calendar-bookings';

const PERIODS = [
  { days: 7, label: '7 zile' },
  { days: 30, label: '30 zile' },
  { days: 90, label: '90 zile' },
];

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  confirmed: { bg: 'bg-amber-50', text: 'text-amber-700' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700' },
  no_show: { bg: 'bg-rose-50', text: 'text-rose-700' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-500' },
};

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

/**
 * Meetings already over: gone from the calendar, kept here with what became
 * of them. The server scopes the list — a closer sees their own.
 */
export default function PastBookingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [days, setDays] = useState(30);
  const [list, setList] = useState<PastBooking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    const now = new Date();
    api
      .get('/bookings', {
        params: { startDate: new Date(now.getTime() - days * 86_400_000).toISOString(), endDate: now.toISOString() },
      })
      .then((res) => alive && setList(toPastBookings(res.data, now)))
      .catch(() => alive && setList([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [visible, days]);

  const stats = pastStats(list);
  const tiles = [
    { label: 'Întâlniri', value: stats.held, hint: `${stats.online} pe Zoom/Meet` },
    { label: 'No-show', value: stats.noShow },
    { label: 'Anulate', value: stats.cancelled },
    { label: 'Nemarcate', value: stats.unmarked },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-slate-50 rounded-t-3xl max-h-[88%]" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="px-4 pt-4 pb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <History size={18} color="#334155" />
              <Text className="text-base font-bold text-slate-900">Programări trecute</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-full bg-white" accessibilityLabel="Închide">
              <X size={16} color="#334155" />
            </TouchableOpacity>
          </View>

          <View className="px-4 flex-row gap-2">
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.days}
                onPress={() => setDays(p.days)}
                className={`px-3 py-1.5 rounded-full ${days === p.days ? 'bg-slate-900' : 'bg-white border border-slate-200'}`}
              >
                <Text className={`text-xs font-semibold ${days === p.days ? 'text-white' : 'text-slate-600'}`}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="px-4 mt-3 flex-row flex-wrap gap-2">
            {tiles.map((t) => (
              <View key={t.label} className="flex-1 min-w-[45%] rounded-2xl bg-white border border-slate-100 px-3 py-2.5">
                <Text className="text-[11px] text-slate-500">{t.label}</Text>
                <Text className="text-xl font-bold text-slate-900">{t.value}</Text>
                {t.hint ? <Text className="text-[10px] text-slate-400">{t.hint}</Text> : null}
              </View>
            ))}
          </View>
          <Text className="px-4 mt-2 text-[11px] text-slate-400">
            Vânzările și ratele de închidere pe closer sunt în Rapoarte.
          </Text>

          {loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#0f766e" />
            </View>
          ) : list.length === 0 ? (
            <Text className="px-4 py-10 text-center text-sm text-slate-400">Nicio programare trecută în perioada aleasă.</Text>
          ) : (
            <ScrollView className="mt-3 px-4" contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {list.map((b) => {
                const style = STATUS_STYLE[b.status] ?? STATUS_STYLE.confirmed;
                return (
                  <View key={b.id} className="rounded-2xl bg-white border border-slate-100 px-3 py-2.5">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-sm font-semibold text-slate-900" numberOfLines={1}>
                        {b.leadName}
                      </Text>
                      <View className={`px-2 py-0.5 rounded-full ${style.bg}`}>
                        <Text className={`text-[10px] font-semibold ${style.text}`}>{PAST_STATUS_LABEL[b.status] ?? b.status}</Text>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-1.5 mt-1">
                      <Text className="text-xs text-slate-500">{when(b.startTime)}</Text>
                      {b.hostName ? <Text className="text-xs text-slate-400">· {b.hostName}</Text> : null}
                      {b.platform ? (
                        <View className="flex-row items-center gap-0.5 ml-1">
                          <Video size={11} color="#64748b" />
                          <Text className="text-[11px] text-slate-500">{b.platform}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
