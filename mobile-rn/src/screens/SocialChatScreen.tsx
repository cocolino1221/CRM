import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, ResizeMode, Video as ExpoVideo } from 'expo-av';
import { ArrowLeft, AudioLines, CheckCircle2, Circle, Instagram, MessageCircle, Mic, Paperclip, Plus, RefreshCw, Send, Square, X } from 'lucide-react-native';
import api from '../lib/api';
import Avatar from '../components/Avatar';
import AudioLibrarySheet from '../components/AudioLibrarySheet';
import { useToastStore } from '../stores/toast-store';
import type { MetaConversation, MetaMessage } from '../types';
import type { WhatsAppStackParams } from '../navigation/WhatsAppStack';

type Nav = NativeStackNavigationProp<WhatsAppStackParams, 'SocialChat'>;
type ScreenRoute = RouteProp<WhatsAppStackParams, 'SocialChat'>;

type PendingAudioAttachment = {
  uri: string;
  name: string;
  mimeType: string;
};

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRecordingDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function inferAudioMimeTypeFromPath(path: string): string {
  const normalized = String(path || '').toLowerCase();
  if (normalized.endsWith('.mp3')) return 'audio/mpeg';
  if (normalized.endsWith('.wav') || normalized.endsWith('.wave')) return 'audio/wav';
  if (normalized.endsWith('.ogg')) return 'audio/ogg';
  if (normalized.endsWith('.opus')) return 'audio/opus';
  if (normalized.endsWith('.aac')) return 'audio/aac';
  if (normalized.endsWith('.amr')) return 'audio/amr';
  if (normalized.endsWith('.caf')) return 'audio/x-caf';
  if (normalized.endsWith('.m4a')) return 'audio/x-m4a';
  return 'audio/mp4';
}

function isAudioMessage(item: MetaMessage): boolean {
  const messageType = String(item.metadata?.messageType || '').trim().toLowerCase();
  const attachmentMimeType = String(item.metadata?.attachmentMimeType || '').trim().toLowerCase();
  const attachmentUrl = String(item.metadata?.attachmentUrl || '').trim().toLowerCase();
  const description = String(item.description || '').trim();

  return (
    messageType === 'audio'
    || attachmentMimeType.startsWith('audio/')
    || /\.(mp3|m4a|aac|ogg|wav|opus|amr|caf)(\?|$)/i.test(attachmentUrl)
    || description === '[Audio message]'
  );
}

function getMessageText(item: MetaMessage): string {
  const description = String(item.description || '').trim();
  if (!description || description === '[Audio message]') {
    return '';
  }
  return description;
}

function getAudioLabel(item: MetaMessage): string {
  return String(item.metadata?.attachmentName || '').trim() || 'Audio message';
}

export default function SocialChatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ScreenRoute>();
  const insets = useSafeAreaInsets();
  const showToast = useToastStore(s => s.show);
  const [conversation, setConversation] = useState<MetaConversation>(route.params.conversation);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [linkingLead, setLinkingLead] = useState(false);
  const [contactPreluat, setContactPreluat] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAudio, setPendingAudio] = useState<PendingAudioAttachment | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ source: { uri: string }; title: string } | null>(null);
  const [showAudioLibrary, setShowAudioLibrary] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [voiceInputError, setVoiceInputError] = useState('');
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceRecordingRef = useRef<Audio.Recording | null>(null);

  const isInstagram = conversation.channel === 'instagram';
  const accent = isInstagram ? '#c026d3' : '#2563eb';
  const ChannelIcon = isInstagram ? Instagram : MessageCircle;

  const loadConversation = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/integrations/meta-messaging/inbox', {
        params: { channel: conversation.channel },
      });

      const rows: MetaConversation[] = Array.isArray(response.data?.data) ? response.data.data : [];
      const nextConversation = rows.find((item) =>
        item.id === conversation.id
        || (
          item.channel === conversation.channel
          && item.integrationId === conversation.integrationId
          && item.externalUserId === conversation.externalUserId
        ),
      );

      if (nextConversation) {
        setConversation(nextConversation);
      }
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || 'Could not refresh this chat.', 'error');
    } finally {
      setLoading(false);
    }
  }, [conversation.channel, conversation.externalUserId, conversation.id, showToast]);

  useEffect(() => {
    void loadConversation();
  }, [loadConversation]);

  const sortedMessages = useMemo(
    () => [...(conversation.messages || [])].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
    [conversation.messages],
  );

  const uploadAudioFile = useCallback(async (payload: PendingAudioAttachment) => {
    const formData = new FormData();
    formData.append('file', {
      uri: payload.uri,
      type: payload.mimeType || 'audio/mp4',
      name: payload.name || `audio-${Date.now()}.m4a`,
    } as any);
    formData.append('subfolder', 'meta-audio');

    const response = await api.post('/upload/single', formData);
    const url = String(response.data?.url || '').trim();

    if (!url) {
      throw new Error('Upload did not return a URL');
    }

    return url;
  }, []);

  const handleSend = useCallback(async () => {
    if (sending || isVoiceRecording) {
      return;
    }

    if (pendingAudio) {
      setSending(true);
      try {
        const audioUrl = await uploadAudioFile(pendingAudio);
        await api.post('/integrations/meta-messaging/send/audio', {
          channel: conversation.channel,
          to: conversation.externalUserId,
          audioUrl,
          attachmentName: pendingAudio.name || undefined,
          ...(conversation.integrationId ? { integrationId: conversation.integrationId } : {}),
        });
        setPendingAudio(null);
        setMessage('');
        await loadConversation();
        showToast('Audio sent.', 'success');
      } catch (error: any) {
        showToast(error?.response?.data?.message || error?.message || 'Could not send this audio.', 'error');
      } finally {
        setSending(false);
      }
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    setSending(true);
    try {
      await api.post('/integrations/meta-messaging/send/text', {
        channel: conversation.channel,
        to: conversation.externalUserId,
        message: trimmed,
        ...(conversation.integrationId ? { integrationId: conversation.integrationId } : {}),
      });
      setMessage('');
      await loadConversation();
      showToast('Message sent.', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || 'Could not send this message.', 'error');
    } finally {
      setSending(false);
    }
  }, [
    conversation.channel,
    conversation.externalUserId,
    conversation.integrationId,
    isVoiceRecording,
    loadConversation,
    message,
    pendingAudio,
    sending,
    showToast,
    uploadAudioFile,
  ]);

  const handleAddToLead = useCallback(async () => {
    if (conversation.contactId) {
      return;
    }

    setLinkingLead(true);
    try {
      const response = await api.post('/integrations/meta-messaging/contacts/ensure', {
        channel: conversation.channel,
        externalUserId: conversation.externalUserId,
        senderName: conversation.contactName,
        integrationId: conversation.integrationId || undefined,
      });

      const created = response.data?.contact;
      if (created?.id) {
        setConversation((current) => ({
          ...current,
          contactId: String(created.id),
          contactName: `${String(created.firstName || '').trim()} ${String(created.lastName || '').trim()}`.trim() || current.contactName,
        }));
      }
      showToast('Lead added to CRM.', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || error?.message || 'Could not add this chat to CRM.', 'error');
    } finally {
      setLinkingLead(false);
    }
  }, [conversation.channel, conversation.contactId, conversation.contactName, conversation.externalUserId, showToast]);

  useEffect(() => {
    if (!conversation.contactId) {
      setContactPreluat(false);
      return;
    }
    api.get(`/contacts/${conversation.contactId}`)
      .then((res) => setContactPreluat(!!res.data?.preluat))
      .catch(() => setContactPreluat(false));
  }, [conversation.contactId]);

  const handleTogglePreluat = useCallback(async () => {
    if (!conversation.contactId) return;
    const nextValue = !contactPreluat;
    setContactPreluat(nextValue);
    try {
      await api.put(`/contacts/${conversation.contactId}/preluat`, { value: nextValue });
    } catch {
      setContactPreluat(!nextValue);
      showToast('Failed to update preluat', 'error');
    }
  }, [conversation.contactId, contactPreluat, showToast]);

  const handlePickAudio = useCallback(async () => {
    try {
      if (isVoiceRecording) {
        const activeRecording = voiceRecordingRef.current;
        voiceRecordingRef.current = null;
        if (voiceTimerRef.current) {
          clearInterval(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
        setIsVoiceRecording(false);
        setVoiceRecordingSeconds(0);
        await activeRecording?.stopAndUnloadAsync().catch(() => undefined);
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        }).catch(() => undefined);
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const file = result.assets[0];
      const mimeType = String(file.mimeType || '').trim() || inferAudioMimeTypeFromPath(file.name || file.uri);
      if (!mimeType.startsWith('audio/')) {
        showToast('Please choose an audio file.', 'error');
        return;
      }

      setPendingAudio({
        uri: file.uri,
        name: file.name || `audio-${Date.now()}.m4a`,
        mimeType,
      });
      setMessage('');
      setVoiceInputError('');
    } catch (error: any) {
      showToast(error?.message || 'Could not pick this audio file.', 'error');
    }
  }, [isVoiceRecording, showToast]);

  const stopVoiceTimer = useCallback(() => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }, []);

  const finalizeVoiceRecording = useCallback(async (discard = false) => {
    const recording = voiceRecordingRef.current;
    voiceRecordingRef.current = null;
    stopVoiceTimer();
    setIsVoiceRecording(false);

    if (!recording) {
      setVoiceRecordingSeconds(0);
      return;
    }

    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // Ignore cleanup stop failures.
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      // Ignore audio mode cleanup issues.
    }

    if (discard) {
      setVoiceRecordingSeconds(0);
      return;
    }

    const uri = recording.getURI();
    if (!uri) {
      setVoiceRecordingSeconds(0);
      setVoiceInputError('Audio recording is empty. Please try again.');
      return;
    }

    const extension = uri.toLowerCase().split('.').pop() || 'm4a';
    setPendingAudio({
      uri,
      name: `social-audio-${Date.now()}.${extension}`,
      mimeType: inferAudioMimeTypeFromPath(uri),
    });
    setVoiceRecordingSeconds(0);
    setMessage('');
    setVoiceInputError('');
  }, [stopVoiceTimer]);

  const startVoiceRecording = useCallback(async () => {
    if (isVoiceRecording || sending) {
      return;
    }

    setPendingAudio(null);
    setVoiceInputError('');

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceInputError('Microphone permission is required to record audio.');
        showToast('Allow microphone access to record audio.', 'error');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      voiceRecordingRef.current = recording;
      setIsVoiceRecording(true);
      setVoiceRecordingSeconds(0);
      stopVoiceTimer();
      voiceTimerRef.current = setInterval(() => {
        setVoiceRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (error: any) {
      await finalizeVoiceRecording(true);
      setVoiceInputError('Could not start audio recording.');
      showToast(error?.message || 'Could not start audio recording.', 'error');
    }
  }, [finalizeVoiceRecording, isVoiceRecording, sending, showToast, stopVoiceTimer]);

  const stopVoiceRecording = useCallback(async () => {
    await finalizeVoiceRecording(false);
  }, [finalizeVoiceRecording]);

  const cancelVoiceRecording = useCallback(async () => {
    await finalizeVoiceRecording(true);
    setVoiceInputError('');
  }, [finalizeVoiceRecording]);

  useEffect(() => (
    () => {
      stopVoiceTimer();
      const activeRecording = voiceRecordingRef.current;
      if (activeRecording) {
        activeRecording.stopAndUnloadAsync().catch(() => undefined);
        voiceRecordingRef.current = null;
      }
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => undefined);
    }
  ), [stopVoiceTimer]);

  const renderMessage = useCallback((item: MetaMessage) => {
    const isOutbound = item.direction === 'outbound';
    const bubbleClass = isOutbound ? 'self-end' : 'self-start';
    const audioMessage = isAudioMessage(item);
    const attachmentUrl = String(item.metadata?.attachmentUrl || '').trim();
    const bodyText = getMessageText(item);

    return (
      <View key={item.id} className={`max-w-[84%] ${bubbleClass}`}>
        <View
          className={`rounded-2xl px-4 py-2.5 shadow-sm ${
            isOutbound ? 'rounded-br-md' : 'rounded-bl-md bg-white border border-slate-100'
          }`}
          style={isOutbound ? { backgroundColor: accent } : undefined}
        >
          {audioMessage && attachmentUrl ? (
            <TouchableOpacity
              onPress={() => setMediaPreview({ source: { uri: attachmentUrl }, title: getAudioLabel(item) })}
              className={`rounded-2xl px-3 py-3 flex-row items-center gap-3 ${
                isOutbound ? 'bg-white/15' : 'bg-slate-100 border border-slate-200'
              }`}
              style={{ marginBottom: bodyText ? 12 : 8 }}
              activeOpacity={0.85}
            >
              <View className={`h-9 w-9 rounded-full items-center justify-center ${isOutbound ? 'bg-white/20' : 'bg-white'}`}>
                <Mic size={16} color={isOutbound ? '#fff' : accent} />
              </View>
              <View className="flex-1">
                <Text className={`text-sm font-semibold ${isOutbound ? 'text-white' : 'text-slate-900'}`}>
                  Play audio
                </Text>
                <Text className={`text-xs ${isOutbound ? 'text-white/80' : 'text-slate-500'}`} numberOfLines={1}>
                  {getAudioLabel(item)}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {bodyText ? (
            <Text className={`text-[15px] leading-6 ${isOutbound ? 'text-white' : 'text-slate-900'}`}>
              {bodyText}
            </Text>
          ) : null}

          <Text className={`mt-1.5 self-end text-[11px] ${isOutbound ? 'text-white/70' : 'text-slate-400'}`}>
            {timeLabel(item.occurredAt)}
          </Text>
        </View>
      </View>
    );
  }, [accent]);

  const canSendMessage = Boolean(message.trim() || pendingAudio);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-slate-50"
    >
      <View className="px-4 pb-4 bg-white border-b border-slate-200" style={{ paddingTop: insets.top + 10 }}>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="h-11 w-11 rounded-2xl bg-slate-100 items-center justify-center"
            activeOpacity={0.8}
          >
            <ArrowLeft size={18} color="#0f172a" />
          </TouchableOpacity>
          <Avatar name={conversation.contactName} size="md" />
          <View className="flex-1">
            <Text className="text-lg font-bold text-slate-900" numberOfLines={1}>
              {conversation.contactName}
            </Text>
            <View className="mt-1 flex-row items-center gap-2">
              <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${accent}15` }}>
                <View className="flex-row items-center gap-1">
                  <ChannelIcon size={12} color={accent} />
                  <Text style={{ color: accent }} className="text-[11px] font-semibold">
                    {isInstagram ? 'Instagram' : 'Messenger'}
                  </Text>
                </View>
              </View>
              {conversation.contactId ? (
                <View className="px-2 py-1 rounded-full bg-emerald-50">
                  <Text className="text-[11px] font-semibold text-emerald-600">Lead in CRM</Text>
                </View>
              ) : null}
              {!!conversation.messageProfileName && (
                <View className="px-2 py-1 rounded-full bg-emerald-50">
                  <Text className="text-[11px] font-semibold text-emerald-700" numberOfLines={1}>
                    {conversation.messageProfileName}
                  </Text>
                </View>
              )}
              {!!conversation.accountName && (
                <View className="px-2 py-1 rounded-full bg-slate-100">
                  <Text className="text-[11px] font-semibold text-slate-600" numberOfLines={1}>
                    {conversation.accountName}
                  </Text>
                </View>
              )}
            </View>
          </View>
          {conversation.contactId && (
            <TouchableOpacity
              onPress={() => void handleTogglePreluat()}
              className={`h-11 w-11 rounded-2xl items-center justify-center ${contactPreluat ? 'bg-emerald-500' : 'bg-slate-100'}`}
              activeOpacity={0.8}
            >
              {contactPreluat ? <CheckCircle2 size={18} color="#fff" /> : <Circle size={18} color="#334155" />}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={loadConversation}
            className="h-11 w-11 rounded-2xl bg-slate-100 items-center justify-center"
            activeOpacity={0.8}
          >
            <RefreshCw size={18} color="#334155" />
          </TouchableOpacity>
        </View>

        {!conversation.contactId ? (
          <TouchableOpacity
            onPress={handleAddToLead}
            disabled={linkingLead}
            className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 flex-row items-center justify-center gap-2"
            activeOpacity={0.85}
          >
            {linkingLead ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Plus size={16} color="#fff" />
                <Text className="text-sm font-semibold text-white">Add to Lead</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
      >
        {loading && !sortedMessages.length ? (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator color="#0f766e" />
            <Text className="mt-3 text-sm text-slate-500">Loading conversation...</Text>
          </View>
        ) : (
          <View className="gap-3">
            {sortedMessages.map(renderMessage)}
          </View>
        )}
      </ScrollView>

      <View
        className="px-4 pt-3 bg-white border-t border-slate-200"
        style={{ paddingBottom: (insets.bottom > 0 ? insets.bottom : 12) + 4 }}
      >
        {pendingAudio ? (
          <View className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-1">
                <Text className="text-xs font-semibold uppercase text-slate-500">Audio ready</Text>
                <Text className="mt-1 text-sm font-medium text-slate-900" numberOfLines={1}>
                  {pendingAudio.name}
                </Text>
                <Text className="mt-1 text-xs text-slate-500">Tap send to upload and deliver this audio clip.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPendingAudio(null)}
                className="h-9 w-9 rounded-full bg-white border border-slate-200 items-center justify-center"
                activeOpacity={0.8}
              >
                <X size={15} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {voiceInputError ? (
          <Text className="mb-2 text-xs text-amber-700">{voiceInputError}</Text>
        ) : null}

        {isVoiceRecording ? (
          <View className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-2">
                <Mic size={14} color="#be123c" />
                <Text className="text-xs font-semibold text-rose-700">
                  Recording audio • {formatRecordingDuration(voiceRecordingSeconds)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={cancelVoiceRecording}
                  className="rounded-xl border border-rose-200 bg-white px-3 py-2"
                  activeOpacity={0.85}
                >
                  <Text className="text-[11px] font-semibold text-rose-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={stopVoiceRecording}
                  className="rounded-xl bg-rose-600 px-3 py-2"
                  activeOpacity={0.85}
                >
                  <Text className="text-[11px] font-semibold text-white">Stop</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        <View className="flex-row items-end gap-2">
          <TouchableOpacity
            onPress={handlePickAudio}
            disabled={sending || isVoiceRecording}
            className="h-12 w-12 rounded-2xl bg-slate-100 border border-slate-200 items-center justify-center"
            style={{ opacity: sending || isVoiceRecording ? 0.5 : 1 }}
            activeOpacity={0.85}
          >
            <Paperclip size={17} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAudioLibrary(true)}
            disabled={sending || isVoiceRecording}
            className="h-12 w-12 rounded-2xl bg-teal-50 border border-teal-100 items-center justify-center"
            style={{ opacity: sending || isVoiceRecording ? 0.5 : 1 }}
            activeOpacity={0.85}
          >
            <AudioLines size={17} color="#0f766e" />
          </TouchableOpacity>
          <View className="flex-1 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-1">
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={
                pendingAudio
                  ? 'Audio ready to send'
                  : isVoiceRecording
                    ? 'Recording audio...'
                    : `Reply on ${isInstagram ? 'Instagram' : 'Messenger'}...`
              }
              placeholderTextColor="#94a3b8"
              multiline
              editable={!isVoiceRecording && !pendingAudio}
              className="py-3 text-[15px] text-slate-900"
            />
          </View>
          {canSendMessage ? (
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending || isVoiceRecording}
              className="h-12 w-12 rounded-2xl items-center justify-center"
              style={{ backgroundColor: sending || isVoiceRecording ? '#cbd5e1' : accent }}
              activeOpacity={0.85}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Send size={18} color="#fff" />}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={isVoiceRecording ? stopVoiceRecording : startVoiceRecording}
              disabled={sending}
              className="h-12 w-12 rounded-2xl items-center justify-center"
              style={{ backgroundColor: sending ? '#cbd5e1' : (isVoiceRecording ? '#e11d48' : '#0f766e') }}
              activeOpacity={0.85}
            >
              {isVoiceRecording ? <Square size={16} color="#fff" /> : <Mic size={18} color="#fff" />}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <AudioLibrarySheet
        visible={showAudioLibrary}
        onClose={() => setShowAudioLibrary(false)}
        channel={conversation.channel}
        to={conversation.externalUserId}
        integrationId={conversation.integrationId || undefined}
        onSent={() => void loadConversation()}
      />

      <Modal
        visible={!!mediaPreview}
        animationType="slide"
        transparent
        onRequestClose={() => setMediaPreview(null)}
      >
        <View className="flex-1 justify-end bg-black/70">
          <View className="rounded-t-3xl bg-slate-950 px-4 pt-3" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                {mediaPreview?.title || 'Audio'}
              </Text>
              <TouchableOpacity
                onPress={() => setMediaPreview(null)}
                className="h-8 w-8 rounded-full bg-white/10 items-center justify-center"
                activeOpacity={0.85}
              >
                <X size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            {mediaPreview?.source ? (
              <ExpoVideo
                source={mediaPreview.source as any}
                style={{
                  width: '100%',
                  height: 72,
                  borderRadius: 10,
                  backgroundColor: '#000',
                }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
