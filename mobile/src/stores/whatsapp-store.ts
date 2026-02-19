import { create } from 'zustand';
import api from '@/lib/api';
import type { Conversation, WhatsAppActivity } from '@/types';

interface WhatsAppState {
  conversations: Conversation[];
  selectedConv: Conversation | null;
  isLoading: boolean;
  isSending: boolean;
  sendError: string;
  fetchInbox: () => Promise<void>;
  selectConversation: (conv: Conversation | null) => void;
  sendMessage: (to: string, message: string) => Promise<boolean>;
  markRead: (waId: string) => void;
}

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  conversations: [],
  selectedConv: null,
  isLoading: true,
  isSending: false,
  sendError: '',

  fetchInbox: async () => {
    try {
      const res = await api.get('/integrations/whatsapp/inbox?limit=200');
      const activities: WhatsAppActivity[] = res.data.data || [];
      const readTimestamps = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
      const convMap = new Map<string, Conversation>();

      for (const act of activities) {
        const waId = act.metadata?.waId || act.contact?.phone?.replace('+', '') || 'unknown';
        const phone = act.contact?.phone || `+${waId}`;
        const contactName = act.contact ? `${act.contact.firstName} ${act.contact.lastName}`.trim() : phone;

        if (!convMap.has(waId)) {
          convMap.set(waId, {
            waId, contactName, contactId: act.contact?.id || null, phone,
            lastMessage: act.description || '', lastMessageTime: act.occurredAt,
            messageCount: 0, messages: [], unreadCount: 0, lastInboundTime: null,
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
      set({ conversations: convList, selectedConv: updated, isLoading: false });
    } catch (err) {
      console.error('Failed to fetch inbox:', err);
      set({ isLoading: false });
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

  markRead: (waId) => {
    const ts = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
    ts[waId] = new Date().toISOString();
    localStorage.setItem('wa_read_timestamps', JSON.stringify(ts));
  },
}));
