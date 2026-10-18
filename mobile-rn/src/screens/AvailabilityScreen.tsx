import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CalendarClock, ChevronLeft, Copy, Eraser, Info } from 'lucide-react-native';
import api from '../lib/api';
import { useToastStore } from '../stores/toast-store';
import {
  SLOT_INTERVALS,
  WEEKDAYS,
  buildMeetingSlug,
  cellState,
  defaultWeek,
  emptyWeek,
  planAvailabilityChanges,
  randomSuffix,
  unitsToIntervals,
  weekFromRows,
  type SlotInterval,
  type WeekUnits,
  type Weekday,
} from '../lib/booking-settings';
import {
  DAY_END,
  DAY_START,
  cellLabel,
  cellStarts,
  clearDay,
  copyDayToWorkdays,
  daySummary,
  needsFullDay,
  toggleCell,
  validateMeeting,
  weekHours,
} from '../lib/availability-editor';

type AvailabilityRow = { id: string; dayOfWeek: Weekday; startTime: string; endTime: string };
type MeetingTypeRow = { id: string; name: string; duration: number; slotInterval?: number };

const DURATIONS = [15, 30, 45, 60, 90];

/** The day of the week today is, so the screen opens where the closer lives. */
const todayWeekday = (): Weekday => {
  const index = new Date().getDay();
  return (WEEKDAYS[(index + 6) % 7]?.value ?? 'monday') as Weekday;
};

/**
 * A closer's own hours, set from the phone.
 *
 * Until this screen existed, availability could only be typed on the web
 * dashboard — so anyone working from a phone could not say when they were
 * free, and therefore never appeared as a host anywhere in the app.
 *
 * The rules are shared with the web grid (lib/booking-settings), so a week
 * typed here and a week typed there mean the same thing; only the editing —
 * one day at a time, by tap — is shaped for a phone.
 */
export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const showToast = useToastStore((s) => s.show);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [existing, setExisting] = useState<AvailabilityRow[]>([]);
  const [week, setWeek] = useState<WeekUnits>(emptyWeek);
  const [meeting, setMeeting] = useState<MeetingTypeRow | null>(null);
  const [meetingName, setMeetingName] = useState('Consultație');
  const [duration, setDuration] = useState(30);
  const [step, setStep] = useState<SlotInterval>(30);

  const [day, setDay] = useState<Weekday>(todayWeekday);
  const [fullDay, setFullDay] = useState(false);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bucharest',
    [],
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const [availabilityRes, meetingRes] = await Promise.all([
        api.get<AvailabilityRow[]>('/scheduling/availability'),
        api.get<MeetingTypeRow[]>('/scheduling/meeting-types'),
      ]);

      const rows = Array.isArray(availabilityRes.data) ? availabilityRes.data : [];
      setExisting(rows);
      // Nine to five is a suggestion for someone who has never set hours; a
      // closer who has must see their own week, empty days included.
      const loaded = rows.length > 0 ? weekFromRows(rows) : defaultWeek();
      setWeek(loaded);
      if (needsFullDay(loaded)) setFullDay(true);

      const first = Array.isArray(meetingRes.data) ? meetingRes.data[0] : null;
      if (first) {
        setMeeting(first);
        setMeetingName(first.name || 'Consultație');
        setDuration(Number(first.duration) || 30);
        const interval = Number(first.slotInterval);
        if ((SLOT_INTERVALS as readonly number[]).includes(interval)) setStep(interval as SlotInterval);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu am putut încărca programul.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  const starts = useMemo(
    () => cellStarts(step, fullDay ? 0 : DAY_START, fullDay ? 24 * 60 : DAY_END),
    [step, fullDay],
  );

  const plan = useMemo(() => planAvailabilityChanges(existing, week), [existing, week]);
  const meetingChanged =
    !meeting ||
    meeting.name !== meetingName.trim() ||
    Number(meeting.duration) !== duration ||
    Number(meeting.slotInterval ?? 15) !== step;
  const dirty = plan.create.length > 0 || plan.remove.length > 0 || meetingChanged;
  const invalid = validateMeeting(meetingName, duration);
  const hours = weekHours(week);

  const save = async () => {
    if (invalid) {
      showToast(invalid, 'error');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // The meeting type first: hours with nothing bookable on top of them
      // leave the closer invisible in the app, and this is the call most
      // likely to be refused.
      const payload = { name: meetingName.trim(), duration, slotInterval: step };
      if (meeting) {
        await api.put(`/scheduling/meeting-types/${meeting.id}`, payload);
      } else {
        await api.post('/scheduling/meeting-types', {
          ...payload,
          // The slug column is unique across every workspace, so it is minted
          // here with a suffix rather than left to collide.
          slug: buildMeetingSlug(meetingName, randomSuffix()),
          isActive: true,
          // Team slots only read meeting types that are public; without this
          // the hours save and the closer still never shows up as free.
          isPublic: true,
        });
      }

      // New windows before the old ones go, so a failure halfway leaves the
      // closer bookable rather than with an empty week.
      for (const row of plan.create) {
        await api.post('/scheduling/availability', { ...row, timezone });
      }
      for (const id of plan.remove) {
        await api.delete(`/scheduling/availability/${id}`);
      }

      await load();
      showToast('Program salvat', 'success');
    } catch (err: any) {
      const message = err?.response?.data?.message;
      const text = Array.isArray(message) ? message.join(' ') : message;
      setError(text || 'Salvarea a eșuat.');
      showToast(text || 'Salvarea a eșuat.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = WEEKDAYS.find((d) => d.value === day)?.label ?? '';

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pb-4 bg-teal-800" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-9 h-9 rounded-full bg-white/15 items-center justify-center"
          >
            <ChevronLeft size={20} color="#ffffff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-[11px] uppercase tracking-widest text-teal-200">Programul meu</Text>
            <Text className="text-2xl font-extrabold text-white">Disponibilitate</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{hours}h / săpt.</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0f766e" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 96 }}
        >
          {error ? (
            <View className="mb-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
              <Text className="text-sm text-rose-700">{error}</Text>
            </View>
          ) : null}

          {hours === 0 ? (
            <View className="mb-3 flex-row items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-100">
              <Info size={18} color="#b45309" />
              <Text className="flex-1 text-xs text-amber-800">
                Cât timp nu ai nicio oră bifată nu apari ca disponibil și nu poți fi ales la
                programarea unui lead.
              </Text>
            </View>
          ) : null}

          {/* ---------- meeting type ---------- */}
          <View className="mb-3 p-4 rounded-2xl bg-white border border-slate-100">
            <Text className="text-sm font-semibold text-slate-700 mb-2">Tipul întâlnirii</Text>
            <TextInput
              value={meetingName}
              onChangeText={setMeetingName}
              placeholder="Consultație"
              placeholderTextColor="#94a3b8"
              className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
            />

            <Text className="text-xs text-slate-500 mt-3 mb-1.5">Durata întâlnirii</Text>
            <View className="flex-row flex-wrap gap-2">
              {DURATIONS.map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setDuration(value)}
                  className={`px-3 py-1.5 rounded-full border ${
                    duration === value
                      ? 'bg-teal-600 border-teal-600'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      duration === value ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    {value} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-xs text-slate-500 mt-3 mb-1.5">
              Din cât în cât se pot alege orele
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {SLOT_INTERVALS.map((value) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setStep(value)}
                  className={`px-3 py-1.5 rounded-full border ${
                    step === value ? 'bg-teal-600 border-teal-600' : 'bg-white border-slate-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      step === value ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    {value} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ---------- day picker ---------- */}
          <View className="mb-3 flex-row flex-wrap gap-2">
            {WEEKDAYS.map(({ value, label }) => {
              const busy = week[value].size > 0;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => setDay(value)}
                  className={`px-3 py-2 rounded-xl border flex-row items-center gap-1.5 ${
                    day === value ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      day === value ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    {label.slice(0, 3)}
                  </Text>
                  <View
                    className={`w-1.5 h-1.5 rounded-full ${
                      busy ? 'bg-emerald-400' : day === value ? 'bg-white/30' : 'bg-slate-200'
                    }`}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ---------- the day being edited ---------- */}
          <View className="mb-3 rounded-2xl bg-white border border-slate-100 overflow-hidden">
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-bold text-slate-900">{dayLabel}</Text>
                <Text className="text-xs text-slate-500 mt-0.5">{daySummary(week[day])}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setWeek((prev) => clearDay(prev, day))}
                className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-50 border border-slate-200"
              >
                <Eraser size={14} color="#64748b" />
                <Text className="text-[11px] font-semibold text-slate-600">Golește</Text>
              </TouchableOpacity>
            </View>

            <View className="px-4 py-2.5 flex-row items-center justify-between border-b border-slate-100">
              <Text className="text-xs text-slate-600">Arată toată ziua (00:00–24:00)</Text>
              <Switch
                value={fullDay}
                onValueChange={setFullDay}
                trackColor={{ true: '#0f766e', false: '#cbd5e1' }}
                thumbColor="#ffffff"
              />
            </View>

            <View className="p-3 flex-row flex-wrap gap-2">
              {starts.map((start) => {
                const state = cellState(week[day], start, step);
                return (
                  <TouchableOpacity
                    key={start}
                    onPress={() => setWeek((prev) => toggleCell(prev, day, start, step))}
                    className={`px-3 py-2 rounded-xl border ${
                      state === 'all'
                        ? 'bg-emerald-600 border-emerald-600'
                        : state === 'some'
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-white border-slate-200'
                    }`}
                    style={{ minWidth: 72 }}
                  >
                    <Text
                      className={`text-xs font-semibold text-center ${
                        state === 'all'
                          ? 'text-white'
                          : state === 'some'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {cellLabel(start)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setWeek((prev) => copyDayToWorkdays(prev, day))}
              className="mx-3 mb-3 flex-row items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
            >
              <Copy size={14} color="#0f766e" />
              <Text className="text-xs font-semibold text-teal-700">
                Copiază {dayLabel} pe Luni–Vineri
              </Text>
            </TouchableOpacity>
          </View>

          {/* ---------- the week at a glance ---------- */}
          <View className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
            <Text className="px-4 py-3 text-sm font-semibold text-slate-700 border-b border-slate-100">
              Săptămâna
            </Text>
            {WEEKDAYS.map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                onPress={() => setDay(value)}
                className="px-4 py-2.5 flex-row items-center justify-between border-b border-slate-50"
              >
                <Text className="text-xs font-semibold text-slate-600 w-20">{label}</Text>
                <Text className="flex-1 text-xs text-slate-500 text-right" numberOfLines={1}>
                  {daySummary(week[value])}
                </Text>
              </TouchableOpacity>
            ))}
            <View className="px-4 py-2.5 flex-row items-center justify-between bg-slate-50">
              <Text className="text-xs text-slate-500">
                {WEEKDAYS.reduce((n, { value }) => n + unitsToIntervals(week[value]).length, 0)}{' '}
                intervale
              </Text>
              <Text className="text-xs font-semibold text-slate-700">{hours} ore</Text>
            </View>
          </View>
        </ScrollView>
      )}

      <View
        className="px-3 pt-3 bg-white border-t border-slate-100"
        style={{ paddingBottom: insets.bottom + 10 }}
      >
        <TouchableOpacity
          onPress={save}
          disabled={saving || !dirty || !!invalid}
          className={`flex-row items-center justify-center gap-2 py-3 rounded-2xl ${
            saving || !dirty || invalid ? 'bg-slate-200' : 'bg-teal-700'
          }`}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <CalendarClock size={16} color={!dirty || invalid ? '#64748b' : '#ffffff'} />
          )}
          <Text
            className={`text-sm font-bold ${!dirty || invalid ? 'text-slate-500' : 'text-white'}`}
          >
            {saving ? 'Se salvează…' : dirty ? 'Salvează programul' : 'Salvat'}
          </Text>
        </TouchableOpacity>
        {invalid ? (
          <Text className="mt-2 text-center text-[11px] text-rose-600">{invalid}</Text>
        ) : null}
      </View>
    </View>
  );
}
