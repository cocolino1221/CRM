import { useMemo, useRef, useState } from 'react';
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
import { Mail, MessageCircle, Phone } from 'lucide-react-native';
import api from '../lib/api';
import { LEAD_MOVES, buildMovePayloads, moveById, type LeadMoveId } from '../lib/lead-moves';
import { SOURCE_OPTIONS } from '../lib/lead-filters';
import { leadStage } from '../lib/lead-stage';
import { whatsappDigits } from '../lib/whatsapp-phone';

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

/** Rounded to the next half hour, which is what someone picking "tomorrow" means. */
function defaultSlot(daysAhead: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
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

  const stage = useMemo(() => leadStage(contact, bookedIds), [contact, bookedIds]);
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
      at: at ?? undefined,
      hostId: currentUserId,
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

  const slots = [
    { label: 'Mâine 10:00', at: defaultSlot(1, 10) },
    { label: 'Mâine 17:00', at: defaultSlot(1, 17) },
    { label: 'Poimâine 10:00', at: defaultSlot(2, 10) },
    { label: 'În 7 zile', at: defaultSlot(7, 10) },
  ];

  const wa = whatsappDigits(contact.phone);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-white rounded-t-3xl max-h-[92%]">
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

          <ScrollView className="px-5" keyboardShouldPersistTaps="handled">
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

            {selected?.needs === 'datetime' && (
              <View className="mt-4">
                <Text className="text-sm font-medium text-slate-700 mb-1.5">
                  {move === 'scheduled' ? 'Când e întâlnirea' : 'Când revii'}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {slots.map((slot) => {
                    const iso = slot.at.toISOString();
                    const on = at === iso;
                    return (
                      <TouchableOpacity
                        key={slot.label}
                        onPress={() => setAt(iso)}
                        className={`rounded-full border px-4 py-2 ${
                          on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
                        }`}
                      >
                        <Text className={`text-sm ${on ? 'text-indigo-800' : 'text-slate-700'}`}>
                          {slot.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View className="mt-4 mb-2">
              <Text className="text-sm font-medium text-slate-700 mb-1.5">Notițe</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
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
