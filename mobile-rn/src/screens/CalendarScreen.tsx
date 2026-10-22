import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRoute } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, FlatList, RefreshControl,
  ActivityIndicator, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Linking, Alert,
} from 'react-native';
import {
  Calendar, ChevronLeft, ChevronRight, CheckCircle, Clock,
  AlertTriangle, Plus, X, Video, User, Phone, History,
} from 'lucide-react-native';
import { toCalendarBookings, type CalendarBooking } from '../lib/calendar-bookings';
import PastBookingsSheet from '../components/PastBookingsSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../lib/api';
import { useToastStore } from '../stores/toast-store';

type CalendarTask = {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  priority: string;
  type: string;
  assignee: { id: string; name: string } | null;
};

const TASK_TYPES = ['call', 'email', 'meeting', 'follow_up', 'demo', 'proposal', 'other'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
function formatDayLabel(date: Date) {
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

type DayGroup = { day: Date; items: CalendarTask[] };

const asText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') return String(value);
  return null;
};

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeTask = (raw: unknown): CalendarTask | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = asText(value.id);
  if (!id) return null;

  return {
    id,
    title: asText(value.title) || 'Untitled task',
    dueDate: asText(value.dueDate),
    status: asText(value.status) || 'pending',
    priority: asText(value.priority) || 'medium',
    type: asText(value.type) || 'other',
    assignee: value.assignee && typeof value.assignee === 'object'
      ? {
          id: asText((value.assignee as { id?: unknown }).id) || '',
          name: asText((value.assignee as { name?: unknown }).name) || '',
        }
      : null,
  };
};

export default function CalendarScreen() {
  const [monthDate, setMonthDate] = useState(new Date());
  // Opened from a notification about one booking: go to its month and mark it.
  const route = useRoute<any>();
  const focusBookingId: string | undefined = route.params?.focusBookingId;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const listRef = useRef<FlatList<any>>(null);
  useEffect(() => {
    if (!focusBookingId) return;
    let alive = true;
    const now = Date.now();
    api
      .get('/bookings', {
        params: {
          startDate: new Date(now - 120 * 86_400_000).toISOString(),
          endDate: new Date(now + 365 * 86_400_000).toISOString(),
        },
      })
      .then((res) => {
        const rows = Array.isArray(res.data) ? res.data : [];
        const found = rows.find((r: any) => r?.id === focusBookingId);
        if (!alive || !found?.startTime) return;
        setMonthDate(new Date(found.startTime));
        setFocusedId(focusBookingId);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [focusBookingId]);
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const insets = useSafeAreaInsets();
  const toast = useToastStore();

  // New task form state
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<string>('other');
  const [formPriority, setFormPriority] = useState<string>('medium');
  const [formDueDate, setFormDueDate] = useState('');
  const [formDueTime, setFormDueTime] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormType('other');
    setFormPriority('medium');
    setFormDueDate('');
    setFormDueTime('');
  };

  const openForm = () => {
    resetForm();
    // Pre-fill with today's date
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setFormDueDate(`${yyyy}-${mm}-${dd}`);
    setFormDueTime('09:00');
    setShowForm(true);
  };

  const saveTask = async () => {
    if (!formTitle.trim()) {
      toast.show('Title is required', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const dueDate = formDueDate && formDueTime
        ? new Date(`${formDueDate}T${formDueTime}:00`).toISOString()
        : formDueDate
          ? new Date(`${formDueDate}T09:00:00`).toISOString()
          : undefined;

      await api.post('/tasks', {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        type: formType,
        priority: formPriority,
        dueDate,
      });
      toast.show('Task created', 'success');
      setShowForm(false);
      loadMonth(monthDate);
    } catch (err: any) {
      toast.show(err?.response?.data?.message || 'Failed to create task', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * A reminder that is done, or should never have been there (a duplicate),
   * leaves the calendar from here. The server lets each person delete only
   * their own; whoever runs the team, any.
   */
  const taskActions = (task: CalendarTask) => {
    const drop = () => setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const failed = (err: any) =>
      toast.show(err?.response?.data?.message || 'Nu s-a putut salva.', 'error');
    Alert.alert(task.title, 'Ce faci cu acest task?', [
      {
        text: 'Făcut',
        onPress: () =>
          api
            .patch(`/tasks/${task.id}/complete`)
            .then(() => {
              drop();
              toast.show('Marcat ca făcut', 'success');
            })
            .catch(failed),
      },
      {
        text: 'Șterge',
        style: 'destructive',
        onPress: () =>
          api
            .delete(`/tasks/${task.id}`)
            .then(() => {
              drop();
              toast.show('Task șters', 'success');
            })
            .catch(failed),
      },
      { text: 'Renunță', style: 'cancel' },
    ]);
  };

  const loadMonth = async (refDate: Date) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await api.get('/tasks/calendar', {
        params: {
          startDate: startOfMonth(refDate).toISOString(),
          endDate: endOfMonth(refDate).toISOString(),
        },
      });
      const rawTasks: unknown[] = Array.isArray(res.data?.tasks)
        ? res.data.tasks
        : Array.isArray(res.data)
          ? res.data
          : [];
      const nextTasks = rawTasks
        .map(normalizeTask)
        .filter((task): task is CalendarTask => Boolean(task));
      setTasks(nextTasks);
      // Bookings are their own table. A failure here must not hide the tasks.
      try {
        const bookingRes = await api.get('/bookings', {
          params: {
            startDate: startOfMonth(refDate).toISOString(),
            endDate: endOfMonth(refDate).toISOString(),
          },
        });
        // Meetings already over leave the diary; they live under "Trecute".
        setBookings(toCalendarBookings(bookingRes.data, new Date()));
      } catch {
        setBookings([]);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadMonth(monthDate); }, [monthDate]);

  const groupedTasks: DayGroup[] = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    tasks.forEach(task => {
      const dueDate = parseDate(task.dueDate);
      if (!dueDate) return;
      const key = dueDate.toDateString();
      const prev = map.get(key) || [];
      prev.push(task);
      map.set(key, prev);
    });
    // A day with only a booking still needs its header.
    bookings.forEach(booking => {
      const key = new Date(booking.startTime).toDateString();
      if (!map.has(key)) map.set(key, []);
    });
    return Array.from(map.entries())
      .map(([dayKey, dayTasks]) => ({ day: new Date(dayKey), items: dayTasks }))
      .sort((a, b) => a.day.getTime() - b.day.getTime());
  }, [tasks, bookings]);

  const pendingCount = tasks.filter(t => t.status !== 'completed').length;
  const onRefresh = useCallback(() => { loadMonth(monthDate); }, [monthDate]);

  type FlatItem =
    | { type: 'dayHeader'; day: Date; key: string }
    | { type: 'task'; task: CalendarTask; key: string }
    | { type: 'booking'; booking: CalendarBooking; key: string };
  const flatItems: FlatItem[] = [];
  for (const g of groupedTasks) {
    flatItems.push({ type: 'dayHeader', day: g.day, key: `day-${g.day.getTime()}` });
    const dayKey = g.day.toDateString();
    for (const b of bookings) {
      if (new Date(b.startTime).toDateString() === dayKey) {
        flatItems.push({ type: 'booking', booking: b, key: `booking-${b.id}` });
      }
    }
    for (const t of g.items) {
      flatItems.push({ type: 'task', task: t, key: t.id });
    }
  }

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-4 pb-4 bg-indigo-800" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-indigo-200">Schedule</Text>
            <Text className="text-2xl font-extrabold text-white">Calendar</Text>
          </View>
          <TouchableOpacity
            onPress={openForm}
            className="p-2 rounded-xl bg-white/18 border border-white/25"
          >
            <Plus size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center justify-between mt-3">
          <TouchableOpacity
            onPress={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            className="p-2 rounded-xl bg-white/15 border border-white/20"
          >
            <ChevronLeft size={16} color="#fff" />
          </TouchableOpacity>
          <Text className="text-sm font-semibold text-white">
            {monthDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity
            onPress={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            className="p-2 rounded-xl bg-white/15 border border-white/20"
          >
            <ChevronRight size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        <View className="flex-row gap-2 mt-3">
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{tasks.length} tasks</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{bookings.length} programări</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{pendingCount} pending</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowPast(true)}
            className="flex-row items-center gap-1 bg-white px-2.5 py-1 rounded-full"
            accessibilityLabel="Programări trecute"
          >
            <History size={12} color="#334155" />
            <Text className="text-[11px] font-semibold text-slate-700">Trecute</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : error ? (
        <View className="mx-3 mt-3 p-4 bg-rose-50 rounded-2xl border border-rose-100">
          <Text className="text-sm text-rose-700">{error}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={flatItems}
          onContentSizeChange={() => {
            if (!focusedId) return;
            const index = flatItems.findIndex((it) => it.type === 'booking' && it.booking.id === focusedId);
            if (index > 0) listRef.current?.scrollToIndex({ index: Math.max(0, index - 1), animated: true });
          }}
          onScrollToIndexFailed={() => {}}
          keyExtractor={item => item.key}
          contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#6366f1" />
          }
          renderItem={({ item }) => {
            if (item.type === 'dayHeader') {
              return (
                <Text className="text-xs font-semibold text-slate-500 px-1 mb-2 mt-3">
                  {formatDayLabel(item.day)}
                </Text>
              );
            }
            if (item.type === 'booking') {
              const b = item.booking;
              return (
                <View
                  className={`bg-violet-50 rounded-2xl p-3 mb-2.5 border ${
                    b.id === focusedId ? 'border-violet-600 border-2' : 'border-violet-200'
                  }`}
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-sm font-semibold text-violet-900 flex-1" numberOfLines={1}>
                      Programare: {b.leadName}
                    </Text>
                    <View className="flex-row items-center gap-1">
                      <Clock size={12} color="#6d28d9" />
                      <Text className="text-[11px] font-semibold text-violet-700">
                        {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                  {!!b.hostName && (
                    <View className="flex-row items-center gap-1 mt-1">
                      <User size={12} color="#7c3aed" />
                      <Text className="text-[11px] text-violet-700">{b.hostName}</Text>
                    </View>
                  )}
                  {!!b.phone && (
                    <TouchableOpacity
                      onPress={() => { void Linking.openURL(`tel:${b.phone}`); }}
                      className="flex-row items-center gap-1 mt-1"
                    >
                      <Phone size={12} color="#2563eb" />
                      <Text className="text-[12px] font-semibold text-blue-600">{b.phone}</Text>
                    </TouchableOpacity>
                  )}
                  {!!b.email && (
                    <Text className="text-[11px] text-violet-700 mt-0.5" numberOfLines={1}>{b.email}</Text>
                  )}
                  {!!b.notes && (
                    <Text className="text-[11px] text-slate-600 mt-1" numberOfLines={3}>{b.notes}</Text>
                  )}
                  {b.link ? (
                    <TouchableOpacity
                      onPress={() => { void Linking.openURL(b.link!); }}
                      className="flex-row items-center justify-center gap-1.5 mt-2 rounded-xl bg-violet-600 py-2"
                    >
                      <Video size={14} color="#fff" />
                      <Text className="text-xs font-semibold text-white">Intră pe {b.platform}</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text className="text-[11px] text-violet-500 mt-1">Fără link de întâlnire</Text>
                  )}
                </View>
              );
            }
            const task = item.task;
            const taskDueDate = parseDate(task.dueDate);
            return (
              <TouchableOpacity
                onPress={() => taskActions(task)}
                activeOpacity={0.7}
                className="bg-white rounded-2xl p-3 mb-2.5 border border-slate-100"
              >
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="text-sm font-semibold text-slate-900 flex-1" numberOfLines={2}>{task.title}</Text>
                  <View className={`px-2 py-0.5 rounded-full ${
                    task.status === 'completed' ? 'bg-emerald-100' :
                    task.status === 'in_progress' ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    <Text className={`text-[10px] font-semibold ${
                      task.status === 'completed' ? 'text-emerald-700' :
                      task.status === 'in_progress' ? 'text-blue-700' : 'text-slate-600'
                    }`}>{task.status}</Text>
                  </View>
                </View>
                <View className="flex-row flex-wrap gap-2 mt-1.5">
                  <View className="flex-row items-center gap-1">
                    <Clock size={12} color="#64748b" />
                    <Text className="text-[11px] text-slate-500">
                      {taskDueDate
                        ? taskDueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '--:--'}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    {task.priority === 'urgent' || task.priority === 'high'
                      ? <AlertTriangle size={12} color="#f59e0b" />
                      : <CheckCircle size={12} color="#10b981" />}
                    <Text className="text-[11px] text-slate-500">{task.priority}</Text>
                  </View>
                  {task.assignee?.name && (
                    <View className="bg-slate-100 px-2 py-0.5 rounded-full">
                      <Text className="text-[11px] text-slate-600">{task.assignee.name}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View className="items-center justify-center py-20">
              <View className="h-14 w-14 rounded-2xl bg-white border border-slate-200 items-center justify-center">
                <Calendar size={28} color="#94a3b8" />
              </View>
              <Text className="text-sm font-medium text-slate-500 mt-3">No tasks planned</Text>
              <Text className="text-xs text-slate-400 mt-1">Tap + to create your first task.</Text>
            </View>
          }
        />
      )}

      <PastBookingsSheet visible={showPast} onClose={() => setShowPast(false)} />

      {/* New Task Modal */}
      <Modal visible={showForm} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <View className="flex-1 bg-black/40 justify-end">
            <View
              className="bg-white rounded-t-3xl"
              style={{ paddingBottom: insets.bottom + 12 }}
            >
              {/* Modal header */}
              <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
                <Text className="text-lg font-bold text-slate-900">New Task</Text>
                <TouchableOpacity onPress={() => setShowForm(false)} className="p-1.5">
                  <X size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 12 }}>
                {/* Title */}
                <Text className="text-xs font-semibold text-slate-500 mb-1.5 mt-2">Title *</Text>
                <TextInput
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder="e.g. Follow up with client"
                  placeholderTextColor="#94a3b8"
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-900"
                />

                {/* Description */}
                <Text className="text-xs font-semibold text-slate-500 mb-1.5 mt-4">Description</Text>
                <TextInput
                  value={formDescription}
                  onChangeText={setFormDescription}
                  placeholder="Optional notes..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  numberOfLines={3}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-900"
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />

                {/* Type */}
                <Text className="text-xs font-semibold text-slate-500 mb-1.5 mt-4">Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-1.5">
                    {TASK_TYPES.map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setFormType(t)}
                        className={`px-3 py-2 rounded-xl border ${
                          formType === t ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'
                        }`}
                      >
                        <Text className={`text-xs font-semibold ${
                          formType === t ? 'text-white' : 'text-slate-600'
                        }`}>
                          {t.replace('_', ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {/* Priority */}
                <Text className="text-xs font-semibold text-slate-500 mb-1.5 mt-4">Priority</Text>
                <View className="flex-row gap-1.5">
                  {PRIORITIES.map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setFormPriority(p)}
                      className={`flex-1 py-2 rounded-xl border items-center ${
                        formPriority === p
                          ? p === 'urgent' ? 'bg-red-500 border-red-500'
                          : p === 'high' ? 'bg-orange-500 border-orange-500'
                          : p === 'medium' ? 'bg-yellow-500 border-yellow-500'
                          : 'bg-green-500 border-green-500'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${
                        formPriority === p ? 'text-white' : 'text-slate-600'
                      }`}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Date & Time */}
                <View className="flex-row gap-3 mt-4">
                  <View className="flex-1">
                    <Text className="text-xs font-semibold text-slate-500 mb-1.5">Due Date</Text>
                    <TextInput
                      value={formDueDate}
                      onChangeText={setFormDueDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#94a3b8"
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-900"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-semibold text-slate-500 mb-1.5">Time</Text>
                    <TextInput
                      value={formDueTime}
                      onChangeText={setFormDueTime}
                      placeholder="HH:MM"
                      placeholderTextColor="#94a3b8"
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-sm text-slate-900"
                    />
                  </View>
                </View>

                {/* Save button */}
                <TouchableOpacity
                  onPress={saveTask}
                  disabled={isSaving}
                  className={`mt-6 py-3.5 rounded-xl items-center ${
                    isSaving ? 'bg-indigo-400' : 'bg-indigo-600'
                  }`}
                  activeOpacity={0.8}
                >
                  <Text className="text-sm font-bold text-white">
                    {isSaving ? 'Creating...' : 'Create Task'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
