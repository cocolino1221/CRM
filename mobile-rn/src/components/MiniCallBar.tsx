import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhoneCall, PhoneOff, Circle } from 'lucide-react-native';
import { useCallStore } from '../stores/call-store';

/** Persistent call-in-progress bar shown app-wide when the call modal is minimized. */
export default function MiniCallBar() {
  const { isOpen, waId, contactName, phase, duration, isRecording, maximize, hangUp } = useCallStore();
  const insets = useSafeAreaInsets();

  if (!waId || isOpen) return null;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const statusText =
    phase === 'connected' ? `Connected · ${formatDuration(duration)}`
    : phase === 'ringing' ? 'Ringing...'
    : phase === 'connecting' ? 'Connecting...'
    : phase === 'ended' ? 'Call ended'
    : phase === 'failed' ? 'Call failed'
    : 'Calling...';

  return (
    <TouchableOpacity
      onPress={maximize}
      activeOpacity={0.9}
      className="absolute left-3 right-3 z-50 flex-row items-center gap-3 pl-3 pr-3 py-2 rounded-full bg-slate-900 shadow-lg"
      style={{ top: insets.top + 6 }}
    >
      <View className="h-8 w-8 rounded-full bg-emerald-500 items-center justify-center">
        <PhoneCall size={14} color="#fff" />
      </View>
      <View className="flex-1">
        <Text className="text-xs font-semibold text-white" numberOfLines={1}>{contactName}</Text>
        <View className="flex-row items-center gap-1">
          {isRecording && <Circle size={6} color="#ef4444" fill="#ef4444" />}
          <Text className="text-[11px] text-slate-300">{statusText}</Text>
        </View>
      </View>
      {(phase === 'connecting' || phase === 'ringing' || phase === 'connected') && (
        <TouchableOpacity
          onPress={() => void hangUp()}
          className="h-8 w-8 rounded-full bg-red-600 items-center justify-center"
        >
          <PhoneOff size={14} color="#fff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
