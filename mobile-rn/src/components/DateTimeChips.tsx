import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { OWN_HOURS, OWN_MINUTES } from '../lib/slot-picking';

export interface DayTime {
  /** Days from today: 0 is today. */
  day: number;
  hour: number;
  minute: number;
}

/** "Azi", "Mâine", then "lun. 27 oct.". */
export function dayLabel(offset: number): string {
  if (offset === 0) return 'Azi';
  if (offset === 1) return 'Mâine';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A free choice of day, hour and minute — no fixed "Mâine 10:00" presets.
 * Chips rather than a native picker: no extra native module, and a thumb can
 * hit them without a wheel.
 */
export default function DateTimeChips({
  value,
  onChange,
  days = 30,
  summarySuffix,
}: {
  value: DayTime;
  onChange: (next: DayTime) => void;
  days?: number;
  summarySuffix?: string;
}) {
  const chip = (on: boolean) => `rounded-full border px-3 py-2 ${on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`;
  const text = (on: boolean) => `text-sm ${on ? 'text-indigo-800' : 'text-slate-700'}`;

  return (
    <View className="gap-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {Array.from({ length: days }, (_, day) => (
            <TouchableOpacity key={day} onPress={() => onChange({ ...value, day })} className={chip(value.day === day)}>
              <Text className={text(value.day === day)}>{dayLabel(day)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <View className="flex-row flex-wrap gap-2">
        {OWN_HOURS.map((hour) => {
          const on = value.hour === hour;
          return (
            <TouchableOpacity
              key={hour}
              onPress={() => onChange({ ...value, hour })}
              className={`w-12 items-center rounded-lg border py-2 ${on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}
            >
              <Text className={text(on)}>{pad(hour)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View className="flex-row gap-2">
        {OWN_MINUTES.map((minute) => {
          const on = value.minute === minute;
          return (
            <TouchableOpacity
              key={minute}
              onPress={() => onChange({ ...value, minute })}
              className={`flex-1 items-center rounded-lg border py-2 ${on ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}
            >
              <Text className={text(on)}>:{pad(minute)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text className="text-sm text-indigo-800">
        {dayLabel(value.day)}, ora {pad(value.hour)}:{pad(value.minute)}
        {summarySuffix ? ` — ${summarySuffix}` : ''}
      </Text>
    </View>
  );
}
