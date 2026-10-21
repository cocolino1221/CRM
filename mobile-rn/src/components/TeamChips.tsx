import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { User } from 'lucide-react-native';
import AssignSheet from './AssignSheet';
import { useLeadsStore } from '../stores/leads-store';
import {
  TEAM_FIELD,
  TEAM_SLOTS,
  TEAM_SLOT_LABEL,
  UNASSIGNED,
  assigneeId,
  assigneeLabel,
  type TeamSlot,
} from '../lib/lead-team';

type Person = { id: string; firstName: string; lastName: string } | null | undefined;
type TeamContact = {
  id: string;
  firstName?: string;
  lastName?: string;
  closerId?: string | null;
  setterId?: string | null;
  callerId?: string | null;
  closer?: Person;
  setter?: Person;
  caller?: Person;
};

/**
 * Closer, setter and caller on one lead — the names the reports count by.
 * Tap a chip to pick who holds that place; it saves at once.
 */
export default function TeamChips({ contact, size = 'sm' }: { contact: TeamContact; size?: 'sm' | 'md' }) {
  const users = useLeadsStore((s) => s.users);
  const fetchUsers = useLeadsStore((s) => s.fetchUsers);
  const assignTeam = useLeadsStore((s) => s.assignTeam);
  const [team, setTeam] = useState<TeamContact>(contact);
  const [slot, setSlot] = useState<TeamSlot | null>(null);

  useEffect(() => setTeam(contact), [contact]);
  useEffect(() => {
    if (!users.length) fetchUsers();
  }, [users.length, fetchUsers]);

  const pick = async (userId: string | null) => {
    if (!slot) return;
    const field = TEAM_FIELD[slot];
    const person = userId ? users.find((u) => u.id === userId) : null;
    const before = team;
    setSlot(null);
    setTeam({
      ...team,
      [field]: userId,
      [slot]: person ? { id: person.id, firstName: person.firstName, lastName: person.lastName } : null,
    });
    const error = await assignTeam(contact.id, { [field]: userId });
    if (error) {
      setTeam(before);
      Alert.alert('Nu s-a salvat', error);
    }
  };

  const text = size === 'md' ? 'text-xs' : 'text-[10px]';
  return (
    <>
      <View className="flex-row flex-wrap gap-1.5">
        {TEAM_SLOTS.map((s) => {
          const label = assigneeLabel(team, s);
          const empty = label === UNASSIGNED;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setSlot(s)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              className={`flex-row items-center gap-1 rounded-full border ${size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'} ${
                empty ? 'border-dashed border-slate-300 bg-white' : 'border-sky-200 bg-sky-50'
              }`}
              accessibilityLabel={`${TEAM_SLOT_LABEL[s]}: ${label}`}
            >
              <User size={size === 'md' ? 12 : 10} color={empty ? '#94a3b8' : '#0284c7'} />
              <Text className={`${text} font-semibold ${empty ? 'text-slate-400' : 'text-sky-700'}`} numberOfLines={1}>
                {TEAM_SLOT_LABEL[s]}: {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {slot && (
        <AssignSheet
          slot={slot}
          leadName={`${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()}
          currentId={assigneeId(team, slot)}
          users={users}
          onClose={() => setSlot(null)}
          onPick={pick}
        />
      )}
    </>
  );
}
