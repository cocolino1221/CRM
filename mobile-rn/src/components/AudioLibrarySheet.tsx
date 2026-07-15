import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { AudioLines, Pause, Play, Send, X } from 'lucide-react-native';
import api from '../lib/api';
import { useToastStore } from '../stores/toast-store';

// Workspace-wide saved voice notes (backend: /audio-library).
// One sheet, reused by WhatsApp + Messenger + Instagram chats.
export type AudioClip = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AudioLibrarySheet({
  visible,
  onClose,
  channel,
  to,
  integrationId,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  channel: 'whatsapp' | 'messenger' | 'instagram';
  to: string;
  integrationId?: string;
  onSent?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const showToast = useToastStore((s) => s.show);
  const [loading, setLoading] = useState(true);
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [sendingId, setSendingId] = useState('');
  const [playingId, setPlayingId] = useState('');
  const soundRef = useRef<Audio.Sound | null>(null);

  const stopPreview = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    setPlayingId('');
    if (sound) {
      await sound.stopAsync().catch(() => undefined);
      await sound.unloadAsync().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      void stopPreview();
      return;
    }

    let active = true;
    setLoading(true);
    api
      .get('/audio-library')
      .then((res) => {
        if (active) setClips(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (active) showToast('Could not load the audio library.', 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [visible, showToast, stopPreview]);

  useEffect(() => () => { void stopPreview(); }, [stopPreview]);

  const togglePreview = useCallback(async (clip: AudioClip) => {
    if (playingId === clip.id) {
      await stopPreview();
      return;
    }
    await stopPreview();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
      const { sound } = await Audio.Sound.createAsync({ uri: clip.url }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingId(clip.id);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void stopPreview();
        }
      });
    } catch {
      showToast('Could not play this clip.', 'error');
    }
  }, [playingId, showToast, stopPreview]);

  const sendClip = useCallback(async (clip: AudioClip) => {
    if (sendingId) return;
    setSendingId(clip.id);
    try {
      await api.post(`/audio-library/${clip.id}/send`, {
        channel,
        to,
        ...(integrationId ? { integrationId } : {}),
      });
      showToast(`"${clip.name}" sent.`, 'success');
      onSent?.();
      onClose();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Could not send this clip.', 'error');
    } finally {
      setSendingId('');
    }
  }, [channel, integrationId, onClose, onSent, sendingId, showToast, to]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View
          className="rounded-t-[28px] bg-white px-4 pt-4"
          style={{ paddingBottom: (insets.bottom > 0 ? insets.bottom : 16) + 4, maxHeight: '75%' }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 rounded-2xl bg-teal-50 items-center justify-center">
                <AudioLines size={17} color="#0f766e" />
              </View>
              <View>
                <Text className="text-base font-bold text-slate-900">Audio library</Text>
                <Text className="text-[11px] text-slate-500">Saved voice notes — tap ▶ to preview, send with one tap</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="h-9 w-9 rounded-full bg-slate-100 items-center justify-center"
              activeOpacity={0.8}
            >
              <X size={16} color="#475569" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#0f766e" />
            </View>
          ) : clips.length === 0 ? (
            <View className="py-10 items-center px-6">
              <Text className="text-sm font-semibold text-slate-900">No saved audio clips yet</Text>
              <Text className="mt-1.5 text-xs text-slate-500 text-center">
                Record a voice note with the mic button, then save it to the library from the web app to reuse it here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={clips}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 8, gap: 8 }}
              renderItem={({ item }) => (
                <View className="flex-row items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                  <TouchableOpacity
                    onPress={() => void togglePreview(item)}
                    className={`h-10 w-10 rounded-full items-center justify-center ${
                      playingId === item.id ? 'bg-teal-600' : 'bg-white border border-slate-200'
                    }`}
                    activeOpacity={0.85}
                  >
                    {playingId === item.id
                      ? <Pause size={15} color="#fff" />
                      : <Play size={15} color="#0f766e" />}
                  </TouchableOpacity>
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>{item.name}</Text>
                    <Text className="text-[11px] text-slate-500">{formatSize(item.sizeBytes)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void sendClip(item)}
                    disabled={!!sendingId}
                    className="h-10 px-4 rounded-2xl bg-teal-600 flex-row items-center gap-1.5"
                    style={{ opacity: sendingId && sendingId !== item.id ? 0.5 : 1 }}
                    activeOpacity={0.85}
                  >
                    {sendingId === item.id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Send size={14} color="#fff" />}
                    <Text className="text-xs font-bold text-white">Send</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
