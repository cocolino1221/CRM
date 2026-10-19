import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { TEAM_SLOT_LABEL, UNASSIGNED, candidatesFor, personName, type TeamSlot } from '../lib/lead-team';
import type { User } from '../types';

/** Picks the closer or caller for one lead, straight from the tag on its row. */
export default function AssignSheet({
  slot,
  leadName,
  currentId,
  users,
  onPick,
  onClose,
}: {
  slot: TeamSlot;
  leadName: string;
  currentId?: string | null;
  users: User[];
  onPick: (userId: string | null) => void;
  onClose: () => void;
}) {
  const { fitting, others } = candidatesFor(users, slot);

  const row = (id: string | null, label: string, hint?: string) => {
    const on = (currentId ?? null) === id;
    return (
      <TouchableOpacity
        key={id ?? 'none'}
        onPress={() => onPick(id)}
        className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${
          on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
        }`}
      >
        <View>
          <Text className={`text-sm ${on ? 'font-semibold text-indigo-800' : 'text-slate-800'}`}>{label}</Text>
          {hint ? <Text className="text-[11px] text-slate-400">{hint}</Text> : null}
        </View>
        {on && <Check size={16} color="#4f46e5" />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} className="flex-1 bg-black/40 justify-end">
        <TouchableOpacity activeOpacity={1} className="bg-white rounded-t-3xl max-h-[75%]">
          <View className="px-5 pt-5 pb-3 border-b border-gray-100">
            <Text className="text-lg font-bold text-slate-900">{TEAM_SLOT_LABEL[slot]}</Text>
            <Text className="text-xs text-slate-500" numberOfLines={1}>
              pentru {leadName}
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}>
            {row(null, UNASSIGNED)}
            {fitting.map((u) => row(u.id, personName(u) || u.email))}
            {others.length > 0 && (
              <Text className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Alți colegi</Text>
            )}
            {others.map((u) => row(u.id, personName(u) || u.email, u.role))}
            {users.length === 0 && (
              <Text className="text-sm text-slate-500">Se încarcă echipa…</Text>
            )}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
