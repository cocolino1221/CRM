import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { personName } from '../lib/lead-team';
import type { User } from '../types';

type Person = { id: string; firstName?: string | null; lastName?: string | null } | null | undefined;

/**
 * Who does it: me, the lead's closer, the lead's caller — or any colleague.
 * The three obvious ones are one tap; the rest of the team is behind "Alt coleg".
 */
export default function PersonChips({
  value,
  onChange,
  currentUserId,
  closer,
  caller,
  users,
}: {
  value: string | null;
  onChange: (userId: string) => void;
  currentUserId?: string;
  closer?: Person;
  caller?: Person;
  users: User[];
}) {
  const [showAll, setShowAll] = useState(false);

  const quick: Array<{ id: string; label: string }> = [];
  const add = (id: string | undefined, label: string) => {
    if (id && !quick.some((q) => q.id === id)) quick.push({ id, label });
  };
  add(currentUserId, 'Eu');
  add(closer?.id, `Closer: ${personName(closer) || 'closer'}`);
  add(caller?.id, `Caller: ${personName(caller) || 'caller'}`);
  // Someone picked from the full list stays visible as a chip.
  const picked = value && !quick.some((q) => q.id === value) ? users.find((u) => u.id === value) : undefined;
  if (picked) add(picked.id, personName(picked) || picked.email);

  const chip = (on: boolean) => `rounded-full border px-3 py-2 ${on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`;
  const text = (on: boolean) => `text-sm ${on ? 'text-indigo-800 font-semibold' : 'text-slate-700'}`;

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-2">
        {quick.map((q) => (
          <TouchableOpacity key={q.id} onPress={() => onChange(q.id)} className={chip(value === q.id)}>
            <Text className={text(value === q.id)}>{q.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setShowAll((v) => !v)} className="rounded-full border border-dashed border-gray-300 px-3 py-2">
          <Text className="text-sm text-slate-500">{showAll ? 'Ascunde' : 'Alt coleg…'}</Text>
        </TouchableOpacity>
      </View>
      {showAll && (
        <View className="flex-row flex-wrap gap-2">
          {users.length === 0 && <Text className="text-sm text-slate-500">Se încarcă echipa…</Text>}
          {users
            .filter((u) => u.id)
            .sort((a, b) => personName(a).localeCompare(personName(b), 'ro'))
            .map((u) => (
              <TouchableOpacity
                key={u.id}
                onPress={() => {
                  onChange(u.id);
                  setShowAll(false);
                }}
                className={chip(value === u.id)}
              >
                <Text className={text(value === u.id)}>{personName(u) || u.email}</Text>
                <Text className="text-[10px] text-slate-400">{u.role}</Text>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </View>
  );
}
