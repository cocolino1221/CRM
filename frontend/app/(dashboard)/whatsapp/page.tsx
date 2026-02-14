'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Send, Search, Phone, User, RefreshCw, Clock,
  CheckCheck, Check, Loader2, Settings, Plus, Smile, Paperclip,
  Image, FileText, Mic, Video, Info, X, Zap, LayoutTemplate,
  Building2, Tag, Star, AlertTriangle, Timer, Edit, Trash2,
  Copy, ExternalLink, Mail, Briefcase, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';

// ─── Interfaces ─────────────────────────────────────────────

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
    messageStatus?: 'sent' | 'delivered' | 'read' | 'failed';
    mediaUrl?: string;
    mediaCaption?: string;
    fileName?: string;
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
  unreadCount: number;
  lastInboundTime: string | null;
}

interface ContactDetail {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  status: string;
  source?: string;
  leadScore?: number;
  tags?: string[];
  notes?: string;
  company?: { id: string; name: string };
  deals?: Array<{ id: string; title: string; stage?: string; value?: number }>;
  createdAt: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  displayName: string;
  language: string;
  body: string;
  parameterCount: number;
  category: 'marketing' | 'utility' | 'authentication';
}

interface QuickReply {
  id: string;
  title: string;
  message: string;
}

// ─── Constants ──────────────────────────────────────────────

const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  { id: '1', name: 'hello_world', displayName: 'Hello World', language: 'en_US', body: 'Hello World', parameterCount: 0, category: 'utility' },
];

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { id: 'qr1', title: 'Welcome', message: 'Thank you for reaching out! How can I help you today?' },
  { id: 'qr2', title: 'Follow up', message: 'Just checking in. Is there anything else you need help with?' },
  { id: 'qr3', title: 'More info', message: 'Could you please provide more details so I can assist you better?' },
];

const EMOJI_DATA: Record<string, string[]> = {
  'Smileys': ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😚','🤗','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😛','😜','😝','🤑'],
  'Gestures': ['👍','👎','👌','✌️','🤞','🤝','👏','🙌','💪','🤲','👐','🖐️','✋','👋','🤙','👆','👇','👈','👉','☝️'],
  'Objects': ['❤️','🧡','💛','💚','💙','💜','🖤','💔','🔥','⭐','✅','❌','📞','📧','💼','📝','📊','🎯','💡','🔔','💰','📅','🏷️','📎','🔗'],
};

// ─── Sub-Components ─────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs font-medium text-gray-400 px-2">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function MessageBubble({ msg, formatTime }: { msg: WhatsAppActivity; formatTime: (d: string) => string }) {
  const isOutbound = msg.direction === 'outbound';
  const parsed = parseMessageContent(msg);
  const status = getStatusDisplay(msg);

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-md rounded-2xl px-4 py-2.5 shadow-sm ${
        isOutbound
          ? 'bg-green-500 text-white rounded-br-sm'
          : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
      }`}>
        {parsed.type === 'image' && (
          <div className={`flex items-center gap-2 mb-1 ${isOutbound ? 'text-green-100' : 'text-gray-400'}`}>
            <Image className="h-4 w-4" />
            <span className="text-xs font-medium">Photo</span>
          </div>
        )}
        {parsed.type === 'document' && (
          <div className={`flex items-center gap-2 p-2 mb-1 rounded-lg ${isOutbound ? 'bg-green-600' : 'bg-gray-50'}`}>
            <FileText className="h-5 w-5 flex-shrink-0" />
            <span className="text-xs font-medium truncate">{parsed.fileName || 'Document'}</span>
          </div>
        )}
        {parsed.type === 'audio' && (
          <div className={`flex items-center gap-2 ${isOutbound ? 'text-green-100' : 'text-gray-400'}`}>
            <Mic className="h-4 w-4" />
            <div className="flex gap-0.5">
              {[3,5,8,4,7,6,3,5,8,4,6,3].map((h, i) => (
                <div key={i} className={`w-1 rounded-full ${isOutbound ? 'bg-green-200' : 'bg-gray-300'}`} style={{ height: `${h * 2}px` }} />
              ))}
            </div>
          </div>
        )}
        {parsed.type === 'video' && (
          <div className={`flex items-center gap-2 mb-1 ${isOutbound ? 'text-green-100' : 'text-gray-400'}`}>
            <Video className="h-4 w-4" />
            <span className="text-xs font-medium">Video</span>
          </div>
        )}
        {parsed.text && <p className="text-sm whitespace-pre-wrap">{parsed.text}</p>}
        <div className={`flex items-center justify-end gap-1 mt-1 ${isOutbound ? 'text-green-100' : 'text-gray-400'}`}>
          <span className="text-xs">{formatTime(msg.occurredAt)}</span>
          {isOutbound && (
            status.icon === 'double'
              ? <CheckCheck className={`h-3.5 w-3.5 ${status.color}`} />
              : <Check className={`h-3.5 w-3.5 ${status.color}`} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('Smileys');
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 w-80 z-50">
      <div className="flex items-center justify-between p-2 border-b border-gray-100">
        <div className="flex gap-1">
          {Object.keys(EMOJI_DATA).map(cat => (
            <button key={cat} onClick={() => setActiveTab(cat)}
              className={`px-2 py-1 text-xs rounded-lg ${activeTab === cat ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}>
              {cat}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-3.5 w-3.5 text-gray-400" /></button>
      </div>
      <div className="grid grid-cols-10 gap-0.5 p-2 max-h-40 overflow-y-auto">
        {(EMOJI_DATA[activeTab] || []).map((emoji, i) => (
          <button key={i} onClick={() => onSelect(emoji)} className="h-8 w-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded-lg">{emoji}</button>
        ))}
      </div>
    </div>
  );
}

function ContactInfoSidebar({ contact, isLoading, onClose }: { contact: ContactDetail | null; isLoading: boolean; onClose: () => void }) {
  if (isLoading) {
    return (
      <div className="w-80 flex-shrink-0 border-l border-gray-100 bg-white flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!contact) return null;

  const statusColors: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    customer: 'bg-purple-100 text-purple-700',
    inactive: 'bg-gray-100 text-gray-600',
    churned: 'bg-red-100 text-red-700',
  };

  return (
    <div className="w-80 flex-shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Contact Info</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-400" /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="p-4 text-center border-b border-gray-100">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 mx-auto mb-3">
            <span className="text-white text-xl font-bold">{contact.firstName?.charAt(0)?.toUpperCase() || '?'}</span>
          </div>
          <h4 className="font-semibold text-gray-900">{contact.firstName} {contact.lastName}</h4>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[contact.status?.toLowerCase()] || 'bg-gray-100 text-gray-600'}`}>
            {contact.status}
          </span>
        </div>

        {/* Contact Details */}
        <div className="p-4 space-y-3 border-b border-gray-100">
          {contact.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">{contact.phone}</span>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700 truncate">{contact.email}</span>
            </div>
          )}
          {contact.jobTitle && (
            <div className="flex items-center gap-3 text-sm">
              <Briefcase className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">{contact.jobTitle}</span>
            </div>
          )}
          {contact.company && (
            <div className="flex items-center gap-3 text-sm">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700">{contact.company.name}</span>
            </div>
          )}
        </div>

        {/* Lead Score */}
        {contact.leadScore !== undefined && contact.leadScore > 0 && (
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-500 flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> Lead Score</span>
              <span className="font-semibold text-gray-900">{contact.leadScore}/100</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full" style={{ width: `${Math.min(contact.leadScore, 100)}%` }} />
            </div>
          </div>
        )}

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Deals */}
        {contact.deals && contact.deals.length > 0 && (
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Deals</p>
            <div className="space-y-2">
              {contact.deals.map(deal => (
                <div key={deal.id} className="p-2 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                  <div className="flex items-center justify-between mt-1">
                    {deal.stage && <span className="text-xs text-gray-500">{deal.stage}</span>}
                    {deal.value !== undefined && <span className="text-xs font-semibold text-green-600">${deal.value.toLocaleString()}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="p-4">
          <Link href={`/contacts?id=${contact.id}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all">
            <ExternalLink className="h-4 w-4" />
            View Full Profile
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function parseMessageContent(msg: WhatsAppActivity): { type: string; text: string; fileName?: string } {
  const desc = msg.description || '';
  const msgType = msg.metadata?.messageType || 'text';
  if (msgType === 'image' || desc.startsWith('[Image]')) return { type: 'image', text: desc.replace('[Image]', '').trim() || '' };
  if (msgType === 'document' || desc.startsWith('[Document:')) {
    const match = desc.match(/\[Document:\s*([^\]]+)\]/);
    return { type: 'document', text: desc.replace(/\[Document:[^\]]*\]/, '').trim(), fileName: match?.[1] };
  }
  if (msgType === 'audio' || desc === '[Voice message]') return { type: 'audio', text: '' };
  if (msgType === 'video' || desc.startsWith('[Video]')) return { type: 'video', text: desc.replace('[Video]', '').trim() || '' };
  return { type: 'text', text: desc };
}

function getStatusDisplay(msg: WhatsAppActivity): { icon: 'single' | 'double'; color: string } {
  switch (msg.metadata?.messageStatus) {
    case 'read': return { icon: 'double', color: 'text-blue-400' };
    case 'delivered': return { icon: 'double', color: 'text-green-200' };
    case 'sent': return { icon: 'single', color: 'text-green-200' };
    default: return { icon: 'single', color: 'text-green-200' };
  }
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function getSessionStatus(conv: Conversation): 'open' | 'closing' | 'closed' {
  if (!conv.lastInboundTime) return 'closed';
  const hours = (Date.now() - new Date(conv.lastInboundTime).getTime()) / (1000 * 60 * 60);
  if (hours < 20) return 'open';
  if (hours < 24) return 'closing';
  return 'closed';
}

// ─── Main Component ─────────────────────────────────────────

export default function WhatsAppPage() {
  // Core state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Contact info sidebar
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [isLoadingContact, setIsLoadingContact] = useState(false);

  // Template panel
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);

  // New conversation modal
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConvPhone, setNewConvPhone] = useState('');
  const [newConvTemplate, setNewConvTemplate] = useState<WhatsAppTemplate | null>(null);
  const [newConvTemplateParams, setNewConvTemplateParams] = useState<string[]>([]);
  const [contactSearchResults, setContactSearchResults] = useState<any[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);

  // Quick replies
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showQuickReplyEditor, setShowQuickReplyEditor] = useState(false);
  const [editingQR, setEditingQR] = useState<QuickReply | null>(null);
  const [qrTitle, setQrTitle] = useState('');
  const [qrMessage, setQrMessage] = useState('');

  // Emoji picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Attachment
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'image' | 'document'>('image');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentCaption, setAttachmentCaption] = useState('');

  // Message search
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);

  // ─── Effects ──────────────────────────────────────────────

  useEffect(() => {
    fetchInbox();
    const interval = setInterval(fetchInbox, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv?.messages]);

  useEffect(() => {
    const saved = localStorage.getItem('whatsapp_quick_replies');
    if (saved) {
      try { setQuickReplies(JSON.parse(saved)); } catch { setQuickReplies(DEFAULT_QUICK_REPLIES); }
    } else {
      setQuickReplies(DEFAULT_QUICK_REPLIES);
    }
  }, []);

  // ─── Data Fetching ────────────────────────────────────────

  const fetchInbox = useCallback(async () => {
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
      setConversations(convList);

      if (selectedConv) {
        const updated = convList.find(c => c.waId === selectedConv.waId);
        if (updated) setSelectedConv(updated);
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp inbox:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedConv]);

  const fetchContactDetail = async (contactId: string) => {
    setIsLoadingContact(true);
    try {
      const res = await api.get(`/contacts/${contactId}`);
      setContactDetail(res.data);
    } catch (err) {
      console.error('Failed to fetch contact details:', err);
    } finally {
      setIsLoadingContact(false);
    }
  };

  const searchContacts = async (query: string) => {
    if (!query.trim()) { setContactSearchResults([]); return; }
    setIsSearchingContacts(true);
    try {
      const res = await api.get(`/contacts?search=${encodeURIComponent(query)}&limit=10`);
      setContactSearchResults(res.data.data || res.data || []);
    } catch (err) {
      console.error('Failed to search contacts:', err);
    } finally {
      setIsSearchingContacts(false);
    }
  };

  // ─── Actions ──────────────────────────────────────────────

  const markAsRead = (waId: string) => {
    const timestamps = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
    timestamps[waId] = new Date().toISOString();
    localStorage.setItem('wa_read_timestamps', JSON.stringify(timestamps));
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
    markAsRead(conv.waId);
    conv.unreadCount = 0;
    setConversations(prev => prev.map(c => c.waId === conv.waId ? { ...c, unreadCount: 0 } : c));
    if (conv.contactId) {
      fetchContactDetail(conv.contactId);
    } else {
      setContactDetail(null);
    }
  };

  const handleSend = async () => {
    if (!replyText.trim() || !selectedConv) return;
    setIsSending(true);
    setSendError('');
    try {
      await api.post('/integrations/whatsapp/send', { to: selectedConv.waId, message: replyText.trim() });
      setReplyText('');
      await fetchInbox();
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTemplate = async (to: string, template: WhatsAppTemplate, params: string[]) => {
    setIsSending(true);
    setSendError('');
    try {
      await api.post('/integrations/whatsapp/send/template', {
        to,
        templateName: template.name,
        language: template.language,
        parameters: params.length > 0 ? params.map(p => ({ type: 'text', text: p })) : [],
      });
      setShowTemplatePanel(false);
      setSelectedTemplate(null);
      setTemplateParams([]);
      setShowNewConversation(false);
      setNewConvPhone('');
      setNewConvTemplate(null);
      setNewConvTemplateParams([]);
      await fetchInbox();
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to send template');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAttachment = async () => {
    if (!attachmentUrl.trim() || !selectedConv) return;
    setIsSending(true);
    setSendError('');
    try {
      const endpoint = attachmentType === 'image' ? '/integrations/whatsapp/send/image' : '/integrations/whatsapp/send/document';
      const body = attachmentType === 'image'
        ? { to: selectedConv.waId, imageUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined }
        : { to: selectedConv.waId, documentUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined };
      await api.post(endpoint, body);
      setShowAttachmentModal(false);
      setAttachmentUrl('');
      setAttachmentCaption('');
      await fetchInbox();
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to send attachment');
    } finally {
      setIsSending(false);
    }
  };

  const saveQuickReplies = (replies: QuickReply[]) => {
    setQuickReplies(replies);
    localStorage.setItem('whatsapp_quick_replies', JSON.stringify(replies));
  };

  const handleSaveQuickReply = () => {
    if (!qrTitle.trim() || !qrMessage.trim()) return;
    if (editingQR) {
      saveQuickReplies(quickReplies.map(qr => qr.id === editingQR.id ? { ...qr, title: qrTitle, message: qrMessage } : qr));
    } else {
      saveQuickReplies([...quickReplies, { id: `qr_${Date.now()}`, title: qrTitle, message: qrMessage }]);
    }
    setQrTitle('');
    setQrMessage('');
    setEditingQR(null);
    setShowQuickReplyEditor(false);
  };

  const handleDeleteQuickReply = (id: string) => {
    saveQuickReplies(quickReplies.filter(qr => qr.id !== id));
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
    c.contactName.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search),
  );

  const sessionStatus = selectedConv ? getSessionStatus(selectedConv) : 'closed';
  const sessionOpen = sessionStatus === 'open' || sessionStatus === 'closing';

  const filteredMessages = selectedConv?.messages.filter(m =>
    !messageSearch || m.description?.toLowerCase().includes(messageSearch.toLowerCase())
  ) || [];

  // Build date-grouped messages
  const messagesWithDates: Array<{ type: 'date'; label: string } | { type: 'message'; msg: WhatsAppActivity }> = [];
  let lastDateLabel = '';
  for (const msg of filteredMessages) {
    const label = getDateLabel(msg.occurredAt);
    if (label !== lastDateLabel) {
      messagesWithDates.push({ type: 'date', label });
      lastDateLabel = label;
    }
    messagesWithDates.push({ type: 'message', msg });
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)] bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">

      {/* ═══ LEFT: Conversation List ═══ */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              WhatsApp
            </h1>
            <div className="flex gap-1">
              <button onClick={() => setShowNewConversation(true)} className="p-1.5 rounded-lg bg-green-500 hover:bg-green-600 transition-all" title="New conversation">
                <Plus className="h-4 w-4 text-white" />
              </button>
              <button onClick={fetchInbox} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Refresh">
                <RefreshCw className="h-4 w-4 text-gray-500" />
              </button>
              <Link href="/integrations" className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Settings">
                <Settings className="h-4 w-4 text-gray-500" />
              </Link>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageCircle className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">No conversations yet</p>
              <p className="text-xs text-gray-400 mt-1">Messages from WhatsApp will appear here</p>
              <button onClick={() => setShowNewConversation(true)} className="mt-4 text-xs text-green-600 hover:underline font-medium">
                Start a new conversation
              </button>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const ss = getSessionStatus(conv);
              const isSelected = selectedConv?.waId === conv.waId;
              const hasUnread = conv.unreadCount > 0;
              return (
                <button key={conv.waId} onClick={() => selectConversation(conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-all border-b border-gray-50 text-left ${
                    isSelected ? 'bg-green-50 border-l-2 border-l-green-500' : ''
                  }`}>
                  <div className="relative flex-shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600">
                      <span className="text-white text-sm font-bold">{conv.contactName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
                      ss === 'open' ? 'bg-green-400' : ss === 'closing' ? 'bg-orange-400' : 'bg-gray-300'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-semibold text-gray-900'}`}>{conv.contactName}</p>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatTime(conv.lastMessageTime)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className={`text-xs truncate ${hasUnread ? 'font-medium text-gray-700' : 'text-gray-500'}`}>{conv.lastMessage}</p>
                      {hasUnread && (
                        <span className="flex-shrink-0 ml-2 h-5 min-w-5 flex items-center justify-center rounded-full bg-green-500 text-white text-xs font-bold px-1">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ═══ CENTER: Chat Area ═══ */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex-shrink-0">
              <span className="text-white font-bold">{selectedConv.contactName.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 truncate">{selectedConv.contactName}</h2>
              <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{selectedConv.phone}</p>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => { setShowMessageSearch(!showMessageSearch); setMessageSearch(''); }}
                className={`p-2 rounded-lg transition-all ${showMessageSearch ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Search messages">
                <Search className="h-4 w-4" />
              </button>
              {selectedConv.contactId && (
                <button onClick={() => setShowContactInfo(!showContactInfo)}
                  className={`p-2 rounded-lg transition-all ${showContactInfo ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Contact info">
                  <Info className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Message search bar */}
          {showMessageSearch && (
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" placeholder="Search in conversation..." value={messageSearch} onChange={e => setMessageSearch(e.target.value)} autoFocus
                  className="w-full pl-9 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                {messageSearch && (
                  <button onClick={() => setMessageSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 24h session banner */}
          {!sessionOpen && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700">Customer session expired. Send a template message to re-engage.</p>
            </div>
          )}
          {sessionStatus === 'closing' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-200">
              <Timer className="h-4 w-4 text-orange-500 flex-shrink-0" />
              <p className="text-xs text-orange-700">Session closing soon. Reply before the 24-hour window expires.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
            {messagesWithDates.map((item, i) =>
              item.type === 'date'
                ? <DateSeparator key={`date-${i}`} label={item.label} />
                : <MessageBubble key={item.msg.id} msg={item.msg} formatTime={formatTime} />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Template panel (slide up) */}
          {showTemplatePanel && (
            <div className="border-t border-gray-200 bg-white p-4 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4" /> Message Templates
                </h3>
                <button onClick={() => { setShowTemplatePanel(false); setSelectedTemplate(null); setTemplateParams([]); }}>
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              {!selectedTemplate ? (
                <div className="grid grid-cols-2 gap-2">
                  {WHATSAPP_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => { setSelectedTemplate(t); setTemplateParams(Array(t.parameterCount).fill('')); }}
                      className="p-3 text-left bg-gray-50 hover:bg-green-50 rounded-xl border border-gray-200 hover:border-green-300 transition-all">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-900">{t.displayName}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          t.category === 'marketing' ? 'bg-purple-100 text-purple-600' : t.category === 'utility' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                        }`}>{t.category}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{t.body}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-700 mb-3 p-2 bg-gray-50 rounded-lg">{selectedTemplate.body}</p>
                  {selectedTemplate.parameterCount > 0 && (
                    <div className="space-y-2 mb-3">
                      {templateParams.map((p, i) => (
                        <input key={i} type="text" placeholder={`Parameter {{${i + 1}}}`} value={p}
                          onChange={e => { const np = [...templateParams]; np[i] = e.target.value; setTemplateParams(np); }}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => { setSelectedTemplate(null); setTemplateParams([]); }} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
                    <button onClick={() => handleSendTemplate(selectedConv.waId, selectedTemplate, templateParams)} disabled={isSending}
                      className="px-4 py-1.5 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg disabled:opacity-50 flex items-center gap-2">
                      {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send Template
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reply input */}
          <div className="p-3 border-t border-gray-100 bg-white">
            {sendError && <p className="text-xs text-red-600 mb-2 px-1">{sendError}</p>}

            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-2 relative">
              <div className="relative">
                <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowQuickReplies(false); }}
                  className={`p-1.5 rounded-lg transition-all ${showEmojiPicker ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Emoji">
                  <Smile className="h-4 w-4" />
                </button>
                {showEmojiPicker && <EmojiPicker onSelect={(e) => { setReplyText(prev => prev + e); }} onClose={() => setShowEmojiPicker(false)} />}
              </div>
              <button onClick={() => { setShowAttachmentModal(true); setShowEmojiPicker(false); setShowQuickReplies(false); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-all" title="Attachment">
                <Paperclip className="h-4 w-4" />
              </button>
              <button onClick={() => { setShowTemplatePanel(!showTemplatePanel); setShowEmojiPicker(false); setShowQuickReplies(false); }}
                className={`p-1.5 rounded-lg transition-all ${showTemplatePanel ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Templates">
                <LayoutTemplate className="h-4 w-4" />
              </button>
              <div className="relative">
                <button onClick={() => { setShowQuickReplies(!showQuickReplies); setShowEmojiPicker(false); }}
                  className={`p-1.5 rounded-lg transition-all ${showQuickReplies ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Quick replies">
                  <Zap className="h-4 w-4" />
                </button>
                {showQuickReplies && (
                  <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 w-72 z-50 max-h-60 overflow-y-auto">
                    <div className="flex items-center justify-between p-2 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-700">Quick Replies</span>
                      <button onClick={() => { setShowQuickReplyEditor(true); setShowQuickReplies(false); setEditingQR(null); setQrTitle(''); setQrMessage(''); }}
                        className="text-xs text-green-600 hover:underline font-medium">+ Add</button>
                    </div>
                    {quickReplies.map(qr => (
                      <button key={qr.id} onClick={() => { setReplyText(qr.message); setShowQuickReplies(false); }}
                        className="w-full text-left p-2 hover:bg-gray-50 border-b border-gray-50 group">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-900">{qr.title}</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                            <button onClick={(e) => { e.stopPropagation(); setEditingQR(qr); setQrTitle(qr.title); setQrMessage(qr.message); setShowQuickReplyEditor(true); setShowQuickReplies(false); }}
                              className="p-0.5 hover:bg-gray-200 rounded"><Edit className="h-3 w-3 text-gray-400" /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteQuickReply(qr.id); }}
                              className="p-0.5 hover:bg-red-100 rounded"><Trash2 className="h-3 w-3 text-red-400" /></button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{qr.message}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Text input + send */}
            <div className="flex items-end gap-2">
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={sessionOpen ? 'Type a message... (Enter to send)' : 'Send a template to start conversation'}
                disabled={!sessionOpen}
                rows={2}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:bg-gray-100 disabled:cursor-not-allowed" />
              <button onClick={handleSend} disabled={isSending || !replyText.trim() || !sessionOpen}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500 hover:bg-green-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
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
            <p className="text-sm text-gray-500 max-w-xs mb-4">Select a conversation or start a new one to begin messaging.</p>
            <button onClick={() => setShowNewConversation(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl transition-all flex items-center gap-2 mx-auto">
              <Plus className="h-4 w-4" /> New Conversation
            </button>
          </div>
        </div>
      )}

      {/* ═══ RIGHT: Contact Info Sidebar ═══ */}
      {showContactInfo && selectedConv?.contactId && (
        <ContactInfoSidebar contact={contactDetail} isLoading={isLoadingContact} onClose={() => setShowContactInfo(false)} />
      )}

      {/* ═══ MODALS ═══ */}

      {/* New Conversation Modal */}
      {showNewConversation && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><MessageCircle className="h-5 w-5 text-green-600" /> New Conversation</h3>
              <button onClick={() => { setShowNewConversation(false); setNewConvPhone(''); setNewConvTemplate(null); setNewConvTemplateParams([]); setContactSearchQuery(''); setContactSearchResults([]); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Contact search */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Search contacts</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" placeholder="Search by name, email, or phone..." value={contactSearchQuery}
                    onChange={e => { setContactSearchQuery(e.target.value); searchContacts(e.target.value); }}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                </div>
                {isSearchingContacts && <div className="mt-2 text-center"><Loader2 className="h-4 w-4 animate-spin text-gray-400 inline" /></div>}
                {contactSearchResults.length > 0 && (
                  <div className="mt-2 max-h-36 overflow-y-auto border border-gray-200 rounded-xl">
                    {contactSearchResults.map((c: any) => (
                      <button key={c.id} onClick={() => { setNewConvPhone(c.phone?.replace('+', '') || ''); setContactSearchQuery(`${c.firstName} ${c.lastName}`); setContactSearchResults([]); }}
                        className="w-full text-left p-2 hover:bg-gray-50 border-b border-gray-50 flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{c.firstName?.charAt(0)?.toUpperCase() || '?'}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-gray-500 truncate">{c.phone || c.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual phone */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Or enter phone number</label>
                <input type="text" placeholder="40755644461 (no + prefix)" value={newConvPhone}
                  onChange={e => setNewConvPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
              </div>

              {/* Template selection (required) */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-1">
                  <LayoutTemplate className="h-3.5 w-3.5" /> Select template <span className="text-xs text-gray-400">(required for first message)</span>
                </label>
                <div className="space-y-2">
                  {WHATSAPP_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => { setNewConvTemplate(t); setNewConvTemplateParams(Array(t.parameterCount).fill('')); }}
                      className={`w-full p-3 text-left rounded-xl border transition-all ${
                        newConvTemplate?.id === t.id ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                      }`}>
                      <span className="text-sm font-medium text-gray-900">{t.displayName}</span>
                      <p className="text-xs text-gray-500 mt-0.5">{t.body}</p>
                    </button>
                  ))}
                </div>
                {newConvTemplate && newConvTemplate.parameterCount > 0 && (
                  <div className="mt-2 space-y-2">
                    {newConvTemplateParams.map((p, i) => (
                      <input key={i} type="text" placeholder={`Parameter {{${i + 1}}}`} value={p}
                        onChange={e => { const np = [...newConvTemplateParams]; np[i] = e.target.value; setNewConvTemplateParams(np); }}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => { setShowNewConversation(false); setNewConvPhone(''); setNewConvTemplate(null); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all">Cancel</button>
              <button onClick={() => { if (newConvPhone && newConvTemplate) handleSendTemplate(newConvPhone, newConvTemplate, newConvTemplateParams); }}
                disabled={!newConvPhone || !newConvTemplate || isSending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Modal */}
      {showAttachmentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Send Attachment</h3>
              <button onClick={() => { setShowAttachmentModal(false); setAttachmentUrl(''); setAttachmentCaption(''); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setAttachmentType('image')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'image' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <Image className="h-4 w-4" /> Image
                </button>
                <button onClick={() => setAttachmentType('document')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'document' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <FileText className="h-4 w-4" /> Document
                </button>
              </div>
              <input type="url" placeholder={attachmentType === 'image' ? 'Image URL (https://...)' : 'Document URL (https://...)'}
                value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
              <input type="text" placeholder="Caption (optional)" value={attachmentCaption} onChange={e => setAttachmentCaption(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => { setShowAttachmentModal(false); setAttachmentUrl(''); setAttachmentCaption(''); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancel</button>
              <button onClick={handleSendAttachment} disabled={!attachmentUrl.trim() || isSending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Reply Editor Modal */}
      {showQuickReplyEditor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{editingQR ? 'Edit' : 'New'} Quick Reply</h3>
              <button onClick={() => { setShowQuickReplyEditor(false); setEditingQR(null); setQrTitle(''); setQrMessage(''); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input type="text" placeholder="Title (e.g., Welcome)" value={qrTitle} onChange={e => setQrTitle(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
              <textarea placeholder="Message text..." value={qrMessage} onChange={e => setQrMessage(e.target.value)} rows={3}
                className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 resize-none" />
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => { setShowQuickReplyEditor(false); setEditingQR(null); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancel</button>
              <button onClick={handleSaveQuickReply} disabled={!qrTitle.trim() || !qrMessage.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
