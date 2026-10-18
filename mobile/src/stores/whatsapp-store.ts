import { create } from 'zustand';
import api from '@/lib/api';
import type { Conversation, WhatsAppActivity } from '@/types';

interface WhatsAppState {
  conversations: Conversation[];
  selectedConv: Conversation | null;
  isLoading: boolean;
  fetchError: string;
  isSending: boolean;
  sendError: string;
  fetchInbox: () => Promise<void>;
  selectConversation: (conv: Conversation | null) => void;
  sendMessage: (to: string, message: string, integrationId?: string) => Promise<boolean>;
  markRead: (waId: string) => void;
}

function normalizeWaId(value?: string): string {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizePhone(value?: string, waId?: string): string {
  const digits = normalizeWaId(value || waId);
  return digits ? `+${digits}` : '';
}

const INVALID_WHATSAPP_CONTACT_NAMES = new Set([
  'online',
  'online contact',
  'offline',
  'unknown',
  'customer',
  'whatsapp',
  'whatsapp contact',
]);

function getWhatsAppContactDisplayName(contact: WhatsAppActivity['contact'], phone: string): string {
  const fullName = `${contact?.firstName || ''} ${contact?.lastName || ''}`.replace(/\s+/g, ' ').trim();
  if (!fullName || INVALID_WHATSAPP_CONTACT_NAMES.has(fullName.toLowerCase())) {
    return phone;
  }
  return fullName;
}

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  conversations: [],
  selectedConv: null,
  isLoading: true,
  fetchError: '',
  isSending: false,
  sendError: '',

  fetchInbox: async () => {
    try {
      const res = await api.get('/integrations/whatsapp/inbox?limit=200');
      const activities: WhatsAppActivity[] = res.data.data || [];
      const readTimestamps = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
      const convMap = new Map<string, Conversation>();
      const latestInboundByConversation = new Map<string, number>();

      for (const act of activities) {
        const waId = normalizeWaId(act.metadata?.waId) || normalizeWaId(act.contact?.phone) || 'unknown';
        const phone = normalizePhone(act.contact?.phone, waId) || `+${waId}`;
        const contactName = getWhatsAppContactDisplayName(act.contact, phone);
        const senderIntegrationId = String(act.metadata?.senderIntegrationId || '').trim() || null;
        const senderPhoneDisplay = String(act.metadata?.senderPhoneDisplay || '').trim() || null;

        if (!convMap.has(waId)) {
          convMap.set(waId, {
            waId, contactName, contactId: act.contact?.id || null, phone,
            preferredSenderIntegrationId: senderIntegrationId,
            preferredSenderPhoneDisplay: senderPhoneDisplay,
            lastMessage: act.description || '', lastMessageTime: act.occurredAt,
            messageCount: 0, messages: [], unreadCount: 0, lastInboundTime: null,
          });
        }
        const conv = convMap.get(waId)!;
        conv.messages.push(act);
        conv.messageCount++;
        if (!conv.preferredSenderIntegrationId && senderIntegrationId) {
          conv.preferredSenderIntegrationId = senderIntegrationId;
        }
        if (!conv.preferredSenderPhoneDisplay && senderPhoneDisplay) {
          conv.preferredSenderPhoneDisplay = senderPhoneDisplay;
        }

        if (new Date(act.occurredAt) > new Date(conv.lastMessageTime)) {
          conv.lastMessage = act.description || '';
          conv.lastMessageTime = act.occurredAt;
        }
        if (act.direction === 'inbound') {
          const occurredAtMs = new Date(act.occurredAt).getTime();
          const previousMs = latestInboundByConversation.get(waId) || Number.NEGATIVE_INFINITY;
          if (senderIntegrationId && occurredAtMs >= previousMs) {
            conv.preferredSenderIntegrationId = senderIntegrationId;
            if (senderPhoneDisplay) {
              conv.preferredSenderPhoneDisplay = senderPhoneDisplay;
            }
            latestInboundByConversation.set(waId, occurredAtMs);
          }
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

  selectConversation: (conv) => {
    if (conv) {
      const ts = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
      ts[conv.waId] = new Date().toISOString();
      localStorage.setItem('wa_read_timestamps', JSON.stringify(ts));
      conv.unreadCount = 0;
    }
    set({ selectedConv: conv });
  },

  sendMessage: async (to, message, integrationId) => {
    set({ isSending: true, sendError: '' });
    try {
      await api.post('/integrations/whatsapp/send', integrationId ? { to, message, integrationId } : { to, message });
      set({ isSending: false });
      get().fetchInbox();
      return true;
    } catch (err: any) {
      set({ isSending: false, sendError: err?.response?.data?.message || 'Send failed' });
      return false;
    }
  },

  markRead: (waId) => {
    const ts = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
    ts[waId] = new Date().toISOString();
    localStorage.setItem('wa_read_timestamps', JSON.stringify(ts));
  },
}));
