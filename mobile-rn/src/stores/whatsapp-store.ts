import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';
import type { Conversation, ConversationAssignment, User, WhatsAppActivity } from '../types';

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
  kind: 'text' | 'media';
  text?: string;
  media?: WhatsAppAttachmentPayload;
  retries: number;
  createdAt: string;
}

interface WhatsAppState {
  conversations: Conversation[];
  selectedConv: Conversation | null;
  assignments: Record<string, ConversationAssignment>;
  archivedMap: Record<string, boolean>;
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
  selectConversation: (conv: Conversation | null) => void;
  openConversation: (input: { waId?: string; phone?: string; contactName?: string; contactId?: string | null }) => Promise<Conversation | null>;
  sendMessage: (to: string, message: string) => Promise<boolean>;
  sendMediaMessage: (to: string, media: WhatsAppAttachmentPayload) => Promise<boolean>;
  markUnread: (waId: string) => Promise<void>;
  markRead: (waId: string) => void;
  archiveConversation: (waId: string, archived?: boolean) => Promise<void>;
  deleteConversation: (waId: string) => Promise<string | null>;
  syncOutbox: () => Promise<void>;
}

const USER_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#dc2626', '#ea580c', '#0891b2', '#be185d', '#65a30d'];
const ARCHIVED_STORAGE_KEY = 'wa_archived_conversations';
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

async function uploadMediaFile(payload: WhatsAppAttachmentPayload): Promise<string> {
  const formData = new FormData();
  formData.append('file', {
    uri: payload.uri,
    type: payload.mimeType || 'application/octet-stream',
    name: payload.name || `upload-${Date.now()}`,
  } as any);
  const res = await api.post('/integrations/whatsapp/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const mediaId = String(res.data?.id || '').trim();
  if (!mediaId) {
    throw new Error('Media upload failed');
  }
  return mediaId;
}

function buildMediaSendRequest(to: string, mediaId: string, payload: WhatsAppAttachmentPayload) {
  switch (payload.type) {
    case 'image':
      return {
        endpoint: '/integrations/whatsapp/send/image',
        body: { to, imageId: mediaId, caption: payload.caption || undefined },
      };
    case 'video':
      return {
        endpoint: '/integrations/whatsapp/send/video',
        body: { to, videoId: mediaId, caption: payload.caption || undefined },
      };
    case 'audio':
      return {
        endpoint: '/integrations/whatsapp/send/audio',
        body: { to, audioId: mediaId },
      };
    default:
      return {
        endpoint: '/integrations/whatsapp/send/document',
        body: {
          to,
          documentId: mediaId,
          filename: payload.name || undefined,
          caption: payload.caption || undefined,
        },
      };
  }
}

async function sendTextNow(to: string, message: string): Promise<void> {
  await api.post('/integrations/whatsapp/send', { to, message });
}

async function sendMediaNow(to: string, payload: WhatsAppAttachmentPayload): Promise<void> {
  const mediaId = await uploadMediaFile(payload);
  const request = buildMediaSendRequest(to, mediaId, payload);
  await api.post(request.endpoint, request.body);
}

function normalizeWaId(value?: string): string {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizePhone(value?: string, waId?: string): string {
  const raw = String(value || '').trim();
  if (raw.startsWith('+')) return raw;
  const digits = normalizeWaId(raw || waId);
  return digits ? `+${digits}` : '';
}

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  conversations: [],
  selectedConv: null,
  assignments: {},
  archivedMap: {},
  teamUsers: [],
  pendingOutboxCount: 0,
  isLoading: true,
  fetchError: '',
  isSending: false,
  sendError: '',

  fetchInbox: async () => {
    try {
      const res = await api.get('/integrations/whatsapp/inbox?limit=200');
      const activities: WhatsAppActivity[] = res.data.data || [];
      const readTimestamps = await getReadTimestamps();
      const archivedMap = await getArchivedMap();
      const convMap = new Map<string, Conversation>();

      for (const act of activities) {
        const waId = act.metadata?.waId || act.contact?.phone?.replace('+', '') || 'unknown';
        const phone = act.contact?.phone || `+${waId}`;
        const contactName = act.contact ? `${act.contact.firstName} ${act.contact.lastName}`.trim() : phone;

        if (!convMap.has(waId)) {
          const assignment = get().assignments[waId] || null;
          convMap.set(waId, {
            waId, contactName, contactId: act.contact?.id || null, phone,
            lastMessage: act.description || '', lastMessageTime: act.occurredAt,
            messageCount: 0, messages: [], unreadCount: 0, lastInboundTime: null,
            assignment,
            archived: !!archivedMap[waId],
          });
        }
        const conv = convMap.get(waId)!;
        conv.messages.push(act);
        conv.messageCount++;

        if (new Date(act.occurredAt) > new Date(conv.lastMessageTime)) {
          conv.lastMessage = act.description || '';
          conv.lastMessageTime = act.occurredAt;
        }
        if (act.direction === 'inbound') {
          if (!conv.lastInboundTime || new Date(act.occurredAt) > new Date(conv.lastInboundTime)) {
            conv.lastInboundTime = act.occurredAt;
          }
          const lastRead = readTimestamps[waId];
          if (!lastRead || new Date(act.occurredAt) > new Date(lastRead)) {
            conv.unreadCount++;
          }
        }
      }

      for (const conv of convMap.values()) {
        conv.messages.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
      }

      const convList = Array.from(convMap.values()).sort(
        (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime(),
      );

      const selected = get().selectedConv;
      const updated = selected ? convList.find(c => c.waId === selected.waId) || null : null;
      const outbox = await getPendingOutbox();
      set({
        conversations: convList,
        selectedConv: updated,
        archivedMap,
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
      return null;
    } catch (err: any) {
      return err?.response?.data?.message || 'Failed to assign conversation';
    }
  },

  selectConversation: async (conv) => {
    if (conv) {
      const ts = await getReadTimestamps();
      ts[conv.waId] = new Date().toISOString();
      await setReadTimestamps(ts);
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
          assignment: existing.assignment || get().assignments[normalizedWaId] || null,
          archived: false,
          unreadCount: 0,
        }
      : {
          waId: normalizedWaId,
          contactName: contactName || normalizedPhone || normalizedWaId,
          contactId: contactId || null,
          phone: normalizedPhone || `+${normalizedWaId}`,
          lastMessage: '',
          lastMessageTime: now,
          messageCount: 0,
          messages: [],
          unreadCount: 0,
          lastInboundTime: null,
          assignment: get().assignments[normalizedWaId] || null,
          archived: false,
        };

    const nextConversations = existing
      ? get().conversations.map((conv) => (conv.waId === existing.waId ? conversation : conv))
      : [conversation, ...get().conversations];

    const ts = await getReadTimestamps();
    ts[conversation.waId] = now;
    await setReadTimestamps(ts);

    const archivedMap = { ...get().archivedMap };
    if (archivedMap[conversation.waId]) {
      delete archivedMap[conversation.waId];
      await setArchivedMap(archivedMap);
    }
    set({ selectedConv: conversation, conversations: nextConversations });

    return conversation;
  },

  sendMessage: async (to, message) => {
    set({ isSending: true, sendError: '' });
    try {
      await sendTextNow(to, message);
      set({ isSending: false });
      get().fetchInbox();
      return true;
    } catch (err: any) {
      if (shouldQueueRetry(err)) {
        const queue = await getPendingOutbox();
        queue.push({
          id: createOutboxId(),
          waId: normalizeWaId(to),
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

  sendMediaMessage: async (to, payload) => {
    set({ isSending: true, sendError: '' });
    try {
      await sendMediaNow(to, payload);
      set({ isSending: false });
      get().fetchInbox();
      return true;
    } catch (err: any) {
      if (shouldQueueRetry(err)) {
        const queue = await getPendingOutbox();
        queue.push({
          id: createOutboxId(),
          waId: normalizeWaId(to),
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

  deleteConversation: async (waId) => {
    const normalizedWaId = normalizeWaId(waId);
    if (!normalizedWaId) return 'Conversation is invalid';
    try {
      await api.delete(`/integrations/whatsapp/conversation/${normalizedWaId}`);
      const conversations = get().conversations.filter((conversation) => conversation.waId !== normalizedWaId);
      const selected = get().selectedConv;
      const selectedConv = selected && selected.waId === normalizedWaId ? null : selected;
      const archivedMap = { ...get().archivedMap };
      delete archivedMap[normalizedWaId];
      await setArchivedMap(archivedMap);
      set({ conversations, selectedConv, archivedMap });
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
          await sendTextNow(item.waId, item.text);
          sentAny = true;
          continue;
        }
        if (item.kind === 'media' && item.media) {
          await sendMediaNow(item.waId, item.media);
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
