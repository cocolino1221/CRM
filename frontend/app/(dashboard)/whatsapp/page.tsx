'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageCircle, Send, Search, Phone, User, RefreshCw, Clock,
  CheckCheck, Check, Loader2, Settings, Plus, Smile, Paperclip,
  Image, FileText, Mic, Video, Info, X, Zap, LayoutTemplate,
  Building2, Tag, Star, AlertTriangle, Timer, Edit, Trash2,
  Copy, ExternalLink, Mail, Briefcase, ArrowRight, ChevronLeft, Brain,
  GitBranch, Upload,
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
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
  messages: WhatsAppActivity[];
  unreadCount: number;
  lastInboundTime: string | null;
  assignment?: ConvAssignment;
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

// Convert a Meta API template object to the local WhatsAppTemplate format
function toSendableTemplate(t: any): WhatsAppTemplate {
  const bodyComponent = t.components?.find((c: any) => c.type === 'BODY');
  const bodyText = bodyComponent?.text || t.name;
  const paramCount = (bodyText.match(/\{\{\d+\}\}/g) || []).length;
  return {
    id: t.id || t.name,
    name: t.name,
    displayName: t.name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
    language: t.language || 'en_US',
    body: bodyText,
    parameterCount: paramCount,
    category: (t.category || 'utility').toLowerCase() as any,
  };
}

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
  const [convFilter, setConvFilter] = useState<'all' | 'unread' | 'assigned'>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mobile layout: 'list' shows conv list, 'chat' shows selected chat
  const [mobilePanel, setMobilePanel] = useState<'list' | 'chat'>('list');

  // Delete conversation
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);

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

  // "/" slash command dropdown
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashSearch, setSlashSearch] = useState('');

  // Attachment
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'image' | 'document' | 'video'>('image');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentCaption, setAttachmentCaption] = useState('');

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
  const [autoSendEnabled, setAutoSendEnabled] = useState(false);
  const [autoSendTemplate, setAutoSendTemplate] = useState('hello_world');
  const [autoSendLanguage, setAutoSendLanguage] = useState('en_US');
  const [autoSendIncludeName, setAutoSendIncludeName] = useState(false);
  const [autoSendSources, setAutoSendSources] = useState<string[]>([]);
  const [autoSendStatuses, setAutoSendStatuses] = useState<string[]>([]);
  const [autoSendRequirePhone, setAutoSendRequirePhone] = useState(true);
  const [isSavingAutoSend, setIsSavingAutoSend] = useState(false);
  const [autoSendSaveError, setAutoSendSaveError] = useState('');

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

  // ─── Conversation Flows ─────────────────────────────────
  const [showFlowEditor, setShowFlowEditor] = useState(false);
  const [flows, setFlows] = useState<any[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);
  const [isSavingFlows, setIsSavingFlows] = useState(false);
  const [editingFlow, setEditingFlow] = useState<any | null>(null);
  const [flowTestPhone, setFlowTestPhone] = useState('');
  const [flowTestResult, setFlowTestResult] = useState<string | null>(null);

  // ─── Effects ──────────────────────────────────────────────

  useEffect(() => {
    fetchInbox();
    fetchWebhookInfo();
    fetchAutoResponses();
    fetchAutoSend();
    fetchAssignments();
    fetchTeamUsers();
    // Poll every 5 seconds for near-real-time inbox updates
    const interval = setInterval(fetchInbox, 5000);
    // Also refresh when the user tabs back to the page
    const onVisible = () => { if (document.visibilityState === 'visible') fetchInbox(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
      setAutoSendEnabled(cfg.enabled ?? false);
      setAutoSendTemplate(cfg.templateName || 'hello_world');
      setAutoSendLanguage(cfg.language || 'en_US');
      setAutoSendIncludeName(cfg.includeNameParam ?? false);
      setAutoSendSources(cfg.conditions?.sources || []);
      setAutoSendStatuses(cfg.conditions?.statuses || []);
      setAutoSendRequirePhone(cfg.conditions?.requirePhone ?? true);
    } catch { /* silent */ }
  };

  const saveAutoSendConfig = async () => {
    setIsSavingAutoSend(true);
    setAutoSendSaveError('');
    try {
      await api.post('/integrations/whatsapp/auto-send', {
        enabled: autoSendEnabled,
        templateName: autoSendTemplate.trim(),
        language: autoSendLanguage.trim() || 'en',
        includeNameParam: autoSendIncludeName,
        conditions: {
          sources: autoSendSources.length > 0 ? autoSendSources : undefined,
          statuses: autoSendStatuses.length > 0 ? autoSendStatuses : undefined,
          requirePhone: autoSendRequirePhone,
        },
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
      const body = user ? { userId: user.id, userName: `${user.firstName} ${user.lastName}`.trim(), color } : null;
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
    markAsRead(conv.waId);
    conv.unreadCount = 0;
    setConversations(prev => prev.map(c => c.waId === conv.waId ? { ...c, unreadCount: 0 } : c));
    if (conv.contactId) {
      fetchContactDetail(conv.contactId);
    } else {
      setContactDetail(null);
    }
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
      // Delete activities for this waId on the server
      await api.delete(`/integrations/whatsapp/conversation/${waId}`);
    } catch {
      // If server fails, refresh to restore
      await fetchInbox();
    } finally {
      setDeletingConvId(null);
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
      let endpoint: string;
      let body: any;
      if (attachmentType === 'image') {
        endpoint = '/integrations/whatsapp/send/image';
        body = { to: selectedConv.waId, imageUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined };
      } else if (attachmentType === 'video') {
        endpoint = '/integrations/whatsapp/send/video';
        body = { to: selectedConv.waId, videoUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined };
      } else {
        endpoint = '/integrations/whatsapp/send/document';
        body = { to: selectedConv.waId, documentUrl: attachmentUrl.trim(), caption: attachmentCaption.trim() || undefined };
      }
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

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.contactName.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    if (!matchesSearch) return false;
    if (convFilter === 'unread') return c.unreadCount > 0;
    if (convFilter === 'assigned') return !!assignments[c.waId];
    return true;
  });

  // Group conversations by date for Brevo-style display
  const groupedConversations = (() => {
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
  })();

  const sessionStatus = selectedConv ? getSessionStatus(selectedConv) : 'closed';
  const sessionOpen = sessionStatus === 'open' || sessionStatus === 'closing';

  // True if this conversation has NEVER received an inbound message
  const hasEverReceivedInbound = selectedConv?.messages.some(m => m.direction === 'inbound') ?? false;
  // True if webhooks may not be configured (no inbound messages across all conversations)
  const noInboundEver = conversations.length > 0 && conversations.every(c => !c.lastInboundTime);

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
      const res = await api.get('/integrations/whatsapp/campaigns');
      setCampaigns(res.data || []);
    } catch { /* silent */ }
    finally { setIsLoadingCampaigns(false); }
  };

  const previewAudience = async () => {
    setIsPreviewingAudience(true);
    try {
      const res = await api.post('/integrations/whatsapp/campaigns/preview-audience', {
        tags: campFilterTags.length > 0 ? campFilterTags : undefined,
        status: campFilterStatus.length > 0 ? campFilterStatus : undefined,
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
          message: '',
          buttons: [
            { id: `btn_${Date.now()}_a`, title: 'Option 1', nextStepId: 'step_1' },
            { id: `btn_${Date.now()}_b`, title: 'Option 2', nextStepId: 'step_2' },
          ],
        },
        { id: 'step_1', message: 'You selected Option 1. Here is more info...', buttons: [] },
        { id: 'step_2', message: 'You selected Option 2. Here is more info...', buttons: [] },
      ],
    };
    setEditingFlow(newFlow);
  };

  const handleSaveFlow = async () => {
    if (!editingFlow) return;

    // Basic validation: template selected for step 0 and all buttons mapped
    const stepIds = new Set(editingFlow.steps.map((s: any) => s.id));
    if (!editingFlow.steps[0]?.templateName) {
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
    if (!editingFlow) return;
    const steps = [...editingFlow.steps];
    steps[stepIndex] = { ...steps[stepIndex], [field]: value };
    setEditingFlow({ ...editingFlow, steps });
  };

  const addFlowStep = () => {
    if (!editingFlow) return;
    const stepId = `step_${editingFlow.steps.length}`;
    setEditingFlow({
      ...editingFlow,
      steps: [...editingFlow.steps, { id: stepId, message: '', buttons: [] }],
    });
  };

  const removeFlowStep = (stepIndex: number) => {
    if (!editingFlow || editingFlow.steps.length <= 1) return;
    const removedId = editingFlow.steps[stepIndex].id;
    const steps = editingFlow.steps.filter((_: any, i: number) => i !== stepIndex);
    // Clean up button references to removed step
    for (const step of steps) {
      if (step.buttons) {
        step.buttons = step.buttons.map((b: any) =>
          b.nextStepId === removedId ? { ...b, nextStepId: '' } : b
        );
      }
    }
    setEditingFlow({ ...editingFlow, steps });
  };

  const addStepButton = (stepIndex: number) => {
    if (!editingFlow) return;
    const steps = [...editingFlow.steps];
    const step = steps[stepIndex];
    if ((step.buttons || []).length >= 3) return; // Meta limit
    const buttons = [...(step.buttons || []), { id: `btn_${Date.now()}`, title: '', nextStepId: '' }];
    steps[stepIndex] = { ...step, buttons };
    setEditingFlow({ ...editingFlow, steps });
  };

  const removeStepButton = (stepIndex: number, btnIndex: number) => {
    if (!editingFlow) return;
    const steps = [...editingFlow.steps];
    const step = steps[stepIndex];
    const buttons = (step.buttons || []).filter((_: any, i: number) => i !== btnIndex);
    steps[stepIndex] = { ...step, buttons };
    setEditingFlow({ ...editingFlow, steps });
  };

  const updateStepButton = (stepIndex: number, btnIndex: number, field: string, value: string) => {
    if (!editingFlow) return;
    const steps = [...editingFlow.steps];
    const step = steps[stepIndex];
    const buttons = [...(step.buttons || [])];
    buttons[btnIndex] = { ...buttons[btnIndex], [field]: value };
    steps[stepIndex] = { ...step, buttons };
    setEditingFlow({ ...editingFlow, steps });
  };

  // ─── Render ───────────────────────────────────────────────

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
              <button onClick={() => { setShowCreateCampaign(!showCreateCampaign); setCampaignError(''); setAudiencePreview(null); }}
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-green-500 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-bold text-gray-900">Chats</span>
              {conversations.length > 0 && (
                <span className="text-xs font-medium text-gray-400">{conversations.length}</span>
              )}
            </div>
            <div className="flex gap-0.5">
              <button onClick={() => { setShowNewConversation(true); if (metaTemplates.length === 0) fetchMetaTemplates(); }} className="p-1.5 rounded-lg bg-green-500 hover:bg-green-600 transition-all shadow-sm" title="New conversation">
                <Plus className="h-3.5 w-3.5 text-white" />
              </button>
              <button onClick={fetchInbox} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Refresh">
                <RefreshCw className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowAutoResponses(true); fetchAutoResponses(); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Auto-responses">
                <Zap className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowTemplateManager(true); fetchMetaTemplates(); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Templates">
                <LayoutTemplate className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowAutoSend(true); fetchAutoSend(); fetchMetaTemplates(); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Auto-send">
                <Timer className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowAISettings(true); fetchAIConfig(); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="AI Auto-Reply">
                <Brain className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => { setShowFlowEditor(true); fetchFlows(); if (metaTemplates.length === 0) fetchMetaTemplates(); }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Conversation Flows">
                <GitBranch className="h-3.5 w-3.5 text-gray-400" />
              </button>
              <button onClick={() => setShowWebhookSetup(true)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="Settings">
                <Settings className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </div>
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input type="text" placeholder="Search conversations..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" />
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1">
            {(['all', 'unread', 'assigned'] as const).map(f => (
              <button key={f} onClick={() => setConvFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${convFilter === f ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Assigned'}
              </button>
            ))}
          </div>
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
              <button onClick={() => setShowNewConversation(true)} className="mt-4 px-4 py-1.5 text-xs font-medium text-white bg-green-500 rounded-full hover:bg-green-600 transition-all">
                Start conversation
              </button>
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
                  const convAssignment = assignments[conv.waId];
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
                          <p className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{conv.contactName}</p>
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
                    {/* Delete button on hover */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.waId); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/conv:opacity-100 transition-opacity p-1.5 bg-white rounded-lg shadow-sm border border-gray-100 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-400"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
                isLoadingTemplates ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                ) : (
                <div className="grid grid-cols-2 gap-2">
                  {(metaTemplates.filter((t: any) => t.status === 'APPROVED').map(toSendableTemplate).length > 0
                    ? metaTemplates.filter((t: any) => t.status === 'APPROVED').map(toSendableTemplate)
                    : WHATSAPP_TEMPLATES
                  ).map(t => (
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
              <button onClick={() => { const opening = !showTemplatePanel; setShowTemplatePanel(opening); setShowEmojiPicker(false); setShowQuickReplies(false); if (opening && metaTemplates.length === 0) fetchMetaTemplates(); }}
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
                    <button key={tpl.name} onClick={() => {
                      setSelectedTemplate(tpl);
                      setTemplateParams(Array(tpl.parameterCount).fill(''));
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

      </div>
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
                  {isLoadingTemplates ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : (metaTemplates.filter((t: any) => t.status === 'APPROVED').map(toSendableTemplate).length > 0
                    ? metaTemplates.filter((t: any) => t.status === 'APPROVED').map(toSendableTemplate)
                    : WHATSAPP_TEMPLATES
                  ).map(t => (
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
                <button onClick={() => setAttachmentType('video')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'video' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <Video className="h-4 w-4" /> Video
                </button>
                <button onClick={() => setAttachmentType('document')}
                  className={`flex-1 py-2 text-sm font-medium rounded-xl flex items-center justify-center gap-2 transition-all ${
                    attachmentType === 'document' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-50 text-gray-600 border border-gray-200'
                  }`}>
                  <FileText className="h-4 w-4" /> Document
                </button>
              </div>
              <input type="url" placeholder={
                attachmentType === 'image' ? 'Image URL (JPEG/PNG, max 5MB)' :
                attachmentType === 'video' ? 'Video URL (MP4/3GPP, max 16MB)' :
                'Document URL (PDF/DOC/XLS, max 100MB)'
              }
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
                                  setSelectedTemplate({
                                    id: t.id || t.name, name: t.name, displayName: t.name,
                                    language: t.language, body: t.components?.find((c: any) => c.type === 'BODY')?.text || '',
                                    parameterCount: 0, category: t.category?.toLowerCase() || 'utility',
                                  });
                                  setTemplateParams([]);
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
              {/* Master toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900">Enable Auto-Send</p>
                  <p className="text-xs text-gray-500 mt-0.5">Automatically send a template when conditions match</p>
                </div>
                <button onClick={() => setAutoSendEnabled(!autoSendEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoSendEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoSendEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
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
                      value={autoSendTemplate}
                      onChange={e => {
                        const selected = metaTemplates.find((t: any) => t.name === e.target.value);
                        setAutoSendTemplate(e.target.value);
                        if (selected?.language) setAutoSendLanguage(selected.language);
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
                  <input type="text" value={autoSendLanguage} onChange={e => setAutoSendLanguage(e.target.value)}
                    placeholder="e.g. en_US, ro"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" />
                  <p className="text-xs text-gray-400 mt-1">Auto-filled when you select a template above</p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={autoSendIncludeName} onChange={e => setAutoSendIncludeName(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 accent-green-600" />
                  <div>
                    <p className="text-sm text-gray-800">Include contact first name as parameter</p>
                    <p className="text-xs text-gray-400">Passes {`{{1}}`} = first name to the template</p>
                  </div>
                </label>
              </div>

              {/* Source filter */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter by Source</p>
                <p className="text-xs text-gray-400">Leave all unchecked to send for contacts from any source</p>
                <div className="grid grid-cols-2 gap-2">
                  {['typeform', 'manychat', 'manual', 'form', 'import', 'webhook'].map(src => (
                    <label key={src} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                      <input type="checkbox"
                        checked={autoSendSources.includes(src)}
                        onChange={e => setAutoSendSources(prev => e.target.checked ? [...prev, src] : prev.filter(s => s !== src))}
                        className="h-4 w-4 rounded border-gray-300 accent-green-600" />
                      <span className="text-sm text-gray-700 capitalize">{src}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status filter */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter by Status</p>
                <p className="text-xs text-gray-400">Leave all unchecked to send for any contact status</p>
                <div className="grid grid-cols-2 gap-2">
                  {['lead', 'prospect', 'customer', 'active'].map(st => (
                    <label key={st} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                      <input type="checkbox"
                        checked={autoSendStatuses.includes(st)}
                        onChange={e => setAutoSendStatuses(prev => e.target.checked ? [...prev, st] : prev.filter(s => s !== st))}
                        className="h-4 w-4 rounded border-gray-300 accent-green-600" />
                      <span className="text-sm text-gray-700 capitalize">{st}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Require phone */}
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-xl">
                <input type="checkbox" checked={autoSendRequirePhone} onChange={e => setAutoSendRequirePhone(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-green-600" />
                <div>
                  <p className="text-sm font-medium text-gray-800">Only send if contact has a phone number</p>
                  <p className="text-xs text-gray-400">Skip contacts without a phone — recommended</p>
                </div>
              </label>

              {autoSendSaveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{autoSendSaveError}</p>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button onClick={() => { setShowAutoSend(false); setAutoSendSaveError(''); }}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">
                Cancel
              </button>
              <button onClick={saveAutoSendConfig} disabled={isSavingAutoSend || !autoSendTemplate.trim()}
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
                        <input type="text" value={step.id} onChange={e => updateFlowStep(si, 'id', e.target.value)}
                          placeholder="step_id" className="w-full px-3 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-green-400" />

                        {si === 0 ? (
                          /* Step 1: Template-based (required to initiate conversations) */
                          <div className="space-y-2">
                            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
                              First step must use an approved template. Buttons from the template will auto-load below.
                            </div>
                            <div className="flex gap-1.5">
                            <select value={step.templateName || ''} onChange={e => {
                              if (!editingFlow) return;
                              const t = metaTemplates.find((t: any) => t.name === e.target.value);
                              const steps = [...editingFlow.steps];
                              // Extract QUICK_REPLY buttons from template
                              const tplButtons = t?.components?.find((c: any) => c.type === 'BUTTONS')?.buttons || [];
                              const quickReplyBtns = tplButtons
                                .filter((b: any) => b.type === 'QUICK_REPLY')
                                .map((b: any, i: number) => ({
                                  id: b.payload || b.text || `btn_${Date.now()}_${i}`,
                                  title: b.text,
                                  nextStepId: '',
                                }));
                              steps[si] = {
                                ...steps[si],
                                templateName: e.target.value,
                                type: 'template',
                                templateLanguage: t?.language || 'en_US',
                                message: t?.components?.find((c: any) => c.type === 'BODY')?.text || '',
                                buttons: quickReplyBtns,
                              };
                              setEditingFlow({ ...editingFlow, steps });
                            }} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white">
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
                        ) : (
                          /* Steps 2+: Interactive message (within 24h session window) */
                          <div className="space-y-2">
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
                                            const res = await api.post('/integrations/whatsapp/media/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                                            updateFlowStep(si, 'mediaId', res.data.id);
                                            updateFlowStep(si, 'mediaUrl', undefined);
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

                        {/* Buttons */}
                        <div className="space-y-1.5">
                          {si === 0 && step.type === 'template' ? (
                            /* Step 1 (template): buttons are auto-loaded, title is read-only */
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
                            /* Steps 2+: editable interactive buttons */
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
                            {flow.trigger === 'first_message' ? 'Triggers on first message' : `Keyword: "${flow.triggerKeyword}"`}
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
