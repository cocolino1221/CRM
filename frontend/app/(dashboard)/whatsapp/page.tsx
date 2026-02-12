'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Search, Phone, User, RefreshCw, Clock, CheckCheck, Loader2, Settings } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';

interface WhatsAppActivity {
  id: string;
  title: string;
  description: string;
  direction: 'inbound' | 'outbound';
  occurredAt: string;
  metadata: {
    whatsappMessageId?: string;
    waId?: string;
    messageType?: string;
  };
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
  } | null;
}

interface Conversation {
  waId: string;
  contactName: string;
  contactId: string | null;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
  messages: WhatsAppActivity[];
}

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchInbox();
    const interval = setInterval(fetchInbox, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv?.messages]);

  const fetchInbox = async () => {
    try {
      const res = await api.get('/integrations/whatsapp/inbox?limit=200');
      const activities: WhatsAppActivity[] = res.data.data || [];

      // Group by waId (phone number)
      const convMap = new Map<string, Conversation>();
      for (const act of activities) {
        const waId = act.metadata?.waId || act.contact?.phone?.replace('+', '') || 'unknown';
        const phone = act.contact?.phone || `+${waId}`;
        const contactName = act.contact
          ? `${act.contact.firstName} ${act.contact.lastName}`.trim()
          : phone;

        if (!convMap.has(waId)) {
          convMap.set(waId, {
            waId,
            contactName,
            contactId: act.contact?.id || null,
            phone,
            lastMessage: act.description || '',
            lastMessageTime: act.occurredAt,
            messageCount: 0,
            messages: [],
          });
        }
        const conv = convMap.get(waId)!;
        conv.messages.push(act);
        conv.messageCount++;
        if (new Date(act.occurredAt) > new Date(conv.lastMessageTime)) {
          conv.lastMessage = act.description || '';
          conv.lastMessageTime = act.occurredAt;
        }
      }

      // Sort messages within each conversation
      for (const conv of convMap.values()) {
        conv.messages.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
      }

      const convList = Array.from(convMap.values()).sort(
        (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime(),
      );

      setConversations(convList);

      // Keep selected conversation in sync
      if (selectedConv) {
        const updated = convList.find(c => c.waId === selectedConv.waId);
        if (updated) setSelectedConv(updated);
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp inbox:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!replyText.trim() || !selectedConv) return;
    setIsSending(true);
    setSendError('');
    try {
      await api.post('/integrations/whatsapp/send', {
        to: selectedConv.waId,
        message: replyText.trim(),
      });
      setReplyText('');
      await fetchInbox();
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to send message. Check WhatsApp credentials.');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredConversations = conversations.filter(c =>
    c.contactName.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search),
  );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      {/* Sidebar — conversation list */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              WhatsApp
            </h1>
            <div className="flex gap-2">
              <button
                onClick={fetchInbox}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-all"
                title="Refresh"
              >
                <RefreshCw className="h-4 w-4 text-gray-500" />
              </button>
              <Link href="/integrations" className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Settings">
                <Settings className="h-4 w-4 text-gray-500" />
              </Link>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageCircle className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-400 mt-1">Messages from WhatsApp will appear here</p>
              <Link href="/integrations" className="mt-4 text-xs text-green-600 hover:underline font-medium">
                Set up WhatsApp integration →
              </Link>
            </div>
          ) : (
            filteredConversations.map(conv => (
              <button
                key={conv.waId}
                onClick={() => setSelectedConv(conv)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-all border-b border-gray-50 text-left ${
                  selectedConv?.waId === conv.waId ? 'bg-green-50 border-l-2 border-l-green-500' : ''
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex-shrink-0">
                  <span className="text-white text-sm font-bold">
                    {conv.contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 truncate">{conv.contactName}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatTime(conv.lastMessageTime)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{conv.lastMessage}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600">
              <span className="text-white font-bold">{selectedConv.contactName.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{selectedConv.contactName}</h2>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {selectedConv.phone}
              </p>
            </div>
            {selectedConv.contactId && (
              <Link
                href={`/contacts?id=${selectedConv.contactId}`}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all"
              >
                <User className="h-3.5 w-3.5" />
                View Contact
              </Link>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {selectedConv.messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-sm rounded-2xl px-4 py-2.5 shadow-sm ${
                    msg.direction === 'outbound'
                      ? 'bg-green-500 text-white rounded-br-sm'
                      : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.description}</p>
                  <div className={`flex items-center justify-end gap-1 mt-1 ${msg.direction === 'outbound' ? 'text-green-100' : 'text-gray-400'}`}>
                    <Clock className="h-3 w-3" />
                    <span className="text-xs">{formatTime(msg.occurredAt)}</span>
                    {msg.direction === 'outbound' && <CheckCheck className="h-3 w-3" />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply input */}
          <div className="p-4 border-t border-gray-100 bg-white">
            {sendError && (
              <p className="text-xs text-red-600 mb-2">{sendError}</p>
            )}
            <div className="flex items-end gap-3">
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send)"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
              />
              <button
                onClick={handleSend}
                disabled={isSending || !replyText.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-500 hover:bg-green-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
              <MessageCircle className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">WhatsApp Inbox</h3>
            <p className="text-sm text-gray-500 max-w-xs">
              Select a conversation to view messages, or wait for incoming WhatsApp messages to appear.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
