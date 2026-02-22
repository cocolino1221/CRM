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

interface WhatsAppState {
  conversations: Conversation[];
  selectedConv: Conversation | null;
  assignments: Record<string, ConversationAssignment>;
  teamUsers: User[];
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
  markRead: (waId: string) => void;
}

const USER_COLORS = ['#16a34a', '#2563eb', '#9333ea', '#dc2626', '#ea580c', '#0891b2', '#be185d', '#65a30d'];

function getUserColor(userId: string): string {
  const hash = userId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
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
  teamUsers: [],
  isLoading: true,
  fetchError: '',
  isSending: false,
  sendError: '',

  fetchInbox: async () => {
    try {
      const res = await api.get('/integrations/whatsapp/inbox?limit=200');
      const activities: WhatsAppActivity[] = res.data.data || [];
      const readTimestamps = await getReadTimestamps();
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
      set({ conversations: convList, selectedConv: updated, isLoading: false, fetchError: '' });
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
        };

    const nextConversations = existing
      ? get().conversations.map((conv) => (conv.waId === existing.waId ? conversation : conv))
      : [conversation, ...get().conversations];

    const ts = await getReadTimestamps();
    ts[conversation.waId] = now;
    await setReadTimestamps(ts);
    set({ selectedConv: conversation, conversations: nextConversations });

    return conversation;
  },

  sendMessage: async (to, message) => {
    set({ isSending: true, sendError: '' });
    try {
      await api.post('/integrations/whatsapp/send', { to, message });
      set({ isSending: false });
      get().fetchInbox();
      return true;
    } catch (err: any) {
      set({ isSending: false, sendError: err?.response?.data?.message || 'Send failed' });
      return false;
    }
  },

  sendMediaMessage: async (to, payload) => {
    set({ isSending: true, sendError: '' });
    try {
      const mediaId = await uploadMediaFile(payload);
      const request = buildMediaSendRequest(to, mediaId, payload);
      await api.post(request.endpoint, request.body);
      set({ isSending: false });
      get().fetchInbox();
      return true;
    } catch (err: any) {
      set({ isSending: false, sendError: err?.response?.data?.message || err?.message || 'Media send failed' });
      return false;
    }
  },

  markRead: async (waId) => {
    const ts = await getReadTimestamps();
    ts[waId] = new Date().toISOString();
    await setReadTimestamps(ts);
  },
}));
