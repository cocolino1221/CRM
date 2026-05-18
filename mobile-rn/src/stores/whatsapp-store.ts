import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';
import type { Conversation, ConversationAssignment, User, WhatsAppActivity } from '../types';
import { useLeadsStore } from './leads-store';

export type WhatsAppAttachmentType = 'image' | 'video' | 'audio' | 'document';

export interface WhatsAppAttachmentPayload {
  uri: string;
  name: string;
  mimeType: string;
  type: WhatsAppAttachmentType;
  caption?: string;
}

interface PendingOutboxItem {
  id: string;
  waId: string;
  integrationId?: string;
  kind: 'text' | 'media';
  text?: string;
  media?: WhatsAppAttachmentPayload;
  retries: number;
  createdAt: string;
}

interface MessageSendOptions {
  replyToMessageId?: string;
  replyPreviewText?: string;
}

interface WhatsAppState {
  conversations: Conversation[];
  selectedConv: Conversation | null;
  assignments: Record<string, ConversationAssignment>;
  archivedMap: Record<string, boolean>;
  pinnedMap: Record<string, boolean>;
  mutedUntilMap: Record<string, string>;
  teamUsers: User[];
  pendingOutboxCount: number;
  isLoading: boolean;
  fetchError: string;
  isSending: boolean;
  sendError: string;
  fetchInbox: () => Promise<void>;
  fetchAssignments: () => Promise<void>;
  fetchTeamUsers: () => Promise<void>;
  assignConversation: (waId: string, user: User | null) => Promise<string | null>;
  selectConversation: (conv: Conversation | null) => Promise<void>;
  openConversation: (input: { waId?: string; phone?: string; contactName?: string; contactId?: string | null }) => Promise<Conversation | null>;
  sendMessage: (to: string, message: string, integrationId?: string, options?: MessageSendOptions) => Promise<boolean>;
  sendMediaMessage: (to: string, media: WhatsAppAttachmentPayload, integrationId?: string, options?: MessageSendOptions) => Promise<boolean>;
  markUnread: (waId: string) => Promise<void>;
  markRead: (waId: string) => Promise<void>;
  archiveConversation: (waId: string, archived?: boolean) => Promise<void>;
  pinConversation: (waId: string, pinned?: boolean) => Promise<void>;
  muteConversation: (waId: string, mutedUntil?: string | null) => Promise<void>;
  deleteConversation: (waId: string) => Promise<string | null>;
  syncOutbox: () => Promise<void>;
}

const USER_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#dc2626', '#ea580c', '#0891b2', '#be185d', '#65a30d'];
const ARCHIVED_STORAGE_KEY = 'wa_archived_conversations';
const PINNED_STORAGE_KEY = 'wa_pinned_conversations';
const MUTED_STORAGE_KEY = 'wa_muted_until_conversations';
const OUTBOX_STORAGE_KEY = 'wa_pending_outbox';

function getUserColor(userId: string): string {
  const hash = userId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function shouldQueueRetry(err: any): boolean {
  if (!err?.response) return true;
  const status = Number(err?.response?.status || 0);
  return status >= 500;
}

function shouldRetryWithoutIntegration(err: any): boolean {
  const rawMessage = err?.response?.data?.message ?? err?.message ?? '';
  const message = String(rawMessage).toLowerCase();
  return (
    message.includes('selected whatsapp number was not found')
    || message.includes('selected whatsapp sender number is disabled')
    || message.includes('selected whatsapp sender number is missing credentials')
  );
}

function createOutboxId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getReadTimestamps(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem('wa_read_timestamps');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setReadTimestamps(ts: Record<string, string>) {
  await AsyncStorage.setItem('wa_read_timestamps', JSON.stringify(ts));
}

async function getArchivedMap(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setArchivedMap(value: Record<string, boolean>) {
  await AsyncStorage.setItem(ARCHIVED_STORAGE_KEY, JSON.stringify(value));
}

async function getPinnedMap(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(PINNED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setPinnedMap(value: Record<string, boolean>) {
  await AsyncStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(value));
}

async function getMutedUntilMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(MUTED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setMutedUntilMap(value: Record<string, string>) {
  await AsyncStorage.setItem(MUTED_STORAGE_KEY, JSON.stringify(value));
}

async function getPendingOutbox(): Promise<PendingOutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setPendingOutbox(value: PendingOutboxItem[]) {
  await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(value));
}

async function getConversationStateFromServer(): Promise<{
  archivedMap: Record<string, boolean>;
  readAtMap: Record<string, string>;
  pinnedMap: Record<string, boolean>;
  mutedUntilMap: Record<string, string>;
}> {
  try {
    const res = await api.get('/integrations/whatsapp/conversations/state');
    const raw = res.data?.data || {};
    const archivedRaw = raw.archivedMap && typeof raw.archivedMap === 'object' ? raw.archivedMap : {};
    const readRaw = raw.readAtMap && typeof raw.readAtMap === 'object' ? raw.readAtMap : {};
    const pinnedRaw = raw.pinnedMap && typeof raw.pinnedMap === 'object' ? raw.pinnedMap : {};
    const mutedRaw = raw.mutedUntilMap && typeof raw.mutedUntilMap === 'object' ? raw.mutedUntilMap : {};
    const archivedMap: Record<string, boolean> = {};
    const readAtMap: Record<string, string> = {};
    const pinnedMap: Record<string, boolean> = {};
    const mutedUntilMap: Record<string, string> = {};

    for (const [waId, archived] of Object.entries(archivedRaw)) {
      const normalizedWaId = normalizeWaId(String(waId || ''));
      if (!normalizedWaId) continue;
      if (archived) archivedMap[normalizedWaId] = true;
    }
    for (const [waId, readAtRaw] of Object.entries(readRaw)) {
      const normalizedWaId = normalizeWaId(String(waId || ''));
      if (!normalizedWaId) continue;
      const readAt = String(readAtRaw || '').trim();
      if (!readAt) continue;
      const parsed = new Date(readAt);
      if (Number.isNaN(parsed.getTime())) continue;
      readAtMap[normalizedWaId] = parsed.toISOString();
    }
    for (const [waId, pinned] of Object.entries(pinnedRaw)) {
      const normalizedWaId = normalizeWaId(String(waId || ''));
      if (!normalizedWaId) continue;
      if (pinned) pinnedMap[normalizedWaId] = true;
    }
    for (const [waId, mutedUntilRaw] of Object.entries(mutedRaw)) {
      const normalizedWaId = normalizeWaId(String(waId || ''));
      if (!normalizedWaId) continue;
      const mutedUntil = String(mutedUntilRaw || '').trim();
      if (!mutedUntil) continue;
      const parsed = new Date(mutedUntil);
      if (Number.isNaN(parsed.getTime())) continue;
      mutedUntilMap[normalizedWaId] = parsed.toISOString();
    }
    return { archivedMap, readAtMap, pinnedMap, mutedUntilMap };
  } catch {
    return { archivedMap: {}, readAtMap: {}, pinnedMap: {}, mutedUntilMap: {} };
  }
}

async function uploadMediaFile(payload: WhatsAppAttachmentPayload, integrationId?: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', {
    uri: payload.uri,
    type: payload.mimeType || 'application/octet-stream',
    name: payload.name || `upload-${Date.now()}`,
  } as any);
  const res = await api.post('/integrations/whatsapp/media/upload', formData, {
    ...(integrationId ? { params: { integrationId } } : {}),
  });
  const mediaId = String(res.data?.id || '').trim();
  if (!mediaId) {
    throw new Error('Media upload failed');
  }
  return mediaId;
}

function buildMediaSendRequest(
  to: string,
  mediaId: string,
  payload: WhatsAppAttachmentPayload,
  integrationId?: string,
) {
  const withIntegration = (body: Record<string, any>) => (
    integrationId ? { ...body, integrationId } : body
  );
  switch (payload.type) {
    case 'image':
      return {
        endpoint: '/integrations/whatsapp/send/image',
        body: withIntegration({ to, imageId: mediaId, caption: payload.caption || undefined }),
      };
    case 'video':
      return {
        endpoint: '/integrations/whatsapp/send/video',
        body: withIntegration({ to, videoId: mediaId, caption: payload.caption || undefined }),
      };
    case 'audio':
      return {
        endpoint: '/integrations/whatsapp/send/audio',
        body: withIntegration({ to, audioId: mediaId }),
      };
    default:
      return {
        endpoint: '/integrations/whatsapp/send/document',
        body: withIntegration({
          to,
          documentId: mediaId,
          filename: payload.name || undefined,
          caption: payload.caption || undefined,
        }),
      };
  }
}

async function sendTextNow(to: string, message: string, integrationId?: string, options?: MessageSendOptions): Promise<void> {
  const replyToMessageId = String(options?.replyToMessageId || '').trim() || undefined;
  const replyPreviewText = String(options?.replyPreviewText || '').trim() || undefined;
  const sendWithIntegration = async (selectedIntegrationId?: string) => {
    const payload = selectedIntegrationId ? { to, message, integrationId: selectedIntegrationId } : { to, message };
    await api.post('/integrations/whatsapp/send', {
      ...payload,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(replyPreviewText ? { replyPreviewText } : {}),
    });
  };

  try {
    await sendWithIntegration(integrationId);
  } catch (err) {
    if (integrationId && shouldRetryWithoutIntegration(err)) {
      await sendWithIntegration(undefined);
      return;
    }
    throw err;
  }
}

async function sendMediaNow(
  to: string,
  payload: WhatsAppAttachmentPayload,
  integrationId?: string,
  options?: MessageSendOptions,
): Promise<void> {
  const replyToMessageId = String(options?.replyToMessageId || '').trim() || undefined;
  const replyPreviewText = String(options?.replyPreviewText || '').trim() || undefined;
  const sendWithIntegration = async (selectedIntegrationId?: string) => {
    const mediaId = await uploadMediaFile(payload, selectedIntegrationId);
    const request = buildMediaSendRequest(to, mediaId, payload, selectedIntegrationId);
    await api.post(request.endpoint, {
      ...request.body,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(replyPreviewText ? { replyPreviewText } : {}),
    });
  };

  try {
    await sendWithIntegration(integrationId);
  } catch (err) {
    if (integrationId && shouldRetryWithoutIntegration(err)) {
      await sendWithIntegration(undefined);
      return;
    }
    throw err;
  }
}

function normalizeWaId(value?: string): string {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizePhone(value?: string, waId?: string): string {
  const digits = normalizeWaId(value || waId);
  return digits ? `+${digits}` : '';
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

function normalizeOccurredAt(value: unknown): string {
  const raw = asText(value).trim();
  const parsed = raw ? new Date(raw) : new Date(NaN);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function normalizeDirection(value: unknown): 'inbound' | 'outbound' {
  return String(value || '').toLowerCase() === 'outbound' ? 'outbound' : 'inbound';
}

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  conversations: [],
  selectedConv: null,
  assignments: {},
  archivedMap: {},
  pinnedMap: {},
  mutedUntilMap: {},
  teamUsers: [],
  pendingOutboxCount: 0,
  isLoading: true,
  fetchError: '',
  isSending: false,
  sendError: '',

  fetchInbox: async () => {
    try {
      const [inboxRes, serverState, localReadTimestamps, localArchivedMap, localPinnedMap, localMutedUntilMap] = await Promise.all([
        api.get('/integrations/whatsapp/inbox?limit=200'),
        getConversationStateFromServer(),
        getReadTimestamps(),
        getArchivedMap(),
        getPinnedMap(),
        getMutedUntilMap(),
      ]);
      const rawActivities = Array.isArray(inboxRes.data?.data) ? inboxRes.data.data : [];
      const readTimestamps = { ...localReadTimestamps, ...serverState.readAtMap };
      const archivedMap = { ...localArchivedMap, ...serverState.archivedMap };
      const pinnedMap = { ...localPinnedMap, ...serverState.pinnedMap };
      const mutedUntilMap = { ...localMutedUntilMap, ...serverState.mutedUntilMap };
      await setReadTimestamps(readTimestamps);
      await setArchivedMap(archivedMap);
      await setPinnedMap(pinnedMap);
      await setMutedUntilMap(mutedUntilMap);
      const convMap = new Map<string, Conversation>();
      const latestInboundByConversation = new Map<string, number>();

      for (const rawAct of rawActivities) {
        if (!rawAct || typeof rawAct !== 'object') continue;
        const raw = rawAct as Record<string, any>;
        const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {};
        const contactRaw = raw.contact && typeof raw.contact === 'object' ? raw.contact : null;
        const occurredAt = normalizeOccurredAt(raw.occurredAt);
        const activity: WhatsAppActivity = {
          id: asText(raw.id) || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          title: asText(raw.title),
          description: asText(raw.description),
          direction: normalizeDirection(raw.direction),
          occurredAt,
          metadata: {
            whatsappMessageId: asText(metadata.whatsappMessageId) || undefined,
            waId: asText(metadata.waId) || undefined,
            messageType: asText(metadata.messageType) || undefined,
            messageStatus: ['sent', 'delivered', 'read', 'failed'].includes(String(metadata.messageStatus))
              ? metadata.messageStatus
              : undefined,
            senderIntegrationId: asText(metadata.senderIntegrationId) || undefined,
            senderPhoneNumberId: asText(metadata.senderPhoneNumberId) || undefined,
            senderPhoneDisplay: asText(metadata.senderPhoneDisplay) || undefined,
            mediaId: asText(metadata.mediaId) || undefined,
            mediaUrl: asText(metadata.mediaUrl) || undefined,
            mediaType: ['image', 'video', 'audio', 'document', 'template'].includes(String(metadata.mediaType))
              ? metadata.mediaType
              : undefined,
            mediaMimeType: asText(metadata.mediaMimeType) || undefined,
            mediaCaption: asText(metadata.mediaCaption) || undefined,
            fileName: asText(metadata.fileName) || undefined,
            reactionEmoji: asText(metadata.reactionEmoji) || undefined,
            reactionMessageId: asText(metadata.reactionMessageId) || undefined,
            replyToMessageId: asText(metadata.replyToMessageId) || undefined,
            replyPreviewText: asText(metadata.replyPreviewText) || undefined,
          },
          contact: contactRaw ? {
            id: asText(contactRaw.id),
            firstName: asText(contactRaw.firstName),
            lastName: asText(contactRaw.lastName),
            phone: asText(contactRaw.phone),
            status: asText(contactRaw.status),
            source: asText(contactRaw.source) || undefined,
          } : null,
        };

        const metadataWaId = normalizeWaId(asText(activity.metadata?.waId));
        const contactPhoneRaw = asText(activity.contact?.phone);
        const phoneWaId = normalizeWaId(contactPhoneRaw);
        const waId = metadataWaId || phoneWaId || 'unknown';
        const phone = normalizePhone(contactPhoneRaw, waId) || `+${waId}`;
        const firstName = asText(activity.contact?.firstName);
        const lastName = asText(activity.contact?.lastName);
        const fullName = `${firstName} ${lastName}`.trim();
        const contactName = fullName || phone;
        const description = asText(activity.description);

        if (!convMap.has(waId)) {
          const assignment = get().assignments[waId] || null;
          convMap.set(waId, {
            waId, contactName, contactId: activity.contact?.id || null, phone,
            contactSource: activity.contact?.source || null,
            preferredSenderIntegrationId: activity.metadata?.senderIntegrationId || null,
            preferredSenderPhoneDisplay: activity.metadata?.senderPhoneDisplay || null,
            lastMessage: description, lastMessageTime: activity.occurredAt,
            messageCount: 0, messages: [], unreadCount: 0, lastInboundTime: null,
            assignment,
            archived: !!archivedMap[waId],
            pinned: !!pinnedMap[waId],
            mutedUntil: mutedUntilMap[waId] || null,
          });
        }
        const conv = convMap.get(waId)!;
        if (!conv.contactSource && asText(activity.contact?.source).trim()) {
          conv.contactSource = asText(activity.contact?.source);
        }
        conv.messages.push(activity);
        conv.messageCount++;
        if (!conv.preferredSenderIntegrationId && activity.metadata?.senderIntegrationId) {
          conv.preferredSenderIntegrationId = activity.metadata.senderIntegrationId;
        }
        if (!conv.preferredSenderPhoneDisplay && activity.metadata?.senderPhoneDisplay) {
          conv.preferredSenderPhoneDisplay = activity.metadata.senderPhoneDisplay;
        }

        if (new Date(activity.occurredAt) > new Date(conv.lastMessageTime)) {
          conv.lastMessage = description;
          conv.lastMessageTime = activity.occurredAt;
        }
        if (activity.direction === 'inbound') {
          const occurredAtMs = new Date(activity.occurredAt).getTime();
          const previousMs = latestInboundByConversation.get(waId) || Number.NEGATIVE_INFINITY;
          if (
            activity.metadata?.senderIntegrationId
            && occurredAtMs >= previousMs
          ) {
            conv.preferredSenderIntegrationId = activity.metadata.senderIntegrationId;
            if (activity.metadata?.senderPhoneDisplay) {
              conv.preferredSenderPhoneDisplay = activity.metadata.senderPhoneDisplay;
            }
            latestInboundByConversation.set(waId, occurredAtMs);
          }
          if (!conv.lastInboundTime || new Date(activity.occurredAt) > new Date(conv.lastInboundTime)) {
            conv.lastInboundTime = activity.occurredAt;
          }
          const lastRead = readTimestamps[waId];
          if (!lastRead || new Date(activity.occurredAt) > new Date(lastRead)) {
            conv.unreadCount++;
          }
        }
      }

      for (const conv of convMap.values()) {
        conv.messages.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
      }

      const convList = Array.from(convMap.values()).sort((a, b) => {
        const aPinned = !!pinnedMap[a.waId];
        const bPinned = !!pinnedMap[b.waId];
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });

      const selected = get().selectedConv;
      const updated = selected ? convList.find(c => c.waId === selected.waId) || null : null;
      const outbox = await getPendingOutbox();
      set({
        conversations: convList,
        selectedConv: updated,
        archivedMap,
        pinnedMap,
        mutedUntilMap,
        pendingOutboxCount: outbox.length,
        isLoading: false,
        fetchError: '',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load conversations';
      set({ isLoading: false, fetchError: msg });
    }
  },

  fetchAssignments: async () => {
    try {
      const res = await api.get('/integrations/whatsapp/assignments');
      const assignmentMap = (res.data?.data || {}) as Record<string, ConversationAssignment>;
      const conversations = get().conversations.map((conversation) => ({
        ...conversation,
        assignment: assignmentMap[conversation.waId] || null,
      }));
      const selected = get().selectedConv;
      const selectedConv = selected
        ? {
            ...selected,
            assignment: assignmentMap[selected.waId] || null,
          }
        : null;
      set({ assignments: assignmentMap, conversations, selectedConv });
    } catch {
      // Non-blocking: inbox should still work without assignment data.
    }
  },

  fetchTeamUsers: async () => {
    try {
      const res = await api.get('/users');
      const rows = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data?.users)
          ? res.data.users
          : Array.isArray(res.data)
            ? res.data
            : [];
      set({
        teamUsers: rows.filter((user: any) => user?.id).map((user: any) => ({
          id: String(user.id),
          email: String(user.email || ''),
          firstName: String(user.firstName || ''),
          lastName: String(user.lastName || ''),
          role: String(user.role || ''),
          status: typeof user.status === 'string' ? user.status : undefined,
          workspaceId: String(user.workspaceId || ''),
          avatar: typeof user.avatar === 'string' ? user.avatar : undefined,
          preferences: user.preferences,
        })),
      });
    } catch {
      // Non-blocking: assignment picker can be hidden when users cannot be loaded.
    }
  },

  assignConversation: async (waId, user) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) {
      return 'Conversation is invalid';
    }
    try {
      const assignment = user
        ? {
            userId: user.id,
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown User',
            color: getUserColor(user.id),
            assignedAt: new Date().toISOString(),
          }
        : null;
      await api.post(`/integrations/whatsapp/conversations/${normalizedWaId}/assign`, assignment ? {
        userId: assignment.userId,
        userName: assignment.userName,
        color: assignment.color,
      } : { userId: null });

      const nextAssignments = { ...get().assignments };
      if (assignment) {
        nextAssignments[normalizedWaId] = assignment;
      } else {
        delete nextAssignments[normalizedWaId];
      }

      const nextConversations = get().conversations.map((conversation) => (
        conversation.waId === normalizedWaId
          ? { ...conversation, assignment: assignment || null }
          : conversation
      ));
      const selected = get().selectedConv;
      const nextSelected = selected && selected.waId === normalizedWaId
        ? { ...selected, assignment: assignment || null }
        : selected;
      set({ assignments: nextAssignments, conversations: nextConversations, selectedConv: nextSelected });
      await useLeadsStore.getState().fetchContacts();
      return null;
    } catch (err: any) {
      return err?.response?.data?.message || 'Failed to assign conversation';
    }
  },

  selectConversation: async (conv) => {
    if (conv) {
      await get().markRead(conv.waId);
      conv.unreadCount = 0;
    }
    set({ selectedConv: conv });
  },

  openConversation: async ({ waId, phone, contactName, contactId }) => {
    const normalizedWaId = normalizeWaId(waId || phone);
    if (!normalizedWaId) return null;

    const normalizedPhone = normalizePhone(phone, normalizedWaId);
    const now = new Date().toISOString();
    const existing = get().conversations.find(
      (conv) => conv.waId === normalizedWaId || normalizeWaId(conv.phone) === normalizedWaId,
    );

    const conversation: Conversation = existing
      ? {
          ...existing,
          phone: existing.phone || normalizedPhone,
          contactName: existing.contactName || contactName || normalizedPhone || normalizedWaId,
          contactId: existing.contactId || contactId || null,
          contactSource: existing.contactSource || null,
          assignment: existing.assignment || get().assignments[normalizedWaId] || null,
          preferredSenderIntegrationId: existing.preferredSenderIntegrationId || null,
          preferredSenderPhoneDisplay: existing.preferredSenderPhoneDisplay || null,
          archived: false,
          unreadCount: 0,
          pinned: existing.pinned || false,
          mutedUntil: existing.mutedUntil || null,
        }
      : {
          waId: normalizedWaId,
          contactName: contactName || normalizedPhone || normalizedWaId,
          contactId: contactId || null,
          contactSource: null,
          preferredSenderIntegrationId: null,
          preferredSenderPhoneDisplay: null,
          phone: normalizedPhone || `+${normalizedWaId}`,
          lastMessage: '',
          lastMessageTime: now,
          messageCount: 0,
          messages: [],
          unreadCount: 0,
          lastInboundTime: null,
          assignment: get().assignments[normalizedWaId] || null,
          archived: false,
          pinned: !!get().pinnedMap[normalizedWaId],
          mutedUntil: get().mutedUntilMap[normalizedWaId] || null,
        };

    const nextConversations = existing
      ? get().conversations.map((conv) => (conv.waId === existing.waId ? conversation : conv))
      : [conversation, ...get().conversations];

    const ts = await getReadTimestamps();
    ts[conversation.waId] = now;
    await setReadTimestamps(ts);
    api.post(`/integrations/whatsapp/conversations/${conversation.waId}/read`, { read: true }).catch(() => undefined);

    const archivedMap = { ...get().archivedMap };
    if (archivedMap[conversation.waId]) {
      delete archivedMap[conversation.waId];
      await setArchivedMap(archivedMap);
      api.post(`/integrations/whatsapp/conversations/${conversation.waId}/archive`, { archived: false }).catch(() => undefined);
    }
    const conversationsWithState = nextConversations.map((entry) => (
      entry.waId === conversation.waId
        ? { ...entry, unreadCount: 0, archived: false }
        : entry
    ));
    set({
      selectedConv: { ...conversation, unreadCount: 0, archived: false },
      conversations: conversationsWithState,
      archivedMap,
    });

    return conversation;
  },

  sendMessage: async (to, message, integrationId, options) => {
    set({ isSending: true, sendError: '' });
    try {
      await sendTextNow(to, message, integrationId, options);
      set({ isSending: false });
      get().fetchInbox();
      return true;
    } catch (err: any) {
      if (shouldQueueRetry(err)) {
        const queue = await getPendingOutbox();
        queue.push({
          id: createOutboxId(),
          waId: normalizeWaId(to),
          integrationId: integrationId || undefined,
          kind: 'text',
          text: message,
          retries: 0,
          createdAt: new Date().toISOString(),
        });
        await setPendingOutbox(queue);
        set({
          isSending: false,
          pendingOutboxCount: queue.length,
          sendError: 'No connection. Message queued and will retry automatically.',
        });
        return true;
      }
      set({ isSending: false, sendError: err?.response?.data?.message || 'Send failed' });
      return false;
    }
  },

  sendMediaMessage: async (to, payload, integrationId, options) => {
    set({ isSending: true, sendError: '' });
    try {
      await sendMediaNow(to, payload, integrationId, options);
      set({ isSending: false });
      get().fetchInbox();
      return true;
    } catch (err: any) {
      if (shouldQueueRetry(err)) {
        const queue = await getPendingOutbox();
        queue.push({
          id: createOutboxId(),
          waId: normalizeWaId(to),
          integrationId: integrationId || undefined,
          kind: 'media',
          media: payload,
          retries: 0,
          createdAt: new Date().toISOString(),
        });
        await setPendingOutbox(queue);
        set({
          isSending: false,
          pendingOutboxCount: queue.length,
          sendError: 'No connection. Media queued and will retry automatically.',
        });
        return true;
      }
      set({ isSending: false, sendError: err?.response?.data?.message || err?.message || 'Media send failed' });
      return false;
    }
  },

  markUnread: async (waId) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) return;
    await api.post(`/integrations/whatsapp/conversations/${normalizedWaId}/read`, { read: false }).catch(() => undefined);
    const ts = await getReadTimestamps();
    delete ts[normalizedWaId];
    await setReadTimestamps(ts);
    const conversations = get().conversations.map((conversation) => (
      conversation.waId === normalizedWaId
        ? { ...conversation, unreadCount: Math.max(conversation.unreadCount, 1) }
        : conversation
    ));
    set({ conversations });
  },

  markRead: async (waId) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) return;
    await api.post(`/integrations/whatsapp/conversations/${normalizedWaId}/read`, { read: true }).catch(() => undefined);
    const ts = await getReadTimestamps();
    ts[normalizedWaId] = new Date().toISOString();
    await setReadTimestamps(ts);
    const conversations = get().conversations.map((conversation) => (
      conversation.waId === normalizedWaId
        ? { ...conversation, unreadCount: 0 }
        : conversation
    ));
    set({ conversations });
  },

  archiveConversation: async (waId, archived = true) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) return;
    await api.post(`/integrations/whatsapp/conversations/${normalizedWaId}/archive`, { archived }).catch(() => undefined);
    const map = { ...get().archivedMap };
    if (archived) {
      map[normalizedWaId] = true;
    } else {
      delete map[normalizedWaId];
    }
    await setArchivedMap(map);
    const conversations = get().conversations.map((conversation) => (
      conversation.waId === normalizedWaId
        ? { ...conversation, archived }
        : conversation
    ));
    const selected = get().selectedConv;
    const selectedConv = selected && selected.waId === normalizedWaId
      ? { ...selected, archived }
      : selected;
    set({ archivedMap: map, conversations, selectedConv });
  },

  pinConversation: async (waId, pinned = true) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) return;
    await api.post(`/integrations/whatsapp/conversations/${normalizedWaId}/pin`, { pinned }).catch(() => undefined);
    const map = { ...get().pinnedMap };
    if (pinned) {
      map[normalizedWaId] = true;
    } else {
      delete map[normalizedWaId];
    }
    await setPinnedMap(map);
    const conversations = [...get().conversations]
      .map((conversation) => (
        conversation.waId === normalizedWaId
          ? { ...conversation, pinned }
          : { ...conversation, pinned: !!map[conversation.waId] }
      ))
      .sort((a, b) => {
        const aPinned = !!map[a.waId];
        const bPinned = !!map[b.waId];
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
      });
    const selected = get().selectedConv;
    const selectedConv = selected && selected.waId === normalizedWaId
      ? { ...selected, pinned }
      : selected;
    set({ pinnedMap: map, conversations, selectedConv });
  },

  muteConversation: async (waId, mutedUntil = null) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) return;
    const normalizedMutedUntil = String(mutedUntil || '').trim() || null;
    await api.post(`/integrations/whatsapp/conversations/${normalizedWaId}/mute`, { mutedUntil: normalizedMutedUntil }).catch(() => undefined);
    const map = { ...get().mutedUntilMap };
    if (normalizedMutedUntil) {
      map[normalizedWaId] = normalizedMutedUntil;
    } else {
      delete map[normalizedWaId];
    }
    await setMutedUntilMap(map);
    const conversations = get().conversations.map((conversation) => (
      conversation.waId === normalizedWaId
        ? { ...conversation, mutedUntil: normalizedMutedUntil }
        : { ...conversation, mutedUntil: map[conversation.waId] || null }
    ));
    const selected = get().selectedConv;
    const selectedConv = selected && selected.waId === normalizedWaId
      ? { ...selected, mutedUntil: normalizedMutedUntil }
      : selected;
    set({ mutedUntilMap: map, conversations, selectedConv });
  },

  deleteConversation: async (waId) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) return 'Conversation is invalid';
    try {
      await api.delete(`/integrations/whatsapp/conversation/${normalizedWaId}`);
      const conversations = get().conversations.filter((conversation) => conversation.waId !== normalizedWaId);
      const selected = get().selectedConv;
      const selectedConv = selected && selected.waId === normalizedWaId ? null : selected;
      const archivedMap = { ...get().archivedMap };
      const pinnedMap = { ...get().pinnedMap };
      const mutedUntilMap = { ...get().mutedUntilMap };
      delete archivedMap[normalizedWaId];
      delete pinnedMap[normalizedWaId];
      delete mutedUntilMap[normalizedWaId];
      await setArchivedMap(archivedMap);
      await setPinnedMap(pinnedMap);
      await setMutedUntilMap(mutedUntilMap);
      set({ conversations, selectedConv, archivedMap, pinnedMap, mutedUntilMap });
      return null;
    } catch (err: any) {
      return err?.response?.data?.message || 'Failed to delete conversation';
    }
  },

  syncOutbox: async () => {
    const queue = await getPendingOutbox();
    if (!queue.length) {
      if (get().pendingOutboxCount !== 0) {
        set({ pendingOutboxCount: 0 });
      }
      return;
    }

    const remaining: PendingOutboxItem[] = [];
    let sentAny = false;

    for (const item of queue) {
      try {
        if (item.kind === 'text' && item.text) {
          await sendTextNow(item.waId, item.text, item.integrationId);
          sentAny = true;
          continue;
        }
        if (item.kind === 'media' && item.media) {
          await sendMediaNow(item.waId, item.media, item.integrationId);
          sentAny = true;
          continue;
        }
      } catch {
        if (item.retries < 5) {
          remaining.push({ ...item, retries: item.retries + 1 });
        }
        continue;
      }
    }

    await setPendingOutbox(remaining);
    set({ pendingOutboxCount: remaining.length });
    if (sentAny) {
      await get().fetchInbox();
    }
  },
}));
