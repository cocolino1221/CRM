import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, Linking, Modal, Alert,
} from 'react-native';
import {
  ArrowLeft, Send, Paperclip, X, Image as ImageIcon, FileText, Mic, Video,
  Check, CheckCheck, AlertTriangle, Clock, Users, Smile, Search, Zap, CornerUpLeft, Square, AudioLines,
  PhoneCall, Ban, GitBranch, CheckCircle2, Circle,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, Video as ExpoVideo, ResizeMode } from 'expo-av';
import api from '../lib/api';
import { useWhatsAppStore, type WhatsAppAttachmentPayload } from '../stores/whatsapp-store';
import { useToastStore } from '../stores/toast-store';
import { API_BASE_URL } from '../lib/api';
import Avatar from '../components/Avatar';
import AudioLibrarySheet from '../components/AudioLibrarySheet';
import { useCallStore } from '../stores/call-store';
import type { WhatsAppStackParams } from '../navigation/WhatsAppStack';
import type { WhatsAppActivity } from '../types';

type ChatRoute = RouteProp<WhatsAppStackParams, 'Chat'>;
const DRAFT_PREFIX = 'wa_draft_';
const QUICK_REPLIES_STORAGE_KEY = 'wa_mobile_quick_replies';
type TemplateItem = {
  name: string;
  language: string;
  status?: string;
  category?: string;
  requiresMediaHeader?: boolean;
  requiresDynamicParams?: boolean;
  headerMediaType?: 'image' | 'video' | 'document';
  headerMediaId?: string;
  headerMediaUrl?: string;
  hasReusableHeaderMedia?: boolean;
  components?: any[];
};

type QuickReply = {
  id: string;
  title: string;
  message: string;
};

type ReplyDraft = {
  messageId: string;
  previewText: string;
  direction: 'inbound' | 'outbound';
};

type PipelineStageOption = {
  id: string;
  name: string;
  displayOrder: number;
};

type PipelineOption = {
  id: string;
  name: string;
  isDefault?: boolean;
  stages: PipelineStageOption[];
};

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { id: 'qr_welcome', title: 'Welcome', message: 'Hey! Thanks for writing. How can I help you today?' },
  { id: 'qr_followup', title: 'Follow up', message: 'Just following up here. Do you want me to continue with the details?' },
  { id: 'qr_schedule', title: 'Schedule call', message: 'Great. Can we schedule a short call so I can help you faster?' },
];

function buildTemplateParameters(template: TemplateItem, fallbackName?: string): any[] {
  const components = Array.isArray(template.components) ? template.components : [];
  if (!components.length) return [];
  const baseName = String(fallbackName || '').trim() || 'there';
  const built: any[] = [];

  for (const component of components) {
    const type = String(component?.type || '').toUpperCase();
    if (!['HEADER', 'BODY'].includes(type)) continue;
    const text = String(component?.text || '');
    const placeholders = Array.from(text.matchAll(/\{\{\d+\}\}/g));
    if (!placeholders.length) continue;
    built.push({
      type: type.toLowerCase(),
      parameters: placeholders.map((_, index) => ({
        type: 'text',
        text: index === 0 ? baseName : '-',
      })),
    });
  }

  return built;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function getTimeLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRecordingDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseMessage(msg: WhatsAppActivity) {
  const desc = asText(msg.description);
  const t = asText(msg.metadata?.messageType || 'text').toLowerCase();
  const reactionEmoji = asText(msg.metadata?.reactionEmoji).trim();
  const templateMediaType = asText(msg.metadata?.mediaType).trim().toLowerCase();
  const mediaId = asText(msg.metadata?.mediaId).trim();
  const mediaUrl = asText(msg.metadata?.mediaUrl).trim();
  const fileName = asText(msg.metadata?.fileName).trim();
  const mediaCaption = asText(msg.metadata?.mediaCaption).trim();

  if (t === 'call') {
    return {
      type: 'call',
      text: desc,
      callStatus: asText(msg.metadata?.callStatus),
      callDurationSeconds: msg.metadata?.callDurationSeconds as number | undefined,
      recordingUrl: asText(msg.metadata?.recordingUrl) || undefined,
    };
  }
  if (reactionEmoji || t === 'reaction' || desc.startsWith('[Reaction]')) {
    return { type: 'reaction', text: reactionEmoji || desc.replace('[Reaction]', '').trim() || 'Reaction', emoji: reactionEmoji || '👍' };
  }
  if (t === 'template' && ['image', 'video', 'audio', 'document'].includes(templateMediaType)) {
    return {
      type: templateMediaType,
      text: desc,
      mediaId: mediaId || undefined,
      mediaUrl: mediaUrl || undefined,
      fileName: fileName || undefined,
      isTemplateMedia: true,
    };
  }
  if (t === 'image' || desc.startsWith('[Image]')) {
    return { type: 'image', text: desc.replace('[Image]', '').trim() || mediaCaption || 'Photo', mediaId: mediaId || undefined, mediaUrl: mediaUrl || undefined };
  }
  if (t === 'document' || desc.startsWith('[Document:')) {
    const m = desc.match(/\[Document:\s*([^\]]+)\]/);
    return {
      type: 'document',
      text: desc.replace(/\[Document:[^\]]*\]/, '').trim() || mediaCaption || '',
      fileName: fileName || m?.[1] || 'Document',
      mediaId: mediaId || undefined,
      mediaUrl: mediaUrl || undefined,
    };
  }
  if (t === 'audio' || desc === '[Voice message]') {
    return { type: 'audio', text: mediaCaption || 'Voice message', mediaId: mediaId || undefined, mediaUrl: mediaUrl || undefined };
  }
  if (t === 'video' || desc.startsWith('[Video]')) {
    return { type: 'video', text: desc.replace('[Video]', '').trim() || mediaCaption || 'Video', mediaId: mediaId || undefined, mediaUrl: mediaUrl || undefined };
  }
  if (t === 'template') {
    return { type: 'template', text: desc || '[Template message]' };
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
  if (type === 'reaction') return <Smile size={size} color={color} />;
  if (type === 'template') return <FileText size={size} color={color} />;
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

function getNameInitials(name?: string): string {
  const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return '??';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase();
}

function formatSourceLabel(source?: string | null): string {
  const raw = String(source || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'manychat') return 'ManyChat';
  if (normalized === 'typeform') return 'Typeform';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ChatScreen() {
  const route = useRoute<ChatRoute>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const {
    selectedConv,
    teamUsers,
    isSending,
    sendError,
    sendMessage,
    sendMediaMessage,
    fetchInbox,
    fetchAssignments,
    fetchTeamUsers,
    assignConversation,
    markRead,
    openConversation,
    blockConversation,
  } = useWhatsAppStore();
  const showToast = useToastStore(s => s.show);
  const [text, setText] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<WhatsAppAttachmentPayload | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{
    source: { uri: string; headers?: Record<string, string> };
    type: 'video' | 'audio';
    title: string;
  } | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [contactPipelineId, setContactPipelineId] = useState<string | null>(null);
  const [contactStageId, setContactStageId] = useState<string | null>(null);
  const [isLoadingPipelineInfo, setIsLoadingPipelineInfo] = useState(false);
  const [isSavingPipeline, setIsSavingPipeline] = useState(false);
  const [contactPreluat, setContactPreluat] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showAudioLibrary, setShowAudioLibrary] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearch, setMessageSearch] = useState('');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(DEFAULT_QUICK_REPLIES);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyDraft | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [voiceInputError, setVoiceInputError] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceRecordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    const iv = setInterval(fetchInbox, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    fetchAssignments();
    fetchTeamUsers();
  }, [fetchAssignments, fetchTeamUsers]);

  useEffect(() => {
    AsyncStorage.getItem('accessToken')
      .then((token) => setAccessToken(token || ''))
      .catch(() => setAccessToken(''));
  }, []);

  const templateIntegrationId = selectedConv?.waId === route.params.waId
    ? (selectedConv?.preferredSenderIntegrationId || undefined)
    : undefined;

  useEffect(() => {
    openConversation({
      waId: route.params.waId,
      phone: route.params.phone,
      contactName: route.params.contactName,
    });
  }, [route.params.waId, route.params.phone, route.params.contactName, openConversation]);

  useEffect(() => {
    if (!route.params.waId) return;
    markRead(route.params.waId);
  }, [route.params.waId, markRead]);

  useEffect(() => {
    if (sendError) showToast(sendError, 'error');
  }, [sendError]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(QUICK_REPLIES_STORAGE_KEY)
      .then((saved) => {
        if (!mounted || !saved) return;
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed
              .filter((item) => item && typeof item === 'object')
              .map((item) => ({
                id: String((item as any).id || `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
                title: String((item as any).title || '').trim(),
                message: String((item as any).message || '').trim(),
              }))
              .filter((item) => item.title && item.message);
            if (normalized.length) {
              setQuickReplies(normalized.slice(0, 20));
            }
          }
        } catch {
          // Keep defaults if storage payload is invalid.
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(QUICK_REPLIES_STORAGE_KEY, JSON.stringify(quickReplies)).catch(() => undefined);
  }, [quickReplies]);

  useEffect(() => {
    if (!showTemplatePicker) return;
    let active = true;
    setIsLoadingTemplates(true);
    api.get('/integrations/whatsapp/templates', {
      ...(templateIntegrationId ? { params: { integrationId: templateIntegrationId } } : {}),
    })
      .then((res) => {
        if (!active) return;
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        const mapped: TemplateItem[] = rows
          .map((tpl: any) => {
            const components = Array.isArray(tpl?.components) ? tpl.components : [];
            const headerComponent = components.find((component: any) => {
              const componentType = String(component?.type || '').toUpperCase();
              const headerFormat = String(component?.format || '').toUpperCase();
              return componentType === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat);
            });
            const headerMediaType = headerComponent
              ? String(headerComponent?.format || '').trim().toLowerCase() as TemplateItem['headerMediaType']
              : undefined;
            const headerMediaId = String(tpl?.headerMediaId || '').trim() || undefined;
            const headerMediaUrl = String(tpl?.headerMediaUrl || '').trim() || undefined;
            const requiresMediaHeader = Boolean(headerMediaType);
            const requiresDynamicParams = components.some((component: any) => {
              const componentText = String(component?.text || '');
              return /\{\{\d+\}\}/.test(componentText);
            });
            return {
              name: String(tpl?.name || '').trim(),
              language: String(tpl?.language || '').trim() || 'en',
              status: String(tpl?.status || '').trim(),
              category: String(tpl?.category || '').trim(),
              requiresMediaHeader,
              requiresDynamicParams,
              headerMediaType,
              headerMediaId,
              headerMediaUrl,
              hasReusableHeaderMedia: requiresMediaHeader && Boolean(headerMediaId || headerMediaUrl),
              components,
            };
          })
          .filter((tpl: TemplateItem) => tpl.name && String(tpl.status || '').toUpperCase() === 'APPROVED')
          .sort((a: TemplateItem, b: TemplateItem) => `${a.name}_${a.language}`.localeCompare(`${b.name}_${b.language}`));
        setTemplates(mapped);
        setSelectedTemplate((current) => {
          if (!current) return mapped[0] || null;
          const stillExists = mapped.some((tpl) => tpl.name === current.name && tpl.language === current.language);
          return stillExists ? current : (mapped[0] || null);
        });
      })
      .catch((err: any) => {
        if (!active) return;
        showToast(err?.response?.data?.message || 'Failed to load templates', 'error');
        setTemplates([]);
      })
      .finally(() => {
        if (active) setIsLoadingTemplates(false);
      });
    return () => {
      active = false;
    };
  }, [showTemplatePicker, showToast, templateIntegrationId]);

  // Draft load/save — must be before any conditional return to satisfy Rules of Hooks
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(`${DRAFT_PREFIX}${route.params.waId}`)
      .then((saved) => {
        if (!mounted) return;
        if (saved && !text.trim()) {
          setText(saved);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [route.params.waId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      AsyncStorage.setItem(`${DRAFT_PREFIX}${route.params.waId}`, text).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [route.params.waId, text]);

  const stopVoiceTimer = () => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const finalizeVoiceRecording = async (discard = false) => {
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
      // Ignore stop failures when recording is already stopped.
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      // Non-blocking cleanup.
    }

    if (discard) {
      setVoiceRecordingSeconds(0);
      return;
    }

    const uri = recording.getURI();
    if (!uri) {
      setVoiceRecordingSeconds(0);
      setVoiceInputError('Voice recording is empty. Please try again.');
      return;
    }

    const extension = uri.toLowerCase().split('.').pop() || 'm4a';
    const mimeType = extension === 'mp3'
      ? 'audio/mpeg'
      : extension === 'wav' || extension === 'wave'
        ? 'audio/wav'
        : extension === 'ogg'
          ? 'audio/ogg'
          : extension === 'aac'
            ? 'audio/aac'
            : extension === 'amr'
              ? 'audio/amr'
              : extension === 'caf'
                ? 'audio/x-caf'
                : extension === 'webm'
                  ? 'audio/webm'
                  : 'audio/mp4';

    setPendingAttachment({
      uri,
      name: `voice-note-${Date.now()}.${extension}`,
      mimeType,
      type: 'audio',
      isVoiceNote: true,
    });
    setText('');
    setVoiceInputError('');
  };

  const startVoiceRecording = async () => {
    if (isVoiceRecording || isSending) return;
    setVoiceInputError('');
    setShowQuickReplies(false);
    setShowTemplatePicker(false);
    setShowAssignModal(false);

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceInputError('Microphone permission is required to record voice notes.');
        showToast('Allow microphone access to record voice notes.', 'error');
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
        setVoiceRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error: any) {
      await finalizeVoiceRecording(true);
      setVoiceInputError('Could not start voice recording.');
      showToast(error?.message || 'Could not start voice recording.', 'error');
    }
  };

  const stopVoiceRecording = async () => {
    await finalizeVoiceRecording(false);
  };

  const cancelVoiceRecording = async () => {
    await finalizeVoiceRecording(true);
    setVoiceInputError('');
  };

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
  ), []);

  // These must run unconditionally on every render (Rules of Hooks) — the
  // `if (!conv) return` guard below means anything declared after it only
  // runs once `conv` resolves, which crashes React the moment it does
  // (hook count changes between renders). Both use the raw selectedConv
  // check directly since `conv` itself isn't computed until after this.
  const activeContactId = selectedConv?.waId === route.params.waId ? selectedConv?.contactId : undefined;

  useEffect(() => {
    api.get('/pipelines')
      .then((res: any) => {
        const list: PipelineOption[] = Array.isArray(res.data) ? res.data : [];
        setPipelines(list.map((p) => ({ ...p, stages: (p.stages || []).slice().sort((a, b) => a.displayOrder - b.displayOrder) })));
      })
      .catch(() => setPipelines([]));
  }, []);

  useEffect(() => {
    if (!activeContactId) {
      setContactPreluat(false);
      return;
    }
    api.get(`/contacts/${activeContactId}`)
      .then((res) => setContactPreluat(!!res.data?.preluat))
      .catch(() => setContactPreluat(false));
  }, [activeContactId]);

  const conv = selectedConv && selectedConv.waId === route.params.waId
    ? selectedConv
    : null;
  if (!conv) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="small" color="#0c4a6e" />
      </View>
    );
  }

  const session = getSessionStatus(conv.lastInboundTime);
    const normalizedSearch = messageSearch.trim().toLowerCase();
  const messages = normalizedSearch
    ? conv.messages.filter((message) => {
        const parsed = parseMessage(message);
        const searchableText = `${asText(message.description)} ${asText(parsed.text)} ${asText(parsed.fileName)}`.toLowerCase();
        return searchableText.includes(normalizedSearch);
      })
    : conv.messages;

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
    if (isSending || isVoiceRecording) return;

    if (pendingAttachment) {
      const payload: WhatsAppAttachmentPayload = {
        ...pendingAttachment,
        caption: pendingAttachment.type !== 'audio' ? (text.trim() || undefined) : undefined,
      };
      const ok = await sendMediaMessage(
        conv.waId,
        payload,
        conv.preferredSenderIntegrationId || undefined,
        replyingTo ? { replyToMessageId: replyingTo.messageId, replyPreviewText: replyingTo.previewText } : undefined,
      );
      if (ok) {
        setPendingAttachment(null);
        setText('');
        setReplyingTo(null);
        await AsyncStorage.removeItem(`${DRAFT_PREFIX}${conv.waId}`);
      }
      return;
    }

    if (!text.trim()) return;
    const msg = text.trim();
    setText('');
    const ok = await sendMessage(
      conv.waId,
      msg,
      conv.preferredSenderIntegrationId || undefined,
      replyingTo ? { replyToMessageId: replyingTo.messageId, replyPreviewText: replyingTo.previewText } : undefined,
    );
    if (ok) {
      setReplyingTo(null);
      await AsyncStorage.removeItem(`${DRAFT_PREFIX}${conv.waId}`);
    }
  };

  const handlePickAttachment = async () => {
    try {
      if (isVoiceRecording) {
        await cancelVoiceRecording();
      }
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
  const canSendMessage = Boolean(text.trim() || pendingAttachment);

  const assigned = conv.assignment;
  const sourceLabel = formatSourceLabel(conv.contactSource);

  const handleAssign = async (userId: string | null) => {
    if (isAssigning) return;
    setIsAssigning(true);
    const user = userId ? teamUsers.find((candidate) => candidate.id === userId) || null : null;
    const error = await assignConversation(conv.waId, user);
    setIsAssigning(false);
    if (error) {
      showToast(error, 'error');
      return;
    }
    setShowAssignModal(false);
    showToast(user ? `Assigned to ${user.firstName || user.email}` : 'Conversation unassigned', 'success');
  };

  const openPipelineModal = async () => {
    if (!conv.contactId) {
      showToast('No linked contact for this conversation yet', 'error');
      return;
    }
    setShowPipelineModal(true);
    setIsLoadingPipelineInfo(true);
    try {
      const res = await api.get(`/contacts/${conv.contactId}`);
      setContactPipelineId(res.data?.pipelineId || null);
      setContactStageId(res.data?.pipelineStageId || null);
    } catch {
      showToast('Failed to load pipeline info', 'error');
    } finally {
      setIsLoadingPipelineInfo(false);
    }
  };

  const handlePipelineSelect = (pipelineId: string) => {
    const pipeline = pipelines.find((p) => p.id === pipelineId);
    setContactPipelineId(pipelineId);
    setContactStageId(pipeline?.stages?.[0]?.id || null);
  };

  const handleSavePipeline = async () => {
    if (!conv.contactId || isSavingPipeline) return;
    setIsSavingPipeline(true);
    try {
      await api.put(`/pipelines/contacts/${conv.contactId}`, {
        ...(contactPipelineId ? { pipelineId: contactPipelineId } : {}),
        ...(contactStageId ? { pipelineStageId: contactStageId } : {}),
      });
      setShowPipelineModal(false);
      showToast('Pipeline updated', 'success');
    } catch {
      showToast('Failed to update pipeline', 'error');
    } finally {
      setIsSavingPipeline(false);
    }
  };

  const handleTogglePreluat = async () => {
    if (!conv.contactId) return;
    const nextValue = !contactPreluat;
    setContactPreluat(nextValue);
    try {
      await api.put(`/contacts/${conv.contactId}/preluat`, { value: nextValue });
    } catch {
      setContactPreluat(!nextValue);
      showToast('Failed to update preluat', 'error');
    }
  };

  const handleSendSelectedTemplate = async () => {
    if (!selectedTemplate || isSendingTemplate) return;
    if (selectedTemplate.requiresMediaHeader && !selectedTemplate.hasReusableHeaderMedia) {
      showToast('This template needs saved header media. Send it once from web first, then mobile can reuse it.', 'error');
      return;
    }
    setIsSendingTemplate(true);
    try {
      const parameters = buildTemplateParameters(selectedTemplate, conv.contactName);
      await api.post('/integrations/whatsapp/send/template', {
        to: conv.waId,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language || 'en',
        ...(conv.preferredSenderIntegrationId ? { integrationId: conv.preferredSenderIntegrationId } : {}),
        ...(parameters.length ? { parameters } : {}),
        ...(selectedTemplate.headerMediaType ? { headerMediaType: selectedTemplate.headerMediaType } : {}),
        ...(selectedTemplate.headerMediaId ? { headerMediaId: selectedTemplate.headerMediaId } : {}),
        ...(selectedTemplate.headerMediaUrl ? { headerMediaUrl: selectedTemplate.headerMediaUrl } : {}),
      });
      setShowTemplatePicker(false);
      showToast(`Template sent: ${selectedTemplate.name}`, 'success');
      await fetchInbox();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to send template', 'error');
    } finally {
      setIsSendingTemplate(false);
    }
  };

  const saveCurrentTextAsQuickReply = () => {
    const value = text.trim();
    if (!value) {
      showToast('Type a message first', 'error');
      return;
    }
    const exists = quickReplies.some((item) => item.message.trim().toLowerCase() === value.toLowerCase());
    if (exists) {
      showToast('Quick reply already saved', 'error');
      return;
    }
    const title = value.length > 24 ? `${value.slice(0, 24).trim()}...` : value;
    setQuickReplies((prev) => [
      { id: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, title, message: value },
      ...prev,
    ].slice(0, 20));
    showToast('Saved to quick replies', 'success');
  };

  const removeQuickReply = (id: string) => {
    setQuickReplies((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          <Text className="text-sm font-semibold text-white" numberOfLines={1}>{conv.contactName || route.params.contactName}</Text>
          {!!sourceLabel && (
            <Text className="text-[11px] text-sky-200" numberOfLines={1}>{sourceLabel}</Text>
          )}
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[11px] text-sky-100" numberOfLines={1}>{route.params.phone}</Text>
            {!!conv.blocked && (
              <View className="px-1.5 py-0.5 rounded-full bg-red-500/30 border border-red-300/40">
                <Text className="text-[9px] font-bold text-red-50">BLOCKED</Text>
              </View>
            )}
          </View>
          {!!conv.preferredSenderPhoneDisplay && (
            <Text className="text-[10px] text-sky-200" numberOfLines={1}>
              Sending from {conv.preferredSenderPhoneDisplay}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => {
            const result = useCallStore.getState().open(route.params.waId, conv.contactName || route.params.contactName);
            if (result === 'busy') {
              showToast('You have an active call with someone else — end it first', 'error');
            }
          }}
          className="h-8 w-8 rounded-full items-center justify-center border bg-white/15 border-white/30"
        >
          <PhoneCall size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            const nextBlocked = !conv.blocked;
            if (nextBlocked) {
              Alert.alert(
                'Block this contact?',
                'They will no longer be able to message this WhatsApp number, and auto-send will stop targeting them.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Block', style: 'destructive', onPress: () => void blockConversation(route.params.waId, true) },
                ],
              );
            } else {
              void blockConversation(route.params.waId, false);
            }
          }}
          className={`h-8 w-8 rounded-full items-center justify-center border ${conv.blocked ? 'bg-red-500/40 border-red-300/50' : 'bg-white/15 border-white/30'}`}
        >
          <Ban size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setShowMessageSearch((prev) => {
              const next = !prev;
              if (!next) setMessageSearch('');
              return next;
            });
          }}
          className={`h-8 w-8 rounded-full items-center justify-center border ${showMessageSearch ? 'bg-white/30 border-white/40' : 'bg-white/15 border-white/30'}`}
        >
          <Search size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowAssignModal(true)}
          className="mr-1 h-8 w-8 rounded-full items-center justify-center border border-white/30"
          style={{ backgroundColor: assigned?.color || 'rgba(255,255,255,0.15)' }}
        >
          {assigned ? (
            <Text className="text-[11px] font-bold text-white">{getNameInitials(assigned.userName)}</Text>
          ) : (
            <Users size={15} color="#fff" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void openPipelineModal()}
          className="mr-1 h-8 w-8 rounded-full items-center justify-center border bg-white/15 border-white/30"
        >
          <GitBranch size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void handleTogglePreluat()}
          className={`mr-1 h-8 w-8 rounded-full items-center justify-center border ${contactPreluat ? 'bg-emerald-500/80 border-emerald-300' : 'bg-white/15 border-white/30'}`}
        >
          {contactPreluat ? <CheckCircle2 size={15} color="#fff" /> : <Circle size={14} color="#fff" />}
        </TouchableOpacity>
        <View className={`${sessionBadge.bg} px-2 py-1 rounded-full`}>
          <Text className={`text-[10px] font-bold ${sessionBadge.text}`}>{sessionBadge.label}</Text>
        </View>
      </View>

      {showMessageSearch && (
        <View className="px-3 pb-2 bg-sky-800">
          <View className="bg-white/15 border border-white/25 rounded-xl px-3 py-2.5 flex-row items-center gap-2">
            <Search size={14} color="#e2e8f0" />
            <TextInput
              value={messageSearch}
              onChangeText={setMessageSearch}
              placeholder="Search in conversation..."
              placeholderTextColor="rgba(226,232,240,0.75)"
              className="flex-1 text-sm text-white"
            />
            {!!messageSearch && (
              <TouchableOpacity onPress={() => setMessageSearch('')}>
                <X size={14} color="#e2e8f0" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

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
        onContentSizeChange={() => {
          if (!normalizedSearch) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
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
          const time = getTimeLabel(msg.occurredAt);
          const status = msg.metadata?.messageStatus;

          if (parsed.type === 'call') {
            const isMissed = ['missed', 'no_answer', 'rejected'].includes(parsed.callStatus || '');
            return (
              <View className="items-center my-1">
                <TouchableOpacity
                  disabled={!parsed.recordingUrl}
                  onPress={async () => {
                    if (!parsed.recordingUrl) return;
                    try {
                      const { sound } = await Audio.Sound.createAsync({ uri: parsed.recordingUrl }, { shouldPlay: true });
                      sound.setOnPlaybackStatusUpdate((s) => { if ('didJustFinish' in s && s.didJustFinish) sound.unloadAsync(); });
                    } catch {
                      showToast('Could not play recording', 'error');
                    }
                  }}
                  className={`flex-row items-center gap-1.5 px-3 py-2 rounded-xl border ${isMissed ? 'bg-red-50 border-red-100' : 'bg-slate-100 border-slate-200'}`}
                >
                  <PhoneCall size={13} color={isMissed ? '#dc2626' : '#475569'} />
                  <Text className={`text-xs font-medium ${isMissed ? 'text-red-600' : 'text-slate-600'}`}>{parsed.text}</Text>
                  <Text className="text-xs text-slate-400">· {time}</Text>
                  {!!parsed.recordingUrl && <Text className="text-xs text-emerald-600 ml-1">▶</Text>}
                </TouchableOpacity>
              </View>
            );
          }

          return (
            <View className={`flex-row mb-1.5 ${isOut ? 'justify-end' : 'justify-start'}`}>
              <View
                className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl shadow-sm ${
                  isOut
                    ? 'bg-emerald-500 rounded-br-md'
                    : 'bg-white border border-slate-100 rounded-bl-md'
                }`}
                onTouchEnd={() => undefined}
              >
                <TouchableOpacity
                  activeOpacity={0.9}
                  onLongPress={() => {
                    const previewText = String(parsed.text || parsed.fileName || parsed.type || 'Message').trim().slice(0, 120);
                    setReplyingTo({
                      messageId: String(msg.metadata?.whatsappMessageId || msg.id),
                      previewText: previewText || 'Message',
                      direction: msg.direction,
                    });
                    showToast('Reply attached', 'success');
                  }}
                >
                  {!!msg.metadata?.replyPreviewText && (
                    <View className={`mb-1.5 px-2 py-1 rounded-lg ${isOut ? 'bg-emerald-600' : 'bg-slate-50 border border-slate-200'}`}>
                      <Text className={`text-[10px] font-semibold mb-0.5 ${isOut ? 'text-emerald-100' : 'text-slate-500'}`}>Reply</Text>
                      <Text className={`text-xs ${isOut ? 'text-white' : 'text-slate-700'}`} numberOfLines={2}>{msg.metadata.replyPreviewText}</Text>
                    </View>
                  )}
                {!['text', 'reaction'].includes(parsed.type) && (
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <MediaIcon type={parsed.type} />
                    <Text className={`text-xs font-medium capitalize ${isOut ? 'text-emerald-100' : 'text-slate-500'}`}>{parsed.type}</Text>
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
                  <TouchableOpacity
                    onPress={() => setMediaPreview({ source: mediaSource, type: 'video', title: parsed.text || 'Video' })}
                    className={`mb-1.5 px-3 py-2 rounded-xl flex-row items-center gap-2 ${isOut ? 'bg-white/20' : 'bg-slate-100 border border-slate-200'}`}
                  >
                    <Video size={14} color={isOut ? '#fff' : '#334155'} />
                    <Text className={`text-xs font-medium ${isOut ? 'text-white' : 'text-slate-700'}`}>Open video</Text>
                  </TouchableOpacity>
                )}
                {parsed.type === 'audio' && mediaSource && (
                  <TouchableOpacity
                    onPress={() => setMediaPreview({ source: mediaSource, type: 'audio', title: parsed.text || 'Audio' })}
                    className={`mb-1.5 px-3 py-2 rounded-xl flex-row items-center gap-2 ${isOut ? 'bg-white/20' : 'bg-slate-100 border border-slate-200'}`}
                  >
                    <Mic size={14} color={isOut ? '#fff' : '#334155'} />
                    <Text className={`text-xs font-medium ${isOut ? 'text-white' : 'text-slate-700'}`}>Play audio</Text>
                  </TouchableOpacity>
                )}
                {parsed.type === 'document' && parsed.mediaUrl && (
                  <TouchableOpacity onPress={() => Linking.openURL(parsed.mediaUrl || '')} className="mb-1">
                    <Text className={`text-xs underline ${isOut ? 'text-emerald-100' : 'text-blue-600'}`}>{parsed.fileName || 'Open document'}</Text>
                  </TouchableOpacity>
                )}
                {parsed.type === 'reaction' && (
                  <View className="flex-row items-center gap-1 mb-1">
                    <Text className="text-lg">{parsed.emoji || '👍'}</Text>
                    <Text className={`text-xs ${isOut ? 'text-emerald-100' : 'text-slate-500'}`}>reaction</Text>
                  </View>
                )}
                {parsed.type !== 'reaction' && !!parsed.text && (
                  <Text className={`text-[15px] leading-5.5 ${isOut ? 'text-white' : 'text-slate-900'}`}>{parsed.text}</Text>
                )}
                <View className="flex-row items-center justify-end gap-1 mt-1">
                  <Text className={`text-[10px] ${isOut ? 'text-emerald-100' : 'text-slate-400'}`}>{time}</Text>
                  {isOut && (
                    status === 'failed' ? <AlertTriangle size={12} color="#fecaca" /> :
                    status === 'read' ? <CheckCheck size={12} color="#7dd3fc" /> :
                    status === 'delivered' ? <CheckCheck size={12} color="#d1fae5" /> :
                    <Check size={12} color="#d1fae5" />
                  )}
                </View>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          normalizedSearch
            ? (
              <View className="items-center justify-center py-16">
                <Text className="text-sm font-semibold text-slate-500">No messages found</Text>
                <Text className="text-xs text-slate-400 mt-1">Try a different search term</Text>
              </View>
            )
            : null
        }
      />

      {/* Input */}
      <View style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }} className="bg-white border-t border-slate-200">
        {replyingTo && (
          <View className="mx-3 mt-2 px-3 py-2 rounded-xl border border-sky-100 bg-sky-50 flex-row items-start gap-2">
            <CornerUpLeft size={14} color="#0369a1" />
            <View className="flex-1 min-w-0">
              <Text className="text-[10px] font-semibold text-sky-700">
                Replying to {replyingTo.direction === 'inbound' ? 'contact' : 'you'}
              </Text>
              <Text className="text-xs text-slate-700" numberOfLines={2}>{replyingTo.previewText}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)}>
              <X size={14} color="#0369a1" />
            </TouchableOpacity>
          </View>
        )}
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
        {voiceInputError ? (
          <Text className="mx-3 mt-1 text-xs text-amber-700">{voiceInputError}</Text>
        ) : null}
        {isVoiceRecording && (
          <View className="mx-3 mt-2 mb-1 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Mic size={14} color="#be123c" />
                <Text className="text-xs font-semibold text-rose-700">
                  Recording voice note • {formatRecordingDuration(voiceRecordingSeconds)}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <TouchableOpacity
                  onPress={cancelVoiceRecording}
                  className="px-2 py-1 rounded-md border border-rose-200 bg-white"
                >
                  <Text className="text-[11px] font-semibold text-rose-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={stopVoiceRecording}
                  className="px-2 py-1 rounded-md bg-rose-600"
                >
                  <Text className="text-[11px] font-semibold text-white">Stop</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View className="px-3 py-2.5 flex-row items-end gap-2">
          <TouchableOpacity
            onPress={handlePickAttachment}
            disabled={isVoiceRecording}
            className="h-10 w-10 rounded-full bg-slate-100 items-center justify-center border border-slate-200"
            style={{ opacity: isVoiceRecording ? 0.5 : 1 }}
          >
            <Paperclip size={16} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowTemplatePicker(true)}
            disabled={isVoiceRecording}
            className="h-10 w-10 rounded-full bg-slate-100 items-center justify-center border border-slate-200"
            style={{ opacity: isVoiceRecording ? 0.5 : 1 }}
          >
            <FileText size={16} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowQuickReplies(true)}
            disabled={isVoiceRecording}
            className="h-10 w-10 rounded-full bg-slate-100 items-center justify-center border border-slate-200"
            style={{ opacity: isVoiceRecording ? 0.5 : 1 }}
          >
            <Zap size={16} color="#334155" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowAudioLibrary(true)}
            disabled={isVoiceRecording}
            className="h-10 w-10 rounded-full bg-teal-50 items-center justify-center border border-teal-100"
            style={{ opacity: isVoiceRecording ? 0.5 : 1 }}
          >
            <AudioLines size={16} color="#0f766e" />
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              pendingAttachment
                ? (pendingAttachment.type === 'audio' ? 'Optional note...' : 'Caption (optional)...')
                : isVoiceRecording
                  ? 'Recording voice note...'
                  : (session === 'closed' ? 'Type (session expired)...' : 'Type a message...')
            }
            placeholderTextColor="#94a3b8"
            multiline
            editable={!isVoiceRecording}
            className="flex-1 px-4 py-2.5 rounded-3xl border border-slate-200 bg-slate-50 text-sm text-slate-900 max-h-24"
          />
          {canSendMessage ? (
            <TouchableOpacity
              onPress={handleSend}
              disabled={isSending || isVoiceRecording}
              className="h-10 w-10 bg-sky-800 rounded-full items-center justify-center"
              style={{ opacity: (isSending || isVoiceRecording) ? 0.4 : 1 }}
            >
              {isSending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Send size={16} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={isVoiceRecording ? stopVoiceRecording : startVoiceRecording}
              disabled={isSending}
              className={`h-10 w-10 rounded-full items-center justify-center ${isVoiceRecording ? 'bg-rose-600' : 'bg-emerald-600'}`}
              style={{ opacity: isSending ? 0.4 : 1 }}
            >
              {isVoiceRecording ? <Square size={14} color="#fff" /> : <Mic size={16} color="#fff" />}
            </TouchableOpacity>
          )}
        </View>
      </View>


      <AudioLibrarySheet
        visible={showAudioLibrary}
        onClose={() => setShowAudioLibrary(false)}
        channel="whatsapp"
        to={route.params.waId}
        integrationId={templateIntegrationId}
        onSent={() => void openConversation({ waId: route.params.waId })}
      />

      <Modal visible={showQuickReplies} animationType="slide" transparent onRequestClose={() => setShowQuickReplies(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[72%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-bold text-slate-900">Quick replies</Text>
                <Text className="text-xs text-slate-500 mt-0.5">Tap one to insert in the composer</Text>
              </View>
              <TouchableOpacity onPress={() => setShowQuickReplies(false)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="px-4 pt-3">
              <TouchableOpacity
                onPress={saveCurrentTextAsQuickReply}
                className="px-3 py-2.5 rounded-xl border border-sky-200 bg-sky-50"
              >
                <Text className="text-xs font-semibold text-sky-700 text-center">Save current text as quick reply</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={quickReplies}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}
              renderItem={({ item }) => (
                <View className="py-2.5 px-1 border-b border-slate-100 flex-row items-center gap-2">
                  <View className="flex-1 min-w-0">
                    <TouchableOpacity
                      onPress={() => {
                        setText(item.message);
                        setShowQuickReplies(false);
                      }}
                    >
                      <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>{item.title}</Text>
                      <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={2}>{item.message}</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeQuickReply(item.id)}
                    className="h-7 w-7 rounded-full items-center justify-center bg-slate-100"
                  >
                    <X size={12} color="#64748b" />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View className="py-6">
                  <Text className="text-xs text-slate-400 text-center">No quick replies saved yet</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal visible={showTemplatePicker} animationType="slide" transparent onRequestClose={() => setShowTemplatePicker(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[72%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <Text className="text-base font-bold text-slate-900">Send template</Text>
              <TouchableOpacity onPress={() => setShowTemplatePicker(false)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={templates}
              keyExtractor={(item) => `${item.name}_${item.language}`}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}
              renderItem={({ item }) => {
                const isSelected = selectedTemplate?.name === item.name && selectedTemplate?.language === item.language;
                return (
                  <TouchableOpacity
                    onPress={() => setSelectedTemplate(item)}
                    className={`py-2.5 px-1 rounded-xl flex-row items-center gap-2 mb-1 ${isSelected ? 'bg-sky-50' : ''}`}
                  >
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-xs text-slate-500" numberOfLines={1}>
                        {item.language} • {item.category || 'template'}
                      </Text>
                    </View>
                    {isSelected && <Check size={16} color="#0284c7" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="py-4">
                  <Text className="text-xs text-slate-400">
                    {isLoadingTemplates ? 'Loading templates...' : 'No approved templates found'}
                  </Text>
                </View>
              }
            />
            {selectedTemplate?.requiresMediaHeader ? (
              <Text className="text-[11px] text-amber-600 px-4">
                {selectedTemplate.hasReusableHeaderMedia
                  ? `Saved ${selectedTemplate.headerMediaType || 'header'} media will be reused from your web setup.`
                  : 'This template needs header media. Send it once from web first so mobile can reuse it.'}
              </Text>
            ) : null}
            <View className="px-4 pt-2">
              <TouchableOpacity
                onPress={handleSendSelectedTemplate}
                disabled={!selectedTemplate || isSendingTemplate || Boolean(selectedTemplate?.requiresMediaHeader && !selectedTemplate?.hasReusableHeaderMedia)}
                className={`px-4 py-2.5 rounded-xl ${selectedTemplate && !isSendingTemplate && !(selectedTemplate.requiresMediaHeader && !selectedTemplate.hasReusableHeaderMedia) ? 'bg-sky-700' : 'bg-slate-300'}`}
              >
                <Text className="text-xs font-semibold text-white text-center">
                  {isSendingTemplate ? 'Sending...' : 'Send template'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAssignModal} animationType="slide" transparent onRequestClose={() => setShowAssignModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <View>
                <Text className="text-base font-bold text-slate-900">Assign conversation</Text>
                <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{conv.contactName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAssignModal(false)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={teamUsers}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 340 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
              renderItem={({ item }) => {
                const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email;
                const isCurrent = assigned?.userId === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => handleAssign(item.id)}
                    disabled={isAssigning}
                    className={`py-2.5 px-1 rounded-xl flex-row items-center gap-2 mb-1 ${isCurrent ? 'bg-sky-50' : ''}`}
                  >
                    <View className="h-8 w-8 rounded-full items-center justify-center" style={{ backgroundColor: assigned?.userId === item.id ? (assigned?.color || '#0ea5e9') : '#0f766e' }}>
                      <Text className="text-[11px] font-semibold text-white">{getNameInitials(fullName)}</Text>
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>{fullName}</Text>
                      <Text className="text-xs text-slate-500" numberOfLines={1}>{item.email}</Text>
                    </View>
                    {isCurrent && <Check size={16} color="#0284c7" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text className="text-xs text-slate-400 py-4">No team users available</Text>
              }
            />

            {assigned && (
              <View className="px-4 pt-1">
                <TouchableOpacity
                  onPress={() => handleAssign(null)}
                  disabled={isAssigning}
                  className="px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 items-center"
                >
                  <Text className="text-xs font-semibold text-rose-600">Unassign</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showPipelineModal} animationType="slide" transparent onRequestClose={() => setShowPipelineModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <View>
                <Text className="text-base font-bold text-slate-900">Pipeline</Text>
                <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{conv.contactName}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPipelineModal(false)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>

            {isLoadingPipelineInfo ? (
              <View className="py-8 items-center">
                <ActivityIndicator color="#0369a1" />
              </View>
            ) : (
              <View style={{ maxHeight: 420 }}>
                <View className="px-4 pt-3">
                  <Text className="text-xs font-semibold text-slate-500 mb-2">PIPELINE</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {pipelines.map((pipeline) => {
                      const isSelected = contactPipelineId === pipeline.id;
                      return (
                        <TouchableOpacity
                          key={pipeline.id}
                          onPress={() => handlePipelineSelect(pipeline.id)}
                          className={`px-3 py-1.5 rounded-full border ${isSelected ? 'bg-sky-700 border-sky-700' : 'bg-white border-slate-200'}`}
                        >
                          <Text className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-slate-700'}`}>{pipeline.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {contactPipelineId && (
                  <View className="px-4 pt-4">
                    <Text className="text-xs font-semibold text-slate-500 mb-2">STAGE</Text>
                    <FlatList
                      data={pipelines.find((p) => p.id === contactPipelineId)?.stages || []}
                      keyExtractor={(item) => item.id}
                      style={{ maxHeight: 220 }}
                      renderItem={({ item }) => {
                        const isCurrent = contactStageId === item.id;
                        return (
                          <TouchableOpacity
                            onPress={() => setContactStageId(item.id)}
                            className={`py-2.5 px-3 rounded-xl flex-row items-center justify-between mb-1 ${isCurrent ? 'bg-sky-50' : ''}`}
                          >
                            <Text className="text-sm font-medium text-slate-800">{item.name}</Text>
                            {isCurrent && <Check size={16} color="#0284c7" />}
                          </TouchableOpacity>
                        );
                      }}
                      ListEmptyComponent={
                        <Text className="text-xs text-slate-400 py-2">No stages in this pipeline</Text>
                      }
                    />
                  </View>
                )}

                <View className="px-4 pt-3">
                  <TouchableOpacity
                    onPress={() => void handleSavePipeline()}
                    disabled={isSavingPipeline || !contactPipelineId}
                    className={`px-4 py-2.5 rounded-xl items-center ${!isSavingPipeline && contactPipelineId ? 'bg-sky-700' : 'bg-slate-300'}`}
                  >
                    <Text className="text-xs font-semibold text-white">{isSavingPipeline ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!mediaPreview}
        animationType="slide"
        transparent
        onRequestClose={() => setMediaPreview(null)}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-slate-950 rounded-t-3xl px-4 pt-3" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                {mediaPreview?.title || (mediaPreview?.type === 'audio' ? 'Audio' : 'Video')}
              </Text>
              <TouchableOpacity onPress={() => setMediaPreview(null)} className="h-8 w-8 rounded-full bg-white/10 items-center justify-center">
                <X size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            {mediaPreview?.source && (
              <ExpoVideo
                source={mediaPreview.source as any}
                style={{
                  width: '100%',
                  height: mediaPreview.type === 'audio' ? 70 : 240,
                  borderRadius: 10,
                  backgroundColor: '#000',
                }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={mediaPreview.type === 'audio'}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
