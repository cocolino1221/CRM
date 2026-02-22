import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Linking,
} from 'react-native';
import {
  ArrowLeft, Send, Paperclip, X, Image as ImageIcon, FileText, Mic, Video,
  Check, CheckCheck, AlertTriangle, Clock,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { useWhatsAppStore, type WhatsAppAttachmentPayload } from '../stores/whatsapp-store';
import { useToastStore } from '../stores/toast-store';
import { API_BASE_URL } from '../lib/api';
import Avatar from '../components/Avatar';
import type { WhatsAppStackParams } from '../navigation/WhatsAppStack';
import type { WhatsAppActivity } from '../types';

type ChatRoute = RouteProp<WhatsAppStackParams, 'Chat'>;

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function parseMessage(msg: WhatsAppActivity) {
  const desc = msg.description || '';
  const t = msg.metadata?.messageType || 'text';
  const mediaId = msg.metadata?.mediaId;
  const mediaUrl = msg.metadata?.mediaUrl;
  if (t === 'image' || desc.startsWith('[Image]')) {
    return { type: 'image', text: desc.replace('[Image]', '').trim() || msg.metadata?.mediaCaption || 'Photo', mediaId, mediaUrl };
  }
  if (t === 'document' || desc.startsWith('[Document:')) {
    const m = desc.match(/\[Document:\s*([^\]]+)\]/);
    return {
      type: 'document',
      text: desc.replace(/\[Document:[^\]]*\]/, '').trim() || msg.metadata?.mediaCaption || '',
      fileName: msg.metadata?.fileName || m?.[1] || 'Document',
      mediaId,
      mediaUrl,
    };
  }
  if (t === 'audio' || desc === '[Voice message]') {
    return { type: 'audio', text: msg.metadata?.mediaCaption || 'Voice message', mediaId, mediaUrl };
  }
  if (t === 'video' || desc.startsWith('[Video]')) {
    return { type: 'video', text: desc.replace('[Video]', '').trim() || msg.metadata?.mediaCaption || 'Video', mediaId, mediaUrl };
  }
  return { type: 'text', text: desc };
}

function inferAttachmentType(mimeType: string): WhatsAppAttachmentPayload['type'] {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

function getSessionStatus(lastInbound: string | null): 'open' | 'closing' | 'closed' {
  if (!lastInbound) return 'closed';
  const hrs = (Date.now() - new Date(lastInbound).getTime()) / 3600000;
  return hrs < 20 ? 'open' : hrs < 24 ? 'closing' : 'closed';
}

function MediaIcon({ type }: { type: string }) {
  const size = 14;
  const color = '#64748b';
  if (type === 'image') return <ImageIcon size={size} color={color} />;
  if (type === 'document') return <FileText size={size} color={color} />;
  if (type === 'audio') return <Mic size={size} color={color} />;
  if (type === 'video') return <Video size={size} color={color} />;
  return null;
}

function buildMediaSource(
  parsed: ReturnType<typeof parseMessage>,
  accessToken: string,
): { uri: string; headers?: Record<string, string> } | null {
  if (parsed.mediaUrl) return { uri: parsed.mediaUrl };
  if (!parsed.mediaId) return null;
  const source: { uri: string; headers?: Record<string, string> } = {
    uri: `${API_BASE_URL}/integrations/whatsapp/media/${parsed.mediaId}/file`,
  };
  if (accessToken) {
    source.headers = { Authorization: `Bearer ${accessToken}` };
  }
  return source;
}

export default function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { selectedConv, isSending, sendError, sendMessage, sendMediaMessage, fetchInbox } = useWhatsAppStore();
  const showToast = useToastStore(s => s.show);
  const [text, setText] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<WhatsAppAttachmentPayload | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const iv = setInterval(fetchInbox, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('accessToken')
      .then((token) => setAccessToken(token || ''))
      .catch(() => setAccessToken(''));
  }, []);

  useEffect(() => {
    if (sendError) showToast(sendError, 'error');
  }, [sendError]);

  const conv = selectedConv;
  if (!conv) return null;

  const session = getSessionStatus(conv.lastInboundTime);
  const messages = conv.messages;

  // Group by date
  type Group = { label: string; msgs: WhatsAppActivity[] };
  const groups: Group[] = [];
  let currentLabel = '';
  for (const m of messages) {
    const label = getDateLabel(m.occurredAt);
    if (label !== currentLabel) {
      groups.push({ label, msgs: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].msgs.push(m);
  }

  // Flatten for FlatList: date headers + messages
  type FlatItem = { type: 'date'; label: string; key: string } | { type: 'msg'; msg: WhatsAppActivity; key: string };
  const flatItems: FlatItem[] = [];
  for (const g of groups) {
    flatItems.push({ type: 'date', label: g.label, key: `date-${g.label}` });
    for (const m of g.msgs) {
      flatItems.push({ type: 'msg', msg: m, key: m.id });
    }
  }

  const handleSend = async () => {
    if (isSending) return;

    if (pendingAttachment) {
      const payload: WhatsAppAttachmentPayload = {
        ...pendingAttachment,
        caption: pendingAttachment.type !== 'audio' ? (text.trim() || undefined) : undefined,
      };
      const ok = await sendMediaMessage(conv.waId, payload);
      if (ok) {
        setPendingAttachment(null);
        setText('');
      }
      return;
    }

    if (!text.trim()) return;
    const msg = text.trim();
    setText('');
    await sendMessage(conv.waId, msg);
  };

  const handlePickAttachment = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const file = result.assets[0];
      const mimeType = file.mimeType || 'application/octet-stream';
      setPendingAttachment({
        uri: file.uri,
        name: file.name || `file-${Date.now()}`,
        mimeType,
        type: inferAttachmentType(mimeType),
      });
    } catch (error: any) {
      showToast(error?.message || 'Cannot pick file', 'error');
    }
  };

  const sessionBadge = session === 'open'
    ? { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Open 24h' }
    : session === 'closing'
      ? { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Closing' }
      : { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Expired' };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-slate-50"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        className="px-3 pb-3 bg-sky-800 flex-row items-center gap-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-1.5 rounded-xl bg-white/15">
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <Avatar name={route.params.contactName} size="sm" />
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-white" numberOfLines={1}>{route.params.contactName}</Text>
          <Text className="text-[11px] text-sky-200" numberOfLines={1}>{route.params.phone}</Text>
        </View>
        <View className={`${sessionBadge.bg} px-2 py-1 rounded-full`}>
          <Text className={`text-[10px] font-bold ${sessionBadge.text}`}>{sessionBadge.label}</Text>
        </View>
      </View>

      {/* Session banner */}
      {session === 'closed' && (
        <View className="bg-amber-50 px-4 py-2 flex-row items-center gap-2 border-b border-amber-100">
          <Clock size={14} color="#b45309" />
          <Text className="text-xs text-amber-700 flex-1">24h session expired. Message may require a template.</Text>
        </View>
      )}
      {session === 'closing' && (
        <View className="bg-amber-50 px-4 py-1.5 flex-row items-center gap-2 border-b border-amber-100">
          <AlertTriangle size={14} color="#d97706" />
          <Text className="text-xs text-amber-600">Session closing soon</Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={flatItems}
        keyExtractor={item => item.key}
        contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          if (item.type === 'date') {
            return (
              <View className="items-center my-3">
                <View className="bg-white border border-slate-200 px-3 py-1 rounded-lg">
                  <Text className="text-[11px] font-semibold text-slate-500">{item.label}</Text>
                </View>
              </View>
            );
          }
          const msg = item.msg;
          const isOut = msg.direction === 'outbound';
          const parsed = parseMessage(msg);
          const mediaSource = buildMediaSource(parsed, accessToken);
          const time = new Date(msg.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const status = msg.metadata?.messageStatus;

          return (
            <View className={`flex-row mb-1.5 ${isOut ? 'justify-end' : 'justify-start'}`}>
              <View
                className={`max-w-[82%] px-3 py-2 rounded-2xl border ${
                  isOut
                    ? 'bg-teal-50 border-teal-100 rounded-br-sm'
                    : 'bg-white border-slate-200 rounded-bl-sm'
                }`}
              >
                {parsed.type !== 'text' && (
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <MediaIcon type={parsed.type} />
                    <Text className="text-xs font-medium text-slate-500 capitalize">{parsed.type}</Text>
                  </View>
                )}
                {parsed.type === 'image' && mediaSource && (
                  <Image
                    source={mediaSource}
                    style={{ width: 210, height: 210, borderRadius: 10, marginBottom: 6, backgroundColor: '#e2e8f0' }}
                    resizeMode="cover"
                  />
                )}
                {parsed.type === 'video' && mediaSource && (
                  <ExpoVideo
                    source={mediaSource as any}
                    style={{ width: 220, height: 140, borderRadius: 10, marginBottom: 6, backgroundColor: '#000' }}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                  />
                )}
                {parsed.type === 'audio' && mediaSource && (
                  <ExpoVideo
                    source={mediaSource as any}
                    style={{ width: 220, height: 44, borderRadius: 8, marginBottom: 6, backgroundColor: '#0f172a' }}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                  />
                )}
                {parsed.type === 'document' && parsed.mediaUrl && (
                  <TouchableOpacity onPress={() => Linking.openURL(parsed.mediaUrl || '')} className="mb-1">
                    <Text className="text-xs text-blue-600 underline">{parsed.fileName || 'Open document'}</Text>
                  </TouchableOpacity>
                )}
                {!!parsed.text && <Text className="text-sm leading-5 text-slate-900">{parsed.text}</Text>}
                <View className="flex-row items-center justify-end gap-1 mt-1">
                  <Text className="text-[10px] text-slate-400">{time}</Text>
                  {isOut && (
                    status === 'failed' ? <AlertTriangle size={12} color="#ef4444" /> :
                    status === 'read' ? <CheckCheck size={12} color="#3b82f6" /> :
                    status === 'delivered' ? <CheckCheck size={12} color="#94a3b8" /> :
                    <Check size={12} color="#94a3b8" />
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }} className="bg-white border-t border-slate-200">
        {pendingAttachment && (
          <View className="mx-3 mt-2 mb-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-xs font-semibold text-slate-600 uppercase">{pendingAttachment.type}</Text>
              <TouchableOpacity onPress={() => setPendingAttachment(null)}>
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
            {pendingAttachment.type === 'image' && (
              <Image
                source={{ uri: pendingAttachment.uri }}
                style={{ width: 100, height: 100, borderRadius: 8, marginBottom: 6, backgroundColor: '#e2e8f0' }}
                resizeMode="cover"
              />
            )}
            <Text className="text-xs text-slate-600" numberOfLines={1}>{pendingAttachment.name}</Text>
            <Text className="text-[11px] text-slate-400 mt-0.5">
              {pendingAttachment.type === 'audio' ? 'Tap send to upload audio' : 'Add an optional caption, then send'}
            </Text>
          </View>
        )}

        <View className="px-3 py-2.5 flex-row items-end gap-2">
          <TouchableOpacity
            onPress={handlePickAttachment}
            className="h-10 w-10 rounded-full bg-slate-100 items-center justify-center border border-slate-200"
          >
            <Paperclip size={16} color="#334155" />
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              pendingAttachment
                ? (pendingAttachment.type === 'audio' ? 'Optional note...' : 'Caption (optional)...')
                : (session === 'closed' ? 'Type (session expired)...' : 'Type a message...')
            }
            placeholderTextColor="#94a3b8"
            multiline
            className="flex-1 px-4 py-2.5 rounded-3xl border border-slate-200 bg-slate-50 text-sm text-slate-900 max-h-24"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={(!text.trim() && !pendingAttachment) || isSending}
            className="h-10 w-10 bg-sky-800 rounded-full items-center justify-center"
            style={{ opacity: ((!text.trim() && !pendingAttachment) || isSending) ? 0.4 : 1 }}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Send size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
