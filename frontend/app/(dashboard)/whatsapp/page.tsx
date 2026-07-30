'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageCircle, Send, Search, Phone, User, RefreshCw, Clock,
  CheckCheck, Check, Loader2, Settings, Plus, Smile, Paperclip,
  Image, FileText, Mic, Video, Info, X, Zap, LayoutTemplate,
  Building2, Tag, Star, AlertTriangle, Timer, Edit, Trash2,
  Copy, ExternalLink, Mail, Briefcase, ArrowRight, ChevronLeft, Brain,
  GitBranch, Upload, Pin, BellOff, Bell, Archive, ArchiveRestore, CornerUpLeft, AudioLines, Filter,
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';
import AudioLibraryPicker from '@/components/audio/AudioLibraryPicker';
import { authService, User as CurrentUser } from '@/lib/auth';
import { hasChannelAccess } from '@/lib/channel-access';

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
    campaignId?: string;
    campaignName?: string;
    isCampaign?: boolean;
    campaignAudienceType?: 'direct_list' | 'crm_filters';
    senderIntegrationId?: string;
    senderPhoneNumberId?: string;
    senderPhoneDisplay?: string;
    senderIntegrationName?: string;
    mediaId?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    mediaCaption?: string;
    fileName?: string;
    reactionEmoji?: string;
    reactionMessageId?: string;
    replyToMessageId?: string;
    replyPreviewText?: string;
  };
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
    source?: string;
  } | null;
}

interface ConvAssignment {
  userId: string;
  userName: string;
  color: string;
  assignedAt: string;
}

interface Conversation {
  waId: string;
  contactName: string;
  contactId: string | null;
  contactSource?: string | null;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
  messages: WhatsAppActivity[];
  unreadCount: number;
  lastInboundTime: string | null;
  hasCampaignMessages: boolean;
  campaignIds: string[];
  campaignNames: string[];
  primaryCampaignName: string | null;
  assignment?: ConvAssignment;
  senderIntegrationId?: string | null;
  senderPhoneDisplay?: string | null;
  archived?: boolean;
  pinned?: boolean;
  mutedUntil?: string | null;
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
  pipelineStageId?: string;
}

interface PipelineStageOption {
  id: string;
  name: string;
  color?: string;
  displayOrder: number;
}

interface PipelineOption {
  id: string;
  name: string;
  isDefault?: boolean;
  stages: PipelineStageOption[];
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  displayName: string;
  language: string;
  body: string;
  parameterCount: number;
  category: 'marketing' | 'utility' | 'authentication';
  headerMediaType?: '' | 'image' | 'video' | 'document';
  headerMediaId?: string;
  headerMediaUrl?: string;
}

interface QuickReply {
  id: string;
  title: string;
  message: string;
}

interface ReplyDraft {
  messageId: string;
  previewText: string;
  direction: 'inbound' | 'outbound';
}

interface AutoSendRuleForm {
  id: string;
  name: string;
  enabled: boolean;
  templateName: string;
  language: string;
  includeNameParam: boolean;
  headerMediaType: '' | 'image' | 'video' | 'document';
  headerMediaId: string;
  headerMediaUrl: string;
  priority: number;
  conditions: {
    sources: string[];
    statuses: string[];
    typeformFormIds: string[];
    requirePhone: boolean;
  };
}

interface TypeformFormOption {
  formId: string;
  name: string;
}

interface WhatsAppSenderAccount {
  id: string;
  name: string;
  status: string;
  phoneNumberId?: string | null;
  phoneDisplay?: string | null;
  isDefault?: boolean;
}

// ─── Constants ──────────────────────────────────────────────

const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  { id: '1', name: 'hello_world', displayName: 'Hello World', language: 'en_US', body: 'Hello World', parameterCount: 0, category: 'utility' },
];

// Convert a Meta API template object to the local WhatsAppTemplate format
function toSendableTemplate(t: any): WhatsAppTemplate {
  const bodyComponent = t.components?.find((c: any) => c.type === 'BODY');
  const bodyText = bodyComponent?.text || t.name;
  const paramCount = (bodyText.match(/\{\{\d+\}\}/g) || []).length;
  const headerMediaType = getTemplateHeaderMediaType(t);
  const language = t.language || 'en_US';
  const idBase = t.id || t.name;
  return {
    id: `${idBase}:${language}`,
    name: t.name,
    displayName: t.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    language,
    body: bodyText,
    parameterCount: paramCount,
    category: (t.category || 'utility').toLowerCase() as any,
    headerMediaType,
    headerMediaId: String(t.headerMediaId || '').trim() || undefined,
    headerMediaUrl: String(t.headerMediaUrl || '').trim() || undefined,
  };
}

function getTemplateHeaderMediaType(template: any): '' | 'image' | 'video' | 'document' {
  const headerComponent = template?.components?.find((c: any) => c.type === 'HEADER');
  const format = String(headerComponent?.format || '').toUpperCase();
  if (format === 'IMAGE') return 'image';
  if (format === 'VIDEO') return 'video';
  if (format === 'DOCUMENT') return 'document';
  return '';
}

const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { id: 'qr1', title: 'Welcome', message: 'Thank you for reaching out! How can I help you today?' },
  { id: 'qr2', title: 'Follow up', message: 'Just checking in. Is there anything else you need help with?' },
  { id: 'qr3', title: 'More info', message: 'Could you please provide more details so I can assist you better?' },
];

interface TemplateHeaderMediaCacheEntry {
  headerMediaId: string;
  headerMediaUrl: string;
  updatedAt: string;
}

const TEMPLATE_HEADER_MEDIA_CACHE_KEY = 'wa_template_header_media_cache_v1';

function isConversationMuted(conv: Conversation): boolean {
  const mutedUntil = String(conv.mutedUntil || '').trim();
  if (!mutedUntil) return false;
  const parsed = new Date(mutedUntil);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
}

function sortConversationsByPinAndTime(items: Conversation[]): Conversation[] {
  return [...items].sort((a, b) => {
    const aPinned = !!a.pinned;
    const bPinned = !!b.pinned;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
  });
}

function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function buildDemoConversations(now = new Date()): Conversation[] {
  const nowMs = now.getTime();
  const iso = (deltaMinutes: number) => new Date(nowMs - deltaMinutes * 60_000).toISOString();
  const makeId = (suffix: string) => `demo_${suffix}`;
  const c1Messages: WhatsAppActivity[] = [
    {
      id: makeId('m1'),
      title: 'WhatsApp from Ana',
      description: 'Salut! Ai 5 minute azi pentru demo?',
      direction: 'inbound',
      occurredAt: iso(95),
      metadata: { waId: '40740111222', messageType: 'text', whatsappMessageId: makeId('wm1') },
      contact: { id: makeId('c1'), firstName: 'Ana', lastName: 'Ionescu', phone: '+40740111222', status: 'lead', source: 'manychat' },
    },
    {
      id: makeId('m2'),
      title: 'WhatsApp to Ana',
      description: 'Sigur. Pot la 16:30 sau la 18:00.',
      direction: 'outbound',
      occurredAt: iso(80),
      metadata: { waId: '40740111222', messageType: 'text', messageStatus: 'read', whatsappMessageId: makeId('wm2') },
      contact: { id: makeId('c1'), firstName: 'Ana', lastName: 'Ionescu', phone: '+40740111222', status: 'lead', source: 'manychat' },
    },
    {
      id: makeId('m3'),
      title: 'WhatsApp from Ana',
      description: 'Perfect, 18:00 e ok 🙌',
      direction: 'inbound',
      occurredAt: iso(65),
      metadata: { waId: '40740111222', messageType: 'text', whatsappMessageId: makeId('wm3') },
      contact: { id: makeId('c1'), firstName: 'Ana', lastName: 'Ionescu', phone: '+40740111222', status: 'lead', source: 'manychat' },
    },
    {
      id: makeId('m4'),
      title: 'WhatsApp to Ana',
      description: '[Reaction]',
      direction: 'outbound',
      occurredAt: iso(60),
      metadata: {
        waId: '40740111222',
        messageType: 'reaction',
        reactionEmoji: '👍',
        replyPreviewText: 'Perfect, 18:00 e ok 🙌',
        replyToMessageId: makeId('wm3'),
        whatsappMessageId: makeId('wm4'),
      },
      contact: { id: makeId('c1'), firstName: 'Ana', lastName: 'Ionescu', phone: '+40740111222', status: 'lead', source: 'manychat' },
    },
  ];

  const c2Messages: WhatsAppActivity[] = [
    {
      id: makeId('m5'),
      title: 'WhatsApp from Mihai',
      description: 'Buna! As vrea oferta pentru pachetul Growth.',
      direction: 'inbound',
      occurredAt: iso(240),
      metadata: { waId: '40755666444', messageType: 'text', whatsappMessageId: makeId('wm5') },
      contact: { id: makeId('c2'), firstName: 'Mihai', lastName: 'Popescu', phone: '+40755666444', status: 'prospect', source: 'typeform' },
    },
    {
      id: makeId('m6'),
      title: 'WhatsApp to Mihai',
      description: 'Super. Iti trimit imediat detaliile pe email.',
      direction: 'outbound',
      occurredAt: iso(220),
      metadata: { waId: '40755666444', messageType: 'text', messageStatus: 'delivered', whatsappMessageId: makeId('wm6') },
      contact: { id: makeId('c2'), firstName: 'Mihai', lastName: 'Popescu', phone: '+40755666444', status: 'prospect', source: 'typeform' },
    },
  ];

  const c3Messages: WhatsAppActivity[] = [
    {
      id: makeId('m7'),
      title: 'WhatsApp from Andrei',
      description: '[Document: contract.pdf]',
      direction: 'inbound',
      occurredAt: iso(1440),
      metadata: { waId: '40722233445', messageType: 'document', fileName: 'contract.pdf', whatsappMessageId: makeId('wm7') },
      contact: { id: makeId('c3'), firstName: 'Andrei', lastName: 'Stan', phone: '+40722233445', status: 'customer', source: 'manual' },
    },
  ];

  return [
    {
      waId: '40740111222',
      contactName: 'Ana Ionescu',
      contactId: makeId('c1'),
      contactSource: 'manychat',
      phone: '+40740111222',
      lastMessage: '[Reaction]',
      lastMessageTime: iso(60),
      messageCount: c1Messages.length,
      messages: c1Messages,
      unreadCount: 2,
      lastInboundTime: iso(65),
      hasCampaignMessages: false,
      campaignIds: [],
      campaignNames: [],
      primaryCampaignName: null,
      pinned: true,
      mutedUntil: null,
      archived: false,
      senderIntegrationId: 'demo_sender_a',
      senderPhoneDisplay: '+40 740 111 222',
    },
    {
      waId: '40755666444',
      contactName: 'Mihai Popescu',
      contactId: makeId('c2'),
      contactSource: 'typeform',
      phone: '+40755666444',
      lastMessage: 'Super. Iti trimit imediat detaliile pe email.',
      lastMessageTime: iso(220),
      messageCount: c2Messages.length,
      messages: c2Messages,
      unreadCount: 0,
      lastInboundTime: iso(240),
      hasCampaignMessages: true,
      campaignIds: [makeId('camp1')],
      campaignNames: ['Growth Leads'],
      primaryCampaignName: 'Growth Leads',
      pinned: false,
      mutedUntil: new Date(nowMs + 6 * 60 * 60 * 1000).toISOString(),
      archived: false,
      senderIntegrationId: 'demo_sender_b',
      senderPhoneDisplay: '+40 755 666 444',
    },
    {
      waId: '40722233445',
      contactName: 'Andrei Stan',
      contactId: makeId('c3'),
      contactSource: 'manual',
      phone: '+40722233445',
      lastMessage: '[Document: contract.pdf]',
      lastMessageTime: iso(1440),
      messageCount: c3Messages.length,
      messages: c3Messages,
      unreadCount: 1,
      lastInboundTime: iso(1440),
      hasCampaignMessages: false,
      campaignIds: [],
      campaignNames: [],
      primaryCampaignName: null,
      pinned: false,
      mutedUntil: null,
      archived: true,
      senderIntegrationId: 'demo_sender_a',
      senderPhoneDisplay: '+40 740 111 222',
    },
  ];
}

const AUTO_SEND_SOURCES = ['typeform', 'manychat', 'manual', 'form', 'import', 'webhook'];
const AUTO_SEND_STATUSES = ['lead', 'prospect', 'customer', 'active'];
const INBOX_ACTIVITY_LIMIT = 600;
const INBOX_POLL_INTERVAL_MS = 12000;

const createAutoSendRule = (priority: number): AutoSendRuleForm => ({
  id: `rule_${Date.now()}_${priority}_${Math.random().toString(36).slice(2, 7)}`,
  name: `Rule ${priority + 1}`,
  enabled: true,
  templateName: 'hello_world',
  language: 'en_US',
  includeNameParam: false,
  headerMediaType: '',
  headerMediaId: '',
  headerMediaUrl: '',
  priority,
  conditions: {
    sources: [],
    statuses: [],
    typeformFormIds: [],
    requirePhone: true,
  },
});

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

function MessageBubble({
  msg,
  formatTime,
  onReply,
}: {
  msg: WhatsAppActivity;
  formatTime: (d: string) => string;
  onReply: (msg: WhatsAppActivity) => void;
}) {
  const isOutbound = msg.direction === 'outbound';
  const parsed = parseMessageContent(msg);
  const status = getStatusDisplay(msg);
  const senderIntegrationId = msg.metadata?.senderIntegrationId;
  const [mediaObjectUrl, setMediaObjectUrl] = useState('');
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const mediaSrc = parsed.mediaUrl || mediaObjectUrl;

  useEffect(() => {
    let isCancelled = false;
    let objectUrl: string | null = null;

    if (!parsed.mediaId || parsed.mediaUrl || !['image', 'video', 'audio', 'document'].includes(parsed.type)) {
      setMediaObjectUrl('');
      setIsLoadingMedia(false);
      setMediaError('');
      return;
    }

    const fetchMedia = async () => {
      setIsLoadingMedia(true);
      setMediaError('');
      try {
        const response = await api.get(`/integrations/whatsapp/media/${parsed.mediaId}/file`, {
          responseType: 'blob',
          params: senderIntegrationId ? { integrationId: senderIntegrationId } : undefined,
        });
        if (isCancelled) return;
        objectUrl = URL.createObjectURL(response.data);
        setMediaObjectUrl(objectUrl);
      } catch {
        if (!isCancelled) {
          setMediaObjectUrl('');
          setMediaError('Cannot load media');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingMedia(false);
        }
      }
    };

    fetchMedia();

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [parsed.mediaId, parsed.mediaUrl, parsed.type, senderIntegrationId]);

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div className="group relative">
      <button
        onClick={() => onReply(msg)}
        className={`absolute -top-2 ${isOutbound ? '-left-10' : '-right-10'} opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-green-600 hover:border-green-200`}
        title="Reply"
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
      </button>
      <div className={`max-w-md rounded-2xl px-4 py-2.5 shadow-sm ${
        isOutbound
          ? 'bg-green-500 text-white rounded-br-sm'
          : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
      }`}>
        {msg.metadata?.replyPreviewText && (
          <div className={`mb-1.5 px-2 py-1 rounded-lg border ${isOutbound ? 'bg-green-600 border-green-400' : 'bg-gray-50 border-gray-200'}`}>
            <p className={`text-[10px] font-semibold ${isOutbound ? 'text-green-100' : 'text-gray-500'}`}>Reply</p>
            <p className={`text-xs line-clamp-2 ${isOutbound ? 'text-white' : 'text-gray-700'}`}>{msg.metadata.replyPreviewText}</p>
          </div>
        )}
        {parsed.type === 'image' && (mediaSrc ? (
          <img
            src={mediaSrc}
            alt="WhatsApp media"
            className="mb-1 max-h-72 w-full rounded-lg object-cover"
          />
        ) : (
          <div className={`flex items-center gap-2 mb-1 ${isOutbound ? 'text-green-100' : 'text-gray-400'}`}>
            <Image className="h-4 w-4" />
            <span className="text-xs font-medium">Photo</span>
          </div>
        ))}
        {parsed.type === 'document' && (
          <div className={`flex items-center gap-2 p-2 mb-1 rounded-lg ${isOutbound ? 'bg-green-600' : 'bg-gray-50'}`}>
            <FileText className="h-5 w-5 flex-shrink-0" />
            {mediaSrc ? (
              <a
                href={mediaSrc}
                download={parsed.fileName || 'document'}
                target="_blank"
                rel="noreferrer"
                className={`text-xs font-medium truncate underline ${isOutbound ? 'text-white' : 'text-gray-700'}`}
              >
                {parsed.fileName || 'Document'}
              </a>
            ) : (
              <span className="text-xs font-medium truncate">{parsed.fileName || 'Document'}</span>
            )}
          </div>
        )}
        {parsed.type === 'audio' && (mediaSrc ? (
          <audio controls className="mb-1 w-full" src={mediaSrc} />
        ) : (
          <div className={`flex items-center gap-2 ${isOutbound ? 'text-green-100' : 'text-gray-400'}`}>
            <Mic className="h-4 w-4" />
            <span className="text-xs font-medium">Audio</span>
          </div>
        ))}
        {parsed.type === 'video' && (mediaSrc ? (
          <video controls preload="metadata" className="mb-1 max-h-72 w-full rounded-lg bg-black" src={mediaSrc} />
        ) : (
          <div className={`flex items-center gap-2 mb-1 ${isOutbound ? 'text-green-100' : 'text-gray-400'}`}>
            <Video className="h-4 w-4" />
            <span className="text-xs font-medium">Video</span>
          </div>
        ))}
        {parsed.type === 'reaction' && (
          <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full mb-1 ${isOutbound ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
            <span className="text-lg leading-none">{parsed.reactionEmoji || '👍'}</span>
            <span className="text-xs font-medium">{parsed.text || 'Reaction'}</span>
          </div>
        )}
        {isLoadingMedia && (
          <p className={`text-xs mb-1 ${isOutbound ? 'text-green-100' : 'text-gray-500'}`}>Loading media...</p>
        )}
        {mediaError && (
          <p className={`text-xs mb-1 ${isOutbound ? 'text-green-100' : 'text-red-500'}`}>{mediaError}</p>
        )}
        {parsed.type !== 'reaction' && parsed.text && <p className="text-sm whitespace-pre-wrap">{parsed.text}</p>}
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

function ContactInfoSidebar({ contact, isLoading, onClose, pipelineStages, onStageChange }: { contact: ContactDetail | null; isLoading: boolean; onClose: () => void; pipelineStages: PipelineStageOption[]; onStageChange: (contactId: string, stageId: string) => void }) {
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

        {/* Pipeline Stage */}
        {pipelineStages.length > 0 && (
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" /> Pipeline Stage</p>
            <select
              value={contact.pipelineStageId || ''}
              onChange={(e) => e.target.value && onStageChange(contact.id, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="" disabled>No stage assigned</option>
              {pipelineStages.map((stage) => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Contact Details */}
        <div className="p-4 space-y-3 border-b border-gray-100">
          {contact.source && (
            <div className="flex items-center gap-3 text-sm">
              <Tag className="h-4 w-4 text-gray-400" />
              <span className="text-gray-700 capitalize">{formatSourceLabel(contact.source)}</span>
            </div>
          )}
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

function formatSourceLabel(source?: string | null): string {
  const raw = String(source || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'manychat') return 'ManyChat';
  if (normalized === 'typeform') return 'Typeform';
  if (normalized === 'webhook') return 'Webhook';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseMessageContent(msg: WhatsAppActivity): {
  type: string;
  text: string;
  fileName?: string;
  mediaId?: string;
  mediaUrl?: string;
  reactionEmoji?: string;
} {
  const desc = msg.description || '';
  const msgType = msg.metadata?.messageType || 'text';
  const mediaId = msg.metadata?.mediaId;
  const mediaUrl = msg.metadata?.mediaUrl;
  const reactionEmoji = String(msg.metadata?.reactionEmoji || '').trim();
  if (reactionEmoji || msgType === 'reaction' || desc.startsWith('[Reaction]')) {
    return {
      type: 'reaction',
      text: desc.replace('[Reaction]', '').trim() || 'Reaction',
      reactionEmoji: reactionEmoji || '👍',
    };
  }
  if (msgType === 'image' || desc.startsWith('[Image]')) {
    return {
      type: 'image',
      text: desc.replace('[Image]', '').trim() || msg.metadata?.mediaCaption || '',
      mediaId,
      mediaUrl,
    };
  }
  if (msgType === 'document' || desc.startsWith('[Document:')) {
    const match = desc.match(/\[Document:\s*([^\]]+)\]/);
    return {
      type: 'document',
      text: desc.replace(/\[Document:[^\]]*\]/, '').trim() || msg.metadata?.mediaCaption || '',
      fileName: msg.metadata?.fileName || match?.[1],
      mediaId,
      mediaUrl,
    };
  }
  if (msgType === 'audio' || desc === '[Voice message]') {
    return { type: 'audio', text: msg.metadata?.mediaCaption || '', mediaId, mediaUrl };
  }
  if (msgType === 'video' || desc.startsWith('[Video]')) {
    return {
      type: 'video',
      text: desc.replace('[Video]', '').trim() || msg.metadata?.mediaCaption || '',
      mediaId,
      mediaUrl,
    };
  }
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
  const [accessResolved, setAccessResolved] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [search, setSearch] = useState('');
  const [sendError, setSendError] = useState('');
  const [senderAccounts, setSenderAccounts] = useState<WhatsAppSenderAccount[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [convFilter, setConvFilter] = useState<'all' | 'unread' | 'assigned' | 'campaign' | 'manychat' | 'typeform' | 'pinned' | 'archived' | 'no_reply'>('all');
  const [campaignConversationFilter, setCampaignConversationFilter] = useState('all');
  const [convNumberFilter, setConvNumberFilter] = useState<string>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyDraft | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // Mobile layout: 'list' shows conv list, 'chat' shows selected chat
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat'>('list');

  // Delete conversation
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);

  // Contact info sidebar
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [isLoadingContact, setIsLoadingContact] = useState(false);
  const [pipelineStages, setPipelineStages] = useState<PipelineStageOption[]>([]);

  // Template panel
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [templateHeaderMediaId, setTemplateHeaderMediaId] = useState('');
  const [templateHeaderMediaUrl, setTemplateHeaderMediaUrl] = useState('');
  const [isUploadingTemplateHeader, setIsUploadingTemplateHeader] = useState(false);

  // New conversation modal
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConvPhone, setNewConvPhone] = useState('');
  const [newConvTemplate, setNewConvTemplate] = useState<WhatsAppTemplate | null>(null);
  const [newConvTemplateParams, setNewConvTemplateParams] = useState<string[]>([]);
  const [newConvTemplateSearch, setNewConvTemplateSearch] = useState('');
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

  // "/" slash command dropdown
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashSearch, setSlashSearch] = useState('');

  // Attachment
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'image' | 'document' | 'video' | 'audio'>('image');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentMediaId, setAttachmentMediaId] = useState('');
  const [attachmentFileName, setAttachmentFileName] = useState('');
  const [attachmentCaption, setAttachmentCaption] = useState('');
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const speechRecognitionRef = useRef<any | null>(null);
  const voiceMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const autoSendOnStopRef = useRef(false);
  const autoSendTriggerRef = useRef(false);
  const holdStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const holdLockedRef = useRef(false);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardVoiceOnStopRef = useRef(false);
  const voicePreviewUrlRef = useRef('');
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnimFrameRef = useRef<number | null>(null);
  const voiceWaveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dictationSupported, setDictationSupported] = useState(true);
  const [isDictating, setIsDictating] = useState(false);
  const [voiceRecordingSupported, setVoiceRecordingSupported] = useState(true);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0);
  const [voiceAudioBlob, setVoiceAudioBlob] = useState<Blob | null>(null);
  const [voiceAudioPreviewUrl, setVoiceAudioPreviewUrl] = useState('');
  const [voiceInputError, setVoiceInputError] = useState('');
  const [voicePendingMediaId, setVoicePendingMediaId] = useState<string | null>(null);
  const [holdSlideHint, setHoldSlideHint] = useState<'none' | 'cancel' | 'lock'>('none');
  const [isHoldMode, setIsHoldMode] = useState(false);
  const [isHoldLocked, setIsHoldLocked] = useState(false);

  // Message search
  const [messageSearch, setMessageSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);

  // Webhook setup
  const [webhookInfo, setWebhookInfo] = useState<{ webhookUrl: string; verifyTokenConfigured: boolean; verifyTokenHint: string | null; verifyTokenExact: string | null } | null>(null);
  const [showWebhookSetup, setShowWebhookSetup] = useState(false);
  const [diagnostic, setDiagnostic] = useState<any | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [customToken, setCustomToken] = useState('');
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [tokenSaveError, setTokenSaveError] = useState('');
  const [verificationTest, setVerificationTest] = useState<any | null>(null);
  const [isTestingVerification, setIsTestingVerification] = useState(false);

  // Auto-send on contact creation
  const [showAutoSend, setShowAutoSend] = useState(false);
  const [autoSendRules, setAutoSendRules] = useState<AutoSendRuleForm[]>([createAutoSendRule(0)]);
  const [selectedAutoSendRuleId, setSelectedAutoSendRuleId] = useState<string>('');
  const [isUploadingAutoSendHeader, setIsUploadingAutoSendHeader] = useState(false);
  const [isSavingAutoSend, setIsSavingAutoSend] = useState(false);
  const [autoSendSaveError, setAutoSendSaveError] = useState('');
  const [typeformForms, setTypeformForms] = useState<TypeformFormOption[]>([]);
  const [isLoadingTypeformForms, setIsLoadingTypeformForms] = useState(false);
  const [typeformFormInput, setTypeformFormInput] = useState('');

  // Auto-responses
  const [showAutoResponses, setShowAutoResponses] = useState(false);
  const [autoRespondEnabled, setAutoRespondEnabled] = useState(true);
  const [autoResponseRules, setAutoResponseRules] = useState<Array<{ id: string; name: string; keywords: string; response: string; enabled: boolean }>>([]);
  const [isSavingAutoResp, setIsSavingAutoResp] = useState(false);

  // AI auto-reply settings
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [aiMaxTokens, setAiMaxTokens] = useState(300);
  const [aiFallbackToKeywords, setAiFallbackToKeywords] = useState(true);
  const [isSavingAI, setIsSavingAI] = useState(false);
  const [aiSaveError, setAiSaveError] = useState('');
  const [aiTestMessage, setAiTestMessage] = useState('');
  const [aiTestReply, setAiTestReply] = useState<string | null>(null);
  const [aiTestError, setAiTestError] = useState('');
  const [isTestingAI, setIsTestingAI] = useState(false);

  // Template manager
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [metaTemplates, setMetaTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '', language: 'en_US', category: 'UTILITY' as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    headerType: 'NONE' as 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT',
    headerText: '', headerMediaUrl: '', bodyText: '', footerText: '',
    buttons: [] as Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phoneNumber?: string }>,
  });
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState('');

  // ─── Page tabs ────────────────────────────────────────────
  const [pageTab, setPageTab] = useState<'inbox' | 'broadcasts'>('inbox');

  // ─── Broadcasts: Segment send ─────────────────────────────
  const [broadcastFilterTags, setBroadcastFilterTags] = useState<string[]>([]);
  const [broadcastTagInput, setBroadcastTagInput] = useState('');
  const [broadcastFilterStatus, setBroadcastFilterStatus] = useState<string[]>([]);
  const [broadcastTemplateName, setBroadcastTemplateName] = useState('hello_world');
  const [broadcastTemplateLanguage, setBroadcastTemplateLanguage] = useState('en');
  const [broadcastResults, setBroadcastResults] = useState<any | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');

  // ─── Campaigns ──────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [campName, setCampName] = useState('');
  const [campTemplate, setCampTemplate] = useState('');
  const [campLanguage, setCampLanguage] = useState('en_US');
  const [campFilterTags, setCampFilterTags] = useState<string[]>([]);
  const [campTagInput, setCampTagInput] = useState('');
  const [campFilterStatus, setCampFilterStatus] = useState<string[]>([]);
  const [campContactSearch, setCampContactSearch] = useState('');
  const [campContactResults, setCampContactResults] = useState<any[]>([]);
  const [campSelectedContacts, setCampSelectedContacts] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [isSearchingCampContacts, setIsSearchingCampContacts] = useState(false);
  const [audiencePreview, setAudiencePreview] = useState<{ count: number; sample: any[] } | null>(null);
  const [isPreviewingAudience, setIsPreviewingAudience] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [isSendingCampaign, setIsSendingCampaign] = useState<string | null>(null);
  const [campaignError, setCampaignError] = useState('');

  // ─── Broadcasts: CSV Import ───────────────────────────────
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<Array<{ phone: string; firstName?: string; lastName?: string }>>([]);
  const [csvParseError, setCsvParseError] = useState('');
  const [csvAddTags, setCsvAddTags] = useState('');
  const [csvSendTemplate, setCsvSendTemplate] = useState(false);
  const [csvTemplateName, setCsvTemplateName] = useState('hello_world');
  const [csvTemplateLanguage, setCsvTemplateLanguage] = useState('en');
  const [csvImportResults, setCsvImportResults] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [csvImportError, setCsvImportError] = useState('');

  // ─── Assignments ──────────────────────────────────────────
  const [assignments, setAssignments] = useState<Record<string, ConvAssignment>>({});
  const [teamUsers, setTeamUsers] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const previousScrollSignatureRef = useRef('');
  const inboxFetchInProgressRef = useRef(false);
  const selectedMessageCount = selectedConv?.messages?.length ?? 0;
  const selectedLastMessageId = selectedMessageCount > 0
    ? (selectedConv?.messages?.[selectedMessageCount - 1]?.id || '')
    : '';

  // ─── Conversation Flows ─────────────────────────────────
  const [showFlowEditor, setShowFlowEditor] = useState(false);
  const [flows, setFlows] = useState<any[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);
  const [isSavingFlows, setIsSavingFlows] = useState(false);
  const [editingFlow, setEditingFlow] = useState<any | null>(null);
  const [flowTestPhone, setFlowTestPhone] = useState('');
  const [flowTestResult, setFlowTestResult] = useState<string | null>(null);

  const canAccessWhatsApp = hasChannelAccess(currentUser, 'whatsapp');

  // ─── Effects ──────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    void authService
      .getCurrentUser()
      .catch(() => authService.getUser())
      .then((user) => {
        if (!active) return;
        setCurrentUser(user);
        setAccessResolved(true);
        if (!hasChannelAccess(user, 'whatsapp')) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!accessResolved || !canAccessWhatsApp) {
      return;
    }
    fetchSenderAccounts();
    fetchWebhookInfo();
    fetchAutoResponses();
    fetchAutoSend();
    fetchTypeformForms();
    fetchAssignments();
    fetchTeamUsers();
  }, [accessResolved, canAccessWhatsApp]);

  useEffect(() => {
    if (!accessResolved || !canAccessWhatsApp) {
      return;
    }
    fetchInbox();
    const interval = setInterval(fetchInbox, INBOX_POLL_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchInbox(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessResolved, canAccessWhatsApp]);

  useEffect(() => {
    if (!selectedSenderId) {
      localStorage.removeItem('wa_selected_sender_id');
      return;
    }
    localStorage.setItem('wa_selected_sender_id', selectedSenderId);
  }, [selectedSenderId]);

  useEffect(() => {
    const signature = `${selectedConv?.waId || ''}:${selectedMessageCount}:${selectedLastMessageId}`;
    if (!selectedConv?.waId || previousScrollSignatureRef.current === signature) {
      return;
    }
    previousScrollSignatureRef.current = signature;
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [selectedConv?.waId, selectedMessageCount, selectedLastMessageId]);

  useEffect(() => {
    const saved = localStorage.getItem('whatsapp_quick_replies');
    if (saved) {
      try { setQuickReplies(JSON.parse(saved)); } catch { setQuickReplies(DEFAULT_QUICK_REPLIES); }
    } else {
      setQuickReplies(DEFAULT_QUICK_REPLIES);
    }
  }, []);

  const stopVoiceTimer = useCallback(() => {
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  }, []);

  const stopVoiceStream = useCallback(() => {
    if (voiceStreamRef.current) {
      voiceStreamRef.current.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
  }, []);

  const stopWaveformAnimation = useCallback(() => {
    if (voiceAnimFrameRef.current) {
      cancelAnimationFrame(voiceAnimFrameRef.current);
      voiceAnimFrameRef.current = null;
    }
    voiceAnalyserRef.current = null;
    if (voiceAudioContextRef.current) {
      voiceAudioContextRef.current.close().catch(() => {});
      voiceAudioContextRef.current = null;
    }
    const canvas = voiceWaveformCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const startWaveformAnimation = useCallback((stream: MediaStream) => {
    try {
      const AudioCtxClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const audioCtx: AudioContext = new AudioCtxClass();
      // iOS Safari starts AudioContext suspended — resume immediately after user gesture
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      voiceAudioContextRef.current = audioCtx;
      voiceAnalyserRef.current = analyser;
      const bufferLength = analyser.frequencyBinCount; // 32
      const dataArray = new Uint8Array(bufferLength);

      // Scale canvas buffer to device pixel ratio for sharp rendering on Retina/HiDPI
      const canvas = voiceWaveformCanvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const cssW = canvas.offsetWidth || 160;
        const cssH = canvas.offsetHeight || 30;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        const ctx2d = canvas.getContext('2d');
        if (ctx2d) ctx2d.scale(dpr, dpr);
      }

      const draw = () => {
        if (!voiceAnalyserRef.current) return;
        const cvs = voiceWaveformCanvasRef.current;
        if (cvs) {
          voiceAnalyserRef.current.getByteFrequencyData(dataArray);
          const ctx2d = cvs.getContext('2d');
          if (ctx2d) {
            const dpr = window.devicePixelRatio || 1;
            const W = cvs.width / dpr;
            const H = cvs.height / dpr;
            ctx2d.clearRect(0, 0, W, H);
            const numBars = Math.min(bufferLength, 28);
            const gap = 2;
            const barW = Math.max(1, (W - gap * (numBars - 1)) / numBars);
            for (let i = 0; i < numBars; i++) {
              const val = dataArray[i] / 255;
              const barH = Math.max(3, val * H * 0.92);
              const x = i * (barW + gap);
              const y = (H - barH) / 2;
              ctx2d.fillStyle = '#ef4444';
              ctx2d.fillRect(x, y, barW, barH);
            }
          }
        }
        voiceAnimFrameRef.current = requestAnimationFrame(draw);
      };
      voiceAnimFrameRef.current = requestAnimationFrame(draw);
    } catch {
      // AudioContext unavailable — waveform won't show, recording still works
    }
  }, []);

  const clearVoiceDraft = useCallback((keepPreviewUrl = false) => {
    if (!keepPreviewUrl && voiceAudioPreviewUrl) {
      URL.revokeObjectURL(voiceAudioPreviewUrl);
    }
    setVoiceAudioBlob(null);
    setVoiceAudioPreviewUrl('');
    setVoiceRecordingSeconds(0);
    setVoiceInputError('');
    setVoicePendingMediaId(null);
    setIsHoldMode(false);
    setIsHoldLocked(false);
    setHoldSlideHint('none');
    holdStartPosRef.current = null;
    holdLockedRef.current = false;
    autoSendOnStopRef.current = false;
  }, [voiceAudioPreviewUrl]);

  const stopDictation = useCallback(() => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null;
        speechRecognitionRef.current.stop();
      } catch {
        // ignore
      }
      speechRecognitionRef.current = null;
    }
    setIsDictating(false);
  }, []);

  useEffect(() => {
    voicePreviewUrlRef.current = voiceAudioPreviewUrl;
  }, [voiceAudioPreviewUrl]);

  // Auto-send after hold-to-record release: blob lands in state, trigger fires
  useEffect(() => {
    if (voiceAudioBlob && autoSendTriggerRef.current) {
      autoSendTriggerRef.current = false;
      handleSendVoiceRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceAudioBlob]);

  useEffect(() => {
    const speechCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setDictationSupported(!!speechCtor);
    setVoiceRecordingSupported(!!(window as any).MediaRecorder && !!navigator.mediaDevices?.getUserMedia);

    return () => {
      stopDictation();
      stopVoiceTimer();
      stopVoiceStream();
      stopWaveformAnimation();
      if (voiceMediaRecorderRef.current && voiceMediaRecorderRef.current.state !== 'inactive') {
        try {
          voiceMediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (voicePreviewUrlRef.current) {
        URL.revokeObjectURL(voicePreviewUrlRef.current);
      }
    };
  }, [stopDictation, stopVoiceStream, stopVoiceTimer, stopWaveformAnimation]);

  const enableDemoMode = useCallback(() => {
    const demoConversations = sortConversationsByPinAndTime(buildDemoConversations());
    localStorage.setItem('wa_demo_mode', '1');
    setDemoMode(true);
    setConversations(demoConversations);
    setSelectedConv(demoConversations[0] || null);
    setIsLoading(false);
  }, []);

  const disableDemoMode = useCallback(() => {
    localStorage.setItem('wa_demo_mode', '0');
    setDemoMode(false);
    setConversations([]);
    setSelectedConv(null);
    setIsLoading(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storedDemoMode = localStorage.getItem('wa_demo_mode');
    const demoFromStorage = storedDemoMode === '1';
    const demoDisabledByStorage = storedDemoMode === '0';
    const demoFromQuery = !demoDisabledByStorage && params.get('demo') === '1';
    const enabled = demoFromQuery || demoFromStorage;
    if (enabled) {
      enableDemoMode();
    }
  }, [enableDemoMode]);

  useEffect(() => {
    if (autoSendRules.length === 0) {
      setSelectedAutoSendRuleId('');
      return;
    }
    if (!selectedAutoSendRuleId || !autoSendRules.some(rule => rule.id === selectedAutoSendRuleId)) {
      setSelectedAutoSendRuleId(autoSendRules[0].id);
    }
  }, [autoSendRules, selectedAutoSendRuleId]);

  useEffect(() => {
    const q = campContactSearch.trim();
    if (!q) {
      setCampContactResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchCampaignContacts(q);
    }, 250);
    return () => clearTimeout(t);
  }, [campContactSearch]);

  const selectedAutoSendRule = autoSendRules.find(rule => rule.id === selectedAutoSendRuleId) || autoSendRules[0] || null;
  const selectedSender = senderAccounts.find(account => account.id === selectedSenderId) || null;
  const withSelectedSender = useCallback((payload: Record<string, any> = {}) => (
    selectedSenderId ? { ...payload, integrationId: selectedSenderId } : payload
  ), [selectedSenderId]);
  const approvedTemplates = useMemo<WhatsAppTemplate[]>(
    () => metaTemplates.filter((t: any) => t.status === 'APPROVED').map(toSendableTemplate),
    [metaTemplates],
  );
  const availableTemplates = approvedTemplates.length > 0 ? approvedTemplates : WHATSAPP_TEMPLATES;
  const filteredNewConversationTemplates = useMemo(() => {
    const query = newConvTemplateSearch.trim().toLowerCase();
    if (!query) return availableTemplates;
    return availableTemplates.filter((template) =>
      template.displayName.toLowerCase().includes(query)
      || template.name.toLowerCase().includes(query)
      || template.body.toLowerCase().includes(query),
    );
  }, [availableTemplates, newConvTemplateSearch]);
  const getTemplateMediaCacheKey = useCallback((template: WhatsAppTemplate) => (
    `${selectedSenderId || 'default'}::${template.name}::${template.language}`
  ), [selectedSenderId]);
  const readTemplateHeaderMediaCache = useCallback((template: WhatsAppTemplate) => {
    if (typeof window === 'undefined') return { headerMediaId: '', headerMediaUrl: '' };
    try {
      const raw = localStorage.getItem(TEMPLATE_HEADER_MEDIA_CACHE_KEY);
      if (!raw) return { headerMediaId: '', headerMediaUrl: '' };
      const parsed = JSON.parse(raw) as Record<string, TemplateHeaderMediaCacheEntry>;
      const entry = parsed[getTemplateMediaCacheKey(template)];
      if (!entry) return { headerMediaId: '', headerMediaUrl: '' };
      return {
        headerMediaId: String(entry.headerMediaId || '').trim(),
        headerMediaUrl: String(entry.headerMediaUrl || '').trim(),
      };
    } catch {
      return { headerMediaId: '', headerMediaUrl: '' };
    }
  }, [getTemplateMediaCacheKey]);
  const persistTemplateHeaderMediaCache = useCallback((template: WhatsAppTemplate, mediaId: string, mediaUrl: string) => {
    if (typeof window === 'undefined') return;
    const normalizedId = String(mediaId || '').trim();
    const normalizedUrl = String(mediaUrl || '').trim();
    try {
      const raw = localStorage.getItem(TEMPLATE_HEADER_MEDIA_CACHE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, TemplateHeaderMediaCacheEntry>) : {};
      const key = getTemplateMediaCacheKey(template);
      if (!normalizedId && !normalizedUrl) {
        delete parsed[key];
      } else {
        parsed[key] = {
          headerMediaId: normalizedId,
          headerMediaUrl: normalizedUrl,
          updatedAt: new Date().toISOString(),
        };
      }
      localStorage.setItem(TEMPLATE_HEADER_MEDIA_CACHE_KEY, JSON.stringify(parsed));
    } catch {
      // ignore local cache write failures
    }
  }, [getTemplateMediaCacheKey]);
  const applyTemplateSelection = useCallback((template: WhatsAppTemplate, target: 'chat' | 'new') => {
    const cachedMedia = readTemplateHeaderMediaCache(template);
    const resolvedMediaId = cachedMedia.headerMediaId || String(template.headerMediaId || '').trim();
    const resolvedMediaUrl = cachedMedia.headerMediaUrl || String(template.headerMediaUrl || '').trim();
    if (target === 'chat') {
      setSelectedTemplate(template);
      setTemplateParams(Array(template.parameterCount).fill(''));
    } else {
      setNewConvTemplate(template);
      setNewConvTemplateParams(Array(template.parameterCount).fill(''));
    }
    setTemplateHeaderMediaId(resolvedMediaId);
    setTemplateHeaderMediaUrl(resolvedMediaUrl);
  }, [readTemplateHeaderMediaCache]);

  const updateSelectedAutoSendRule = (updater: (rule: AutoSendRuleForm) => AutoSendRuleForm) => {
    const targetId = selectedAutoSendRuleId || autoSendRules[0]?.id;
    if (!targetId) return;
    setAutoSendRules(prev => prev.map(rule => (rule.id === targetId ? updater(rule) : rule)));
  };

  const moveAutoSendRule = (ruleId: string, direction: 'up' | 'down') => {
    setAutoSendRules(prev => {
      const index = prev.findIndex(rule => rule.id === ruleId);
      if (index < 0) return prev;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const nextRules = [...prev];
      const [rule] = nextRules.splice(index, 1);
      nextRules.splice(nextIndex, 0, rule);
      return nextRules.map((item, idx) => ({ ...item, priority: idx }));
    });
  };

  // ─── Data Fetching ────────────────────────────────────────

  const fetchInbox = useCallback(async () => {
    if (inboxFetchInProgressRef.current) {
      return;
    }
    inboxFetchInProgressRef.current = true;
    const storedDemoMode = typeof window !== 'undefined' ? localStorage.getItem('wa_demo_mode') : null;
    const demoFromStorage = storedDemoMode === '1';
    const demoDisabledByStorage = storedDemoMode === '0';
    const demoFromQuery = typeof window !== 'undefined' && !demoDisabledByStorage && new URLSearchParams(window.location.search).get('demo') === '1';
    const shouldUseDemo = demoFromStorage || demoFromQuery;
    if (shouldUseDemo) {
      const seededDemoConversations = sortConversationsByPinAndTime(buildDemoConversations());
      setDemoMode(true);
      setConversations((prev) => (prev.length > 0 ? sortConversationsByPinAndTime(prev) : seededDemoConversations));
      setSelectedConv((prev) => {
        if (!prev) return seededDemoConversations[0] || null;
        return seededDemoConversations.find((conversation) => conversation.waId === prev.waId) || seededDemoConversations[0] || null;
      });
      setIsLoading(false);
      inboxFetchInProgressRef.current = false;
      return;
    }
    try {
      const [inboxRes, stateRes] = await Promise.all([
        api.get(`/integrations/whatsapp/inbox?limit=${INBOX_ACTIVITY_LIMIT}`),
        api.get('/integrations/whatsapp/conversations/state').catch(() => ({ data: { data: {} } })),
      ]);
      const activities: WhatsAppActivity[] = inboxRes.data.data || [];
      const serverState = stateRes.data?.data || {};
      const localReadTimestamps = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
      const localArchivedMap = JSON.parse(localStorage.getItem('wa_web_archived_map') || '{}');
      const localPinnedMap = JSON.parse(localStorage.getItem('wa_web_pinned_map') || '{}');
      const localMutedMap = JSON.parse(localStorage.getItem('wa_web_muted_map') || '{}');
      const readTimestamps = { ...localReadTimestamps, ...(serverState.readAtMap || {}) };
      const archivedMap = { ...localArchivedMap, ...(serverState.archivedMap || {}) };
      const pinnedMap = { ...localPinnedMap, ...(serverState.pinnedMap || {}) };
      const mutedUntilMap = { ...localMutedMap, ...(serverState.mutedUntilMap || {}) };
      localStorage.setItem('wa_read_timestamps', JSON.stringify(readTimestamps));
      localStorage.setItem('wa_web_archived_map', JSON.stringify(archivedMap));
      localStorage.setItem('wa_web_pinned_map', JSON.stringify(pinnedMap));
      localStorage.setItem('wa_web_muted_map', JSON.stringify(mutedUntilMap));
      const convMap = new Map<string, Conversation>();

      for (const act of activities) {
        const waId = act.metadata?.waId || act.contact?.phone?.replace('+', '') || 'unknown';
        const phone = act.contact?.phone || `+${waId}`;
        const contactName = act.contact ? `${act.contact.firstName} ${act.contact.lastName}`.trim() : phone;
        const contactSource = act.contact?.source || null;

        if (!convMap.has(waId)) {
          convMap.set(waId, {
            waId, contactName, contactId: act.contact?.id || null, contactSource, phone,
            lastMessage: act.description || '', lastMessageTime: act.occurredAt,
            messageCount: 0, messages: [], unreadCount: 0, lastInboundTime: null,
            hasCampaignMessages: false, campaignIds: [], campaignNames: [], primaryCampaignName: null,
            senderIntegrationId: act.metadata?.senderIntegrationId || null,
            senderPhoneDisplay: act.metadata?.senderPhoneDisplay || null,
            archived: !!archivedMap[waId],
            pinned: !!pinnedMap[waId],
            mutedUntil: mutedUntilMap[waId] || null,
          });
        }
        const conv = convMap.get(waId)!;
        if (!conv.contactSource && contactSource) {
          conv.contactSource = contactSource;
        }
        // Update sender info from latest outbound message (most reliable indicator of which number was used)
        if (act.direction === 'outbound' && act.metadata?.senderIntegrationId) {
          conv.senderIntegrationId = act.metadata.senderIntegrationId;
          conv.senderPhoneDisplay = act.metadata.senderPhoneDisplay || conv.senderPhoneDisplay;
        }
        const campaignId = String(act.metadata?.campaignId || '').trim();
        const campaignName = String(act.metadata?.campaignName || '').trim();
        const isCampaignMessage = act.metadata?.isCampaign === true || !!campaignId || !!campaignName;
        if (isCampaignMessage) {
          conv.hasCampaignMessages = true;
          if (campaignId && !conv.campaignIds.includes(campaignId)) {
            conv.campaignIds.push(campaignId);
          }
          if (campaignName && !conv.campaignNames.includes(campaignName)) {
            conv.campaignNames.push(campaignName);
          }
          if (!conv.primaryCampaignName && campaignName) {
            conv.primaryCampaignName = campaignName;
          }
        }
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

      const convList = sortConversationsByPinAndTime(Array.from(convMap.values()));
      setConversations(convList);
      setSelectedConv((prev) => {
        if (!prev) return prev;
        return convList.find((conversation) => conversation.waId === prev.waId) || null;
      });
    } catch (err) {
      console.error('Failed to fetch WhatsApp inbox:', err);
    } finally {
      setIsLoading(false);
      inboxFetchInProgressRef.current = false;
    }
  }, []);

  const fetchSenderAccounts = useCallback(async () => {
    try {
      const res = await api.get('/integrations/whatsapp/accounts');
      const accounts: WhatsAppSenderAccount[] = Array.isArray(res.data?.data) ? res.data.data : [];
      const defaultIntegrationId = String(res.data?.defaultIntegrationId || '').trim();
      setSenderAccounts(accounts);

      const savedSenderId = localStorage.getItem('wa_selected_sender_id') || '';
      const fallbackId = defaultIntegrationId || accounts[0]?.id || '';
      setSelectedSenderId(prev =>
        (savedSenderId && accounts.some(account => account.id === savedSenderId))
          ? savedSenderId
          : (prev && accounts.some(account => account.id === prev))
            ? prev
            : fallbackId,
      );
    } catch (err) {
      console.error('Failed to fetch WhatsApp sender accounts:', err);
      setSenderAccounts([]);
      setSelectedSenderId('');
    }
  }, []);

  const fetchWebhookInfo = async () => {
    try {
      const [setupRes, diagRes] = await Promise.all([
        api.get('/integrations/whatsapp/setup'),
        api.get('/integrations/whatsapp/diagnostic'),
      ]);
      setWebhookInfo(setupRes.data);
      setDiagnostic(diagRes.data);
    } catch { /* silent */ }
  };

  const saveVerifyToken = async () => {
    if (!customToken.trim()) return;
    setIsSavingToken(true);
    setTokenSaveError('');
    try {
      await api.post('/integrations/whatsapp/setup/verify-token', { token: customToken.trim() });
      const res = await api.get('/integrations/whatsapp/setup');
      setWebhookInfo(res.data);
      setCustomToken('');
    } catch (err: any) {
      setTokenSaveError(err?.response?.data?.message || 'Failed to save token');
    } finally {
      setIsSavingToken(false);
    }
  };

  const generateRandomToken = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let token = '';
    for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
    setCustomToken(token);
  };

  const runVerificationTest = async () => {
    setIsTestingVerification(true);
    setVerificationTest(null);
    try {
      const res = await api.get('/integrations/whatsapp/test-verification');
      setVerificationTest(res.data);
    } catch (err: any) {
      setVerificationTest({ working: false, reason: err?.response?.data?.message || err.message || 'Request failed' });
    } finally {
      setIsTestingVerification(false);
    }
  };

  const fetchAutoResponses = async () => {
    try {
      const res = await api.get('/integrations/whatsapp/auto-responses');
      setAutoRespondEnabled(res.data.enabled ?? true);
      const rules = (res.data.rules || []).map((r: any, i: number) => ({
        id: r.id || `rule_${i}`,
        name: r.name || `Rule ${i + 1}`,
        keywords: Array.isArray(r.keywords) ? r.keywords.join(', ') : (r.keywords || ''),
        response: r.response || '',
        enabled: r.enabled !== false,
      }));
      setAutoResponseRules(rules.length > 0 ? rules : [
        { id: 'r1', name: 'Greeting', keywords: 'hello, hi, hey, salut, buna', response: 'Hello{{name}}! Thank you for contacting us. How can we help you today?', enabled: true },
        { id: 'r2', name: 'Pricing', keywords: 'pricing, price, cost, pret', response: 'Thank you for your interest{{name}}! A team member will get back to you with pricing details shortly.', enabled: true },
      ]);
    } catch { /* silent */ }
  };

  const fetchAutoSend = async () => {
    try {
      const res = await api.get('/integrations/whatsapp/auto-send');
      const cfg = res.data;
      const rawRules = Array.isArray(cfg.autoSendRules) && cfg.autoSendRules.length > 0
        ? cfg.autoSendRules
        : [cfg];
      const rules = rawRules.map((rule: any, index: number): AutoSendRuleForm => {
        const headerType = String(rule?.headerMediaType || '').toLowerCase();
        return {
          id: String(rule?.id || `rule_${Date.now()}_${index}`),
          name: String(rule?.name || `Rule ${index + 1}`),
          enabled: rule?.enabled !== false,
          templateName: String(rule?.templateName || 'hello_world'),
          language: String(rule?.language || 'en_US'),
          includeNameParam: Boolean(rule?.includeNameParam),
          headerMediaType: (['image', 'video', 'document'].includes(headerType) ? headerType : '') as '' | 'image' | 'video' | 'document',
          headerMediaId: String(rule?.headerMediaId || ''),
          headerMediaUrl: String(rule?.headerMediaUrl || ''),
          priority: Number.isFinite(Number(rule?.priority)) ? Number(rule.priority) : index,
          conditions: {
            sources: Array.isArray(rule?.conditions?.sources) ? rule.conditions.sources : [],
            statuses: Array.isArray(rule?.conditions?.statuses) ? rule.conditions.statuses : [],
            typeformFormIds: Array.isArray(rule?.conditions?.typeformFormIds) ? rule.conditions.typeformFormIds : [],
            requirePhone: rule?.conditions?.requirePhone !== false,
          },
        };
      }).sort((a: AutoSendRuleForm, b: AutoSendRuleForm) => a.priority - b.priority);
      setAutoSendRules(rules.length > 0 ? rules : [createAutoSendRule(0)]);
    } catch { /* silent */ }
  };

  const fetchTypeformForms = async () => {
    setIsLoadingTypeformForms(true);
    try {
      const res = await api.get('/integrations', { params: { type: 'typeform' } });
      const integrations = Array.isArray(res.data?.integrations) ? res.data.integrations : [];
      const formMap = new Map<string, TypeformFormOption>();

      integrations.forEach((integration: any) => {
        const forms = Array.isArray(integration?.config?.typeformForms) ? integration.config.typeformForms : [];
        forms.forEach((form: any) => {
          if (form?.enabled === false) return;
          const formId = String(form?.formId || '').trim();
          if (!formId) return;
          if (formMap.has(formId)) return;
          formMap.set(formId, {
            formId,
            name: String(form?.name || formId).trim() || formId,
          });
        });
      });

      setTypeformForms(Array.from(formMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setTypeformForms([]);
    } finally {
      setIsLoadingTypeformForms(false);
    }
  };

  const saveAutoSendConfig = async () => {
    setIsSavingAutoSend(true);
    setAutoSendSaveError('');
    try {
      const rules = autoSendRules.map((rule, index) => ({
        id: rule.id,
        name: rule.name.trim() || `Rule ${index + 1}`,
        enabled: rule.enabled,
        templateName: rule.templateName.trim() || 'hello_world',
        language: rule.language.trim() || 'en_US',
        includeNameParam: rule.includeNameParam,
        headerMediaType: rule.headerMediaType || undefined,
        headerMediaId: rule.headerMediaId.trim() || undefined,
        headerMediaUrl: rule.headerMediaUrl.trim() || undefined,
        priority: index,
        conditions: {
          sources: rule.conditions.sources.length > 0 ? rule.conditions.sources : undefined,
          statuses: rule.conditions.statuses.length > 0 ? rule.conditions.statuses : undefined,
          typeformFormIds: rule.conditions.typeformFormIds.length > 0 ? rule.conditions.typeformFormIds : undefined,
          requirePhone: rule.conditions.requirePhone,
        },
      }));
      await api.post('/integrations/whatsapp/auto-send', {
        autoSendRules: rules,
      });
      setShowAutoSend(false);
    } catch (err: any) {
      setAutoSendSaveError(err?.response?.data?.message || 'Failed to save');
    } finally {
      setIsSavingAutoSend(false);
    }
  };

  const fetchAIConfig = async () => {
    try {
      const res = await api.get('/integrations/whatsapp/ai-config');
      const cfg = res.data;
      setAiEnabled(cfg.enabled ?? false);
      setAiSystemPrompt(cfg.systemPrompt || '');
      setAiMaxTokens(cfg.maxTokens || 300);
      setAiFallbackToKeywords(cfg.fallbackToKeywords ?? true);
    } catch { /* silent */ }
  };

  const saveAIConfig = async () => {
    setIsSavingAI(true);
    setAiSaveError('');
    try {
      await api.post('/integrations/whatsapp/ai-config', {
        enabled: aiEnabled,
        systemPrompt: aiSystemPrompt.trim() || undefined,
        maxTokens: aiMaxTokens,
        fallbackToKeywords: aiFallbackToKeywords,
      });
      setShowAISettings(false);
    } catch (err: any) {
      setAiSaveError(err?.response?.data?.message || 'Failed to save AI config');
    } finally {
      setIsSavingAI(false);
    }
  };

  const testAIReply = async () => {
    if (!aiTestMessage.trim()) return;
    setIsTestingAI(true);
    setAiTestReply(null);
    setAiTestError('');
    try {
      const res = await api.post('/integrations/whatsapp/ai-test', { message: aiTestMessage.trim() });
      if (res.data.reply) {
        setAiTestReply(res.data.reply);
      } else {
        setAiTestError(res.data.error || 'No reply generated');
      }
    } catch (err: any) {
      setAiTestError(err?.response?.data?.message || 'Test failed');
    } finally {
      setIsTestingAI(false);
    }
  };

  const saveAutoResponses = async () => {
    setIsSavingAutoResp(true);
    try {
      const rules = autoResponseRules.map(r => ({
        id: r.id,
        name: r.name,
        keywords: r.keywords.split(',').map(k => k.trim()).filter(Boolean),
        response: r.response,
        enabled: r.enabled,
      }));
      await api.post('/integrations/whatsapp/auto-responses', { enabled: autoRespondEnabled, rules });
      setShowAutoResponses(false);
    } catch { /* silent */ }
    finally { setIsSavingAutoResp(false); }
  };

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

  useEffect(() => {
    api.get('/pipelines')
      .then((res: any) => {
        const pipelines: PipelineOption[] = Array.isArray(res.data) ? res.data : [];
        const defaultPipeline = pipelines.find(p => p.isDefault) || pipelines[0];
        const stages = (defaultPipeline?.stages || []).slice().sort((a, b) => a.displayOrder - b.displayOrder);
        setPipelineStages(stages);
      })
      .catch(() => setPipelineStages([]));
  }, []);

  const handleContactStageChange = async (contactId: string, stageId: string) => {
    const previousStageId = contactDetail?.pipelineStageId;
    setContactDetail(prev => (prev && prev.id === contactId ? { ...prev, pipelineStageId: stageId } : prev));
    try {
      await api.put(`/pipelines/contacts/${contactId}`, { pipelineStageId: stageId });
    } catch (err) {
      console.error('Failed to update pipeline stage:', err);
      setContactDetail(prev => (prev && prev.id === contactId ? { ...prev, pipelineStageId: previousStageId } : prev));
      alert('Failed to update pipeline stage');
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

  const searchCampaignContacts = async (query: string) => {
    if (!query.trim()) {
      setCampContactResults([]);
      return;
    }
    setIsSearchingCampContacts(true);
    try {
      const res = await api.get(`/contacts?search=${encodeURIComponent(query)}&limit=20`);
      const rows = res.data.data || res.data || [];
      setCampContactResults(rows);
    } catch {
      setCampContactResults([]);
    } finally {
      setIsSearchingCampContacts(false);
    }
  };

  // ─── Assignment helpers ───────────────────────────────────

  // 8 distinct colors for team members
  const USER_COLORS = ['#16a34a','#2563eb','#9333ea','#dc2626','#ea580c','#0891b2','#be185d','#65a30d'];
  const getUserColor = (userId: string) => USER_COLORS[Math.abs(userId.split('').reduce((a,c) => a + c.charCodeAt(0), 0)) % USER_COLORS.length];
  const getUserInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const fetchAssignments = async () => {
    try {
      const res = await api.get('/integrations/whatsapp/assignments');
      setAssignments(res.data.data || {});
    } catch { /* silent */ }
  };

  const fetchTeamUsers = async () => {
    try {
      const res = await api.get('/users');
      setTeamUsers(res.data.data || res.data || []);
    } catch { /* silent */ }
  };

  const assignConversation = async (waId: string, user: { id: string; firstName: string; lastName: string } | null) => {
    try {
      const color = user ? getUserColor(user.id) : '#6b7280';
      const body = user
        ? { userId: user.id, userName: `${user.firstName} ${user.lastName}`.trim(), color }
        : { userId: null };
      await api.post(`/integrations/whatsapp/conversations/${waId}/assign`, body);
      if (user) {
        setAssignments(prev => ({ ...prev, [waId]: { userId: user.id, userName: `${user.firstName} ${user.lastName}`.trim(), color, assignedAt: new Date().toISOString() } }));
      } else {
        setAssignments(prev => { const n = { ...prev }; delete n[waId]; return n; });
      }
    } catch { /* silent */ }
    setShowAssignDropdown(false);
  };

  // ─── Actions ──────────────────────────────────────────────

  const fetchMetaTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await api.get('/integrations/whatsapp/templates');
      setMetaTemplates(res.data.data || []);
    } catch { /* silent */ }
    finally { setIsLoadingTemplates(false); setTemplatesLoaded(true); }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.bodyText.trim()) return;
    setIsCreatingTemplate(true);
    setTemplateError('');
    try {
      await api.post('/integrations/whatsapp/templates', {
        name: newTemplate.name.trim().toLowerCase().replace(/\s+/g, '_'),
        language: newTemplate.language,
        category: newTemplate.category,
        headerType: newTemplate.headerType,
        headerText: newTemplate.headerType === 'TEXT' ? (newTemplate.headerText.trim() || undefined) : undefined,
        headerMediaUrl: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(newTemplate.headerType) ? (newTemplate.headerMediaUrl.trim() || undefined) : undefined,
        bodyText: newTemplate.bodyText.trim(),
        footerText: newTemplate.footerText.trim() || undefined,
        buttons: newTemplate.buttons.length > 0 ? newTemplate.buttons : undefined,
      });
      setShowCreateTemplate(false);
      setNewTemplate({ name: '', language: 'en_US', category: 'UTILITY', headerType: 'NONE', headerText: '', headerMediaUrl: '', bodyText: '', footerText: '', buttons: [] });
      await fetchMetaTemplates();
    } catch (err: any) {
      setTemplateError(err.response?.data?.message || 'Failed to create template. Check WABA ID is configured in integration settings.');
    } finally {
      setIsCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateName: string) => {
    try {
      await api.delete(`/integrations/whatsapp/templates/${encodeURIComponent(templateName)}`);
      setMetaTemplates(prev => prev.filter(t => t.name !== templateName));
    } catch { /* silent */ }
  };

  const markAsRead = (waId: string) => {
    const timestamps = JSON.parse(localStorage.getItem('wa_read_timestamps') || '{}');
    timestamps[waId] = new Date().toISOString();
    localStorage.setItem('wa_read_timestamps', JSON.stringify(timestamps));
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
    setMobilePanel('chat');
    setReplyingTo(null);
    stopDictation();
    discardVoiceDraft();
    markAsRead(conv.waId);
    conv.unreadCount = 0;
    setConversations(prev => prev.map(c => c.waId === conv.waId ? { ...c, unreadCount: 0 } : c));
    if (conv.contactId) {
      fetchContactDetail(conv.contactId);
    } else {
      setContactDetail(null);
    }
  };

  const pushDemoMessage = (conversationWaId: string, message: WhatsAppActivity) => {
    setConversations((prev) => {
      const updated = prev.map((conversation) => {
        if (conversation.waId !== conversationWaId) return conversation;
        const nextMessages = [...conversation.messages, message];
        return {
          ...conversation,
          messages: nextMessages,
          messageCount: nextMessages.length,
          lastMessage: message.description || conversation.lastMessage,
          lastMessageTime: message.occurredAt,
        };
      });
      const sorted = sortConversationsByPinAndTime(updated);
      setSelectedConv(sorted.find((conversation) => conversation.waId === conversationWaId) || null);
      return sorted;
    });
  };

  const handleDeleteConversation = async (waId: string) => {
    if (!window.confirm('Delete this conversation? All messages will be removed from the inbox.')) return;
    setDeletingConvId(waId);
    try {
      // Remove from local state immediately (optimistic)
      setConversations(prev => prev.filter(c => c.waId !== waId));
      if (selectedConv?.waId === waId) {
        setSelectedConv(null);
        setMobilePanel('list');
      }
      if (demoMode) return;
      // Delete activities for this waId on the server
      await api.delete(`/integrations/whatsapp/conversation/${waId}`);
    } catch {
      // If server fails, refresh to restore
      await fetchInbox();
    } finally {
      setDeletingConvId(null);
    }
  };

  const handleTogglePin = async (waId: string, pinned: boolean) => {
    const nextPinned = !pinned;
    setConversations((prev) => {
      const updated = prev.map((conversation) => (
        conversation.waId === waId
          ? { ...conversation, pinned: nextPinned }
          : conversation
      ));
      const sorted = sortConversationsByPinAndTime(updated);
      const map = sorted.reduce<Record<string, boolean>>((acc, item) => {
        if (item.pinned) acc[item.waId] = true;
        return acc;
      }, {});
      localStorage.setItem('wa_web_pinned_map', JSON.stringify(map));
      return sorted;
    });
    if (selectedConv?.waId === waId) {
      setSelectedConv((prev) => (prev ? { ...prev, pinned: nextPinned } : prev));
    }
    if (demoMode) return;
    try {
      await api.post(`/integrations/whatsapp/conversations/${waId}/pin`, { pinned: nextPinned });
    } catch {
      await fetchInbox();
    }
  };

  const handleToggleMute = async (waId: string, mutedUntil: string | null | undefined) => {
    const currentlyMuted = !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();
    const nextMutedUntil = currentlyMuted ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    setConversations((prev) => {
      const updated = prev.map((conversation) => (
        conversation.waId === waId
          ? { ...conversation, mutedUntil: nextMutedUntil }
          : conversation
      ));
      const map = updated.reduce<Record<string, string>>((acc, item) => {
        if (item.mutedUntil) acc[item.waId] = item.mutedUntil;
        return acc;
      }, {});
      localStorage.setItem('wa_web_muted_map', JSON.stringify(map));
      return updated;
    });
    if (selectedConv?.waId === waId) {
      setSelectedConv((prev) => (prev ? { ...prev, mutedUntil: nextMutedUntil } : prev));
    }
    if (demoMode) return;
    try {
      await api.post(`/integrations/whatsapp/conversations/${waId}/mute`, { mutedUntil: nextMutedUntil });
    } catch {
      await fetchInbox();
    }
  };

  const handleToggleArchive = async (waId: string, archived: boolean) => {
    const nextArchived = !archived;
    setConversations((prev) => {
      const updated = prev.map((conversation) => (
        conversation.waId === waId
          ? { ...conversation, archived: nextArchived }
          : conversation
      ));
      const map = updated.reduce<Record<string, boolean>>((acc, item) => {
        if (item.archived) acc[item.waId] = true;
        return acc;
      }, {});
      localStorage.setItem('wa_web_archived_map', JSON.stringify(map));
      return updated;
    });
    if (selectedConv?.waId === waId) {
      setSelectedConv((prev) => (prev ? { ...prev, archived: nextArchived } : prev));
    }
    if (demoMode) return;
    try {
      await api.post(`/integrations/whatsapp/conversations/${waId}/archive`, { archived: nextArchived });
    } catch {
      await fetchInbox();
    }
  };

  const handleSend = async () => {
    if (!replyText.trim() || !selectedConv) return;
    if (!demoMode && senderAccounts.length > 0 && !selectedSenderId) {
      setSendError('Selecteaza numarul WhatsApp din care vrei sa trimiti.');
      return;
    }
    stopDictation();
    setIsSending(true);
    setSendError('');
    const trimmedMessage = replyText.trim();
    if (demoMode) {
      const nowIso = new Date().toISOString();
      const messageId = `demo_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const [firstName = selectedConv.contactName, ...rest] = selectedConv.contactName.split(' ');
      const senderPhoneDisplay = selectedSender?.phoneDisplay || selectedSender?.phoneNumberId || selectedSender?.name || selectedConv.senderPhoneDisplay || undefined;
      const localMessage: WhatsAppActivity = {
        id: messageId,
        title: `WhatsApp to ${selectedConv.contactName}`,
        description: trimmedMessage,
        direction: 'outbound',
        occurredAt: nowIso,
        metadata: {
          waId: selectedConv.waId,
          messageType: 'text',
          messageStatus: 'sent',
          whatsappMessageId: messageId,
          senderIntegrationId: selectedSenderId || undefined,
          senderPhoneDisplay,
          replyToMessageId: replyingTo?.messageId,
          replyPreviewText: replyingTo?.previewText,
        },
        contact: selectedConv.contactId
          ? {
              id: selectedConv.contactId,
              firstName,
              lastName: rest.join(' '),
              phone: selectedConv.phone,
              status: 'lead',
              source: selectedConv.contactSource || 'manual',
            }
          : null,
      };
      pushDemoMessage(selectedConv.waId, localMessage);
      setReplyText('');
      setReplyingTo(null);
      setIsSending(false);
      return;
    }
    try {
      await api.post('/integrations/whatsapp/send', withSelectedSender({
        to: selectedConv.waId,
        message: trimmedMessage,
        ...(replyingTo?.messageId ? { replyToMessageId: replyingTo.messageId } : {}),
        ...(replyingTo?.previewText ? { replyPreviewText: replyingTo.previewText } : {}),
      }));
      setReplyText('');
      setReplyingTo(null);
      await fetchInbox();
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendTemplate = async (to: string, template: WhatsAppTemplate, params: string[]) => {
    if (!demoMode && senderAccounts.length > 0 && !selectedSenderId) {
      setSendError('Selecteaza numarul WhatsApp din care vrei sa trimiti.');
      return;
    }
    const normalizedHeaderMediaId = templateHeaderMediaId.trim();
    const normalizedHeaderMediaUrl = templateHeaderMediaUrl.trim();
    // No early block when media is missing: the backend reuses the cached media_id/URL
    // from the DB for media templates, and surfaces an error only if none exists.

    setIsSending(true);
    setSendError('');
    try {
      await api.post('/integrations/whatsapp/send/template', withSelectedSender({
        to,
        templateName: template.name,
        language: template.language,
        parameters: params.length > 0 ? params.map(p => ({ type: 'text', text: p })) : [],
        headerMediaType: template.headerMediaType || undefined,
        headerMediaId: normalizedHeaderMediaId || undefined,
        headerMediaUrl: normalizedHeaderMediaUrl || undefined,
      }));
      if (template.headerMediaType && (normalizedHeaderMediaId || normalizedHeaderMediaUrl)) {
        persistTemplateHeaderMediaCache(template, normalizedHeaderMediaId, normalizedHeaderMediaUrl);
      }
      setShowTemplatePanel(false);
      setSelectedTemplate(null);
      setTemplateParams([]);
      setTemplateHeaderMediaId('');
      setTemplateHeaderMediaUrl('');
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

  const handleUploadTemplateHeader = async (file: File) => {
    setIsUploadingTemplateHeader(true);
    setSendError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/integrations/whatsapp/media/upload', formData, {
        params: selectedSenderId ? { integrationId: selectedSenderId } : undefined,
      });
      const uploadedMediaId = String(res.data.id || '').trim();
      const uploadedMediaUrl = String(res.data.url || '').trim();
      setTemplateHeaderMediaId(uploadedMediaId);
      if (uploadedMediaUrl) setTemplateHeaderMediaUrl(uploadedMediaUrl);
      const activeTemplate = selectedTemplate || newConvTemplate;
      if (activeTemplate && uploadedMediaId) {
        persistTemplateHeaderMediaCache(activeTemplate, uploadedMediaId, uploadedMediaUrl || templateHeaderMediaUrl.trim());
      }
    } catch (err: any) {
      setSendError(`Upload failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsUploadingTemplateHeader(false);
    }
  };

  const resetAttachmentState = () => {
    setShowAttachmentModal(false);
    setAttachmentUrl('');
    setAttachmentMediaId('');
    setAttachmentFileName('');
    setAttachmentCaption('');
    setIsUploadingAttachment(false);
  };

  const getAttachmentAccept = () => {
    if (attachmentType === 'image') return 'image/*';
    if (attachmentType === 'video') return 'video/*';
    if (attachmentType === 'audio') return 'audio/*';
    return '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
  };

  const handleUploadAttachment = async (file: File) => {
    setIsUploadingAttachment(true);
    setSendError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/integrations/whatsapp/media/upload', formData, {
        params: {
          ...(selectedSenderId ? { integrationId: selectedSenderId } : {}),
          ...(attachmentType === 'audio' ? { voiceNote: '1' } : {}),
        },
      });
      setAttachmentMediaId(res.data.id || '');
      setAttachmentFileName(file.name);
    } catch (err: any) {
      setAttachmentMediaId('');
      setAttachmentFileName('');
      setSendError(`Upload failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleSendAttachment = async () => {
    if ((!attachmentUrl.trim() && !attachmentMediaId) || !selectedConv) return;
    stopDictation();
    setIsSending(true);
    setSendError('');
    if (demoMode) {
      const nowIso = new Date().toISOString();
      const messageId = `demo_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const [firstName = selectedConv.contactName, ...rest] = selectedConv.contactName.split(' ');
      const senderPhoneDisplay = selectedSender?.phoneDisplay || selectedSender?.phoneNumberId || selectedSender?.name || selectedConv.senderPhoneDisplay || undefined;
      const caption = attachmentCaption.trim();
      const description = attachmentType === 'image'
        ? (caption ? `[Image] ${caption}` : '[Image]')
        : attachmentType === 'video'
          ? (caption ? `[Video] ${caption}` : '[Video]')
          : attachmentType === 'audio'
            ? '[Voice message]'
            : `[Document: ${attachmentFileName || 'Document'}]${caption ? ` ${caption}` : ''}`;
      const localMessage: WhatsAppActivity = {
        id: messageId,
        title: `WhatsApp to ${selectedConv.contactName}`,
        description,
        direction: 'outbound',
        occurredAt: nowIso,
        metadata: {
          waId: selectedConv.waId,
          messageType: attachmentType,
          messageStatus: 'sent',
          whatsappMessageId: messageId,
          senderIntegrationId: selectedSenderId || undefined,
          senderPhoneDisplay,
          mediaId: attachmentMediaId || undefined,
          mediaUrl: attachmentUrl.trim() || undefined,
          mediaCaption: caption || undefined,
          fileName: attachmentType === 'document' ? (attachmentFileName || undefined) : undefined,
          replyToMessageId: replyingTo?.messageId,
          replyPreviewText: replyingTo?.previewText,
        },
        contact: selectedConv.contactId
          ? {
              id: selectedConv.contactId,
              firstName,
              lastName: rest.join(' '),
              phone: selectedConv.phone,
              status: 'lead',
              source: selectedConv.contactSource || 'manual',
            }
          : null,
      };
      pushDemoMessage(selectedConv.waId, localMessage);
      resetAttachmentState();
      setReplyingTo(null);
      setIsSending(false);
      return;
    }
    try {
      let endpoint: string;
      let body: any;
      if (attachmentType === 'image') {
        endpoint = '/integrations/whatsapp/send/image';
        body = attachmentMediaId
          ? { to: selectedConv.waId, imageId: attachmentMediaId, caption: attachmentCaption.trim() || undefined }
          : { to: selectedConv.waId, imageUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined };
      } else if (attachmentType === 'video') {
        endpoint = '/integrations/whatsapp/send/video';
        body = attachmentMediaId
          ? { to: selectedConv.waId, videoId: attachmentMediaId, caption: attachmentCaption.trim() || undefined }
          : { to: selectedConv.waId, videoUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined };
      } else if (attachmentType === 'audio') {
        endpoint = '/integrations/whatsapp/send/audio';
        body = attachmentMediaId
          ? { to: selectedConv.waId, audioId: attachmentMediaId, isVoiceMessage: true }
          : { to: selectedConv.waId, audioUrl: attachmentUrl.trim(), isVoiceMessage: true };
      } else {
        endpoint = '/integrations/whatsapp/send/document';
        body = attachmentMediaId
          ? {
              to: selectedConv.waId,
              documentId: attachmentMediaId,
              filename: attachmentFileName || undefined,
              caption: attachmentCaption.trim() || undefined,
            }
          : { to: selectedConv.waId, documentUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined };
      }
      if (replyingTo?.messageId) {
        body.replyToMessageId = replyingTo.messageId;
      }
      if (replyingTo?.previewText) {
        body.replyPreviewText = replyingTo.previewText;
      }
      await api.post(endpoint, withSelectedSender(body));
      resetAttachmentState();
      setReplyingTo(null);
      await fetchInbox();
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to send attachment');
    } finally {
      setIsSending(false);
    }
  };

  const toggleDictation = () => {
    if (isDictating) {
      stopDictation();
      return;
    }
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceInputError('Speech-to-text is not supported in this browser.');
      return;
    }
    setVoiceInputError('');
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0]?.transcript || '';
        }
      }
      const cleanTranscript = transcript.trim();
      if (!cleanTranscript) return;
      setReplyText((prev) => {
        const separator = prev && !prev.endsWith(' ') ? ' ' : '';
        return `${prev}${separator}${cleanTranscript}`;
      });
    };
    recognition.onerror = (event: any) => {
      if (event?.error === 'not-allowed') {
        setVoiceInputError('Microphone permission denied for speech-to-text.');
      } else {
        setVoiceInputError('Speech-to-text failed. Try again.');
      }
      setIsDictating(false);
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setIsDictating(false);
    };
    speechRecognitionRef.current = recognition;
    recognition.start();
    setIsDictating(true);
  };

  const startVoiceRecording = async () => {
    if (!voiceRecordingSupported) {
      setVoiceInputError('Voice recording is not supported in this browser.');
      return;
    }
    if (!window.isSecureContext) {
      setVoiceInputError('Voice recording needs a secure context (HTTPS or localhost).');
      return;
    }
    if (isVoiceRecording) return;
    setVoiceInputError('');
    stopDictation();
    discardVoiceOnStopRef.current = false;
    clearVoiceDraft();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      startWaveformAnimation(stream);
      const mimeTypeCandidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
      const mimeType = mimeTypeCandidates.find((candidate) => (
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)
      ));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      voiceMediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data?.size) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stopVoiceTimer();
        stopVoiceStream();
        stopWaveformAnimation();
        const shouldDiscard = discardVoiceOnStopRef.current;
        const shouldAutoSend = autoSendOnStopRef.current;
        discardVoiceOnStopRef.current = false;
        autoSendOnStopRef.current = false;
        holdLockedRef.current = false;
        setIsVoiceRecording(false);
        setIsHoldMode(false);
        setIsHoldLocked(false);
        setHoldSlideHint('none');
        holdStartPosRef.current = null;
        if (shouldDiscard) {
          return;
        }
        const voiceBlob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        voiceChunksRef.current = [];
        if (!voiceBlob.size) {
          setVoiceInputError('Recorded audio is empty. Try again.');
          return;
        }
        const previewUrl = URL.createObjectURL(voiceBlob);
        setVoiceAudioBlob(voiceBlob);
        setVoiceAudioPreviewUrl(previewUrl);
        if (shouldAutoSend) {
          autoSendTriggerRef.current = true;
        }
      };
      recorder.onerror = (event: any) => {
        const mediaErrorName = String(event?.error?.name || '').trim();
        if (mediaErrorName === 'NotReadableError') {
          setVoiceInputError('Microphone is currently busy. Close other apps using it and retry.');
          return;
        }
        setVoiceInputError(mediaErrorName ? `Recording failed (${mediaErrorName}).` : 'Recording failed. Please retry.');
      };
      recorder.start(250);
      setVoiceRecordingSeconds(0);
      setIsVoiceRecording(true);
      voiceTimerRef.current = setInterval(() => {
        setVoiceRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error: any) {
      stopVoiceStream();
      setIsVoiceRecording(false);
      const errorName = String(error?.name || '').trim();
      const message = String(error?.message || '').toLowerCase();
      if (errorName === 'NotAllowedError' || errorName === 'SecurityError' || message.includes('denied') || message.includes('permission')) {
        setVoiceInputError('Microphone permission denied for voice recording. Allow mic access in browser site settings.');
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError' || message.includes('not found')) {
        setVoiceInputError('No microphone detected. Connect a microphone and retry.');
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError' || message.includes('could not start') || message.includes('busy')) {
        setVoiceInputError('Microphone is busy/unavailable. Close other recording apps and retry.');
      } else if (errorName === 'NotSupportedError') {
        setVoiceInputError('This browser cannot record audio with current settings.');
      } else {
        setVoiceInputError(errorName ? `Could not start voice recording (${errorName}).` : 'Could not start voice recording.');
      }
      console.error('Voice recording start failed:', error);
    }
  };

  const stopVoiceRecording = () => {
    if (!voiceMediaRecorderRef.current) return;
    if (voiceMediaRecorderRef.current.state !== 'inactive') {
      voiceMediaRecorderRef.current.stop();
    }
  };

  const discardVoiceDraft = () => {
    setVoiceInputError('');
    discardVoiceOnStopRef.current = true;
    autoSendOnStopRef.current = false;
    autoSendTriggerRef.current = false;
    if (voiceMediaRecorderRef.current && voiceMediaRecorderRef.current.state !== 'inactive') {
      voiceMediaRecorderRef.current.stop();
    }
    setIsVoiceRecording(false);
    stopVoiceTimer();
    stopVoiceStream();
    stopWaveformAnimation();
    if (selectedConv?.waId) {
      try { localStorage.removeItem(`wa_voice_mediaId_${selectedConv.waId}`); } catch { /* ignore */ }
    }
    clearVoiceDraft();
  };

  // Hold-to-record pointer handlers (WhatsApp style)
  const handleVoicePointerDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isVoiceRecording || voiceAudioBlob || isSending) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    holdStartPosRef.current = { x: e.clientX, y: e.clientY };
    holdLockedRef.current = false;
    setIsHoldMode(true);
    setHoldSlideHint('none');
    await startVoiceRecording();
  };

  const handleVoicePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!holdStartPosRef.current || holdLockedRef.current) return;
    const dx = e.clientX - holdStartPosRef.current.x;
    const dy = e.clientY - holdStartPosRef.current.y;
    if (dx < -50) setHoldSlideHint('cancel');
    else if (dy < -60) setHoldSlideHint('lock');
    else setHoldSlideHint('none');
  };

  const handleVoicePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!holdStartPosRef.current) return;
    const hint = holdSlideHint;
    holdStartPosRef.current = null;
    if (holdLockedRef.current) return; // locked: user uses Stop/Send/Discard buttons
    if (hint === 'cancel') {
      discardVoiceDraft();
    } else if (hint === 'lock') {
      holdLockedRef.current = true;
      setIsHoldLocked(true);
      setIsHoldMode(false);
      setHoldSlideHint('none');
      // recording continues, user must press Stop/Send
    } else {
      // Normal release: send immediately if ≥ 1 second, else discard
      if (voiceRecordingSeconds < 1) {
        discardVoiceDraft();
      } else {
        autoSendOnStopRef.current = true;
        stopVoiceRecording();
      }
    }
  };

  const handleVoicePointerCancel = () => {
    holdStartPosRef.current = null;
    if (!holdLockedRef.current) discardVoiceDraft();
  };

  const handleSendVoiceRecording = async () => {
    if (!voiceAudioBlob || !selectedConv) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setVoiceInputError('No internet connection. Check your connection and try again.');
      return;
    }
    if (!demoMode && senderAccounts.length > 0 && !selectedSenderId) {
      setVoiceInputError('Selecteaza numarul WhatsApp din care vrei sa trimiti.');
      return;
    }
    setIsSending(true);
    setSendError('');
    setVoiceInputError('');
    stopDictation();
    let voicePreviewForMessage = voiceAudioPreviewUrl;
    if (demoMode && !voicePreviewForMessage) {
      voicePreviewForMessage = URL.createObjectURL(voiceAudioBlob);
    }
    try {
      if (demoMode) {
        const nowIso = new Date().toISOString();
        const messageId = `demo_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const [firstName = selectedConv.contactName, ...rest] = selectedConv.contactName.split(' ');
        const senderPhoneDisplay = selectedSender?.phoneDisplay || selectedSender?.phoneNumberId || selectedSender?.name || selectedConv.senderPhoneDisplay || undefined;
        const localMessage: WhatsAppActivity = {
          id: messageId,
          title: `WhatsApp to ${selectedConv.contactName}`,
          description: '[Voice message]',
          direction: 'outbound',
          occurredAt: nowIso,
          metadata: {
            waId: selectedConv.waId,
            messageType: 'audio',
            messageStatus: 'sent',
            whatsappMessageId: messageId,
            senderIntegrationId: selectedSenderId || undefined,
            senderPhoneDisplay,
            mediaUrl: voicePreviewForMessage,
            replyToMessageId: replyingTo?.messageId,
            replyPreviewText: replyingTo?.previewText,
          },
          contact: selectedConv.contactId
            ? {
                id: selectedConv.contactId,
                firstName,
                lastName: rest.join(' '),
                phone: selectedConv.phone,
                status: 'lead',
                source: selectedConv.contactSource || 'manual',
              }
            : null,
        };
        pushDemoMessage(selectedConv.waId, localMessage);
        clearVoiceDraft(true);
        setReplyingTo(null);
        return;
      }

      const lsKey = `wa_voice_mediaId_${selectedConv.waId}`;
      // Prefer in-memory cache, fall back to localStorage (same tab, conversation switch)
      let uploadedMediaId = voicePendingMediaId || '';
      if (!uploadedMediaId && typeof window !== 'undefined') {
        try {
          const stored = JSON.parse(localStorage.getItem(lsKey) || 'null');
          // Meta media IDs are valid for 30 days; we use 25 for safety
          if (stored?.mediaId && Date.now() - stored.ts < 25 * 24 * 60 * 60 * 1000) {
            uploadedMediaId = stored.mediaId;
            setVoicePendingMediaId(uploadedMediaId);
          }
        } catch { /* ignore */ }
      }
      if (!uploadedMediaId) {
        const extension = voiceAudioBlob.type.includes('ogg') ? 'ogg' : voiceAudioBlob.type.includes('mp4') ? 'm4a' : 'webm';
        const formData = new FormData();
        formData.append('file', new File([voiceAudioBlob], `voice-note-${Date.now()}.${extension}`, { type: voiceAudioBlob.type || 'audio/webm' }));
        const uploadRes = await api.post('/integrations/whatsapp/media/upload', formData, {
          params: {
            ...(selectedSenderId ? { integrationId: selectedSenderId } : {}),
            voiceNote: '1',
          },
        });
        uploadedMediaId = String(uploadRes.data?.id || '').trim();
        if (!uploadedMediaId) {
          throw new Error('Voice upload did not return media id');
        }
        setVoicePendingMediaId(uploadedMediaId);
        // Persist so it survives a conversation switch within the same tab
        try { localStorage.setItem(lsKey, JSON.stringify({ mediaId: uploadedMediaId, ts: Date.now() })); } catch { /* ignore */ }
      }
      const body: Record<string, any> = { to: selectedConv.waId, audioId: uploadedMediaId, isVoiceMessage: true };
      if (replyingTo?.messageId) {
        body.replyToMessageId = replyingTo.messageId;
      }
      if (replyingTo?.previewText) {
        body.replyPreviewText = replyingTo.previewText;
      }
      await api.post('/integrations/whatsapp/send/audio', withSelectedSender(body));
      try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
      clearVoiceDraft();
      setReplyingTo(null);
      await fetchInbox();
    } catch (err: any) {
      const raw = String(err?.response?.data?.message || err?.message || '');
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const looksLikeNetwork =
        isOffline ||
        raw.toLowerCase().includes('no connection') ||
        raw.toLowerCase().includes('network') ||
        raw.toLowerCase().includes('media query') ||
        raw.toLowerCase().includes('will retry') ||
        raw === 'Network Error';
      setVoiceInputError(
        looksLikeNetwork
          ? 'No internet connection. Check your connection and try again.'
          : raw || 'Failed to send voice message.',
      );
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

  const availableCampaignNames = useMemo(() => {
    const names = new Set<string>();
    for (const conv of conversations) {
      for (const campaignName of conv.campaignNames || []) {
        if (campaignName) names.add(campaignName);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  useEffect(() => {
    if (campaignConversationFilter === 'all') return;
    if (availableCampaignNames.includes(campaignConversationFilter)) return;
    setCampaignConversationFilter('all');
  }, [availableCampaignNames, campaignConversationFilter]);

  const filteredConversations = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();
    return conversations.filter(c => {
      const matchesSearch = !normalizedSearch
        || c.contactName.toLowerCase().includes(normalizedSearch)
        || c.phone.includes(search)
        || c.campaignNames.some((campaignName) => campaignName.toLowerCase().includes(normalizedSearch));
      if (!matchesSearch) return false;
      if (convFilter !== 'archived' && c.archived) return false;
      if (convFilter === 'archived') return !!c.archived;
      if (convNumberFilter !== 'all' && c.senderIntegrationId !== convNumberFilter) return false;
      if (convFilter === 'pinned') return !!c.pinned;
      if (convFilter === 'unread') return c.unreadCount > 0;
      if (convFilter === 'assigned') return !!assignments[c.waId];
      if (convFilter === 'manychat') return c.contactSource === 'manychat';
      if (convFilter === 'typeform') return c.contactSource === 'typeform';
      if (convFilter === 'no_reply') return !c.lastInboundTime && c.messageCount > 0;
      if (convFilter === 'campaign') {
        if (!c.hasCampaignMessages) return false;
        if (campaignConversationFilter !== 'all') {
          return c.campaignNames.includes(campaignConversationFilter);
        }
      }
      return true;
    });
  }, [assignments, campaignConversationFilter, conversations, convFilter, convNumberFilter, search]);
  const archivedConversationCount = useMemo(
    () => conversations.filter(c => !!c.archived).length,
    [conversations],
  );

  // Group conversations by date for Brevo-style display
  const groupedConversations = useMemo(() => {
    const groups: { label: string; convs: typeof filteredConversations }[] = [];
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const todayConvs: typeof filteredConversations = [];
    const yesterdayConvs: typeof filteredConversations = [];
    const weekConvs: typeof filteredConversations = [];
    const olderConvs: typeof filteredConversations = [];
    for (const c of filteredConversations) {
      const d = new Date(c.lastMessageTime); d.setHours(0,0,0,0);
      if (d.getTime() >= today.getTime()) todayConvs.push(c);
      else if (d.getTime() >= yesterday.getTime()) yesterdayConvs.push(c);
      else if (d.getTime() >= weekAgo.getTime()) weekConvs.push(c);
      else olderConvs.push(c);
    }
    if (todayConvs.length) groups.push({ label: 'Today', convs: todayConvs });
    if (yesterdayConvs.length) groups.push({ label: 'Yesterday', convs: yesterdayConvs });
    if (weekConvs.length) groups.push({ label: 'This Week', convs: weekConvs });
    if (olderConvs.length) groups.push({ label: 'Older', convs: olderConvs });
    return groups;
  }, [filteredConversations]);

  const sessionStatus = selectedConv ? getSessionStatus(selectedConv) : 'closed';
  const sessionOpen = sessionStatus === 'open' || sessionStatus === 'closing';
  const selectedConversationMuted = selectedConv ? isConversationMuted(selectedConv) : false;
  const selectedSourceLabel = selectedConv ? formatSourceLabel(selectedConv.contactSource || contactDetail?.source || null) : '';

  // True if this conversation has NEVER received an inbound message
  const hasEverReceivedInbound = selectedConv?.messages.some(m => m.direction === 'inbound') ?? false;
  // True if webhooks may not be configured (no inbound messages across all conversations)
  const noInboundEver = conversations.length > 0 && conversations.every(c => !c.lastInboundTime);

  const filteredMessages = useMemo(() => (
    selectedConv?.messages.filter(m =>
      !messageSearch || m.description?.toLowerCase().includes(messageSearch.toLowerCase())
    ) || []
  ), [messageSearch, selectedConv?.messages]);

  // Build date-grouped messages
  const messagesWithDates = useMemo(() => {
    const grouped: Array<{ type: 'date'; label: string } | { type: 'message'; msg: WhatsAppActivity }> = [];
    let lastDateLabel = '';
    for (const msg of filteredMessages) {
      const label = getDateLabel(msg.occurredAt);
      if (label !== lastDateLabel) {
        grouped.push({ type: 'date', label });
        lastDateLabel = label;
      }
      grouped.push({ type: 'message', msg });
    }
    return grouped;
  }, [filteredMessages]);

  // ─── CSV parsing ─────────────────────────────────────────

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { setCsvParseError('File is empty'); return; }
    const headers = lines[0].split(',').map(h => h.trim().replace(/["']/g, '').toLowerCase());
    const phoneIdx = headers.findIndex(h => ['phone', 'telefon', 'number', 'phone_number', 'mobile'].includes(h));
    const firstIdx = headers.findIndex(h => ['first_name', 'firstname', 'first', 'name', 'prenume'].includes(h));
    const lastIdx = headers.findIndex(h => ['last_name', 'lastname', 'last', 'surname', 'nume'].includes(h));
    if (phoneIdx === -1) { setCsvParseError('Could not find a "phone" column. Expected: phone, telefon, number, mobile'); return; }
    const rows: Array<{ phone: string; firstName?: string; lastName?: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      const phone = cols[phoneIdx]?.trim();
      if (!phone) continue;
      rows.push({
        phone,
        firstName: firstIdx >= 0 ? cols[firstIdx]?.trim() || undefined : undefined,
        lastName: lastIdx >= 0 ? cols[lastIdx]?.trim() || undefined : undefined,
      });
    }
    if (!rows.length) { setCsvParseError('No valid rows found'); return; }
    setCsvParseError('');
    setCsvRows(rows);
  };

  const handleCsvFile = (file: File) => {
    setCsvFile(file);
    setCsvRows([]);
    setCsvParseError('');
    setCsvImportResults(null);
    const reader = new FileReader();
    reader.onload = e => parseCsv((e.target?.result as string) || '');
    reader.readAsText(file);
  };

  const handleBroadcast = async () => {
    if (!broadcastTemplateName.trim()) { setBroadcastError('Template name is required'); return; }
    setIsBroadcasting(true);
    setBroadcastError('');
    setBroadcastResults(null);
    try {
      const res = await api.post('/integrations/whatsapp/broadcast', {
        filter: {
          tags: broadcastFilterTags.length > 0 ? broadcastFilterTags : undefined,
          status: broadcastFilterStatus.length > 0 ? broadcastFilterStatus : undefined,
        },
        template: { name: broadcastTemplateName.trim(), language: broadcastTemplateLanguage.trim() || 'en' },
      });
      setBroadcastResults(res.data);
    } catch (err: any) {
      setBroadcastError(err?.response?.data?.message || 'Broadcast failed');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleCsvImport = async () => {
    if (!csvRows.length) { setCsvImportError('No rows to import'); return; }
    setIsImporting(true);
    setCsvImportError('');
    setCsvImportResults(null);
    try {
      const addTags = csvAddTags.trim() ? csvAddTags.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      const res = await api.post('/integrations/whatsapp/bulk/csv-import', {
        rows: csvRows,
        addTags,
        sendTemplate: csvSendTemplate ? { name: csvTemplateName.trim(), language: csvTemplateLanguage.trim() || 'en' } : undefined,
      });
      setCsvImportResults(res.data);
    } catch (err: any) {
      setCsvImportError(err?.response?.data?.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  // ─── Campaign functions ──────────────────────────────────

  const fetchCampaigns = async () => {
    setIsLoadingCampaigns(true);
    try {
      const [legacyRes, bulkRes] = await Promise.allSettled([
        api.get('/integrations/whatsapp/campaigns'),
        api.get('/integrations/whatsapp/bulk-campaigns'),
      ]);
      const legacy = legacyRes.status === 'fulfilled' && Array.isArray(legacyRes.value.data) ? legacyRes.value.data : [];
      const bulk = bulkRes.status === 'fulfilled' && Array.isArray(bulkRes.value.data)
        ? bulkRes.value.data.map((c: any) => ({ ...c, results: c.stats, _isBulk: true }))
        : [];
      const all = [...bulk, ...legacy].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCampaigns(all);
    } catch { /* silent */ }
    finally { setIsLoadingCampaigns(false); }
  };

  const previewAudience = async () => {
    setIsPreviewingAudience(true);
    try {
      const res = await api.post('/integrations/whatsapp/campaigns/preview-audience', {
        tags: campFilterTags.length > 0 ? campFilterTags : undefined,
        status: campFilterStatus.length > 0 ? campFilterStatus : undefined,
        selectedContactIds: campSelectedContacts.length > 0 ? campSelectedContacts.map(c => c.id) : undefined,
      });
      setAudiencePreview(res.data);
    } catch { /* silent */ }
    finally { setIsPreviewingAudience(false); }
  };

  const createAndSendCampaign = async (sendNow: boolean) => {
    if (!campName.trim() || !campTemplate.trim()) return;
    setIsCreatingCampaign(true);
    setCampaignError('');
    try {
      const res = await api.post('/integrations/whatsapp/campaigns', {
        name: campName.trim(),
        templateName: campTemplate.trim(),
        language: campLanguage.trim() || 'en_US',
        filter: {
          tags: campFilterTags.length > 0 ? campFilterTags : undefined,
          status: campFilterStatus.length > 0 ? campFilterStatus : undefined,
          selectedContactIds: campSelectedContacts.length > 0 ? campSelectedContacts.map(c => c.id) : undefined,
        },
      });
      const campaign = res.data;
      if (sendNow) {
        setIsSendingCampaign(campaign.id);
        await api.post(`/integrations/whatsapp/campaigns/${campaign.id}/send`);
      }
      setShowCreateCampaign(false);
      setCampName(''); setCampTemplate(''); setCampLanguage('en_US');
      setCampFilterTags([]); setCampFilterStatus([]);
      setCampSelectedContacts([]);
      setCampContactSearch('');
      setCampContactResults([]);
      setAudiencePreview(null);
      fetchCampaigns();
    } catch (err: any) {
      setCampaignError(err?.response?.data?.message || 'Failed');
    } finally {
      setIsCreatingCampaign(false);
      setIsSendingCampaign(null);
    }
  };

  const sendExistingCampaign = async (campaignId: string) => {
    setIsSendingCampaign(campaignId);
    try {
      await api.post(`/integrations/whatsapp/campaigns/${campaignId}/send`);
      fetchCampaigns();
    } catch { /* silent */ }
    finally { setIsSendingCampaign(null); }
  };

  const deleteCampaign = async (campaignId: string) => {
    try {
      await api.delete(`/integrations/whatsapp/campaigns/${campaignId}`);
      setCampaigns(prev => prev.filter(c => c.id !== campaignId));
    } catch { /* silent */ }
  };

  // ─── Conversation Flows ────────────────────────────────────

  const fetchFlows = async () => {
    setIsLoadingFlows(true);
    try {
      const res = await api.get('/integrations/whatsapp/flows');
      setFlows(res.data || []);
    } catch { /* silent */ }
    finally { setIsLoadingFlows(false); }
  };

  const saveFlows = async (updatedFlows: any[]) => {
    setIsSavingFlows(true);
    try {
      await api.post('/integrations/whatsapp/flows', { flows: updatedFlows });
      setFlows(updatedFlows);
    } catch { /* silent */ }
    finally { setIsSavingFlows(false); }
  };

  const createNewFlow = () => {
    const newFlow = {
      id: `flow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'New Flow',
      enabled: true,
      trigger: 'first_message' as const,
      triggerKeyword: '',
      steps: [
        {
          id: 'step_0',
          type: 'template' as const,
          templateName: '',
          templateLanguage: 'en_US',
          delayMs: 0,
          fallbackOnTextReply: true,
          message: '',
          buttons: [
            { id: `btn_${Date.now()}_a`, title: 'Option 1', nextStepId: 'step_1' },
            { id: `btn_${Date.now()}_b`, title: 'Option 2', nextStepId: 'step_2' },
          ],
        },
        { id: 'step_1', message: 'You selected Option 1. Here is more info...', delayMs: 0, fallbackOnTextReply: false, buttons: [] },
        { id: 'step_2', message: 'You selected Option 2. Here is more info...', delayMs: 0, fallbackOnTextReply: false, buttons: [] },
      ],
    };
    setEditingFlow(newFlow);
  };

  const handleSaveFlow = async () => {
    if (!editingFlow) return;

    // Basic validation: template selected for step 0 and all buttons mapped
    const stepIds = new Set(editingFlow.steps.map((s: any) => s.id));
    if (editingFlow.trigger === 'keyword' && !editingFlow.triggerKeyword?.trim()) {
      alert('Keyword trigger requires at least one keyword.');
      return;
    }
    if (editingFlow.trigger === 'after_auto_send') {
      if (!editingFlow.steps[0]?.timeoutBranch?.nextStepId) {
        alert('Step 1 needs "No-reply follow-up" configured — otherwise this flow never does anything after arming.');
        return;
      }
    } else if (!editingFlow.steps[0]?.templateName) {
      alert('Step 1 must have an approved template selected.');
      return;
    }
    for (const step of editingFlow.steps) {
      if (step.buttons?.length) {
        for (const btn of step.buttons) {
          if (!btn.nextStepId) {
            alert('All buttons must point to a next step.');
            return;
          }
          if (!stepIds.has(btn.nextStepId)) {
            alert(`Button "${btn.title || btn.id}" points to missing step "${btn.nextStepId}".`);
            return;
          }
        }
      }
      if (step.timeoutBranch) {
        const tb = step.timeoutBranch;
        if (!['minutes', 'hours', 'days'].includes(tb.delayUnit)) {
          alert(`Step "${step.id}": pick a valid follow-up time unit.`);
          return;
        }
        if (!Number.isFinite(Number(tb.delayValue)) || Number(tb.delayValue) <= 0) {
          alert(`Step "${step.id}": follow-up delay must be a positive number.`);
          return;
        }
        const unitMs = tb.delayUnit === 'days' ? 86400000 : tb.delayUnit === 'hours' ? 3600000 : 60000;
        if (Number(tb.delayValue) * unitMs > 7 * 24 * 60 * 60 * 1000) {
          alert(`Step "${step.id}": follow-up delay cannot exceed 7 days.`);
          return;
        }
        if (!tb.nextStepId || !stepIds.has(tb.nextStepId)) {
          alert(`Step "${step.id}": follow-up "send step" must point to an existing step.`);
          return;
        }
      }
    }

    const existing = flows.findIndex(f => f.id === editingFlow.id);
    let updated: any[];
    if (existing >= 0) {
      updated = flows.map(f => f.id === editingFlow.id ? editingFlow : f);
    } else {
      updated = [...flows, editingFlow];
    }
    await saveFlows(updated);
    setEditingFlow(null);
  };

  const handleDeleteFlow = async (flowId: string) => {
    const updated = flows.filter(f => f.id !== flowId);
    await saveFlows(updated);
    if (editingFlow?.id === flowId) setEditingFlow(null);
  };

  const handleToggleFlow = async (flowId: string) => {
    const updated = flows.map(f => f.id === flowId ? { ...f, enabled: !f.enabled } : f);
    await saveFlows(updated);
  };

  const handleTestFlow = async (flowId: string) => {
    if (!flowTestPhone.trim()) { setFlowTestResult('Enter a phone number'); return; }
    setFlowTestResult('Sending...');
    try {
      const res = await api.post(`/integrations/whatsapp/flows/${flowId}/test`, { phone: flowTestPhone });
      setFlowTestResult(res.data?.message || 'Sent!');
    } catch (err: any) {
      setFlowTestResult(err.response?.data?.message || 'Failed to send');
    }
  };

  // Flow step editing helpers
  const updateFlowStep = (stepIndex: number, field: string, value: any) => {
    setEditingFlow((prev: any) => {
      if (!prev) return prev;
      const steps = [...prev.steps];
      if (!steps[stepIndex]) return prev;
      steps[stepIndex] = { ...steps[stepIndex], [field]: value };
      return { ...prev, steps };
    });
  };

  // Shared by Step 1's (always-template) picker and the Template toggle on
  // later steps — loads the approved template's body + Quick Reply buttons
  // onto the given step.
  const applyTemplateToStep = (stepIndex: number, templateName: string) => {
    setEditingFlow((prev: any) => {
      if (!prev) return prev;
      const t = metaTemplates.find((t: any) => t.name === templateName);
      const tplButtons = t?.components?.find((c: any) => c.type === 'BUTTONS')?.buttons || [];
      const quickReplyBtns = tplButtons
        .filter((b: any) => b.type === 'QUICK_REPLY')
        .map((b: any, i: number) => ({
          id: b.payload || b.text || `btn_${Date.now()}_${i}`,
          title: b.text,
          nextStepId: '',
        }));
      const steps = [...prev.steps];
      if (!steps[stepIndex]) return prev;
      steps[stepIndex] = {
        ...steps[stepIndex],
        templateName,
        type: 'template',
        templateLanguage: t?.language || 'en_US',
        message: t?.components?.find((c: any) => c.type === 'BODY')?.text || '',
        buttons: quickReplyBtns,
        fallbackOnTextReply: steps[stepIndex].fallbackOnTextReply ?? true,
      };
      return { ...prev, steps };
    });
  };

  const addFlowStep = () => {
    setEditingFlow((prev: any) => {
      if (!prev) return prev;
      const stepId = `step_${prev.steps.length}`;
      return {
        ...prev,
        steps: [...prev.steps, { id: stepId, message: '', delayMs: 0, fallbackOnTextReply: false, buttons: [] }],
      };
    });
  };

  const removeFlowStep = (stepIndex: number) => {
    setEditingFlow((prev: any) => {
      if (!prev || prev.steps.length <= 1 || !prev.steps[stepIndex]) return prev;
      const removedId = prev.steps[stepIndex].id;
      const steps = prev.steps
        .filter((_: any, i: number) => i !== stepIndex)
        .map((step: any) => ({
          ...step,
          buttons: (step.buttons || []).map((b: any) =>
            b.nextStepId === removedId ? { ...b, nextStepId: '' } : b
          ),
          timeoutBranch: step.timeoutBranch?.nextStepId === removedId ? undefined : step.timeoutBranch,
        }));
      return { ...prev, steps };
    });
  };

  const addStepButton = (stepIndex: number) => {
    setEditingFlow((prev: any) => {
      if (!prev || !prev.steps[stepIndex]) return prev;
      const steps = [...prev.steps];
      const step = steps[stepIndex];
      if ((step.buttons || []).length >= 3) return prev; // Meta limit
      const buttons = [...(step.buttons || []), { id: `btn_${Date.now()}`, title: '', nextStepId: '' }];
      steps[stepIndex] = { ...step, buttons };
      return { ...prev, steps };
    });
  };

  const removeStepButton = (stepIndex: number, btnIndex: number) => {
    setEditingFlow((prev: any) => {
      if (!prev || !prev.steps[stepIndex]) return prev;
      const steps = [...prev.steps];
      const step = steps[stepIndex];
      const buttons = (step.buttons || []).filter((_: any, i: number) => i !== btnIndex);
      steps[stepIndex] = { ...step, buttons };
      return { ...prev, steps };
    });
  };

  const updateStepButton = (stepIndex: number, btnIndex: number, field: string, value: string) => {
    setEditingFlow((prev: any) => {
      if (!prev || !prev.steps[stepIndex]) return prev;
      const steps = [...prev.steps];
      const step = steps[stepIndex];
      const buttons = [...(step.buttons || [])];
      if (!buttons[btnIndex]) return prev;
      buttons[btnIndex] = { ...buttons[btnIndex], [field]: value };
      steps[stepIndex] = { ...step, buttons };
      return { ...prev, steps };
    });
  };

  // ─── Render ───────────────────────────────────────────────

  if (accessResolved && !canAccessWhatsApp) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-gray-500">
          Nu ai acces la canalul `WhatsApp` pe acest user. Un admin poate activa accesul din `Team Members`.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b border-gray-100 bg-white px-4 py-0 flex-shrink-0">
        <div className="flex items-center gap-2 mr-4">
          <MessageCircle className="h-5 w-5 text-green-600" />
          <span className="text-base font-bold text-gray-900">WhatsApp</span>
        </div>
        <nav className="flex gap-1">
          <button onClick={() => setPageTab('inbox')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${pageTab === 'inbox' ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Inbox
          </button>
          <button onClick={() => { setPageTab('broadcasts'); fetchCampaigns(); fetchMetaTemplates(); }}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${pageTab === 'broadcasts' ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Broadcasts
          </button>
        </nav>
      </div>

      {pageTab === 'broadcasts' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 space-y-6">

          {/* ── Section A: Campaigns ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Send className="h-4 w-4 text-green-600" /> Broadcast Campaigns
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">Create campaigns to send approved templates to filtered contact segments</p>
              </div>
              <button onClick={() => {
                setShowCreateCampaign(!showCreateCampaign);
                setCampaignError('');
                setAudiencePreview(null);
                if (!showCreateCampaign) {
                  setCampContactSearch('');
                  setCampContactResults([]);
                  setCampSelectedContacts([]);
                }
              }}
                className="px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl flex items-center gap-2">
                <Plus className="h-4 w-4" /> New Campaign
              </button>
            </div>

            {/* Create Campaign Form */}
            {showCreateCampaign && (
              <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Create New Campaign</h3>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Campaign Name *</label>
                  <input type="text" placeholder="e.g. February Welcome Campaign" value={campName} onChange={e => setCampName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                </div>

                {/* Template dropdown */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-700">Template *</label>
                    <button type="button" onClick={fetchMetaTemplates} disabled={isLoadingTemplates}
                      className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 disabled:opacity-50">
                      {isLoadingTemplates ? 'Loading...' : '↻ Reload'}
                    </button>
                  </div>
                  <select value={campTemplate}
                    onChange={e => {
                      const sel = metaTemplates.find((t: any) => t.name === e.target.value);
                      setCampTemplate(e.target.value);
                      if (sel?.language) setCampLanguage(sel.language);
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 bg-white">
                    <option value="">-- Select Template --</option>
                    {metaTemplates.filter((t: any) => t.status === 'APPROVED').map((t: any) => (
                      <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                </div>

                {/* Tag filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Tags</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Add tag and press Enter" value={campTagInput}
                      onChange={e => setCampTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && campTagInput.trim()) { setCampFilterTags(prev => Array.from(new Set([...prev, campTagInput.trim()]))); setCampTagInput(''); e.preventDefault(); }}}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                    <button onClick={() => { if (campTagInput.trim()) { setCampFilterTags(prev => Array.from(new Set([...prev, campTagInput.trim()]))); setCampTagInput(''); }}}
                      className="px-3 py-2 text-sm bg-white hover:bg-gray-100 text-gray-700 rounded-xl font-medium border border-gray-200">Add</button>
                  </div>
                  {campFilterTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {campFilterTags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                          {tag}
                          <button onClick={() => setCampFilterTags(prev => prev.filter(t => t !== tag))}><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Status</label>
                  <div className="flex flex-wrap gap-2">
                    {['lead', 'active', 'customer', 'prospect', 'qualified', 'inactive'].map(s => (
                      <button key={s} onClick={() => setCampFilterStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                        className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${campFilterStatus.includes(s) ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {campFilterStatus.length === 0 && <p className="text-xs text-gray-400 mt-1">No filter = all contacts with a phone number</p>}
                </div>

                {/* Manual contact selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Select specific contacts (optional)</label>
                  <input
                    type="text"
                    placeholder="Search by name, phone, email..."
                    value={campContactSearch}
                    onChange={(e) => setCampContactSearch(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
                  />
                  {isSearchingCampContacts && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching contacts...
                    </div>
                  )}
                  {!isSearchingCampContacts && campContactResults.length > 0 && (
                    <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                      {campContactResults.map((c: any) => {
                        const contactName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.phone || c.email || 'Contact';
                        const contactPhone = c.phone || '-';
                        const isSelected = campSelectedContacts.some((sel) => sel.id === c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={isSelected}
                            onClick={() => {
                              if (isSelected) return;
                              setCampSelectedContacts((prev) => [...prev, { id: c.id, name: contactName, phone: contactPhone }]);
                            }}
                            className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${isSelected ? 'bg-gray-50 text-gray-400' : 'hover:bg-gray-50'}`}
                          >
                            <p className="text-sm font-medium">{contactName}</p>
                            <p className="text-xs text-gray-500">{contactPhone}</p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {campSelectedContacts.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-medium text-green-700">{campSelectedContacts.length} selected</span>
                        <button
                          type="button"
                          onClick={() => setCampSelectedContacts([])}
                          className="text-xs text-gray-500 hover:text-red-500"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {campSelectedContacts.map((c) => (
                          <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                            {c.name}
                            <button type="button" onClick={() => setCampSelectedContacts((prev) => prev.filter((x) => x.id !== c.id))}>
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Audience preview */}
                <div className="flex items-center gap-3">
                  <button onClick={previewAudience} disabled={isPreviewingAudience}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 rounded-xl border border-gray-200 flex items-center gap-2">
                    {isPreviewingAudience ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <User className="h-3.5 w-3.5" />}
                    Preview Audience
                  </button>
                  {audiencePreview && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-600">{audiencePreview.count} contacts</span>
                      {audiencePreview.sample.length > 0 && (
                        <span className="text-xs text-gray-400">
                          ({audiencePreview.sample.slice(0, 3).map(s => s.name).join(', ')}{audiencePreview.count > 3 ? '...' : ''})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {campaignError && <p className="text-sm text-red-600">{campaignError}</p>}

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setShowCreateCampaign(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 rounded-xl border border-gray-200">
                    Cancel
                  </button>
                  <button onClick={() => createAndSendCampaign(false)} disabled={isCreatingCampaign || !campName.trim() || !campTemplate.trim()}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 rounded-xl border border-gray-200 disabled:opacity-50">
                    Save as Draft
                  </button>
                  <button onClick={() => createAndSendCampaign(true)} disabled={isCreatingCampaign || !campName.trim() || !campTemplate.trim()}
                    className="px-5 py-2 text-sm font-semibold text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50 flex items-center gap-2">
                    {isCreatingCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Create & Send Now
                  </button>
                </div>
              </div>
            )}

            {/* Campaign History */}
            {isLoadingCampaigns ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No campaigns yet. Create your first broadcast campaign.</p>
              </div>
            ) : (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Campaign</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Template</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Results</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Date</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {campaigns.map((c: any) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.templateName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.status === 'sent' ? 'bg-green-100 text-green-700' :
                            c.status === 'sending' ? 'bg-yellow-100 text-yellow-700' :
                            c.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {c.results ? (
                            <span className="text-gray-600">
                              <span className="text-green-600 font-medium">{c.results.sent}</span> sent
                              {c.results.failed > 0 && <>, <span className="text-red-500 font-medium">{c.results.failed}</span> failed</>}
                              {' / '}{c.results.total} total
                            </span>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {c.sentAt ? new Date(c.sentAt).toLocaleDateString() : new Date(c.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {c.status === 'draft' && (
                              <button onClick={() => sendExistingCampaign(c.id)} disabled={isSendingCampaign === c.id}
                                className="px-3 py-1 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg disabled:opacity-50 flex items-center gap-1">
                                {isSendingCampaign === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                Send
                              </button>
                            )}
                            <button onClick={() => deleteCampaign(c.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Section B: CSV Import & Send ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" /> CSV Import & Send
            </h2>
            <p className="text-sm text-gray-500 mb-4">Import phone numbers from a CSV and create contacts. Optionally send a template.</p>
            <p className="text-xs text-gray-400 mb-4 font-mono bg-gray-50 rounded-lg p-2">
              Expected CSV headers: <strong>phone</strong> (required), first_name, last_name<br />
              Example: +40712345678,Ion,Popescu
            </p>

            <div className="space-y-4">
              {/* File input */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">CSV File *</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl border border-dashed border-gray-300 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {csvFile ? csvFile.name : 'Choose CSV file'}
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }} />
                  </label>
                  {csvRows.length > 0 && <span className="text-sm font-medium text-green-600">{csvRows.length} rows ready</span>}
                </div>
                {csvParseError && <p className="text-sm text-red-600 mt-1">{csvParseError}</p>}
                {csvRows.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto border border-gray-100 rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-500">Phone</th>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-500">First Name</th>
                          <th className="text-left px-3 py-1.5 font-medium text-gray-500">Last Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvRows.slice(0, 20).map((r, i) => (
                          <tr key={i}>
                            <td className="px-3 py-1 font-mono">{r.phone}</td>
                            <td className="px-3 py-1">{r.firstName || '-'}</td>
                            <td className="px-3 py-1">{r.lastName || '-'}</td>
                          </tr>
                        ))}
                        {csvRows.length > 20 && <tr><td colSpan={3} className="px-3 py-1 text-gray-400">...and {csvRows.length - 20} more</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Tags to add */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tags to Add (comma-separated)</label>
                <input type="text" placeholder="e.g. imported, campaign-feb" value={csvAddTags} onChange={e => setCsvAddTags(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
              </div>

              {/* Send template toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={csvSendTemplate} onChange={e => setCsvSendTemplate(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-500 focus:ring-green-400" />
                  <span className="text-sm font-medium text-gray-700">Send template message after import</span>
                </label>
              </div>

              {csvSendTemplate && (
                <div className="pl-6">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                  <select value={csvTemplateName}
                    onChange={e => {
                      const sel = metaTemplates.find((t: any) => t.name === e.target.value);
                      setCsvTemplateName(e.target.value);
                      if (sel?.language) setCsvTemplateLanguage(sel.language);
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 bg-white">
                    <option value="">-- Select Template --</option>
                    {metaTemplates.filter((t: any) => t.status === 'APPROVED').map((t: any) => (
                      <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                    ))}
                  </select>
                </div>
              )}

              {csvImportError && <p className="text-sm text-red-600">{csvImportError}</p>}

              <button onClick={handleCsvImport} disabled={isImporting || !csvRows.length}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-xl disabled:opacity-50 flex items-center gap-2">
                {isImporting ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing...</> : <><FileText className="h-4 w-4" /> Import Contacts</>}
              </button>
            </div>

            {/* Results */}
            {csvImportResults && (
              <div className="mt-6">
                <div className="flex items-center gap-4 mb-3 text-sm flex-wrap">
                  <span className="font-semibold text-gray-700">Imported: {csvImportResults.imported}</span>
                  <span className="text-green-600">Created: {csvImportResults.created}</span>
                  <span className="text-blue-600">Updated: {csvImportResults.updated}</span>
                  {csvSendTemplate && <span className="text-green-600 font-semibold">✓ Sent: {csvImportResults.sent}</span>}
                  {csvSendTemplate && csvImportResults.failed > 0 && <span className="text-red-500 font-semibold">✗ Failed: {csvImportResults.failed}</span>}
                </div>
                <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Phone</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Action</th>
                        {csvSendTemplate && <th className="text-left px-3 py-2 font-medium text-gray-500">Sent</th>}
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {csvImportResults.results.map((r: any, i: number) => (
                        <tr key={i} className={r.sendError ? 'bg-red-50' : ''}>
                          <td className="px-3 py-1.5 font-mono">{r.phone}</td>
                          <td className="px-3 py-1.5"><span className={r.status === 'created' ? 'text-green-600' : 'text-blue-600'}>{r.status}</span></td>
                          {csvSendTemplate && <td className="px-3 py-1.5">{r.sent ? <span className="text-green-600">✓</span> : r.sendError ? <span className="text-red-500">✗</span> : '-'}</td>}
                          <td className="px-3 py-1.5 text-gray-400 max-w-xs truncate">{r.sendError || r.reason || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {pageTab === 'inbox' && (
      <div className="flex flex-1 overflow-hidden">

      {/* ═══ LEFT: Conversation List ═══ */}
      <div className={`flex-shrink-0 border-r border-gray-100 flex flex-col
        w-full md:w-80
        ${mobilePanel === 'chat' ? 'hidden md:flex' : 'flex'}
      `}>
        <div className="p-3 border-b border-gray-100 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-green-500 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">Chats</span>
            {demoMode && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                DEMO
              </span>
            )}
            {conversations.length > 0 && (
              <span className="text-xs font-medium text-gray-400">{conversations.length}</span>
            )}
          </div>
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex w-max items-center gap-1 pr-2">
              <button
                onClick={demoMode ? disableDemoMode : enableDemoMode}
                className={`flex-shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  demoMode
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={demoMode ? 'Disable demo data' : 'Load demo data'}
              >
                {demoMode ? 'Live' : 'Demo'}
              </button>
              <button onClick={() => { setShowNewConversation(true); setSendError(''); setNewConvTemplateSearch(''); if (metaTemplates.length === 0) fetchMetaTemplates(); }} className="flex-shrink-0 p-1.5 rounded-lg bg-green-500 hover:bg-green-600 transition-all shadow-sm" title="New conversation">
                <Plus className="h-3.5 w-3.5 text-white" />
              </button>
              <button onClick={fetchInbox} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Refresh">
                <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowAutoResponses(true); fetchAutoResponses(); }} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Auto-responses">
                <Zap className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowTemplateManager(true); fetchMetaTemplates(); }} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Templates">
                <LayoutTemplate className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowAutoSend(true); fetchAutoSend(); fetchMetaTemplates(); }} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Auto-send">
                <Timer className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowAISettings(true); fetchAIConfig(); }} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="AI Auto-Reply">
                <Brain className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowFlowEditor(true); fetchFlows(); if (metaTemplates.length === 0) fetchMetaTemplates(); }} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Conversation Flows">
                <GitBranch className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => setShowWebhookSetup(true)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Settings">
                <Settings className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="flex-1 bg-white border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-green-400"
              >
                {senderAccounts.length === 0 && <option value="">No connected numbers</option>}
                {senderAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.phoneDisplay || account.phoneNumberId || account.name}
                  </option>
                ))}
              </select>
              <button
                onClick={fetchSenderAccounts}
                className="p-1 rounded-md hover:bg-gray-200 transition-colors"
                title="Refresh connected numbers"
              >
                <RefreshCw className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>
          </div>
          {/* Number filter — only shown when multiple WA numbers are connected */}
          {senderAccounts.length > 1 && (
            <select
              value={convNumberFilter}
              onChange={e => setConvNumberFilter(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
            >
              <option value="all">All numbers</option>
              {senderAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.phoneDisplay || account.phoneNumberId || account.name}
                </option>
              ))}
            </select>
          )}
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" />
          </div>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1">
            {(
              [
                { key: 'all', label: 'All' },
                { key: 'unread', label: 'Unread' },
                { key: 'no_reply', label: 'No Reply' },
                { key: 'pinned', label: 'Pinned' },
                { key: 'assigned', label: 'Assigned' },
                { key: 'archived', label: 'Archived' },
                { key: 'campaign', label: 'Campaign' },
                { key: 'manychat', label: 'ManyChat' },
                { key: 'typeform', label: 'Typeform' },
              ] as const
            ).map(({ key, label }) => (
              <button key={key} onClick={() => setConvFilter(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${convFilter === key ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
          {convFilter === 'campaign' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
              <select
                value={campaignConversationFilter}
                onChange={(e) => setCampaignConversationFilter(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-green-400"
              >
                <option value="all">All campaigns</option>
                {availableCampaignNames.map((campaignName) => (
                  <option key={campaignName} value={campaignName}>
                    {campaignName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <MessageCircle className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No conversations</p>
              <p className="text-xs text-gray-400 mt-1 max-w-48">Messages from WhatsApp will appear here</p>
              {convFilter !== 'archived' && archivedConversationCount > 0 && (
                <p className="text-xs text-amber-600 mt-2 max-w-56">
                  {archivedConversationCount} chat{archivedConversationCount === 1 ? '' : 's'} are archived.
                  Open the Archived filter to view them.
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button onClick={() => { setShowNewConversation(true); setSendError(''); setNewConvTemplateSearch(''); if (metaTemplates.length === 0) fetchMetaTemplates(); }} className="px-4 py-1.5 text-xs font-medium text-white bg-green-500 rounded-full hover:bg-green-600 transition-all">
                  Start conversation
                </button>
                {convFilter !== 'archived' && archivedConversationCount > 0 && (
                  <button
                    onClick={() => setConvFilter('archived')}
                    className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-amber-100 rounded-full hover:bg-amber-200 transition-all"
                  >
                    View archived chats
                  </button>
                )}
                <button
                  onClick={demoMode ? disableDemoMode : enableDemoMode}
                  className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-full hover:bg-gray-200 transition-all"
                >
                  {demoMode ? 'Disable demo' : 'Load demo chats'}
                </button>
              </div>
            </div>
          ) : (
            groupedConversations.map(group => (
              <div key={group.label}>
                {/* Date group header */}
                <div className="sticky top-0 z-10 px-4 py-1.5 bg-gray-50/90 backdrop-blur-sm border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
                </div>
                {group.convs.map(conv => {
                  const ss = getSessionStatus(conv);
                  const isSelected = selectedConv?.waId === conv.waId;
                  const hasUnread = conv.unreadCount > 0;
                  const isMuted = isConversationMuted(conv);
                  const convAssignment = assignments[conv.waId];
                  const sourceLabel = formatSourceLabel(conv.contactSource);
                  return (
                    <div key={conv.waId} className={`relative group/conv ${isSelected ? 'bg-green-50 border-l-3 border-l-green-500' : 'border-l-3 border-l-transparent hover:bg-gray-50'}`}>
                    <button onClick={() => selectConversation(conv)}
                      className="w-full flex items-center gap-3 px-4 py-3 transition-all text-left">
                      <div className="relative flex-shrink-0">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 shadow-sm">
                          <span className="text-white text-sm font-bold">{conv.contactName.charAt(0).toUpperCase()}</span>
                        </div>
                        {/* Status dot */}
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                          hasUnread ? 'bg-purple-500' : ss === 'open' ? 'bg-green-400' : ss === 'closing' ? 'bg-orange-400' : 'bg-gray-300'
                        }`} />
                        {/* WhatsApp badge */}
                        <div className="absolute -top-1 -left-1 h-4 w-4 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                          <MessageCircle className="h-2.5 w-2.5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex items-center gap-1.5">
                            <p className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{conv.contactName}</p>
                            {conv.pinned && <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                            {isMuted && <BellOff className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                            {conv.archived && <Archive className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            {convAssignment && (
                              <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-sm"
                                style={{ backgroundColor: convAssignment.color }}
                                title={`Assigned: ${convAssignment.userName}`}>
                                {getUserInitials(convAssignment.userName)}
                              </div>
                            )}
                            <span className="text-[11px] text-gray-400">{formatTime(conv.lastMessageTime)}</span>
                          </div>
                        </div>
                        {sourceLabel && (
                          <p className="text-[11px] text-indigo-600 truncate mt-0.5">{sourceLabel}</p>
                        )}
                        {conv.hasCampaignMessages && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Campaign
                            </span>
                            {conv.primaryCampaignName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 truncate max-w-[140px]">
                                {conv.primaryCampaignName}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-0.5">
                          <p className={`text-xs truncate ${hasUnread ? 'font-medium text-gray-700' : 'text-gray-500'}`}>{conv.lastMessage}</p>
                          {hasUnread && (
                            <span className="flex-shrink-0 ml-2 h-5 min-w-5 flex items-center justify-center rounded-full bg-green-500 text-white text-[10px] font-bold px-1.5 shadow-sm">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/conv:opacity-100 transition-opacity flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTogglePin(conv.waId, !!conv.pinned); }}
                        className={`p-1.5 rounded-lg shadow-sm border transition-colors ${
                          conv.pinned
                            ? 'bg-amber-50 border-amber-200 text-amber-600'
                            : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'
                        }`}
                        title={conv.pinned ? 'Unpin chat' : 'Pin chat'}
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleMute(conv.waId, conv.mutedUntil); }}
                        className={`p-1.5 rounded-lg shadow-sm border transition-colors ${
                          isMuted
                            ? 'bg-blue-50 border-blue-200 text-blue-600'
                            : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'
                        }`}
                        title={isMuted ? 'Unmute chat' : 'Mute for 8h'}
                      >
                        {isMuted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleArchive(conv.waId, !!conv.archived); }}
                        className={`p-1.5 rounded-lg shadow-sm border transition-colors ${
                          conv.archived
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                            : 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50'
                        }`}
                        title={conv.archived ? 'Unarchive chat' : 'Archive chat'}
                      >
                        {conv.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.waId); }}
                        className="p-1.5 bg-white rounded-lg shadow-sm border border-gray-100 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400 transition-colors"
                        title="Delete conversation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══ CENTER: Chat Area ═══ */}
      {selectedConv ? (
        <div className={`flex-1 flex flex-col min-w-0 ${mobilePanel === 'list' ? 'hidden md:flex' : 'flex'}`}>
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
            {/* Back button - mobile only */}
            <button
              onClick={() => { setSelectedConv(null); setMobilePanel('list'); }}
              className="md:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex-shrink-0">
              <span className="text-white font-bold">{selectedConv.contactName.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900 truncate">{selectedConv.contactName}</h2>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{selectedConv.phone}</p>
                {selectedSender && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                    Send from: {selectedSender.phoneDisplay || selectedSender.phoneNumberId || selectedSender.name}
                  </span>
                )}
                {selectedSourceLabel && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {selectedSourceLabel}
                  </span>
                )}
                {selectedConv.hasCampaignMessages && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                    Campaign
                  </span>
                )}
                {selectedConv.primaryCampaignName && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 max-w-[180px] truncate">
                    {selectedConv.primaryCampaignName}
                  </span>
                )}
                {assignments[selectedConv.waId] && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <div className="h-4 w-4 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: assignments[selectedConv.waId].color }}>
                      {getUserInitials(assignments[selectedConv.waId].userName)}
                    </div>
                    {assignments[selectedConv.waId].userName}
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => handleTogglePin(selectedConv.waId, !!selectedConv.pinned)}
                className={`p-2 rounded-lg transition-all ${
                  selectedConv.pinned ? 'bg-amber-100 text-amber-700' : 'hover:bg-gray-100 text-gray-500'
                }`}
                title={selectedConv.pinned ? 'Unpin chat' : 'Pin chat'}
              >
                <Pin className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleToggleMute(selectedConv.waId, selectedConv.mutedUntil)}
                className={`p-2 rounded-lg transition-all ${
                  selectedConversationMuted ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-500'
                }`}
                title={selectedConversationMuted ? 'Unmute chat' : 'Mute chat for 8 hours'}
              >
                {selectedConversationMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </button>
              <button
                onClick={() => handleToggleArchive(selectedConv.waId, !!selectedConv.archived)}
                className={`p-2 rounded-lg transition-all ${
                  selectedConv.archived ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-gray-100 text-gray-500'
                }`}
                title={selectedConv.archived ? 'Unarchive chat' : 'Archive chat'}
              >
                {selectedConv.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              </button>
              {/* Assign dropdown */}
              <div className="relative">
                <button onClick={() => setShowAssignDropdown(v => !v)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${assignments[selectedConv.waId] ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' : 'hover:bg-gray-100 text-gray-500'}`}
                  title="Assign conversation">
                  <User className="h-3.5 w-3.5" />
                  {assignments[selectedConv.waId] ? assignments[selectedConv.waId].userName.split(' ')[0] : 'Assign'}
                </button>
                {showAssignDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-20 min-w-40">
                    {teamUsers.map(u => (
                      <button key={u.id} onClick={() => assignConversation(selectedConv.waId, u)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left">
                        <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: getUserColor(u.id) }}>
                          {getUserInitials(`${u.firstName} ${u.lastName}`)}
                        </div>
                        <span>{u.firstName} {u.lastName}</span>
                      </button>
                    ))}
                    {assignments[selectedConv.waId] && (
                      <button onClick={() => assignConversation(selectedConv.waId, null)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-500 border-t border-gray-100">
                        <X className="h-4 w-4" /> Unassign
                      </button>
                    )}
                  </div>
                )}
              </div>
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
          {!sessionOpen && !hasEverReceivedInbound && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200">
              <AlertTriangle className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700 flex-1">
                Waiting for customer reply. If they don&apos;t respond, configure your{' '}
                <button onClick={() => setShowWebhookSetup(true)} className="underline font-medium hover:text-blue-900">
                  WhatsApp webhook
                </button>{' '}
                so messages appear here.
              </p>
            </div>
          )}
          {!sessionOpen && hasEverReceivedInbound && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700">Customer session expired (24h). Send a template message to re-engage.</p>
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
                : <MessageBubble
                    key={item.msg.id}
                    msg={item.msg}
                    formatTime={formatTime}
                    onReply={(message) => {
                      const previewText = parseMessageContent(message).text || message.description || 'Message';
                      setReplyingTo({
                        messageId: String(message.metadata?.whatsappMessageId || message.id),
                        previewText: String(previewText).trim().slice(0, 140),
                        direction: message.direction,
                      });
                    }}
                  />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Template panel (slide up) */}
          {showTemplatePanel && (
            <div className="border-t border-gray-200 bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4" /> Message Templates
                </h3>
                <button
                  onClick={() => {
                    setShowTemplatePanel(false);
                    setSelectedTemplate(null);
                    setTemplateParams([]);
                    setTemplateHeaderMediaId('');
                    setTemplateHeaderMediaUrl('');
                  }}
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <div className="max-h-[40vh] overflow-y-auto p-4">
                {!selectedTemplate ? (
                  isLoadingTemplates ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(metaTemplates.filter((t: any) => t.status === 'APPROVED').map(toSendableTemplate).length > 0
                        ? metaTemplates.filter((t: any) => t.status === 'APPROVED').map(toSendableTemplate)
                        : WHATSAPP_TEMPLATES
                      ).map(t => (
                        <button key={t.id} onClick={() => {
                          applyTemplateSelection(t, 'chat');
                        }}
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
                  )
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
                    {selectedTemplate.headerMediaType && (
                      <div className="mb-3 space-y-2 p-3 rounded-lg border border-amber-200 bg-amber-50">
                        <p className="text-xs text-amber-800 font-medium">
                          Header media required ({selectedTemplate.headerMediaType})
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={templateHeaderMediaId}
                            onChange={(e) => setTemplateHeaderMediaId(e.target.value)}
                            placeholder="Meta media_id"
                            className="flex-1 px-3 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400"
                          />
                          <label className="px-3 py-1.5 text-xs font-medium text-amber-800 border border-amber-300 rounded-lg cursor-pointer hover:bg-amber-100">
                            {isUploadingTemplateHeader ? 'Uploading…' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              accept={selectedTemplate.headerMediaType === 'image' ? 'image/*' : selectedTemplate.headerMediaType === 'video' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                await handleUploadTemplateHeader(file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                        <input
                          type="text"
                          value={templateHeaderMediaUrl}
                          onChange={(e) => setTemplateHeaderMediaUrl(e.target.value)}
                          placeholder={`${selectedTemplate.headerMediaType} URL (optional)`}
                          className="w-full px-3 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              {selectedTemplate && (
                <div className="px-4 py-3 border-t border-gray-100 bg-white sticky bottom-0">
                  <div className="flex gap-2">
                    <button onClick={() => {
                      setSelectedTemplate(null);
                      setTemplateParams([]);
                      setTemplateHeaderMediaId('');
                      setTemplateHeaderMediaUrl('');
                    }} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Back</button>
                    <button
                      onClick={() => handleSendTemplate(selectedConv.waId, selectedTemplate, templateParams)}
                      disabled={isSending}
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
            {voiceInputError && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <p className="text-xs text-amber-700 flex-1">{voiceInputError}</p>
                {voiceAudioBlob && (
                  <button
                    onClick={() => { setVoiceInputError(''); handleSendVoiceRecording(); }}
                    disabled={isSending}
                    className="flex-shrink-0 text-[11px] font-semibold text-amber-800 underline disabled:opacity-50"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
            {replyingTo && (
              <div className="mb-2 flex items-start justify-between gap-2 rounded-xl border border-green-100 bg-green-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-green-700">
                    Replying to {replyingTo.direction === 'inbound' ? 'customer' : 'your message'}
                  </p>
                  <p className="text-xs text-green-900 truncate">{replyingTo.previewText}</p>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="p-1 rounded-md text-green-700 hover:bg-green-100"
                  title="Cancel reply"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {(isVoiceRecording || voiceAudioBlob) && (
              <div className={`mb-2 rounded-xl border px-3 py-2 ${isVoiceRecording ? 'border-red-200 bg-red-50' : 'border-green-100 bg-green-50'}`}>
                {/* Hold-mode hints: visible while user has finger on mic button */}
                {isHoldMode && !isHoldLocked && (
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <span className={`text-[11px] font-semibold transition-colors ${holdSlideHint === 'cancel' ? 'text-red-600' : 'text-gray-400'}`}>
                      ← Slide to cancel
                    </span>
                    <span className={`text-[11px] font-semibold transition-colors ${holdSlideHint === 'lock' ? 'text-green-600' : 'text-gray-400'}`}>
                      ↑ Slide to lock
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {/* Pulsing dot */}
                  <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isVoiceRecording ? 'bg-red-500 animate-pulse' : isSending ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />

                  {/* Waveform canvas (recording) or ready icon (preview) */}
                  {isVoiceRecording ? (
                    <canvas
                      ref={voiceWaveformCanvasRef}
                      width={160}
                      height={30}
                      className="flex-1 min-w-0"
                    />
                  ) : isSending ? (
                    <span className="text-xs text-amber-700 flex-1">Sending…</span>
                  ) : (
                    <AudioLines className="h-4 w-4 flex-shrink-0 text-green-600" />
                  )}

                  {/* Timer */}
                  <span className={`text-xs font-mono flex-shrink-0 tabular-nums ${isVoiceRecording ? 'text-red-700' : 'text-green-700'}`}>
                    {formatDuration(voiceRecordingSeconds)}
                  </span>

                  {/* Actions — only show when locked or when we have a draft (not in hold mode) */}
                  {(!isHoldMode || isHoldLocked) && (
                    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                      {isVoiceRecording ? (
                        <>
                          <button
                            onClick={() => { autoSendOnStopRef.current = true; stopVoiceRecording(); }}
                            className="px-2 py-1 rounded-md bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700"
                          >
                            Send
                          </button>
                          <button
                            onClick={stopVoiceRecording}
                            className="px-2 py-1 rounded-md bg-red-100 text-red-700 text-[11px] font-semibold hover:bg-red-200"
                          >
                            Stop
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={handleSendVoiceRecording}
                          disabled={isSending || !voiceAudioBlob}
                          className="px-2 py-1 rounded-md bg-green-600 text-white text-[11px] font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Send
                        </button>
                      )}
                      <button
                        onClick={discardVoiceDraft}
                        className="px-2 py-1 rounded-md bg-white text-gray-600 text-[11px] font-semibold border border-gray-200 hover:bg-gray-50"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                {!isVoiceRecording && voiceAudioPreviewUrl && !isSending && (
                  <audio controls src={voiceAudioPreviewUrl} className="mt-2 w-full h-8" />
                )}
              </div>
            )}

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
              <button onClick={() => { const opening = !showTemplatePanel; setShowTemplatePanel(opening); setShowEmojiPicker(false); setShowQuickReplies(false); if (opening && metaTemplates.length === 0) fetchMetaTemplates(); }}
                className={`p-1.5 rounded-lg transition-all ${showTemplatePanel ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100 text-gray-500'}`} title="Templates">
                <LayoutTemplate className="h-4 w-4" />
              </button>
              <button
                onClick={toggleDictation}
                disabled={!dictationSupported}
                className={`p-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  isDictating ? 'bg-red-100 text-red-600' : 'hover:bg-gray-100 text-gray-500'
                }`}
                title={dictationSupported ? (isDictating ? 'Stop speech-to-text' : 'Speak to type') : 'Speech-to-text not supported'}
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                onPointerDown={handleVoicePointerDown}
                onPointerMove={handleVoicePointerMove}
                onPointerUp={handleVoicePointerUp}
                onPointerCancel={handleVoicePointerCancel}
                onClick={isVoiceRecording && !isHoldMode ? stopVoiceRecording : undefined}
                disabled={!voiceRecordingSupported || isSending || !!voiceAudioBlob}
                className={`p-1.5 rounded-lg transition-all select-none touch-none disabled:opacity-40 disabled:cursor-not-allowed ${
                  isHoldMode ? 'bg-red-200 text-red-700 scale-110' : isVoiceRecording ? 'bg-red-100 text-red-600' : 'hover:bg-gray-100 text-gray-500'
                }`}
                title={voiceRecordingSupported ? 'Hold to record voice note' : 'Voice recording not supported'}
              >
                <AudioLines className="h-4 w-4" />
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
              {isDictating && (
                <span className="ml-1 text-[11px] font-medium text-red-600 animate-pulse">Listening…</span>
              )}
            </div>

            {/* "/" slash command dropdown */}
            {showSlashMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 mx-4 bg-white rounded-xl shadow-xl border border-gray-200 max-h-64 overflow-y-auto z-50">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500">Templates & Quick Replies</p>
                </div>
                {/* Templates */}
                {metaTemplates.filter((t: any) => t.status === 'APPROVED').filter((t: any) =>
                  !slashSearch || t.name.toLowerCase().includes(slashSearch.toLowerCase())
                ).map((t: any) => {
                  const tpl = toSendableTemplate(t);
                  return (
                    <button key={tpl.id} onClick={() => {
                      applyTemplateSelection(tpl, 'chat');
                      setShowTemplatePanel(true);
                      setShowSlashMenu(false);
                      setReplyText('');
                    }} className="w-full flex items-start gap-3 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-50">
                      <LayoutTemplate className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{tpl.displayName}</p>
                        <p className="text-xs text-gray-400 truncate">{tpl.body}</p>
                      </div>
                    </button>
                  );
                })}
                {/* Quick replies */}
                {(quickReplies.length > 0 ? quickReplies : DEFAULT_QUICK_REPLIES).filter(qr =>
                  !slashSearch || qr.title.toLowerCase().includes(slashSearch.toLowerCase()) || qr.message.toLowerCase().includes(slashSearch.toLowerCase())
                ).map(qr => (
                  <button key={qr.id} onClick={() => {
                    setReplyText(qr.message);
                    setShowSlashMenu(false);
                  }} className="w-full flex items-start gap-3 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-50">
                    <Zap className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{qr.title}</p>
                      <p className="text-xs text-gray-400 truncate">{qr.message}</p>
                    </div>
                  </button>
                ))}
                {metaTemplates.filter((t: any) => t.status === 'APPROVED').length === 0 && (quickReplies.length > 0 ? quickReplies : DEFAULT_QUICK_REPLIES).length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-gray-400">No templates or quick replies available</div>
                )}
              </div>
            )}

            {/* Text input + send */}
            <div className="flex items-end gap-2">
              <AudioLibraryPicker
                channel="whatsapp"
                to={selectedConv?.waId}
                integrationId={selectedSenderId || undefined}
                disabled={!sessionOpen}
                onSent={() => void fetchInbox()}
              />
              <textarea value={replyText}
                onChange={e => {
                  const val = e.target.value;
                  setReplyText(val);
                  // Show slash menu when typing "/"
                  if (val === '/') {
                    setShowSlashMenu(true);
                    setSlashSearch('');
                    if (metaTemplates.length === 0) fetchMetaTemplates();
                  } else if (val.startsWith('/') && showSlashMenu) {
                    setSlashSearch(val.slice(1));
                  } else {
                    setShowSlashMenu(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (showSlashMenu && e.key === 'Escape') {
                    setShowSlashMenu(false);
                    setReplyText('');
                    return;
                  }
                  handleKeyDown(e as any);
                }}
                placeholder={sessionOpen ? 'Type "/" for templates or a message... (Enter to send)' : 'Send a template to start conversation'}
                disabled={!sessionOpen}
                rows={2}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 disabled:bg-gray-100 disabled:cursor-not-allowed" />
              <button onClick={handleSend} disabled={isSending || !replyText.trim() || !sessionOpen}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 hover:bg-green-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-sm">
                {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex-1 items-center justify-center bg-gray-50 ${mobilePanel === 'list' ? 'hidden md:flex' : 'flex'}`}>
          <div className="text-center max-w-sm px-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
              <MessageCircle className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">WhatsApp Inbox</h3>
            <p className="text-sm text-gray-500 mb-4">Select a conversation or start a new one to begin messaging.</p>
            {noInboundEver && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 text-left">
                <p className="font-medium mb-1">⚠️ Replies from customers not appearing?</p>
                <p>Configure your WhatsApp webhook so incoming messages show here automatically.</p>
                <button onClick={() => setShowWebhookSetup(true)} className="mt-2 text-blue-600 underline font-medium hover:text-blue-800">
                  View setup instructions →
                </button>
              </div>
            )}
            <button onClick={() => { setShowNewConversation(true); setSendError(''); setNewConvTemplateSearch(''); if (metaTemplates.length === 0) fetchMetaTemplates(); }}
              className="px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl transition-all flex items-center gap-2 mx-auto">
              <Plus className="h-4 w-4" /> New Conversation
            </button>
            <button
              onClick={demoMode ? disableDemoMode : enableDemoMode}
              className="mt-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all"
            >
              {demoMode ? 'Disable demo data' : 'Load demo chats'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ RIGHT: Contact Info Sidebar ═══ */}
      {showContactInfo && selectedConv?.contactId && (
        <ContactInfoSidebar contact={contactDetail} isLoading={isLoadingContact} onClose={() => setShowContactInfo(false)} pipelineStages={pipelineStages} onStageChange={handleContactStageChange} />
      )}

      </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* New Conversation Modal */}
      {showNewConversation && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><MessageCircle className="h-5 w-5 text-green-600" /> New Conversation</h3>
              <button onClick={() => {
                setShowNewConversation(false);
                setNewConvPhone('');
                setNewConvTemplate(null);
                setNewConvTemplateParams([]);
                setNewConvTemplateSearch('');
                setContactSearchQuery('');
                setContactSearchResults([]);
                setTemplateHeaderMediaId('');
                setTemplateHeaderMediaUrl('');
                setSendError('');
              }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto min-h-0">
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
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search templates..."
                      value={newConvTemplateSearch}
                      onChange={(e) => setNewConvTemplateSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                    {isLoadingTemplates ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                    ) : filteredNewConversationTemplates.length > 0 ? (
                      filteredNewConversationTemplates.map((t) => {
                        const selected = newConvTemplate?.id === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              applyTemplateSelection(t, 'new');
                            }}
                            className={`w-full p-3 text-left rounded-xl border transition-all ${
                              selected ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-gray-900">{t.displayName}</span>
                                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.body}</p>
                              </div>
                              <span className={`text-[11px] font-semibold px-2 py-1 rounded-md flex-shrink-0 ${
                                selected ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {selected ? 'Selected' : 'Use template'}
                              </span>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-4 text-center text-xs text-gray-500 border border-dashed border-gray-200 rounded-xl">
                        No templates match your search.
                      </div>
                    )}
                  </div>
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
                {newConvTemplate?.headerMediaType && (
                  <div className="mt-2 space-y-2 p-3 rounded-lg border border-amber-200 bg-amber-50">
                    <p className="text-xs text-amber-800 font-medium">
                      Header media required ({newConvTemplate.headerMediaType})
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={templateHeaderMediaId}
                        onChange={(e) => setTemplateHeaderMediaId(e.target.value)}
                        placeholder="Meta media_id"
                        className="flex-1 px-3 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400"
                      />
                      <label className="px-3 py-1.5 text-xs font-medium text-amber-800 border border-amber-300 rounded-lg cursor-pointer hover:bg-amber-100">
                        {isUploadingTemplateHeader ? 'Uploading…' : 'Upload'}
                        <input
                          type="file"
                          className="hidden"
                          accept={newConvTemplate.headerMediaType === 'image' ? 'image/*' : newConvTemplate.headerMediaType === 'video' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            await handleUploadTemplateHeader(file);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      value={templateHeaderMediaUrl}
                      onChange={(e) => setTemplateHeaderMediaUrl(e.target.value)}
                      placeholder={`${newConvTemplate.headerMediaType} URL (optional)`}
                      className="w-full px-3 py-1.5 text-sm border border-amber-200 rounded-lg focus:outline-none focus:border-amber-400"
                    />
                  </div>
                )}
              </div>
            </div>
            {sendError && (
              <p className="px-4 pb-2 text-xs text-red-600">{sendError}</p>
            )}
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => {
                setShowNewConversation(false);
                setNewConvPhone('');
                setNewConvTemplate(null);
                setNewConvTemplateParams([]);
                setNewConvTemplateSearch('');
                setContactSearchQuery('');
                setContactSearchResults([]);
                setTemplateHeaderMediaId('');
                setTemplateHeaderMediaUrl('');
                setSendError('');
              }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all">Cancel</button>
              <button onClick={() => { if (newConvPhone && newConvTemplate) handleSendTemplate(newConvPhone, newConvTemplate, newConvTemplateParams); }}
                disabled={!newConvPhone || !newConvTemplate || isSending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Use template
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
              <button onClick={resetAttachmentState}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <button onClick={() => { setAttachmentType('image'); setAttachmentUrl(''); setAttachmentMediaId(''); setAttachmentFileName(''); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'image' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <Image className="h-4 w-4" /> Image
                </button>
                <button onClick={() => { setAttachmentType('video'); setAttachmentUrl(''); setAttachmentMediaId(''); setAttachmentFileName(''); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'video' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <Video className="h-4 w-4" /> Video
                </button>
                <button onClick={() => { setAttachmentType('audio'); setAttachmentUrl(''); setAttachmentMediaId(''); setAttachmentFileName(''); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'audio' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <Mic className="h-4 w-4" /> Audio
                </button>
                <button onClick={() => { setAttachmentType('document'); setAttachmentUrl(''); setAttachmentMediaId(''); setAttachmentFileName(''); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'document' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <FileText className="h-4 w-4" /> Document
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 text-center">
                  Upload file
                  <input
                    type="file"
                    className="hidden"
                    accept={getAttachmentAccept()}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      await handleUploadAttachment(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {isUploadingAttachment && <Loader2 className="h-4 w-4 animate-spin text-green-600" />}
              </div>

              {attachmentMediaId && (
                <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="flex-1 truncate text-xs text-green-700">{attachmentFileName || 'Uploaded file'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMediaId('');
                      setAttachmentFileName('');
                    }}
                    className="text-red-500 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="text-xs text-gray-500">or paste a direct URL</div>
              <input
                type="url"
                placeholder={
                  attachmentType === 'image' ? 'Image URL (JPEG/PNG, max 5MB)' :
                  attachmentType === 'video' ? 'Video URL (MP4/3GPP, max 16MB)' :
                  attachmentType === 'audio' ? 'Audio URL (AAC/MP3/OGG, max 16MB)' :
                  'Document URL (PDF/DOC/XLS, max 100MB)'
                }
                value={attachmentUrl}
                onChange={e => setAttachmentUrl(e.target.value)}
                className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
              />
              {attachmentType !== 'audio' && (
                <input
                  type="text"
                  placeholder="Caption (optional)"
                  value={attachmentCaption}
                  onChange={e => setAttachmentCaption(e.target.value)}
                  className="w-full px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400"
                />
              )}
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={resetAttachmentState}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancel</button>
              <button onClick={handleSendAttachment} disabled={(!attachmentUrl.trim() && !attachmentMediaId) || isSending || isUploadingAttachment}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Manager Modal */}
      {showTemplateManager && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5 text-green-600" /> Message Templates
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowCreateTemplate(true); setTemplateError(''); }}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> New Template
                </button>
                <button onClick={() => { setShowTemplateManager(false); setShowCreateTemplate(false); }}><X className="h-5 w-5 text-gray-400" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!showCreateTemplate ? (
                <>
                  <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
                    Templates must be approved by Meta before use. After creating, status will show as <strong>PENDING</strong> until reviewed (usually 24-48h). Requires WABA ID in integration settings.
                  </div>
                  {isLoadingTemplates ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                  ) : metaTemplates.length === 0 ? (
                    <div className="text-center py-12">
                      <LayoutTemplate className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-500">No templates yet</p>
                      <p className="text-xs text-gray-400 mt-1">Create your first template to start messaging outside the 24h window</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {metaTemplates.map((t: any) => (
                        <div key={t.id || t.name} className="p-4 border border-gray-200 rounded-xl">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm text-gray-900">{t.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  t.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                  t.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                  t.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{t.status}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  t.category === 'MARKETING' ? 'bg-purple-100 text-purple-600' :
                                  t.category === 'UTILITY' ? 'bg-blue-100 text-blue-600' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{t.category}</span>
                              </div>
                              <p className="text-xs text-gray-500">{t.language} · {t.components?.find((c: any) => c.type === 'BODY')?.text || 'No body'}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {t.status === 'APPROVED' && (
                                <button onClick={() => {
                                  applyTemplateSelection(toSendableTemplate(t), 'chat');
                                  setShowTemplatePanel(true);
                                  setShowTemplateManager(false);
                                }}
                                  className="text-xs px-2 py-1 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-medium">Use</button>
                              )}
                              <button onClick={() => handleDeleteTemplate(t.name)}
                                className="p-1.5 hover:bg-red-50 rounded-lg"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <h4 className="font-medium text-gray-900">Create New Template</h4>
                  {templateError && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{templateError}</div>}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Template Name *</label>
                      <input type="text" value={newTemplate.name} placeholder="e.g. order_confirmation" onChange={e => setNewTemplate(p => ({ ...p, name: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                      <p className="text-xs text-gray-400 mt-1">lowercase, underscores only</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">Language *</label>
                      <select value={newTemplate.language} onChange={e => setNewTemplate(p => ({ ...p, language: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400">
                        <option value="en_US">English (US)</option>
                        <option value="en_GB">English (UK)</option>
                        <option value="ro">Romanian</option>
                        <option value="de">German</option>
                        <option value="fr">French</option>
                        <option value="es">Spanish</option>
                        <option value="pt_BR">Portuguese (BR)</option>
                        <option value="it">Italian</option>
                        <option value="nl">Dutch</option>
                        <option value="pl">Polish</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Category *</label>
                    <div className="flex gap-2">
                      {(['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const).map(cat => (
                        <button key={cat} onClick={() => setNewTemplate(p => ({ ...p, category: cat }))}
                          className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-all ${newTemplate.category === cat ? 'bg-green-50 border-green-400 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Header (optional)</label>
                    <select value={newTemplate.headerType} onChange={e => setNewTemplate(p => ({ ...p, headerType: e.target.value as any }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 mb-2">
                      <option value="NONE">None</option>
                      <option value="TEXT">Text</option>
                      <option value="IMAGE">Image</option>
                      <option value="VIDEO">Video</option>
                      <option value="DOCUMENT">Document</option>
                    </select>
                    {newTemplate.headerType === 'TEXT' && (
                      <input type="text" value={newTemplate.headerText} placeholder="Header text" onChange={e => setNewTemplate(p => ({ ...p, headerText: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                    )}
                    {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(newTemplate.headerType) && (
                      <input type="text" value={newTemplate.headerMediaUrl} placeholder={`${newTemplate.headerType.toLowerCase()} URL (example for Meta review)`}
                        onChange={e => setNewTemplate(p => ({ ...p, headerMediaUrl: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Body *</label>
                    <textarea value={newTemplate.bodyText} rows={4} placeholder="Hello {{1}}, your order {{2}} has been confirmed. Thank you!"
                      onChange={e => setNewTemplate(p => ({ ...p, bodyText: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 resize-none" />
                    <p className="text-xs text-gray-400 mt-1">Use {'{'}{'{'}'1{'}'}{'}'}, {'{'}{'{'}'2{'}'}{'}'} for dynamic variables</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Footer (optional)</label>
                    <input type="text" value={newTemplate.footerText} placeholder="e.g. Reply STOP to unsubscribe" onChange={e => setNewTemplate(p => ({ ...p, footerText: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Buttons (optional, max 3)</label>
                    {newTemplate.buttons.map((btn, idx) => (
                      <div key={idx} className="flex items-center gap-2 mb-2">
                        <select value={btn.type} onChange={e => {
                          const updated = [...newTemplate.buttons];
                          updated[idx] = { ...updated[idx], type: e.target.value as any };
                          setNewTemplate(p => ({ ...p, buttons: updated }));
                        }} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg">
                          <option value="QUICK_REPLY">Quick Reply</option>
                          <option value="URL">URL Button</option>
                          <option value="PHONE_NUMBER">Phone</option>
                        </select>
                        <input value={btn.text} placeholder="Button text" onChange={e => {
                          const updated = [...newTemplate.buttons];
                          updated[idx] = { ...updated[idx], text: e.target.value };
                          setNewTemplate(p => ({ ...p, buttons: updated }));
                        }} className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
                        {btn.type === 'URL' && (
                          <input value={btn.url || ''} placeholder="https://..." onChange={e => {
                            const updated = [...newTemplate.buttons];
                            updated[idx] = { ...updated[idx], url: e.target.value };
                            setNewTemplate(p => ({ ...p, buttons: updated }));
                          }} className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
                        )}
                        {btn.type === 'PHONE_NUMBER' && (
                          <input value={btn.phoneNumber || ''} placeholder="+40..." onChange={e => {
                            const updated = [...newTemplate.buttons];
                            updated[idx] = { ...updated[idx], phoneNumber: e.target.value };
                            setNewTemplate(p => ({ ...p, buttons: updated }));
                          }} className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg" />
                        )}
                        <button onClick={() => setNewTemplate(p => ({ ...p, buttons: p.buttons.filter((_, i) => i !== idx) }))}
                          className="text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    {newTemplate.buttons.length < 3 && (
                      <button onClick={() => setNewTemplate(p => ({ ...p, buttons: [...p.buttons, { type: 'QUICK_REPLY', text: '' }] }))}
                        className="text-xs text-green-600 hover:text-green-700 font-medium">+ Add Button</button>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowCreateTemplate(false)}
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">Back</button>
                    <button onClick={handleCreateTemplate} disabled={isCreatingTemplate || !newTemplate.name.trim() || !newTemplate.bodyText.trim()}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                      {isCreatingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Submit to Meta
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto Responses Modal */}
      {showAutoResponses && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-600" /> Auto-Responses
              </h3>
              <button onClick={() => setShowAutoResponses(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Master toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-900">Enable Auto-Responses</p>
                  <p className="text-xs text-gray-500 mt-0.5">Automatically reply when customers send matching keywords</p>
                </div>
                <button onClick={() => setAutoRespondEnabled(!autoRespondEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoRespondEnabled ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoRespondEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Rules */}
              <div className="space-y-3">
                {autoResponseRules.map((rule, idx) => (
                  <div key={rule.id} className={`p-3 rounded-xl border ${rule.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <input type="text" value={rule.name} placeholder="Rule name"
                        onChange={e => setAutoResponseRules(prev => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                        className="flex-1 text-sm font-medium bg-transparent border-0 focus:outline-none text-gray-900" />
                      <button onClick={() => setAutoResponseRules(prev => prev.map((r, i) => i === idx ? { ...r, enabled: !r.enabled } : r))}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all ${rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {rule.enabled ? 'ON' : 'OFF'}
                      </button>
                      <button onClick={() => setAutoResponseRules(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1 hover:bg-red-50 rounded-lg"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Keywords (comma-separated)</label>
                        <input type="text" value={rule.keywords} placeholder="hello, hi, salut, buna"
                          onChange={e => setAutoResponseRules(prev => prev.map((r, i) => i === idx ? { ...r, keywords: e.target.value } : r))}
                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Response (use {'{{name}}'} for customer&apos;s first name)</label>
                        <textarea value={rule.response} rows={2} placeholder="Hello! How can I help you?"
                          onChange={e => setAutoResponseRules(prev => prev.map((r, i) => i === idx ? { ...r, response: e.target.value } : r))}
                          className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 resize-none" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setAutoResponseRules(prev => [...prev, { id: `r_${Date.now()}`, name: 'New Rule', keywords: '', response: '', enabled: true }])}
                className="w-full py-2 text-sm text-green-600 border-2 border-dashed border-green-300 rounded-xl hover:bg-green-50 transition-all flex items-center justify-center gap-2">
                <Plus className="h-4 w-4" /> Add Rule
              </button>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => setShowAutoResponses(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancel</button>
              <button onClick={saveAutoResponses} disabled={isSavingAutoResp}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {isSavingAutoResp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Setup Modal */}
      {showWebhookSetup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="h-5 w-5 text-green-600" /> WhatsApp Webhook Setup
              </h3>
              <button onClick={() => { setShowWebhookSetup(false); setCustomToken(''); setTokenSaveError(''); setVerificationTest(null); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <strong>Why configure this?</strong> WhatsApp uses webhooks to send customer replies to your CRM. Without this, inbound messages will never appear here.
              </div>

              {/* Step 1: Callback URL */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Step 1 — Set Callback URL
                </label>
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <code className="flex-1 text-xs text-gray-800 break-all font-mono">
                    {webhookInfo?.webhookUrl || 'https://slackcrm-backend.fly.dev/api/v1/integrations/whatsapp/webhook'}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(webhookInfo?.webhookUrl || 'https://slackcrm-backend.fly.dev/api/v1/integrations/whatsapp/webhook');
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="flex-shrink-0 p-1.5 hover:bg-gray-200 rounded-lg transition-all">
                    {copiedWebhook ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">In Meta: App → WhatsApp → Configuration → Edit (Webhook) → Callback URL</p>
              </div>

              {/* Step 2: Verify Token */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Step 2 — Set Verify Token
                </label>

                {/* Current token display */}
                {webhookInfo?.verifyTokenExact ? (
                  <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-xs text-green-700 font-medium mb-1">✅ Your verify token (copy this into Meta exactly):</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono text-green-900 bg-white px-2 py-1 rounded-lg border border-green-200 break-all">
                        {webhookInfo.verifyTokenExact}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(webhookInfo.verifyTokenExact!);
                          setCopiedToken(true);
                          setTimeout(() => setCopiedToken(false), 2000);
                        }}
                        className="flex-shrink-0 p-1.5 hover:bg-green-100 rounded-lg transition-all">
                        {copiedToken ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-green-600" />}
                      </button>
                    </div>
                  </div>
                ) : webhookInfo?.verifyTokenHint ? (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                    ⚠️ A token is set via server environment (starts with <code className="font-mono bg-white px-1 rounded">{webhookInfo.verifyTokenHint}</code>), but you need to know the full value to enter in Meta. Use the form below to set a new token you control.
                  </div>
                ) : (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                    ❌ No verify token configured yet. Use the form below to create one.
                  </div>
                )}

                {/* Set new token */}
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <p className="text-xs text-gray-600 font-medium">Set a new verify token:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customToken}
                      onChange={e => setCustomToken(e.target.value)}
                      placeholder="Enter any secret string (min 8 chars)"
                      className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 font-mono"
                    />
                    <button
                      onClick={generateRandomToken}
                      className="px-3 py-2 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg whitespace-nowrap">
                      Generate
                    </button>
                  </div>
                  {tokenSaveError && <p className="text-xs text-red-600">{tokenSaveError}</p>}
                  <button
                    onClick={saveVerifyToken}
                    disabled={isSavingToken || !customToken.trim()}
                    className="w-full py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 rounded-lg">
                    {isSavingToken ? 'Saving…' : 'Save Token'}
                  </button>
                  <p className="text-xs text-gray-400">After saving, the token will appear above — copy it exactly into Meta&apos;s &quot;Verify Token&quot; field.</p>
                </div>
              </div>

              {/* Step 2b: Test Verification */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Step 2b — Test Webhook Verification
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Click below to test if the webhook verification URL actually works. This simulates what Meta does when you click &quot;Verify and Save&quot;.
                </p>
                <button
                  onClick={runVerificationTest}
                  disabled={isTestingVerification}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 rounded-xl"
                >
                  {isTestingVerification ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Testing…</>
                  ) : (
                    'Test Webhook Verification'
                  )}
                </button>
                {verificationTest && (
                  <div className={`mt-2 p-3 rounded-xl text-xs ${verificationTest.working ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                    <p className="font-semibold mb-1">{verificationTest.working ? '✅ Verification is working!' : '❌ Verification FAILED'}</p>
                    <p>{verificationTest.reason}</p>
                    {verificationTest.fullToken && (
                      <div className="mt-2">
                        <p className="font-medium text-red-700 mb-1">The exact token Meta needs to see:</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 font-mono bg-white px-2 py-1 rounded-lg border border-red-200 break-all text-red-900">{verificationTest.fullToken}</code>
                          <button onClick={() => navigator.clipboard.writeText(verificationTest.fullToken)} className="p-1.5 hover:bg-red-100 rounded-lg">
                            <Copy className="h-3.5 w-3.5 text-red-600" />
                          </button>
                        </div>
                        <p className="mt-1 text-red-600 italic">Go to Meta → WhatsApp → Configuration → Edit → paste this exact value as &quot;Verify Token&quot; → Verify and Save.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Subscribe */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Step 3 — Subscribe to Webhook Fields
                </label>
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700">
                  <p className="text-xs mb-2">After verifying, subscribe to these fields:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['messages', 'message_deliveries', 'message_reads'].map(f => (
                      <span key={f} className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">{f}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 4: Live Mode */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Step 4 — Switch Meta App to Live Mode
                </label>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
                  <p className="font-medium">⚠️ Critical: Real customer messages only work in Live mode.</p>
                  <p>In Meta for Developers → Your App → <strong>App Settings → Basic</strong>, find the &quot;App Mode&quot; toggle and switch from <strong>Development</strong> to <strong>Live</strong>.</p>
                  <p className="text-blue-600">Without this, only test webhooks from the Meta dashboard are delivered — real customer replies are blocked.</p>
                </div>
              </div>

              {/* Live Diagnostic */}
              {diagnostic && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Live Diagnostic
                  </label>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                    {/* Messages received */}
                    <div className={`flex items-start gap-2 text-xs p-2 rounded-lg ${diagnostic.messages.receivedInLast24h > 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      <span className="font-bold text-base leading-none">{diagnostic.messages.receivedInLast24h > 0 ? '✅' : '⚠️'}</span>
                      <div>
                        <p className="font-medium">{diagnostic.messages.receivedInLast24h > 0 ? `${diagnostic.messages.receivedInLast24h} message(s) received in last 24h` : 'No messages received in last 24h'}</p>
                        {diagnostic.messages.lastReceivedAt && (
                          <p className="opacity-75">Last: {new Date(diagnostic.messages.lastReceivedAt).toLocaleString()}</p>
                        )}
                      </div>
                    </div>

                    {/* Server config checks */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: 'Verify Token', ok: diagnostic.checks.verifyToken },
                        { label: 'Access Token', ok: diagnostic.checks.accessToken },
                        { label: 'Phone Number ID', ok: diagnostic.checks.phoneNumberId },
                        { label: 'Integration exists', ok: diagnostic.checks.integrationExists },
                      ].map(c => (
                        <div key={c.label} className={`flex items-center gap-1.5 text-xs p-1.5 rounded-lg ${c.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          <span>{c.ok ? '✅' : '❌'}</span>
                          <span className="font-medium">{c.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Meta checklist items that need manual verification */}
                    <div className="border-t border-gray-200 pt-2">
                      <p className="text-xs font-semibold text-gray-600 mb-1.5">Meta Developer Portal checklist — verify manually:</p>
                      {[
                        { label: 'Webhook URL entered in Meta', hint: 'App → WhatsApp → Configuration → Webhook' },
                        { label: '"Verify and Save" clicked successfully', hint: 'Webhook must show green checkmark' },
                        { label: '"messages" field subscribed', hint: 'Click Manage under Webhook Fields → enable messages' },
                        { label: 'App Mode is LIVE (not Development)', hint: 'App Settings → Basic → App Mode → Live' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs mb-1.5">
                          <span className="text-gray-400 font-mono mt-0.5">{i + 1}.</span>
                          <div>
                            <p className="font-medium text-gray-800">{item.label}</p>
                            <p className="text-gray-500 italic">{item.hint}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick summary */}
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-3">
                <strong>Path in Meta:</strong> App → WhatsApp → Configuration → Edit (Webhook) → paste URL → paste token → Verify and Save → subscribe to &apos;messages&apos; → App Settings → Basic → switch to Live.
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => fetchWebhookInfo()}
                className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-xl"
              >
                Refresh Diagnostic
              </button>
              <button onClick={() => { setShowWebhookSetup(false); setCustomToken(''); setTokenSaveError(''); setVerificationTest(null); }}
                className="px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Send Modal */}
      {showAutoSend && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Auto-Send on New Contact</h3>
                <p className="text-xs text-gray-400 mt-0.5">Send a WhatsApp template when a new contact is created</p>
              </div>
              <button onClick={() => { setShowAutoSend(false); setAutoSendSaveError(''); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rules (first match wins)</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoSendRules(prev => {
                        const nextRule = createAutoSendRule(prev.length);
                        return [...prev, nextRule];
                      });
                    }}
                    className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
                  >
                    + Add rule
                  </button>
                </div>
                <div className="space-y-2">
                  {autoSendRules.map((rule, index) => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => setSelectedAutoSendRuleId(rule.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                        (selectedAutoSendRule?.id === rule.id)
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          #{index + 1} {rule.name || `Rule ${index + 1}`}
                        </p>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {rule.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {rule.templateName || 'No template selected'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {selectedAutoSendRule && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => moveAutoSendRule(selectedAutoSendRule.id, 'up')}
                      disabled={autoSendRules.findIndex(rule => rule.id === selectedAutoSendRule.id) === 0}
                      className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl disabled:opacity-50"
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAutoSendRule(selectedAutoSendRule.id, 'down')}
                      disabled={autoSendRules.findIndex(rule => rule.id === selectedAutoSendRule.id) === autoSendRules.length - 1}
                      className="px-3 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl disabled:opacity-50"
                    >
                      Move down
                    </button>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      type="text"
                      value={selectedAutoSendRule.name}
                      onChange={e => updateSelectedAutoSendRule(rule => ({ ...rule, name: e.target.value }))}
                      placeholder="Rule name (ex: Typeform Welcome)"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAutoSendRules(prev => {
                          if (prev.length <= 1) return prev;
                          return prev
                            .filter(rule => rule.id !== selectedAutoSendRule.id)
                            .map((rule, idx) => ({ ...rule, priority: idx }));
                        });
                      }}
                      disabled={autoSendRules.length <= 1}
                      className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Enable this rule</p>
                      <p className="text-xs text-gray-500 mt-0.5">Only enabled rules are used for auto-send</p>
                    </div>
                    <button
                      onClick={() => updateSelectedAutoSendRule(rule => ({ ...rule, enabled: !rule.enabled }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${selectedAutoSendRule.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${selectedAutoSendRule.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Template config */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Template</p>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-gray-500">Select Template</label>
                        <button
                          type="button"
                          onClick={fetchMetaTemplates}
                          disabled={isLoadingTemplates}
                          className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 disabled:opacity-50">
                          {isLoadingTemplates ? 'Loading…' : '↻ Reload'}
                        </button>
                      </div>
                      {isLoadingTemplates ? (
                        <div className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-400">Loading templates…</div>
                      ) : (
                        <select
                          value={selectedAutoSendRule.templateName}
                          onChange={e => {
                            const selected = metaTemplates.find((t: any) => t.name === e.target.value);
                            const headerType = getTemplateHeaderMediaType(selected);
                            const bodyText = selected?.components?.find((c: any) => c.type === 'BODY')?.text || '';
                            const hasBodyParams = /\{\{\d+\}\}/.test(bodyText);
                            updateSelectedAutoSendRule(rule => ({
                              ...rule,
                              templateName: e.target.value,
                              language: selected?.language || rule.language,
                              includeNameParam: hasBodyParams ? rule.includeNameParam : false,
                              headerMediaType: headerType,
                              headerMediaId: headerType ? rule.headerMediaId : '',
                              headerMediaUrl: headerType ? rule.headerMediaUrl : '',
                            }));
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 bg-white">
                          <option value="">— choose a template —</option>
                          {metaTemplates.filter((t: any) => t.status === 'APPROVED').map((t: any) => (
                            <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                          ))}
                        </select>
                      )}
                      {templatesLoaded && !isLoadingTemplates && metaTemplates.filter((t: any) => t.status === 'APPROVED').length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">No approved templates found. Make sure WABA ID is set in integration settings and you have approved templates in Meta.</p>
                      )}
                      {!templatesLoaded && !isLoadingTemplates && (
                        <p className="text-xs text-gray-400 mt-1">Click ↻ Reload to load your approved templates.</p>
                      )}
                      {templatesLoaded && metaTemplates.filter((t: any) => t.status === 'APPROVED').length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">Only approved templates are listed.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Language Code</label>
                      <input
                        type="text"
                        value={selectedAutoSendRule.language}
                        onChange={e => updateSelectedAutoSendRule(rule => ({ ...rule, language: e.target.value }))}
                        placeholder="e.g. en_US, ro"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100"
                      />
                      <p className="text-xs text-gray-400 mt-1">Auto-filled when you select a template above</p>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAutoSendRule.includeNameParam}
                        onChange={e => updateSelectedAutoSendRule(rule => ({ ...rule, includeNameParam: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 text-green-600 accent-green-600"
                      />
                      <div>
                        <p className="text-sm text-gray-800">Include contact first name as parameter</p>
                        <p className="text-xs text-gray-400">Passes {`{{1}}`} = first name to the template</p>
                      </div>
                    </label>

                    {selectedAutoSendRule.headerMediaType && (
                      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                          Header media required ({selectedAutoSendRule.headerMediaType})
                        </p>
                        <p className="text-xs text-amber-700">
                          This template has a media header. Set a media_id (recommended) or a public URL.
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={selectedAutoSendRule.headerMediaId}
                            onChange={e => updateSelectedAutoSendRule(rule => ({ ...rule, headerMediaId: e.target.value }))}
                            placeholder="Meta media_id (recommended)"
                            className="flex-1 px-3 py-2 text-sm border border-amber-200 rounded-xl focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 bg-white"
                          />
                          <label className="px-3 py-2 text-xs font-medium text-amber-800 border border-amber-300 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors">
                            {isUploadingAutoSendHeader ? 'Uploading…' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              accept={selectedAutoSendRule.headerMediaType === 'image' ? 'image/*' : selectedAutoSendRule.headerMediaType === 'video' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                setIsUploadingAutoSendHeader(true);
                                setAutoSendSaveError('');
                                try {
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  const res = await api.post('/integrations/whatsapp/media/upload', formData, {
                                    params: selectedSenderId ? { integrationId: selectedSenderId } : undefined,
                                  });
                                  updateSelectedAutoSendRule(rule => ({ ...rule, headerMediaId: res.data.id || '', headerMediaUrl: res.data.url || rule.headerMediaUrl }));
                                } catch (err: any) {
                                  setAutoSendSaveError(`Upload failed: ${err?.response?.data?.message || err.message}`);
                                } finally {
                                  setIsUploadingAutoSendHeader(false);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                        </div>
                        <input
                          type="text"
                          value={selectedAutoSendRule.headerMediaUrl}
                          onChange={e => updateSelectedAutoSendRule(rule => ({ ...rule, headerMediaUrl: e.target.value }))}
                          placeholder={`${selectedAutoSendRule.headerMediaType} URL (fallback if no media_id)`}
                          className="w-full px-3 py-2 text-sm border border-amber-200 rounded-xl focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 bg-white"
                        />
                      </div>
                    )}
                  </div>

                  {/* Source filter */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter by Source</p>
                    <p className="text-xs text-gray-400">Leave all unchecked to send for contacts from any source</p>
                    <div className="grid grid-cols-2 gap-2">
                      {AUTO_SEND_SOURCES.map(src => (
                        <label key={src} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedAutoSendRule.conditions.sources.includes(src)}
                            onChange={e => updateSelectedAutoSendRule(rule => ({
                              ...rule,
                              conditions: {
                                ...rule.conditions,
                                sources: e.target.checked
                                  ? [...rule.conditions.sources, src]
                                  : rule.conditions.sources.filter(source => source !== src),
                              },
                            }))}
                            className="h-4 w-4 rounded border-gray-300 accent-green-600"
                          />
                          <span className="text-sm text-gray-700 capitalize">{src}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {selectedAutoSendRule.conditions.sources.includes('typeform') && (
                    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                      <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Typeform Form Filter</p>
                      <p className="text-xs text-sky-600">Choose one or more Typeform forms for this rule.</p>

                      {isLoadingTypeformForms ? (
                        <p className="text-xs text-sky-600">Loading connected forms...</p>
                      ) : typeformForms.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                          {typeformForms.map(form => (
                            <label key={form.formId} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-sky-100/70">
                              <input
                                type="checkbox"
                                checked={selectedAutoSendRule.conditions.typeformFormIds.includes(form.formId)}
                                onChange={e => updateSelectedAutoSendRule(rule => ({
                                  ...rule,
                                  conditions: {
                                    ...rule.conditions,
                                    typeformFormIds: e.target.checked
                                      ? [...rule.conditions.typeformFormIds, form.formId]
                                      : rule.conditions.typeformFormIds.filter(id => id !== form.formId),
                                  },
                                }))}
                                className="h-4 w-4 rounded border-gray-300 accent-green-600"
                              />
                              <span className="text-sm text-gray-700 truncate">{form.name}</span>
                              <span className="text-[11px] text-gray-400">{form.formId}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-sky-600">No connected Typeform forms found. You can still add form ID manually.</p>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={typeformFormInput}
                          onChange={(e) => setTypeformFormInput(e.target.value)}
                          placeholder="Typeform formId"
                          className="flex-1 px-3 py-2 text-sm border border-sky-200 rounded-xl focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const formId = typeformFormInput.trim();
                            if (!formId) return;
                            updateSelectedAutoSendRule(rule => ({
                              ...rule,
                              conditions: {
                                ...rule.conditions,
                                typeformFormIds: rule.conditions.typeformFormIds.includes(formId)
                                  ? rule.conditions.typeformFormIds
                                  : [...rule.conditions.typeformFormIds, formId],
                              },
                            }));
                            setTypeformFormInput('');
                          }}
                          className="px-3 py-2 text-xs font-medium text-sky-700 bg-white border border-sky-300 rounded-xl hover:bg-sky-100"
                        >
                          Add ID
                        </button>
                      </div>

                      {selectedAutoSendRule.conditions.typeformFormIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedAutoSendRule.conditions.typeformFormIds.map(formId => (
                            <button
                              type="button"
                              key={formId}
                              onClick={() => updateSelectedAutoSendRule(rule => ({
                                ...rule,
                                conditions: {
                                  ...rule.conditions,
                                  typeformFormIds: rule.conditions.typeformFormIds.filter(id => id !== formId),
                                },
                              }))}
                              className="px-2 py-1 text-[11px] font-medium text-sky-700 bg-white border border-sky-300 rounded-full hover:bg-sky-100"
                            >
                              {formId} ✕
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status filter */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter by Status</p>
                    <p className="text-xs text-gray-400">Leave all unchecked to send for any contact status</p>
                    <div className="grid grid-cols-2 gap-2">
                      {AUTO_SEND_STATUSES.map(st => (
                        <label key={st} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedAutoSendRule.conditions.statuses.includes(st)}
                            onChange={e => updateSelectedAutoSendRule(rule => ({
                              ...rule,
                              conditions: {
                                ...rule.conditions,
                                statuses: e.target.checked
                                  ? [...rule.conditions.statuses, st]
                                  : rule.conditions.statuses.filter(status => status !== st),
                              },
                            }))}
                            className="h-4 w-4 rounded border-gray-300 accent-green-600"
                          />
                          <span className="text-sm text-gray-700 capitalize">{st}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Require phone */}
                  <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-xl">
                    <input
                      type="checkbox"
                      checked={selectedAutoSendRule.conditions.requirePhone}
                      onChange={e => updateSelectedAutoSendRule(rule => ({
                        ...rule,
                        conditions: { ...rule.conditions, requirePhone: e.target.checked },
                      }))}
                      className="h-4 w-4 rounded border-gray-300 accent-green-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">Only send if contact has a phone number</p>
                      <p className="text-xs text-gray-400">Skip contacts without a phone — recommended</p>
                    </div>
                  </label>
                </>
              )}

              {autoSendSaveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{autoSendSaveError}</p>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => { setShowAutoSend(false); setAutoSendSaveError(''); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">
                Cancel
              </button>
              <button
                onClick={saveAutoSendConfig}
                disabled={
                  isSavingAutoSend
                  || autoSendRules.length === 0
                  || autoSendRules.some(rule => (
                    rule.enabled
                    && (
                      !rule.templateName.trim()
                      || (rule.headerMediaType !== '' && !rule.headerMediaId.trim() && !rule.headerMediaUrl.trim())
                    )
                  ))
                }
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {isSavingAutoSend ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Auto-Reply Settings Modal */}
      {showAISettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">AI Auto-Reply</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Powered by Claude AI — responds when no keyword rules match</p>
                </div>
              </div>
              <button onClick={() => { setShowAISettings(false); setAiSaveError(''); }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Master toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900">Enable AI Replies</p>
                  <p className="text-xs text-gray-500 mt-0.5">AI will respond to inbound messages when no keyword auto-response matches</p>
                </div>
                <button onClick={() => setAiEnabled(!aiEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${aiEnabled ? 'bg-purple-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* System prompt */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">System Prompt</p>
                <p className="text-xs text-gray-400">Instructions that define how the AI should respond to customers</p>
                <textarea
                  value={aiSystemPrompt}
                  onChange={e => setAiSystemPrompt(e.target.value)}
                  rows={5}
                  placeholder="You are a helpful customer service assistant. Answer customer questions concisely and professionally..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 resize-none font-mono"
                />
                <p className="text-xs text-gray-400">Leave empty for default prompt. The AI also receives contact info and message history for context.</p>
              </div>

              {/* Max tokens */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Max Response Length</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={50}
                    max={1000}
                    step={50}
                    value={aiMaxTokens}
                    onChange={e => setAiMaxTokens(parseInt(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <span className="text-sm font-medium text-gray-700 w-16 text-right">{aiMaxTokens} tokens</span>
                </div>
                <p className="text-xs text-gray-400">~{Math.round(aiMaxTokens * 0.75)} words maximum per reply</p>
              </div>

              {/* Fallback option */}
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-xl">
                <input type="checkbox" checked={aiFallbackToKeywords} onChange={e => setAiFallbackToKeywords(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-purple-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Keyword rules take priority</p>
                  <p className="text-xs text-gray-400">AI only replies when no keyword auto-response matches</p>
                </div>
              </label>

              {/* Divider */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Test AI Reply</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiTestMessage}
                      onChange={e => setAiTestMessage(e.target.value)}
                      placeholder="Type a test message..."
                      onKeyDown={e => { if (e.key === 'Enter') testAIReply(); }}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                    />
                    <button
                      onClick={testAIReply}
                      disabled={isTestingAI || !aiTestMessage.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 rounded-xl disabled:opacity-50 flex items-center gap-2"
                    >
                      {isTestingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Test
                    </button>
                  </div>
                  {aiTestReply && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                      <p className="text-xs font-medium text-purple-600 mb-1">AI Response:</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{aiTestReply}</p>
                    </div>
                  )}
                  {aiTestError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600">{aiTestError}</p>
                    </div>
                  )}
                </div>
              </div>

              {aiSaveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{aiSaveError}</p>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => { setShowAISettings(false); setAiSaveError(''); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">
                Cancel
              </button>
              <button onClick={saveAIConfig} disabled={isSavingAI}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-500 hover:bg-purple-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {isSavingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
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

      {/* ── Conversation Flows Modal ── */}
      {showFlowEditor && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { setShowFlowEditor(false); setEditingFlow(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-green-600" />
                <h2 className="text-lg font-bold text-gray-900">{editingFlow ? 'Edit Flow' : 'Conversation Flows'}</h2>
              </div>
              <button onClick={() => { if (editingFlow) { setEditingFlow(null); } else { setShowFlowEditor(false); } }}>
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {editingFlow ? (
                /* ── Flow Editor ── */
                <div className="space-y-4">
                  {/* Flow name + trigger */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Flow Name</label>
                      <input type="text" value={editingFlow.name} onChange={e => setEditingFlow({ ...editingFlow, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Trigger</label>
                      <select value={editingFlow.trigger} onChange={e => setEditingFlow({ ...editingFlow, trigger: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 bg-white">
                        <option value="first_message">First Message (new contacts)</option>
                        <option value="keyword">Keyword</option>
                        <option value="after_auto_send">No Reply After Auto-Send</option>
                        <option value="before_meeting">Before Meeting (Calendar reminder)</option>
                      </select>
                    </div>
                  </div>
                  {editingFlow.trigger === 'keyword' && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Keywords (comma-separated)</label>
                      <input type="text" value={editingFlow.triggerKeyword || ''} onChange={e => setEditingFlow({ ...editingFlow, triggerKeyword: e.target.value })}
                        placeholder="menu, start, info" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                    </div>
                  )}
                  {editingFlow.trigger === 'after_auto_send' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-gray-400">
                        Arms the moment an Auto-Send rule (see the Auto-Send tab) sends a message — nothing else to wire up. See Step 1 below.
                      </p>
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">Only for this Auto-Send rule</label>
                        <select value={editingFlow.autoSendRuleId || ''} onChange={e => setEditingFlow({ ...editingFlow, autoSendRuleId: e.target.value || undefined })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 bg-white">
                          <option value="">Any Auto-Send rule</option>
                          {autoSendRules.map((rule) => (
                            <option key={rule.id} value={rule.id}>{rule.name || rule.id}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-gray-400">
                          Leave as "Any" and every auto-sent message arms this flow. Pick a specific rule so contacts hit by other rules don't enter it.
                        </p>
                      </div>
                    </div>
                  )}
                  {editingFlow.trigger === 'before_meeting' && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Send reminder this many hours before the meeting</label>
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} value={editingFlow.reminderHoursBefore ?? 3}
                          onChange={e => setEditingFlow({ ...editingFlow, reminderHoursBefore: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400" />
                        <span className="text-xs text-gray-500">hours before</span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-400">
                        Requires the calendar event to have a linked contact with a phone number. In any later step's message (e.g. the "Yes" branch), write {'{{meetingLink}}'} anywhere in the text — it's replaced with the real meeting link when sent.
                      </p>
                    </div>
                  )}

                  {/* Steps */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-700">Steps</h3>
                      <button onClick={addFlowStep} className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Add Step
                      </button>
                    </div>

                    {editingFlow.steps.map((step: any, si: number) => (
                      <div key={step.id} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white bg-green-500 rounded-full w-5 h-5 flex items-center justify-center">{si + 1}</span>
                            <span className="text-xs font-medium text-gray-500">Step: {step.id}</span>
                          </div>
                          {editingFlow.steps.length > 1 && (
                            <button onClick={() => removeFlowStep(si)} className="text-gray-400 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Step ID */}
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={step.id} onChange={e => updateFlowStep(si, 'id', e.target.value)}
                            placeholder="step_id" className="w-full px-3 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={Math.max(0, Math.floor(Number(step.delayMs || 0) / 1000))}
                              onChange={e => {
                                const seconds = Math.max(0, Number(e.target.value) || 0);
                                updateFlowStep(si, 'delayMs', Math.floor(seconds * 1000));
                              }}
                              className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400"
                              placeholder="Delay seconds"
                            />
                            <span className="text-[10px] text-gray-400 whitespace-nowrap">sec delay</span>
                          </div>
                        </div>

                        {si === 0 && editingFlow.trigger === 'after_auto_send' ? (
                          /* Step 1 for this trigger is a placeholder — the Auto-Send rule
                             already sent the real message. This step only exists to carry
                             the "No-reply follow-up" delay configured below. */
                          <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
                            No message is sent for this step — your Auto-Send rule already covered that. Just set "No-reply follow-up" below: how long to wait, and which step to send if the contact stays silent.
                          </div>
                        ) : si === 0 ? (
                          /* Step 1: Template-based (required to initiate conversations) */
                          <div className="space-y-2">
                            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
                              First step must use an approved template. Buttons from the template will auto-load below.
                            </div>
                            <div className="flex gap-1.5">
                            <select value={step.templateName || ''} onChange={e => applyTemplateToStep(si, e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white">
                              <option value="">Select an approved template...</option>
                              {metaTemplates.filter((t: any) => t.status === 'APPROVED').map((t: any) => (
                                <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                              ))}
                            </select>
                            <button type="button" onClick={fetchMetaTemplates} disabled={isLoadingTemplates}
                              className="px-2 py-2 text-xs text-gray-500 hover:text-green-600 border border-gray-200 rounded-lg hover:border-green-300 transition-colors flex-shrink-0"
                              title="Reload templates">
                              {isLoadingTemplates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </button>
                            </div>
                            {step.templateName && (
                              <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg p-2 space-y-1">
                                <strong>{step.templateName}</strong> ({step.templateLanguage || 'en_US'})
                                {step.message && <p className="mt-1 text-gray-400">{step.message}</p>}
                                {(step.buttons || []).length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {step.buttons.map((b: any) => (
                                      <span key={b.id} className="inline-block px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 rounded-full">
                                        {b.title}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : step.type === 'template' ? (
                          /* Steps 2+ in Template mode: same approved-template picker as Step 1 */
                          <div className="space-y-2">
                            <div className="flex gap-1">
                              <button type="button" onClick={() => updateFlowStep(si, 'type', undefined)}
                                className="px-2 py-1 text-[11px] rounded-lg font-medium text-gray-500 hover:bg-gray-100">
                                Message
                              </button>
                              <button type="button" onClick={() => {}}
                                className="px-2 py-1 text-[11px] rounded-lg font-medium bg-green-100 text-green-700">
                                Template
                              </button>
                            </div>
                            <div className="flex gap-1.5">
                              <select value={step.templateName || ''} onChange={e => applyTemplateToStep(si, e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white">
                                <option value="">Select an approved template...</option>
                                {metaTemplates.filter((t: any) => t.status === 'APPROVED').map((t: any) => (
                                  <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                                ))}
                              </select>
                              <button type="button" onClick={fetchMetaTemplates} disabled={isLoadingTemplates}
                                className="px-2 py-2 text-xs text-gray-500 hover:text-green-600 border border-gray-200 rounded-lg hover:border-green-300 transition-colors flex-shrink-0"
                                title="Reload templates">
                                {isLoadingTemplates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              </button>
                            </div>
                            {step.templateName && (
                              <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg p-2 space-y-1">
                                <strong>{step.templateName}</strong> ({step.templateLanguage || 'en_US'})
                                {step.message && <p className="mt-1 text-gray-400">{step.message}</p>}
                                {(step.buttons || []).length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {step.buttons.map((b: any) => (
                                      <span key={b.id} className="inline-block px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 rounded-full">
                                        {b.title}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            <p className="text-[10px] text-gray-400">
                              Templates can send outside the 24h session window and re-open a conversation — useful for a longer follow-up delay.
                            </p>
                          </div>
                        ) : (
                          /* Steps 2+ in Message mode: plain interactive message (within 24h session window) */
                          <div className="space-y-2">
                            <div className="flex gap-1">
                              <button type="button" onClick={() => {}}
                                className="px-2 py-1 text-[11px] rounded-lg font-medium bg-green-100 text-green-700">
                                Message
                              </button>
                              <button type="button" onClick={() => updateFlowStep(si, 'type', 'template')}
                                className="px-2 py-1 text-[11px] rounded-lg font-medium text-gray-500 hover:bg-gray-100">
                                Template
                              </button>
                            </div>
                            <textarea value={step.message} onChange={e => updateFlowStep(si, 'message', e.target.value)}
                              placeholder="Message text..." rows={2}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 resize-none" />
                            {/* Media attachment */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <select value={step.mediaType || ''} onChange={e => {
                                  updateFlowStep(si, 'mediaType', e.target.value || undefined);
                                  if (!e.target.value) { updateFlowStep(si, 'mediaUrl', undefined); updateFlowStep(si, 'mediaId', undefined); updateFlowStep(si, 'mediaFileName', undefined); }
                                }}
                                  className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white">
                                  <option value="">No media</option>
                                  <option value="image">Image</option>
                                  <option value="video">Video</option>
                                  <option value="document">Document</option>
                                  <option value="audio">Audio</option>
                                </select>
                                {step.mediaType && !step.mediaId && (
                                  <>
                                    <label className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors">
                                      <Upload className="h-3 w-3" />
                                      Upload
                                      <input type="file" className="hidden"
                                        accept={step.mediaType === 'image' ? 'image/*' : step.mediaType === 'video' ? 'video/*' : step.mediaType === 'document' ? '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt' : 'audio/*'}
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          updateFlowStep(si, 'mediaFileName', `Uploading ${file.name}...`);
                                          try {
                                            const formData = new FormData();
                                            formData.append('file', file);
                                            const res = await api.post('/integrations/whatsapp/media/upload', formData, {
                                              params: selectedSenderId ? { integrationId: selectedSenderId } : undefined,
                                            });
                                            updateFlowStep(si, 'mediaId', res.data.id);
                                            updateFlowStep(si, 'mediaUrl', res.data.url || undefined);
                                            updateFlowStep(si, 'mediaFileName', file.name);
                                          } catch (err: any) {
                                            updateFlowStep(si, 'mediaFileName', undefined);
                                            alert('Upload failed: ' + (err.response?.data?.message || err.message));
                                          }
                                          e.target.value = '';
                                        }}
                                      />
                                    </label>
                                  </>
                                )}
                              </div>
                              {step.mediaType && step.mediaId && (
                                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                                  <Check className="h-3 w-3 text-green-600 flex-shrink-0" />
                                  <span className="text-xs text-green-700 truncate flex-1">{step.mediaFileName || 'File uploaded'}</span>
                                  <button type="button" onClick={() => { updateFlowStep(si, 'mediaId', undefined); updateFlowStep(si, 'mediaFileName', undefined); }}
                                    className="text-red-400 hover:text-red-600 flex-shrink-0"><X className="h-3 w-3" /></button>
                                </div>
                              )}
                              {step.mediaType && !step.mediaId && step.mediaFileName?.startsWith('Uploading') && (
                                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin flex-shrink-0" />
                                  <span className="text-xs text-blue-600 truncate">{step.mediaFileName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {(step.buttons || []).length > 0 && (
                          <label className="flex items-center gap-2 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={step.fallbackOnTextReply === true}
                              onChange={e => updateFlowStep(si, 'fallbackOnTextReply', e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-gray-300 accent-green-600"
                            />
                            If contact replies with text instead of button, continue on first button path
                          </label>
                        )}

                        {/* Buttons */}
                        {!(si === 0 && editingFlow.trigger === 'after_auto_send') && (
                        <div className="space-y-1.5">
                          {step.type === 'template' ? (
                            /* Template steps: buttons are auto-loaded from the approved template, title is read-only */
                            <>
                              {(step.buttons || []).length > 0 && (
                                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Template buttons → map to next steps:</p>
                              )}
                              {(step.buttons || []).map((btn: any, bi: number) => (
                                <div key={bi} className="flex items-center gap-2">
                                  <span className="flex-1 px-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-700 truncate">
                                    {btn.title}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                  <select value={btn.nextStepId} onChange={e => updateStepButton(si, bi, 'nextStepId', e.target.value)}
                                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white">
                                    <option value="">-- Select step --</option>
                                    {editingFlow.steps.filter((s: any) => s.id !== step.id).map((s: any) => (
                                      <option key={s.id} value={s.id}>{s.id}</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                              {(step.buttons || []).length === 0 && step.templateName && (
                                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                  This template has no Quick Reply buttons. Select a template with buttons to enable flow branching.
                                </p>
                              )}
                            </>
                          ) : (
                            /* Message-mode steps: editable interactive buttons */
                            <>
                              {(step.buttons || []).map((btn: any, bi: number) => (
                                <div key={bi} className="flex items-center gap-2">
                                  <input type="text" value={btn.title} onChange={e => updateStepButton(si, bi, 'title', e.target.value)}
                                    placeholder="Button title (max 20)" maxLength={20}
                                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                                  <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                  <select value={btn.nextStepId} onChange={e => updateStepButton(si, bi, 'nextStepId', e.target.value)}
                                    className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white">
                                    <option value="">-- Select step --</option>
                                    {editingFlow.steps.filter((s: any) => s.id !== step.id).map((s: any) => (
                                      <option key={s.id} value={s.id}>{s.id}</option>
                                    ))}
                                  </select>
                                  <button onClick={() => removeStepButton(si, bi)} className="text-gray-400 hover:text-red-500">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              {(step.buttons || []).length < 3 && (
                                <button onClick={() => addStepButton(si)} className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1">
                                  <Plus className="h-3 w-3" /> Add Button
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        )}

                        {/* No-reply follow-up: if nothing (no button/keyword match) arrives in time, auto-advance */}
                        <div className="border-t border-gray-200 pt-2 mt-1">
                          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                            <input
                              type="checkbox"
                              checked={!!step.timeoutBranch}
                              onChange={e => updateFlowStep(si, 'timeoutBranch', e.target.checked
                                ? { delayValue: 1, delayUnit: 'hours', nextStepId: '' }
                                : undefined)}
                              className="h-3.5 w-3.5 rounded border-gray-300 accent-green-600"
                            />
                            No-reply follow-up
                          </label>
                          {step.timeoutBranch && (
                            <div className="mt-1.5 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-gray-500 whitespace-nowrap">If no reply within</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={step.timeoutBranch.delayValue}
                                  onChange={e => updateFlowStep(si, 'timeoutBranch', {
                                    ...step.timeoutBranch,
                                    delayValue: Math.max(1, Number(e.target.value) || 1),
                                  })}
                                  className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400"
                                />
                                <select
                                  value={step.timeoutBranch.delayUnit}
                                  onChange={e => updateFlowStep(si, 'timeoutBranch', { ...step.timeoutBranch, delayUnit: e.target.value })}
                                  className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white"
                                >
                                  <option value="minutes">minutes</option>
                                  <option value="hours">hours</option>
                                  <option value="days">days</option>
                                </select>
                                <span className="text-[10px] text-gray-400 whitespace-nowrap">(max 7 days)</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-gray-500 whitespace-nowrap">send step</span>
                                <select
                                  value={step.timeoutBranch.nextStepId}
                                  onChange={e => updateFlowStep(si, 'timeoutBranch', { ...step.timeoutBranch, nextStepId: e.target.value })}
                                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white"
                                >
                                  <option value="">-- Select step --</option>
                                  {editingFlow.steps.filter((s: any) => s.id !== step.id).map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.id}</option>
                                  ))}
                                </select>
                              </div>
                              {(() => {
                                const unitMs = step.timeoutBranch.delayUnit === 'days' ? 86400000 : step.timeoutBranch.delayUnit === 'hours' ? 3600000 : 60000;
                                const ms = Number(step.timeoutBranch.delayValue || 0) * unitMs;
                                return ms > 20 * 3600000 ? (
                                  <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                    This may fire after WhatsApp's 24h window closes — the target step should use an approved template, or delivery may fail.
                                  </p>
                                ) : null;
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Save / Cancel */}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setEditingFlow(null)} className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">
                      Cancel
                    </button>
                    <button onClick={handleSaveFlow} disabled={isSavingFlows || !editingFlow.name.trim()}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-500 hover:bg-green-600 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                      {isSavingFlows ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Flow
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Flow List ── */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Automated multi-step conversations with interactive buttons.</p>
                    <button onClick={createNewFlow} className="px-3 py-1.5 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg flex items-center gap-1">
                      <Plus className="h-3 w-3" /> New Flow
                    </button>
                  </div>

                  {isLoadingFlows ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
                  ) : flows.length === 0 ? (
                    <div className="text-center py-8">
                      <GitBranch className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No flows yet. Create your first conversation flow!</p>
                      <p className="text-xs text-gray-400 mt-1">Flows let you build chatbot conversations with buttons.</p>
                    </div>
                  ) : (
                    flows.map(flow => (
                      <div key={flow.id} className="border border-gray-200 rounded-xl p-3 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-gray-900 truncate">{flow.name}</h4>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${flow.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {flow.enabled ? 'Active' : 'Off'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {flow.trigger === 'first_message'
                              ? 'Triggers on first message'
                              : flow.trigger === 'after_auto_send'
                                ? 'Triggers after auto-send contact reply'
                                : `Keyword: "${flow.triggerKeyword}"`}
                            {' '}&middot; {flow.steps?.length || 0} steps
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button onClick={() => handleToggleFlow(flow.id)} className={`p-1.5 rounded-lg transition-all ${flow.enabled ? 'bg-green-100 text-green-600 hover:bg-green-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`} title={flow.enabled ? 'Disable' : 'Enable'}>
                            <Zap className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditingFlow({ ...flow })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Edit">
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDeleteFlow(flow.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Test Flow */}
                  {flows.length > 0 && (
                    <div className="border-t border-gray-100 pt-3 mt-3">
                      <h4 className="text-xs font-bold text-gray-500 mb-2">Test a Flow</h4>
                      <div className="flex gap-2">
                        <input type="text" value={flowTestPhone} onChange={e => setFlowTestPhone(e.target.value)}
                          placeholder="Phone number (e.g. 40712345678)"
                          className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />
                        <select onChange={e => { if (e.target.value) handleTestFlow(e.target.value); }}
                          className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-green-400"
                          defaultValue="">
                          <option value="" disabled>Send flow...</option>
                          {flows.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                      {flowTestResult && (
                        <p className={`text-xs mt-1.5 ${flowTestResult.includes('Fail') || flowTestResult.includes('Enter') ? 'text-red-500' : 'text-green-600'}`}>
                          {flowTestResult}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
