import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { PhoneOff, Mic, MicOff, PhoneCall, Minus, Circle, Square } from 'lucide-react-native';
import { useCallStore } from '../stores/call-store';

export default function CallModal() {
  const { isOpen, waId, contactName, phase, error, duration, muted, isRecording, recordingDuration, minimize, requestPermission, checkAgain, toggleMute, toggleRecording, hangUp, retry } = useCallStore();

  if (!isOpen || !waId) return null;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <Modal visible={isOpen} animationType="fade" transparent onRequestClose={minimize}>
      <View className="flex-1 bg-black/60 items-center justify-center px-6">
        <View className="w-full bg-white rounded-2xl overflow-hidden">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
            <Text className="text-sm font-semibold text-gray-900">WhatsApp Call</Text>
            <TouchableOpacity onPress={minimize} className="p-1">
              <Minus size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          <View className="px-6 py-8 items-center">
            <View className="h-16 w-16 rounded-full bg-emerald-500 items-center justify-center mb-3">
              <Text className="text-white text-xl font-bold">{contactName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text className="font-semibold text-gray-900 mb-2">{contactName}</Text>

            {phase === 'checking_permission' && (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#6b7280" />
                <Text className="text-sm text-gray-500 ml-2">Checking calling permission...</Text>
              </View>
            )}

            {phase === 'needs_permission' && (
              <>
                <Text className="text-sm text-gray-500 text-center mb-3">
                  {error || "This contact hasn't granted calling permission yet."}
                </Text>
                <TouchableOpacity onPress={() => void requestPermission()} className="px-4 py-2.5 bg-emerald-600 rounded-xl">
                  <Text className="text-sm font-semibold text-white">Request Calling Permission</Text>
                </TouchableOpacity>
              </>
            )}

            {phase === 'permission_requested' && (
              <>
                <Text className="text-sm text-gray-500 text-center mb-3">
                  Permission request sent. Waiting for {contactName} to accept it in WhatsApp.
                </Text>
                <TouchableOpacity onPress={checkAgain} className="px-4 py-2.5 border border-gray-300 rounded-xl">
                  <Text className="text-sm font-medium text-gray-700">Check Again</Text>
                </TouchableOpacity>
              </>
            )}

            {(phase === 'connecting' || phase === 'ringing') && (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color="#6b7280" />
                <Text className="text-sm text-gray-500 ml-2">{phase === 'connecting' ? 'Connecting...' : 'Ringing...'}</Text>
              </View>
            )}

            {phase === 'connected' && (
              <View className="items-center gap-1.5">
                <Text className="text-sm text-emerald-600 font-medium">Connected · {formatDuration(duration)}</Text>
                {isRecording && (
                  <View className="flex-row items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 border border-red-100">
                    <Circle size={8} color="#ef4444" fill="#ef4444" />
                    <Text className="text-[11px] font-semibold text-red-600">Recording · {formatDuration(recordingDuration)}</Text>
                  </View>
                )}
              </View>
            )}

            {phase === 'ended' && (
              <Text className="text-sm text-gray-500">Call ended{duration > 0 ? ` · ${formatDuration(duration)}` : ''}</Text>
            )}

            {phase === 'failed' && !!error && (
              <Text className="text-sm text-red-600 text-center">{error}</Text>
            )}

            <View className="flex-row items-center gap-4 mt-5">
              {phase === 'connected' && (
                <TouchableOpacity
                  onPress={toggleMute}
                  className={`h-12 w-12 rounded-full items-center justify-center border ${muted ? 'bg-gray-200 border-gray-300' : 'bg-white border-gray-200'}`}
                >
                  {muted ? <MicOff size={18} color="#374151" /> : <Mic size={18} color="#374151" />}
                </TouchableOpacity>
              )}
              {phase === 'connected' && (
                <TouchableOpacity
                  onPress={() => void toggleRecording()}
                  className={`h-12 w-12 rounded-full items-center justify-center border ${isRecording ? 'bg-red-600 border-red-600' : 'bg-white border-gray-200'}`}
                >
                  {isRecording ? (
                    <Square size={16} color="#fff" fill="#fff" />
                  ) : (
                    <Circle size={18} color="#ef4444" fill="#ef4444" />
                  )}
                </TouchableOpacity>
              )}
              {(phase === 'connecting' || phase === 'ringing' || phase === 'connected') && (
                <TouchableOpacity onPress={() => void hangUp()} className="h-12 w-12 rounded-full bg-red-600 items-center justify-center">
                  <PhoneOff size={20} color="#fff" />
                </TouchableOpacity>
              )}
              {phase === 'failed' && (
                <TouchableOpacity onPress={retry} className="flex-row items-center gap-2 px-4 py-2.5 bg-emerald-600 rounded-xl">
                  <PhoneCall size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white ml-2">Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
