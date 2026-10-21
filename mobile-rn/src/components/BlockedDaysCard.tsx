import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { CalendarOff, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import api from '../lib/api';
import { useToastStore } from '../stores/toast-store';
import {
  MONTHS_RO,
  WEEKDAYS_SHORT_RO,
  addDays,
  blockWeek,
  copyWeek,
  formatBlockedDay,
  formatWeek,
  isPastDay,
  monthGrid,
  nextWeekend,
  toggleDay,
  toYmd,
  upcomingDays,
  weekDays,
  weekStartOf,
} from '../lib/blocked-days';

/**
 * Whole days off. Tap a day to block it, tap again to free it; each change is
 * saved at once, so a closer cannot forget to press Save before the weekend.
 */
export default function BlockedDaysCard() {
  const showToast = useToastStore((s) => s.show);
  const [days, setDays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  // The week the copy buttons act on: the one of the last day tapped.
  const [focusWeek, setFocusWeek] = useState(() => weekStartOf(toYmd(now)));

  useEffect(() => {
    api
      .get('/scheduling/blocked-days')
      .then((res) => setDays(Array.isArray(res.data?.days) ? res.data.days : []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(
    async (next: string[]) => {
      const before = days;
      setDays(next);
      setSaving(true);
      try {
        const res = await api.put('/scheduling/blocked-days', { days: next });
        setDays(Array.isArray(res.data?.days) ? res.data.days : next);
      } catch {
        setDays(before);
        showToast('Nu am putut salva zilele libere. Încearcă din nou.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [days, showToast],
  );

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();
  const weeks = monthGrid(cursor.year, cursor.month);
  const today = toYmd(now);
  const ahead = upcomingDays(days, now);

  return (
    <View className="rounded-2xl bg-white border border-slate-100 overflow-hidden mb-4">
      <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <CalendarOff size={16} color="#be123c" />
          <Text className="text-sm font-semibold text-slate-700">Zile libere</Text>
        </View>
        {saving ? <ActivityIndicator size="small" color="#0f766e" /> : null}
      </View>

      <Text className="px-4 pt-3 text-xs text-slate-500">
        Atinge o zi ca s-o blochezi. În zilele blocate nu te poate programa nimeni.
      </Text>

      {loading ? (
        <View className="py-8 items-center">
          <ActivityIndicator color="#0f766e" />
        </View>
      ) : (
        <View className="px-3 pt-3 pb-2">
          <View className="flex-row items-center justify-between mb-2 px-1">
            <TouchableOpacity
              onPress={() => shiftMonth(-1)}
              disabled={isCurrentMonth}
              className="w-8 h-8 items-center justify-center rounded-full"
              accessibilityLabel="Luna anterioară"
            >
              <ChevronLeft size={18} color={isCurrentMonth ? '#cbd5e1' : '#334155'} />
            </TouchableOpacity>
            <Text className="text-sm font-semibold text-slate-800 capitalize">
              {MONTHS_RO[cursor.month]} {cursor.year}
            </Text>
            <TouchableOpacity
              onPress={() => shiftMonth(1)}
              className="w-8 h-8 items-center justify-center rounded-full"
              accessibilityLabel="Luna următoare"
            >
              <ChevronRight size={18} color="#334155" />
            </TouchableOpacity>
          </View>

          <View className="flex-row">
            {WEEKDAYS_SHORT_RO.map((d) => (
              <Text key={d} className="flex-1 text-center text-[10px] font-semibold text-slate-400 mb-1">
                {d}
              </Text>
            ))}
          </View>

          {weeks.map((week, i) => (
            <View key={i} className="flex-row">
              {week.map((ymd, j) => {
                if (!ymd) return <View key={j} className="flex-1 h-10" />;
                const past = isPastDay(ymd, now);
                const blocked = days.includes(ymd);
                return (
                  <TouchableOpacity
                    key={ymd}
                    disabled={past || saving}
                    onPress={() => {
                      setFocusWeek(weekStartOf(ymd));
                      persist(toggleDay(days, ymd));
                    }}
                    className={`flex-1 h-10 items-center justify-center ${
                      weekStartOf(ymd) === focusWeek ? 'bg-slate-50' : ''
                    }`}
                    accessibilityLabel={`${formatBlockedDay(ymd)}${blocked ? ', blocată' : ''}`}
                  >
                    <View
                      className={`w-8 h-8 rounded-full items-center justify-center ${
                        blocked ? 'bg-rose-600' : ymd === today ? 'border border-teal-600' : ''
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          blocked
                            ? 'text-white font-bold'
                            : past
                              ? 'text-slate-300'
                              : j >= 5
                                ? 'text-slate-500'
                                : 'text-slate-800'
                        }`}
                      >
                        {Number(ymd.slice(8))}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* The week last tapped: block it all, or repeat it on the next weeks. */}
          <View className="mt-2 rounded-xl border border-slate-100 p-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-slate-700">Săptămâna {formatWeek(focusWeek)}</Text>
              <TouchableOpacity
                onPress={() => persist(blockWeek(days, focusWeek))}
                disabled={saving || weekDays(focusWeek).every((d) => days.includes(d) || isPastDay(d, now))}
                className="px-2.5 py-1 rounded-full bg-rose-600"
              >
                <Text className="text-[11px] font-semibold text-white">Blochează toată</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center gap-2 mt-2.5">
              <Text className="text-[11px] text-slate-500">Copiază pe următoarele:</Text>
              {[1, 2, 3].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => persist(copyWeek(days, focusWeek, n))}
                  disabled={saving}
                  className="px-3 py-1 rounded-full bg-slate-100"
                  accessibilityLabel={`Copiază săptămâna pe următoarele ${n}`}
                >
                  <Text className="text-[11px] font-semibold text-slate-700">{n} săpt.</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            onPress={() => persist(addDays(days, nextWeekend(now)))}
            disabled={saving || nextWeekend(now).every((d) => days.includes(d))}
            className="mt-2 py-2.5 rounded-xl bg-rose-50 items-center"
          >
            <Text className="text-xs font-semibold text-rose-700">Blochează weekendul următor</Text>
          </TouchableOpacity>
        </View>
      )}

      {ahead.length > 0 && (
        <View className="px-4 pb-3 pt-1 flex-row flex-wrap gap-2">
          {ahead.map((ymd) => (
            <TouchableOpacity
              key={ymd}
              onPress={() => persist(toggleDay(days, ymd))}
              disabled={saving}
              className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100"
              accessibilityLabel={`Deblochează ${formatBlockedDay(ymd)}`}
            >
              <Text className="text-xs text-rose-700">{formatBlockedDay(ymd)}</Text>
              <X size={12} color="#be123c" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
