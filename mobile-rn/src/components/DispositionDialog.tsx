import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useKeyboardSheet } from '../lib/use-keyboard-sheet';
import { Audio } from 'expo-av';
import { Pause, Play, Phone } from 'lucide-react-native';
import api from '../lib/api';
import { clearDraft, loadDraft, saveDraft } from '../lib/disposition-draft';
import {
  CALLBACK_CHOICES,
  OUTCOMES,
  buildDispositionPayload,
  defaultFollowUpFor,
  dispositionEndpoint,
  outcomeById,
} from '../lib/disposition-outcomes';

/**
 * The question a caller answers after every call — the phone half.
 *
 * Same seven outcomes, same copy and the same one-request-id-per-dialog rule
 * as the web dialog, so the two clients cannot drift. What differs is the
 * input: touch targets instead of number keys, and a draft store that has to
 * be awaited because AsyncStorage is async.
 */

function newRequestId(): string {
  return `disp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface DispositionDialogProps {
  /** Absent for a call that was never logged — a manual entry. */
  activityId?: string;
  contactId: string;
  contactName: string;
  durationSeconds?: number;
  phone?: string;
  /** Present only when the caller recorded the call; recording is consent-gated. */
  recordingUrl?: string;
  /** Offered when the dialog opened instead of the contact's record. */
  onViewDetails?: () => void;
  onClose: () => void;
  onSaved?: () => void;
}

export default function DispositionDialog({
  activityId,
  contactId,
  contactName,
  durationSeconds,
  phone,
  recordingUrl,
  onViewDetails,
  onClose,
  onSaved,
}: DispositionDialogProps) {
  // One id per dialog, not per attempt: this is what makes a retry idempotent.
  const clientRequestId = useRef<string>(newRequestId());
  const draftKey = activityId ?? `contact:${contactId}`;

  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [followUpAt, setFollowUpAt] = useState<string | null>(null);
  const [bookingSent, setBookingSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(true);

  const sound = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  // Whatever survived the last failed submit — or the app being backgrounded
  // mid-dialog, which on a phone is the common case.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadDraft(draftKey);
      if (cancelled || !draft) {
        setRestoring(false);
        return;
      }
      if (draft.clientRequestId) clientRequestId.current = draft.clientRequestId;
      const row = OUTCOMES.find((o) => o.outcome === draft.outcome);
      if (row) setSelected(row.id);
      if (draft.notes) setNotes(draft.notes);
      if (draft.followUpAt) setFollowUpAt(draft.followUpAt);
      if (typeof draft.dealValue === 'number') setAmount(String(draft.dealValue));
      if (draft.bookingSent) setBookingSent(true);
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  useEffect(
    () => () => {
      void sound.current?.unloadAsync();
    },
    [],
  );

  const row = useMemo(() => outcomeById(selected), [selected]);

  const payload = useMemo(
    () =>
      row
        ? buildDispositionPayload({
            row,
            clientRequestId: clientRequestId.current,
            contactId,
            contactName,
            notes,
            amount,
            followUpAt,
            bookingSent,
            activityId,
            durationSeconds,
          })
        : null,
    [row, contactId, contactName, notes, amount, followUpAt, bookingSent, activityId, durationSeconds],
  );

  // Written on every change, so losing the app costs nothing typed.
  useEffect(() => {
    if (restoring || !selected) return;
    void saveDraft(draftKey, {
      outcome: row?.outcome,
      rowId: row?.id,
      notes,
      followUpAt: followUpAt ?? undefined,
      dealValue: amount ? Number(amount.replace(',', '.')) : undefined,
      bookingSent: bookingSent || undefined,
      clientRequestId: clientRequestId.current,
    });
  }, [restoring, draftKey, selected, row, notes, followUpAt, amount, bookingSent]);

  const pick = useCallback((id: string) => {
    setSelected(id);
    setFollowUpAt(defaultFollowUpFor(id));
  }, []);

  const toggleRecording = useCallback(async () => {
    if (!recordingUrl) return;
    try {
      if (!sound.current) {
        const { sound: created } = await Audio.Sound.createAsync({ uri: recordingUrl });
        sound.current = created;
        created.setOnPlaybackStatusUpdate((status: any) => {
          if (status?.didJustFinish) setPlaying(false);
        });
      }
      if (playing) {
        await sound.current.pauseAsync();
        setPlaying(false);
      } else {
        await sound.current.playAsync();
        setPlaying(true);
      }
    } catch {
      // A recording that will not play must not block the outcome.
      setPlaying(false);
    }
  }, [recordingUrl, playing]);

  const submit = useCallback(async () => {
    if (!row || !payload || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(dispositionEndpoint(activityId), payload);
      await clearDraft(draftKey);
      onSaved?.();
      onClose();
    } catch (err: any) {
      // The draft stays. Pressing Salvează again lands once, because the
      // request id is the same.
      setError(
        err?.response?.data?.message ||
          'Nu s-a putut salva. Rezultatul e păstrat — încearcă din nou.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [row, payload, submitting, activityId, draftKey, onClose, onSaved]);

  const duration =
    typeof durationSeconds === 'number'
      ? `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}`
      : null;

  const scrollRef = useRef<ScrollView>(null);
  const { keyboardHeight, sheetMaxHeight } = useKeyboardSheet();

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      {/* The sheet sits above the keyboard. Android does not resize a Modal's
          content for the keyboard, so on a phone the note field and the
          Salvează button were hidden behind it while someone typed. */}
      <View className="flex-1 bg-black/60 justify-end" style={{ paddingBottom: keyboardHeight }}>
        <View className="bg-white rounded-t-3xl" style={{ maxHeight: sheetMaxHeight }}>
          <View className="px-5 pt-5 pb-3 border-b border-gray-100">
            <Text className="text-lg font-bold text-gray-900">
              Cum a mers apelul cu {contactName}?
            </Text>
            {duration && <Text className="text-sm text-gray-500 mt-0.5">Durată: {duration}</Text>}
            <View className="flex-row items-center gap-4 mt-1">
              {phone && (
                <View className="flex-row items-center gap-1.5">
                  <Phone size={13} color="#2563eb" />
                  <Text className="text-sm text-blue-600">{phone}</Text>
                </View>
              )}
              {onViewDetails && (
                <TouchableOpacity onPress={onViewDetails}>
                  <Text className="text-sm text-slate-500 underline">Vezi detalii</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView ref={scrollRef} className="px-5" keyboardShouldPersistTaps="handled">
            {recordingUrl && (
              <TouchableOpacity
                onPress={toggleRecording}
                className="flex-row items-center gap-2 mt-4 rounded-xl border border-gray-200 px-4 py-3"
              >
                {playing ? <Pause size={16} color="#4f46e5" /> : <Play size={16} color="#4f46e5" />}
                <Text className="text-sm font-medium text-indigo-700">
                  {playing ? 'Oprește înregistrarea' : 'Ascultă înregistrarea'}
                </Text>
              </TouchableOpacity>
            )}

            <View className="mt-4 gap-2">
              {OUTCOMES.map((o) => {
                const on = selected === o.id;
                return (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => pick(o.id)}
                    // A finger needs a bigger target than a cursor.
                    className={`rounded-xl border px-4 py-3.5 ${
                      on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                    }`}
                  >
                    <Text className={`text-base ${on ? 'text-indigo-900 font-semibold' : 'text-gray-900'}`}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {row?.followOn === 'amount' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Sumă (RON)</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900"
                />
              </View>
            )}

            {row?.followOn === 'callback' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Resună</Text>
                <View className="flex-row flex-wrap gap-2">
                  {CALLBACK_CHOICES.map((c) => {
                    const iso = c.at().toISOString();
                    const on = followUpAt === iso;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setFollowUpAt(iso)}
                        className={`rounded-full border px-4 py-2 ${
                          on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
                        }`}
                      >
                        <Text className={`text-sm ${on ? 'text-indigo-800' : 'text-gray-700'}`}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {row?.followOn === 'followup_date' && followUpAt && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-gray-700 mb-1.5">Revenire pe</Text>
                <View className="flex-row flex-wrap gap-2">
                  {[3, 7, 14, 30].map((days) => {
                    const iso = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
                    const on = followUpAt.slice(0, 10) === iso.slice(0, 10);
                    return (
                      <TouchableOpacity
                        key={days}
                        onPress={() => setFollowUpAt(iso)}
                        className={`rounded-full border px-4 py-2 ${
                          on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
                        }`}
                      >
                        <Text className={`text-sm ${on ? 'text-indigo-800' : 'text-gray-700'}`}>
                          {days === 3 ? 'În 3 zile' : `În ${days} zile`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {row?.followOn === 'booking' && (
              <TouchableOpacity
                onPress={() => setBookingSent((v) => !v)}
                className={`mt-4 rounded-xl border px-4 py-3.5 ${
                  bookingSent ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                }`}
              >
                <Text className={`text-base ${bookingSent ? 'text-indigo-900 font-semibold' : 'text-gray-900'}`}>
                  {bookingSent ? '✓ ' : ''}Am trimis link de programare
                </Text>
              </TouchableOpacity>
            )}

            <View className="mt-4 mb-2">
              <Text className="text-sm font-medium text-gray-700 mb-1.5">Notiță</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                // Bring the field into view above the keyboard once it opens.
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                placeholder="Ce s-a discutat…"
                className="rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 min-h-[84px]"
              />
            </View>

            {error ? <Text className="text-sm text-red-600 mb-2">{error}</Text> : null}
          </ScrollView>

          <View className="flex-row gap-2 px-5 py-4 border-t border-gray-100">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 rounded-xl border border-gray-300 py-3.5 items-center"
            >
              <Text className="text-base text-gray-700">Închide</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={!row || submitting}
              className={`flex-1 rounded-xl py-3.5 items-center ${
                !row || submitting ? 'bg-indigo-300' : 'bg-indigo-600'
              }`}
            >
              {submitting ? (
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
