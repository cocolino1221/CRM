import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useKeyboardSheet } from '../lib/use-keyboard-sheet';
import { Mail, MessageCircle, Phone } from 'lucide-react-native';
import api from '../lib/api';
import {
  LEAD_MOVES,
  MEETING_KINDS,
  buildMovePayloads,
  moveById,
  type LeadMoveId,
  type MeetingKind,
} from '../lib/lead-moves';
import {
  OWN_HOURS,
  OWN_MINUTES,
  canPickOwnHour,
  groupSlotsByDay,
  hostChoiceFor,
  labelForSlot,
  ownHourIso,
  type SlotDay,
  type TeamSlot,
} from '../lib/slot-picking';
import { useAuthStore } from '../stores/auth-store';
import { useLeadsStore } from '../stores/leads-store';
import DateTimeChips, { type DayTime } from './DateTimeChips';
import PersonChips from './PersonChips';
import { SOURCE_OPTIONS } from '../lib/lead-filters';
import { leadStage } from '../lib/lead-stage';
import { activityHeadline, activityNote, activityTone, parseActivityList, type ActivityRow } from '../lib/activity-view';
import { whatsappDigits } from '../lib/whatsapp-phone';
import TeamChips from './TeamChips';

/**
 * What a caller sees when they tap a lead.
 *
 * Who this is, where they came from, when they arrived — then the one
 * decision worth making on a phone: where does this person go next. The call
 * dialog lives elsewhere; this is the lead's own screen.
 *
 * "Programat" creates a real appointment rather than only recording an
 * outcome, because the badge on the list reads bookings. A tick that left the
 * row unchanged would be worse than no tick at all.
 */

/** The workspace clock; the server reads the rule in this zone too. */
const TIME_ZONE = 'Europe/Bucharest';

const sourceLabel = (value?: string) =>
  SOURCE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** The next few days, so one request covers what a caller will scroll. */
function nextDays(count: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default function LeadSheet({
  contact,
  bookedIds,
  currentUserId,
  onClose,
  onSaved,
  onOpenRecord,
}: {
  contact: any;
  bookedIds: Set<string>;
  /** The booking's host defaults to whoever is holding the phone. */
  currentUserId?: string;
  onClose: () => void;
  onSaved: () => void;
  onOpenRecord?: () => void;
}) {
  const clientRequestId = useRef(`move-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  const [move, setMove] = useState<LeadMoveId | null>(null);
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [at, setAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // The team's actual free hours. The sheet used to offer four computed
  // labels that were not looked up anywhere, so it could book an hour
  // nobody was free for.
  const [days, setDays] = useState<SlotDay[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [chosenHostId, setChosenHostId] = useState<string | null>(null);

  // A closer may also book themselves at any hour, free slot or not.
  const role = useAuthStore((state) => state.user?.role);
  const ownHourAllowed = canPickOwnHour(role) && !!currentUserId;
  const [ownHourMode, setOwnHourMode] = useState(false);
  const [own, setOwn] = useState<DayTime>({ day: 0, hour: 10, minute: 0 });
  const pickOwn = (next: DayTime) => {
    setOwn(next);
    setAt(ownHourIso(next.day, next.hour, next.minute));
    setChosenHostId(currentUserId ?? null);
  };

  // Programat splits in two: a phone call at a time agreed between people,
  // or a Zoom meeting booked into a closer's free hours (the calendar).
  const [meetingKind, setMeetingKind] = useState<MeetingKind | null>(null);
  const [callTime, setCallTime] = useState<DayTime>({ day: 1, hour: 10, minute: 0 });
  const [callPerson, setCallPerson] = useState<string | null>(currentUserId ?? null);

  // Revenire: any day and hour, and whoever is to ring back.
  const [backTime, setBackTime] = useState<DayTime>({ day: 1, hour: 10, minute: 0 });
  const [backPerson, setBackPerson] = useState<string | null>(currentUserId ?? null);

  const users = useLeadsStore((state) => state.users);

  const stage = useMemo(() => leadStage(contact, bookedIds), [contact, bookedIds]);

  // What was said before, so whoever opens the lead next can read it here
  // instead of only in the full record.
  const [pastCalls, setPastCalls] = useState<ActivityRow[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .get('/activities', { params: { contactId: contact.id, type: 'call', limit: 5 } })
      .then((res) => alive && setPastCalls(parseActivityList(res.data)))
      .catch(() => alive && setPastCalls([]));
    return () => {
      alive = false;
    };
  }, [contact.id]);
  const name =
    `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() ||
    contact.phone ||
    contact.email ||
    'Contact';
  const selected = move ? moveById(move) : null;

  const save = async () => {
    if (!move) return;
    setError('');

    const payloads = buildMovePayloads({
      move,
      contact,
      notes,
      amount,
      at:
        move === 'callback'
          ? ownHourIso(backTime.day, backTime.hour, backTime.minute)
          : move === 'scheduled' && meetingKind === 'call'
            ? ownHourIso(callTime.day, callTime.hour, callTime.minute)
            : at ?? undefined,
      hostId:
        move === 'scheduled'
          ? (meetingKind === 'call' ? callPerson : chosenHostId) ?? undefined
          : currentUserId,
      meetingKind,
      assigneeId: move === 'callback' ? backPerson ?? undefined : undefined,
      clientRequestId: clientRequestId.current,
    });

    if (payloads.error) {
      setError(payloads.error);
      return;
    }

    setSaving(true);
    try {
      // The appointment first: if it fails there is nothing to undo, whereas
      // writing the outcome first would leave a lead marked scheduled with no
      // appointment behind it.
      if (payloads.booking) {
        await api.post('/bookings', payloads.booking);
      }
      await api.post('/activities/disposition', payloads.disposition);
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Nu s-a putut salva. Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  // Loaded only once Programat is chosen: nobody else needs the round trip.
  // loadingSlots stays out of the dependencies: setting it re-ran this effect,
  // whose cleanup cancelled the request in flight, so the spinner never ended.
  useEffect(() => {
    if (move !== 'scheduled' || meetingKind !== 'zoom' || days.length) return;

    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError('');

    Promise.all(
      nextDays(7).map((date) =>
        api
          .get<TeamSlot[]>('/scheduling/team-slots', { params: { date } })
          .then((res) => (Array.isArray(res.data) ? res.data : []))
          // One bad day must not cost the other six.
          .catch(() => [] as TeamSlot[]),
      ),
    )
      .then((pages) => {
        if (cancelled) return;
        const grouped = groupSlotsByDay(pages.flat(), TIME_ZONE);
        setDays(grouped);
        if (!grouped.length) {
          setSlotsError(
            'Nicio oră liberă în următoarele 7 zile. Verifică programul colegilor în Setări.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [move, meetingKind, days.length]);

  const selectedSlot = days.flatMap((d) => d.slots).find((sl) => sl.startTime === at) ?? null;
  const hostChoice = hostChoiceFor(selectedSlot);

  const wa = whatsappDigits(contact.phone);

  const { keyboardHeight, sheetMaxHeight } = useKeyboardSheet();

  // The sheet rises above the keyboard, but Notițe is the last thing in the
  // scroll and the sheet shrinks by exactly the keyboard's height — so the
  // field you just tapped ends up below the fold. It looked like the sheet
  // was not rising at all; it was, and typing happened out of sight.
  const scrollRef = useRef<ScrollView>(null);
  const [notesFocused, setNotesFocused] = useState(false);

  useEffect(() => {
    if (!notesFocused) return;
    // Both the focus and the keyboard's arrival move the layout, and the
    // second one lands after this runs — hence keyboardHeight as a dependency
    // rather than scrolling once on focus.
    const id = requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => cancelAnimationFrame(id);
  }, [notesFocused, keyboardHeight]);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      {/* Kept above the keyboard: on Android a Modal is not resized for it. */}
      <View className="flex-1 bg-black/60 justify-end" style={{ paddingBottom: keyboardHeight }}>
        <View className="bg-white rounded-t-3xl" style={{ maxHeight: sheetMaxHeight }}>
          {/* Who this is */}
          <View className="px-5 pt-5 pb-3 border-b border-gray-100">
            <View className="flex-row items-start gap-2">
              <Text className="flex-1 text-lg font-bold text-slate-900">{name}</Text>
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${stage.color}20` }}
              >
                <Text className="text-[11px] font-semibold" style={{ color: stage.color }}>
                  {stage.label}
                </Text>
              </View>
            </View>
            <Text className="text-xs text-slate-500 mt-1">
              {sourceLabel(contact.source)} · intrat {formatDate(contact.createdAt)}
            </Text>
          </View>

          <ScrollView ref={scrollRef} className="px-5" keyboardShouldPersistTaps="handled">
            {/* How to reach them */}
            <View className="flex-row flex-wrap gap-2 mt-4">
              {contact.phone && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${contact.phone}`)}
                  className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-50"
                >
                  <Phone size={14} color="#0369a1" />
                  <Text className="text-sm font-medium text-sky-700">{contact.phone}</Text>
                </TouchableOpacity>
              )}
              {wa && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`https://wa.me/${wa}`)}
                  className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-50"
                >
                  <MessageCircle size={14} color="#0f766e" />
                  <Text className="text-sm font-medium text-teal-700">WhatsApp</Text>
                </TouchableOpacity>
              )}
              {contact.email && (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`mailto:${contact.email}`)}
                  className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100"
                >
                  <Mail size={14} color="#475569" />
                  <Text className="text-sm font-medium text-slate-700" numberOfLines={1}>
                    {contact.email}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Who holds the lead — what the reports count by. */}
            <View className="mt-4">
              <TeamChips contact={contact} size="md" />
            </View>

            {pastCalls.length > 0 && (
              <View className="mt-5">
                <Text className="text-sm font-semibold text-slate-900 mb-2">Ultimele apeluri</Text>
                <View className="gap-2">
                  {pastCalls.map((call) => {
                    const tone = activityTone(call);
                    const color = { red: '#be123c', green: '#047857', amber: '#b45309', slate: '#334155' }[tone];
                    const note = activityNote(call);
                    const who = (users || []).find((u: any) => u.id === call.userId) as any;
                    const whoName = who ? `${who.firstName || ''} ${who.lastName || ''}`.trim() : '';
                    return (
                      <View key={call.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <View className="flex-row items-center justify-between gap-2">
                          <Text className="text-sm font-semibold" style={{ color }}>{activityHeadline(call)}</Text>
                          <Text className="text-[11px] text-slate-400">
                            {formatDate(call.occurredAt)}{whoName ? ` · ${whoName}` : ''}
                          </Text>
                        </View>
                        {note ? (
                          <Text className="text-sm text-slate-700 mt-1">{note}</Text>
                        ) : (
                          <Text className="text-xs text-slate-400 mt-1">Fără notiță</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Where it goes next */}
            <Text className="text-sm font-semibold text-slate-900 mt-5 mb-2">Mută leadul la</Text>
            <View className="gap-2">
              {LEAD_MOVES.map((option) => {
                const on = move === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => {
                      setMove(option.id);
                      setError('');
                      if (option.needs !== 'datetime') setAt(null);
                    }}
                    className={`rounded-xl border px-4 py-3 ${
                      on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                    }`}
                  >
                    <Text
                      className="text-base font-semibold"
                      style={{ color: on ? option.color : '#0f172a' }}
                    >
                      {option.label}
                    </Text>
                    <Text className="text-xs text-slate-500 mt-0.5">{option.hint}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selected?.needs === 'amount' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Suma (RON)</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base text-slate-900"
                />
              </View>
            )}

            {move === 'scheduled' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Ce fel de programare</Text>
                <View className="flex-row gap-2">
                  {MEETING_KINDS.map((kind) => {
                    const on = meetingKind === kind.id;
                    return (
                      <TouchableOpacity
                        key={kind.id}
                        onPress={() => {
                          setMeetingKind(kind.id);
                          setError('');
                          // The two pick a time differently; a time from one
                          // must not leak into the other.
                          setAt(null);
                          setChosenHostId(null);
                          setOwnHourMode(false);
                        }}
                        className={`flex-1 rounded-xl border px-4 py-3 ${
                          on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                        }`}
                      >
                        <Text className={`text-base font-semibold ${on ? 'text-indigo-800' : 'text-slate-900'}`}>
                          {kind.id === 'zoom' ? '🎥 ' : '📞 '}
                          {kind.label}
                        </Text>
                        <Text className="text-xs text-slate-500">{kind.hint}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {move === 'scheduled' && meetingKind === 'call' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Când e apelul</Text>
                <DateTimeChips value={callTime} onChange={setCallTime} />
                <Text className="text-sm font-medium text-slate-700 mt-4 mb-1.5">Cine sună</Text>
                <PersonChips
                  value={callPerson}
                  onChange={setCallPerson}
                  currentUserId={currentUserId}
                  closer={contact.closer}
                  caller={contact.caller}
                  users={users}
                />
              </View>
            )}

            {selected?.needs === 'datetime' && move === 'scheduled' && meetingKind === 'zoom' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Când e întâlnirea Zoom</Text>

                {loadingSlots && (
                  <View className="py-4 items-center">
                    <ActivityIndicator color="#4f46e5" />
                  </View>
                )}

                {slotsError ? <Text className="text-sm text-amber-700">{slotsError}</Text> : null}

                {days.map((day) => (
                  <View key={day.date} className="mb-3">
                    <Text className="text-xs font-semibold text-slate-500 mb-1.5">{day.label}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {day.slots.map((slot) => {
                        const on = at === slot.startTime;
                        return (
                          <TouchableOpacity
                            key={slot.startTime}
                            onPress={() => {
                              setOwnHourMode(false);
                              setAt(slot.startTime);
                              // One person free means nothing to ask.
                              const choice = hostChoiceFor(slot);
                              setChosenHostId(choice.mustAsk ? null : (choice.hosts[0]?.userId ?? null));
                            }}
                            className={`rounded-full border px-4 py-2 ${
                              on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
                            }`}
                          >
                            <Text className={`text-sm ${on ? 'text-indigo-800' : 'text-slate-700'}`}>
                              {labelForSlot(slot.startTime, TIME_ZONE)}
                            </Text>
                            <Text className="text-[10px] text-slate-400">
                              {slot.hosts.length === 1
                                ? slot.hosts[0].name
                                : `${slot.hosts.length} colegi liberi`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}

                {ownHourAllowed && (
                  <View className="mt-1 mb-2">
                    <TouchableOpacity
                      onPress={() => {
                        if (ownHourMode) {
                          setOwnHourMode(false);
                          setAt(null);
                          setChosenHostId(null);
                        } else {
                          setOwnHourMode(true);
                          pickOwn(own);
                        }
                      }}
                      className={`rounded-xl border px-4 py-3 ${
                        ownHourMode ? 'border-indigo-500 bg-indigo-50' : 'border-dashed border-gray-300'
                      }`}
                    >
                      <Text className={`text-sm font-semibold ${ownHourMode ? 'text-indigo-800' : 'text-slate-700'}`}>
                        Altă oră, în programul meu
                      </Text>
                      <Text className="text-xs text-slate-500">
                        Oricând vrei, doar să nu se suprapună cu altă programare.
                      </Text>
                    </TouchableOpacity>

                    {ownHourMode && (
                      <View className="mt-3">
                        <DateTimeChips value={own} onChange={pickOwn} days={21} summarySuffix="cu tine" />
                      </View>
                    )}
                  </View>
                )}

                {/* Two people free at that hour, so the caller says which. */}
                {!ownHourMode && hostChoice.mustAsk && (
                  <View className="mt-1">
                    <Text className="text-sm font-medium text-slate-700 mb-1.5">Cu cine</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {hostChoice.hosts.map((host) => {
                        const on = chosenHostId === host.userId;
                        return (
                          <TouchableOpacity
                            key={host.userId}
                            onPress={() => setChosenHostId(host.userId)}
                            className={`rounded-xl border px-4 py-2.5 ${
                              on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
                            }`}
                          >
                            <Text className={`text-sm ${on ? 'text-indigo-800 font-semibold' : 'text-slate-700'}`}>
                              {host.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}

            {move === 'callback' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">Când revii</Text>
                <DateTimeChips value={backTime} onChange={setBackTime} />
                <Text className="text-sm font-medium text-slate-700 mt-4 mb-1.5">Cine revine</Text>
                <PersonChips
                  value={backPerson}
                  onChange={setBackPerson}
                  currentUserId={currentUserId}
                  closer={contact.closer}
                  caller={contact.caller}
                  users={users}
                />
              </View>
            )}

            <View className="mt-4 mb-2">
              <Text className="text-sm font-medium text-slate-700 mb-1.5">Notițe</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                onFocus={() => setNotesFocused(true)}
                onBlur={() => setNotesFocused(false)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                placeholder="Ce s-a discutat, ce a cerut…"
                className="rounded-xl border border-gray-300 px-4 py-3 text-base text-slate-900 min-h-[84px]"
              />
            </View>

            {error ? <Text className="text-sm text-red-600 mb-2">{error}</Text> : null}

            {onOpenRecord && (
              <TouchableOpacity onPress={onOpenRecord} className="mb-3">
                <Text className="text-sm text-slate-500 underline">Deschide fișa completă</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <View className="flex-row gap-2 px-5 py-4 border-t border-gray-100">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 rounded-xl border border-gray-300 py-3.5 items-center"
            >
              <Text className="text-base text-slate-700">Închide</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
              disabled={!move || saving}
              className={`flex-1 rounded-xl py-3.5 items-center ${
                !move || saving ? 'bg-indigo-300' : 'bg-indigo-600'
              }`}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-semibold text-white">Salvează</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
