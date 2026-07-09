'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  ChevronRight,
  CircleDot,
  Copy,
  ExternalLink,
  Instagram,
  LoaderCircle,
  MessageCircle,
  MessageSquare,
  Mic,
  MonitorPlay,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  Share2,
  Square,
  Trash2,
  UserCircle2,
  Webhook,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { authService, User } from '@/lib/auth';
import { hasChannelAccess } from '@/lib/channel-access';
import { cn } from '@/lib/utils';
import AudioLibraryPicker from '@/components/audio/AudioLibraryPicker';
import { playNewMessageChime } from '@/lib/notificationSound';

type MetaChannel = 'messenger' | 'instagram';

interface MetaAudioTemplate {
  id: string;
  name: string;
  attachmentId: string;
  channel: MetaChannel;
  createdAt: string;
}
type InboxFilter = 'all' | 'unread' | 'messenger' | 'instagram';
type ComposerMode = 'text' | 'audio';
type MessageDirection = 'inbound' | 'outbound' | 'internal';
type ProfileFilterOption = {
  key: string;
  label: string;
  count: number;
};

interface MetaMessage {
  id: string;
  direction: MessageDirection;
  description: string;
  occurredAt: string;
  metadata: {
    externalMessageId?: string;
    externalThreadId?: string;
    externalUserId?: string;
    messageType?: string;
    attachmentUrl?: string;
    attachmentMimeType?: string;
    attachmentName?: string;
    attachmentTitle?: string;
    senderPageName?: string;
    senderAccountName?: string;
    isSimulated?: boolean;
    messageStatus?: string;
  };
}

interface MetaConversation {
  id: string;
  channel: MetaChannel;
  externalUserId: string;
  externalThreadId: string;
  integrationId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  messageProfileId?: string | null;
  messageProfileName?: string | null;
  contactId?: string | null;
  contactName: string;
  contactSource?: string | null;
  avatarUrl?: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: MetaMessage[];
}

interface MetaAccount {
  integrationId: string;
  provider: 'facebook' | 'instagram';
  name: string;
  status: string;
  liveReady: boolean;
  warning?: string | null;
  messageProfileId?: string | null;
  messageProfileName?: string | null;
  account?: {
    pageId?: string | null;
    pageName?: string | null;
    igUserId?: string | null;
    igUsername?: string | null;
  } | null;
}

interface MetaSetupInfo {
  integrationId: string;
  provider: 'facebook' | 'instagram';
  name: string;
  status: string;
  webhookUrl: string;
  verifyToken: string;
  accountCount?: number;
  accounts?: string[];
  instructions: string[];
}

interface TeamUser {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email: string;
  role: string;
  status?: string;
  avatar?: string;
}

interface MetaContactDetails {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  status?: string;
  setterId?: string | null;
  closerId?: string | null;
  ownerId?: string | null;
  setter?: TeamUser | null;
  closer?: TeamUser | null;
  owner?: TeamUser | null;
}

type AssignmentField = 'setterId' | 'closerId';

interface ConversationContactOverride {
  contactId: string;
  contactName: string;
}

interface ConversationSelection {
  channel: MetaChannel;
  externalUserId: string;
  integrationId?: string | null;
}

const filterLabels: Record<InboxFilter, string> = {
  all: 'All',
  unread: 'Unread',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

const channelTheme: Record<
  MetaChannel,
  {
    label: string;
    icon: typeof MessageCircle;
    badge: string;
    subtleIcon: string;
    outboundBubble: string;
    listAccent: string;
    avatarRing: string;
    rowAccent: string;
    panelBorder: string;
    composerDivider: string;
    composerPill: string;
  }
> = {
  messenger: {
    label: 'Messenger',
    icon: MessageCircle,
    badge: 'border-[#0078ff]/40 bg-[#e8f1ff] text-[#0057d9]',
    subtleIcon: 'bg-[#e8f1ff] text-[#0057d9]',
    outboundBubble: 'bg-[#0078ff] text-white',
    listAccent: 'text-[#0078ff]',
    avatarRing: 'ring-2 ring-[#0078ff]/60',
    rowAccent: 'border-l-[3px] border-l-[#0078ff]',
    panelBorder: 'border-2 border-[#0078ff]/45',
    composerDivider: 'border-t-2 border-t-[#0078ff]/50',
    composerPill: 'border-[#0078ff]/40',
  },
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    badge: 'border-fuchsia-400/50 bg-fuchsia-50 text-fuchsia-700',
    subtleIcon: 'bg-[linear-gradient(135deg,#fdf2f8_0%,#faf5ff_100%)] text-fuchsia-700',
    outboundBubble: 'bg-[linear-gradient(135deg,#7c3aed_0%,#d946ef_100%)] text-white',
    listAccent: 'text-fuchsia-600',
    avatarRing: 'ring-2 ring-fuchsia-500/60',
    rowAccent: 'border-l-[3px] border-l-fuchsia-500',
    panelBorder: 'border-2 border-fuchsia-500/45',
    composerDivider: 'border-t-2 border-t-fuchsia-500/50',
    composerPill: 'border-fuchsia-500/40',
  },
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('ro-RO', {
    day: '2-digit',
    month: 'short',
  });
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'CL'
  );
}

// Renders the contact's profile photo when available, falling back to initials
// (initials sit underneath, so a broken/expired photo URL degrades gracefully).
function ContactAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-full', className)}>
      <span className="flex h-full w-full items-center justify-center">{getInitials(name)}</span>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
    </div>
  );
}

function getUserDisplayName(user?: Partial<TeamUser> | null) {
  if (!user) return '';
  const composed = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return user.fullName?.trim() || composed || user.email || 'Unassigned';
}

function getContactDisplayName(contact?: Partial<MetaContactDetails> | null) {
  if (!contact) return '';
  const composed = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return contact.fullName?.trim() || composed || '';
}

function getAccountDisplayName(conversation?: Partial<MetaConversation> | null, account?: MetaAccount | null) {
  return (
    String(conversation?.accountName || '').trim()
    || String(account?.account?.igUsername || '').trim()
    || String(account?.account?.pageName || '').trim()
    || String(account?.name || '').trim()
    || 'Default account'
  );
}

function getMessageProfileDisplayName(conversation?: Partial<MetaConversation> | null, account?: MetaAccount | null) {
  return (
    String(conversation?.messageProfileName || '').trim()
    || String(account?.messageProfileName || '').trim()
    || ''
  );
}

function buildSyntheticProfileKey(channel: MetaChannel, profileName?: string | null) {
  const normalized = String(profileName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${channel}:${normalized || 'standalone'}`;
}

function formatRole(role?: string | null) {
  if (!role) return '';
  return role.replace(/_/g, ' ');
}

function buildAssignableUsers(users: TeamUser[], role: 'setter' | 'closer') {
  const sharedRoles = new Set(['admin', 'manager', 'super_admin']);
  const preferred = users.filter((user) => sharedRoles.has(user.role) || user.role === role);
  const pool = preferred.length ? preferred : users;

  return [...pool].sort((left, right) => getUserDisplayName(left).localeCompare(getUserDisplayName(right), 'ro'));
}

function copyText(value: string) {
  if (!value) return;
  void navigator.clipboard?.writeText(value);
}

function isAudioMessage(message: MetaMessage) {
  return message.metadata.messageType === 'audio';
}

type MediaKind = 'audio' | 'image' | 'video' | 'share' | 'file' | null;

function getMediaKind(message: MetaMessage): MediaKind {
  const m = message.metadata;
  const type = String(m.messageType || '').toLowerCase();
  const mime = String(m.attachmentMimeType || '').toLowerCase();
  const url = m.attachmentUrl || '';
  if (type === 'share') return 'share';
  if (!url) return null;
  if (type === 'audio' || mime.startsWith('audio/') || /\.(mp3|m4a|ogg|wav|aac)(\?|$)/i.test(url)) return 'audio';
  if (type === 'image' || mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url)) return 'image';
  if (type === 'video' || mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return 'video';
  // Anything else with a URL in a social DM is almost always a shared post,
  // reel, story or profile — render it as a rich card, not a bare file chip.
  return 'share';
}

function looksLikeImageUrl(url?: string, mime?: string): boolean {
  if (mime && mime.toLowerCase().startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url || '');
}

// Hide the "[Photo]" / "[Video]" style placeholder text when we actually render
// the media inline; keep real captions.
function isBracketPlaceholder(text?: string): boolean {
  return /^\[(photo|video|audio message|file|shared post|message)\]$/i.test(String(text || '').trim());
}

function getConversationProfileKey(
  conversation: Pick<MetaConversation, 'channel' | 'integrationId' | 'accountName' | 'messageProfileId' | 'messageProfileName'>,
) {
  if (conversation.messageProfileId) {
    return `profile:${conversation.messageProfileId}`;
  }

  if (conversation.messageProfileName) {
    return `profile:${buildSyntheticProfileKey(conversation.channel, conversation.messageProfileName)}`;
  }

  if (conversation.integrationId) {
    return `standalone:${conversation.integrationId}`;
  }

  const accountName = String(conversation.accountName || '').trim().toLowerCase() || 'default';
  return `account:${conversation.channel}:${accountName}`;
}

function ChannelBadge({ channel }: { channel: MetaChannel }) {
  const theme = channelTheme[channel];
  const Icon = theme.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium', theme.badge)}>
      <Icon className="h-3.5 w-3.5" />
      {theme.label}
    </span>
  );
}

function StatusBadge({ liveReady }: { liveReady: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
        liveReady ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500',
      )}
    >
      <CircleDot className="h-3 w-3" />
      {liveReady ? 'Live' : 'Not live'}
    </span>
  );
}

function AssignmentPill({
  label,
  user,
}: {
  label: string;
  user?: Partial<TeamUser> | null;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-slate-900">{getUserDisplayName(user) || 'Unassigned'}</span>
    </span>
  );
}

function upsertStreamMessage(
  conversations: MetaConversation[],
  payload: any,
  isSelected: boolean,
): MetaConversation[] {
  const convData = payload.conversation || {};
  const msg = payload.message || {};
  const conversationId = String(convData.id || '');
  if (!conversationId || !msg.id) return conversations;

  const message: MetaMessage = {
    id: String(msg.id),
    direction: msg.direction,
    description: msg.description || '',
    occurredAt: msg.occurredAt,
    metadata: msg.metadata || {},
  };
  const inbound = message.direction === 'inbound';
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);

  if (index === -1) {
    const fresh: MetaConversation = {
      id: conversationId,
      channel: convData.channel,
      externalUserId: convData.externalUserId,
      externalThreadId: convData.externalThreadId || convData.externalUserId,
      integrationId: convData.integrationId ?? null,
      accountId: convData.accountId ?? null,
      accountName: convData.accountName ?? null,
      messageProfileId: convData.messageProfileId ?? null,
      messageProfileName: convData.messageProfileName ?? null,
      contactId: convData.contactId ?? null,
      contactName: convData.contactName || 'Unknown',
      contactSource: convData.contactSource ?? null,
      lastMessage: message.description,
      lastMessageTime: message.occurredAt,
      unreadCount: inbound && !isSelected ? 1 : 0,
      messages: [message],
    };
    return [fresh, ...conversations];
  }

  const existing = conversations[index];
  if (existing.messages.some((item) => item.id === message.id)) {
    return conversations;
  }

  const updated: MetaConversation = {
    ...existing,
    contactId: convData.contactId ?? existing.contactId,
    contactName: convData.contactName || existing.contactName,
    accountName: convData.accountName ?? existing.accountName,
    messageProfileName: convData.messageProfileName ?? existing.messageProfileName,
    lastMessage: message.description || existing.lastMessage,
    lastMessageTime: message.occurredAt,
    unreadCount: existing.unreadCount + (inbound && !isSelected ? 1 : 0),
    messages: [...existing.messages, message],
  };

  return [updated, ...conversations.filter((_, position) => position !== index)];
}

function applyStreamDeletion(conversations: MetaConversation[], payload: any): MetaConversation[] {
  if (payload.messageId) {
    return conversations
      .map((conversation) => {
        if (!conversation.messages.some((item) => item.id === payload.messageId)) return conversation;
        const messages = conversation.messages.filter((item) => item.id !== payload.messageId);
        const last = messages[messages.length - 1];
        return {
          ...conversation,
          messages,
          lastMessage: last?.description || '',
          lastMessageTime: last?.occurredAt || conversation.lastMessageTime,
        };
      })
      .filter((conversation) => conversation.messages.length > 0);
  }

  if (payload.externalUserId && payload.channel) {
    return conversations.filter(
      (conversation) =>
        !(conversation.channel === payload.channel && conversation.externalUserId === payload.externalUserId),
    );
  }

  return conversations;
}

export default function MessagesPage() {
  const [loading, setLoading] = useState(true);
  const [accessResolved, setAccessResolved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<MetaConversation[]>([]);
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [setupInfo, setSetupInfo] = useState<MetaSetupInfo[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [contactDetails, setContactDetails] = useState<MetaContactDetails | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [assignmentBusy, setAssignmentBusy] = useState<AssignmentField | null>(null);
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentSuccess, setAssignmentSuccess] = useState('');
  const [crmLinkBusy, setCrmLinkBusy] = useState(false);
  const [crmLinkError, setCrmLinkError] = useState('');
  const [crmLinkSuccess, setCrmLinkSuccess] = useState('');
  const [conversationContactOverrides, setConversationContactOverrides] = useState<Record<string, ConversationContactOverride>>({});
  const [selectedId, setSelectedId] = useState<string>('');
  const [manualChannel, setManualChannel] = useState<MetaChannel>('messenger');
  const [manualIntegrationId, setManualIntegrationId] = useState('');
  const [manualRecipient, setManualRecipient] = useState('');
  const [outboundText, setOutboundText] = useState('');
  const [outboundAudioUrl, setOutboundAudioUrl] = useState('');
  const [outboundAudioName, setOutboundAudioName] = useState('');
  const [audioTemplates, setAudioTemplates] = useState<MetaAudioTemplate[]>([]);
  const [templatesBusy, setTemplatesBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('all');
  const [activeAccountFilter, setActiveAccountFilter] = useState('all');
  const [profileDrafts, setProfileDrafts] = useState<Record<string, { selection: string; newName: string }>>({});
  const [profileBusyIntegrationId, setProfileBusyIntegrationId] = useState<string | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [composerMode, setComposerMode] = useState<ComposerMode>('text');
  const [showTools, setShowTools] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const rawMessengerAccess = hasChannelAccess(currentUser, 'messenger');
  const rawInstagramAccess = hasChannelAccess(currentUser, 'instagram');
  const hasMessagesAccess = rawMessengerAccess || rawInstagramAccess;

  const accountsById = useMemo(
    () => new Map(accounts.map((item) => [item.integrationId, item])),
    [accounts],
  );
  const messengerAccounts = useMemo(
    () => accounts.filter((item) => item.provider === 'facebook'),
    [accounts],
  );
  const instagramAccounts = useMemo(
    () => accounts.filter((item) => item.provider === 'instagram'),
    [accounts],
  );
  const canAccessMessenger = rawMessengerAccess && messengerAccounts.length > 0;
  const canAccessInstagram = rawInstagramAccess && instagramAccounts.length > 0;
  const hasConnectedVisibleChannels = canAccessMessenger || canAccessInstagram;
  const messageProfiles = useMemo(() => {
    const profiles = new Map<string, { id: string; name: string; integrationIds: string[] }>();

    for (const account of accounts) {
      const profileId = String(account.messageProfileId || '').trim();
      const profileName = String(account.messageProfileName || '').trim();
      if (!profileId && !profileName) continue;

      const key = profileId || buildSyntheticProfileKey(account.provider === 'facebook' ? 'messenger' : 'instagram', profileName);
      const existing = profiles.get(key);
      if (existing) {
        existing.integrationIds.push(account.integrationId);
        continue;
      }

      profiles.set(key, {
        id: key,
        name: profileName || 'Message profile',
        integrationIds: [account.integrationId],
      });
    }

    return Array.from(profiles.values()).sort((left, right) => left.name.localeCompare(right.name, 'ro'));
  }, [accounts]);

  const displayConversations = useMemo(() => {
    return [...conversations]
      .map((conversation) => {
        const override = conversationContactOverrides[conversation.id];
        return override
          ? { ...conversation, contactId: override.contactId, contactName: override.contactName }
          : conversation;
      })
      .filter((conversation) => {
        if (conversation.channel === 'messenger' && !canAccessMessenger) return false;
        if (conversation.channel === 'instagram' && !canAccessInstagram) return false;
        return true;
      })
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  }, [canAccessInstagram, canAccessMessenger, conversationContactOverrides, conversations]);

  const selectedConversation = useMemo(
    () => displayConversations.find((conversation) => conversation.id === selectedId) || null,
    [displayConversations, selectedId],
  );

  const filteredConversations = useMemo(() => {
    return displayConversations.filter((conversation) => {
      if (activeFilter === 'unread' && conversation.unreadCount === 0) return false;
      if (activeFilter === 'messenger' && conversation.channel !== 'messenger') return false;
      if (activeFilter === 'instagram' && conversation.channel !== 'instagram') return false;

      return true;
    });
  }, [activeFilter, displayConversations]);

  const accountFilters = useMemo<ProfileFilterOption[]>(() => {
    const labels = new Map<string, ProfileFilterOption>();

    for (const conversation of filteredConversations) {
      const account = conversation.integrationId ? accountsById.get(conversation.integrationId) || null : null;
      const label = getMessageProfileDisplayName(conversation, account) || getAccountDisplayName(conversation, account);
      // Dedupe by account name so duplicate integrations for the same account
      // (e.g. two "andrei.ra2" rows from repeated connects) collapse to one chip.
      const key = String(label || '').trim().toLowerCase();
      const current = labels.get(key);

      if (current) {
        current.count += 1;
        continue;
      }

      labels.set(key, { key, label, count: 1 });
    }

    const baseLabel =
      activeFilter === 'messenger'
        ? 'All Messenger profiles'
        : activeFilter === 'instagram'
          ? 'All Instagram profiles'
          : 'All profiles';

    return [
      { key: 'all', label: baseLabel, count: filteredConversations.length },
      ...Array.from(labels.values()).sort((left, right) => left.label.localeCompare(right.label, 'ro')),
    ];
  }, [accountsById, activeFilter, filteredConversations]);

  const visibleConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return filteredConversations.filter((conversation) => {
      if (activeAccountFilter !== 'all') {
        const account = conversation.integrationId ? accountsById.get(conversation.integrationId) || null : null;
        const label = String(
          getMessageProfileDisplayName(conversation, account) || getAccountDisplayName(conversation, account) || '',
        )
          .trim()
          .toLowerCase();
        if (label !== activeAccountFilter) return false;
      }

      if (!query) return true;

      const haystack = [
        conversation.contactName,
        conversation.lastMessage,
        conversation.externalUserId,
        conversation.contactSource || '',
        conversation.accountName || '',
        conversation.messageProfileName || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [accountsById, activeAccountFilter, filteredConversations, searchTerm]);

  const selectedMessages = useMemo(() => {
    if (!selectedConversation?.messages?.length) return [];
    return [...selectedConversation.messages].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
  }, [selectedConversation]);

  // Jump to the latest message when opening a conversation or when a new one
  // arrives — the thread should always start at the bottom, not the top.
  useEffect(() => {
    if (!selectedMessages.length) return;
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [selectedId, selectedMessages.length]);

  const setterOptions = useMemo(() => buildAssignableUsers(teamUsers, 'setter'), [teamUsers]);
  const closerOptions = useMemo(() => buildAssignableUsers(teamUsers, 'closer'), [teamUsers]);
  const currentSetterId = contactDetails?.setterId ?? '';
  const currentCloserId = contactDetails?.closerId ?? '';
  const currentSetterUser =
    contactDetails?.setter || setterOptions.find((user) => user.id === currentSetterId) || null;
  const currentCloserUser =
    contactDetails?.closer || closerOptions.find((user) => user.id === currentCloserId) || null;
  const assignmentMode = selectedConversation?.contactId ? 'crm' : 'unavailable';

  const inboxStats = useMemo(
    () => ({
      all: displayConversations.length,
      unread: displayConversations.reduce((sum, item) => sum + item.unreadCount, 0),
      messenger: displayConversations.filter((item) => item.channel === 'messenger').length,
      instagram: displayConversations.filter((item) => item.channel === 'instagram').length,
    }),
    [displayConversations],
  );

  const activeChannel: MetaChannel = selectedConversation?.channel || manualChannel;
  const activeRecipient = selectedConversation?.externalUserId || manualRecipient.trim();
  const activeIntegration = selectedConversation?.integrationId
    ? accountsById.get(selectedConversation.integrationId) || null
    : (
      activeChannel === 'messenger'
        ? messengerAccounts.find((item) => item.integrationId === manualIntegrationId) || messengerAccounts[0] || null
        : instagramAccounts.find((item) => item.integrationId === manualIntegrationId) || instagramAccounts[0] || null
    );
  // Always send for real. The old behaviour simulated whenever liveReady was
  // false (which it often is on first load), so replies never reached Meta.
  const outboundWillSimulate = false;
  const activeAccountName = getAccountDisplayName(selectedConversation, activeIntegration);
  const activeProfileName = getMessageProfileDisplayName(selectedConversation, activeIntegration);

  const fetchData = async (
    refreshAccounts = false,
    preferredSelection?: ConversationSelection,
  ) => {
    const accountQuery = refreshAccounts
      ? '/integrations/meta-messaging/accounts?refresh=1'
      : '/integrations/meta-messaging/accounts';

    // Load independently: a failure in accounts/setup must NOT blank the inbox.
    // (Promise.all would reject the whole batch and drop the conversations.)
    const [inboxRes, accountRes, setupRes] = await Promise.allSettled([
      api.get('/integrations/meta-messaging/inbox'),
      api.get(accountQuery),
      api.get('/integrations/meta-messaging/setup'),
    ]);

    if (accountRes.status === 'fulfilled') {
      setAccounts(Array.isArray(accountRes.value.data) ? accountRes.value.data : []);
    }
    if (setupRes.status === 'fulfilled') {
      setSetupInfo(Array.isArray(setupRes.value.data) ? setupRes.value.data : []);
    }

    if (inboxRes.status !== 'fulfilled') {
      throw inboxRes.reason;
    }

    const nextConversations = Array.isArray(inboxRes.value.data?.data) ? inboxRes.value.data.data : [];
    setConversations(nextConversations);
    setSelectedId((prev) => {
      if (preferredSelection) {
        const match = nextConversations.find(
          (conversation: MetaConversation) =>
            conversation.channel === preferredSelection.channel &&
            conversation.externalUserId === preferredSelection.externalUserId &&
            (preferredSelection.integrationId
              ? conversation.integrationId === preferredSelection.integrationId
              : true),
        );
        if (match) return match.id;
      }

      if (prev && nextConversations.some((conversation: MetaConversation) => conversation.id === prev)) {
        return prev;
      }

      return prev;
    });
  };

  const fetchTeamUsers = async () => {
    setTeamLoading(true);
    try {
      const response = await api.get('/users?status=active');
      setTeamUsers(Array.isArray(response.data) ? response.data : []);
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await authService.getCurrentUser().catch(() => authService.getUser());
        if (mounted) {
          setCurrentUser(me);
          setAccessResolved(true);
        }

        if (!hasChannelAccess(me, 'messenger') && !hasChannelAccess(me, 'instagram')) {
          return;
        }

        await Promise.all([fetchData(false), fetchTeamUsers()]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Live inbox sync via Server-Sent Events — zero DB polling (keeps Neon asleep).
  // EventSource can't set headers, so the JWT rides as ?token= (see jwt.strategy).
  const [streamEpoch, setStreamEpoch] = useState(0);
  useEffect(() => {
    if (!hasMessagesAccess || typeof window === 'undefined') return;

    const token = localStorage.getItem('accessToken');
    const base = process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';
    const url = `${base}/integrations/meta-messaging/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const source = new EventSource(url, { withCredentials: true });

    // Track stream liveness. The backend pings every 25s; if we hear nothing for
    // 45s the connection is a zombie (open TCP, no data), so force a reconnect.
    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };
    source.addEventListener('ping', markActive);

    source.onmessage = (event) => {
      markActive();
      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'message' && payload.conversation && payload.message) {
        const conversationId = String(payload.conversation.id || '');
        const isSelected = selectedIdRef.current === conversationId;
        // Soft chime only for genuinely new inbound messages (not our own echoes).
        if (payload.message.direction === 'inbound') {
          playNewMessageChime();
        }
        setConversations((prev) => upsertStreamMessage(prev, payload, isSelected));
      } else if (payload.type === 'deleted') {
        setConversations((prev) => applyStreamDeletion(prev, payload));
      }
    };

    // On every (re)connection after the first, re-sync the inbox so messages
    // that arrived while the stream was dropped appear immediately instead of
    // trickling in on the next reconnect. Event-driven, so no constant polling.
    let firstOpen = true;
    source.onopen = () => {
      markActive();
      // Skip only the very first connection on initial mount (the page already
      // loaded the inbox). Auto-reconnects and watchdog rebuilds (epoch > 0)
      // always resync so nothing that arrived while offline is missed.
      if (streamEpoch === 0 && firstOpen) {
        firstOpen = false;
        return;
      }
      void refreshAll(false);
    };

    source.onerror = () => {};

    // Watchdog: if the stream goes silent (no ping/message for 45s), tear it
    // down and bump the epoch to rebuild a fresh EventSource + resync.
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastActivity > 45000) {
        source.close();
        window.clearInterval(watchdog);
        setStreamEpoch((epoch) => epoch + 1);
      }
    }, 15000);

    return () => {
      window.clearInterval(watchdog);
      source.removeEventListener('ping', markActive);
      source.close();
    };
  }, [hasMessagesAccess, streamEpoch]);

  useEffect(() => {
    if (activeFilter === 'messenger' && !canAccessMessenger) {
      setActiveFilter('all');
    }
    if (activeFilter === 'instagram' && !canAccessInstagram) {
      setActiveFilter('all');
    }
  }, [activeFilter, canAccessInstagram, canAccessMessenger]);

  useEffect(() => {
    if (!accountFilters.some((item) => item.key === activeAccountFilter)) {
      setActiveAccountFilter('all');
    }
  }, [accountFilters, activeAccountFilter]);

  useEffect(() => {
    if (!visibleConversations.length) {
      if (selectedId) setSelectedId('');
      return;
    }

    if (!selectedId) {
      setSelectedId(visibleConversations[0].id);
      return;
    }

    if (!visibleConversations.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(visibleConversations[0].id);
    }
  }, [selectedId, visibleConversations]);

  useEffect(() => {
    if (!canAccessMessenger && manualChannel === 'messenger' && canAccessInstagram) {
      setManualChannel('instagram');
    }
    if (!canAccessInstagram && manualChannel === 'instagram' && canAccessMessenger) {
      setManualChannel('messenger');
    }
  }, [canAccessInstagram, canAccessMessenger, manualChannel]);

  useEffect(() => {
    const available = manualChannel === 'messenger' ? messengerAccounts : instagramAccounts;
    if (!available.length) {
      if (manualIntegrationId) setManualIntegrationId('');
      return;
    }

    if (!available.some((item) => item.integrationId === manualIntegrationId)) {
      setManualIntegrationId(available[0].integrationId);
    }
  }, [instagramAccounts, manualChannel, manualIntegrationId, messengerAccounts]);

  useEffect(() => {
    void loadAudioTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel, activeIntegration?.integrationId]);

  useEffect(() => {
    let cancelled = false;
    const contactId = selectedConversation?.contactId;

    setAssignmentError('');
    setAssignmentSuccess('');
    setCrmLinkError('');
    setCrmLinkSuccess('');

    if (!contactId) {
      setContactDetails(null);
      setContactLoading(false);
      return;
    }

    setContactLoading(true);
    void api
      .get(`/contacts/${contactId}?include=owner,setter,closer`)
      .then((response) => {
        if (!cancelled) {
          setContactDetails(response.data);
        }
      })
      .catch((error: any) => {
        if (!cancelled) {
          setContactDetails(null);
          setAssignmentError(error?.response?.data?.message || error?.message || 'Nu am putut încărca contactul din CRM.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setContactLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedConversation?.contactId]);

  const updateAssignment = async (field: AssignmentField, nextValue: string) => {
    if (!selectedConversation) return;

    setAssignmentBusy(field);
    setAssignmentError('');
    setAssignmentSuccess('');

    if (selectedConversation.contactId) {
      try {
        const payload = {
          [field]: nextValue || null,
        };
        const response = await api.put(`/contacts/${selectedConversation.contactId}`, payload);
        setContactDetails(response.data);
        setAssignmentSuccess(field === 'setterId' ? 'Setterul a fost actualizat.' : 'Closerul a fost actualizat.');
      } catch (error: any) {
        setAssignmentError(error?.response?.data?.message || error?.message || 'Nu am putut salva assignment-ul.');
      } finally {
        setAssignmentBusy(null);
      }
      return;
    }

    setAssignmentError('Conversația nu este încă legată de un contact CRM.');
    setAssignmentBusy(null);
  };

  const addConversationToCrm = async () => {
    if (!selectedConversation) return;

    setCrmLinkBusy(true);
    setCrmLinkError('');
    setCrmLinkSuccess('');

    try {
      const response = await api.post('/integrations/meta-messaging/contacts/ensure', {
        channel: selectedConversation.channel,
        externalUserId: selectedConversation.externalUserId,
        senderName: selectedConversation.contactName,
        integrationId: selectedConversation.integrationId || undefined,
      });

      const contact = response.data?.contact as MetaContactDetails | undefined;
      const linkedActivities = Number(response.data?.linkedActivities || 0);

      if (!contact?.id) {
        throw new Error('Contact creation did not return a valid contact');
      }

      const contactName = getContactDisplayName(contact) || selectedConversation.contactName;

      setConversationContactOverrides((current) => ({
        ...current,
        [selectedConversation.id]: {
          contactId: contact.id,
          contactName,
        },
      }));
      setContactDetails(contact);
      setCrmLinkSuccess(
        linkedActivities > 0
          ? `Lead-ul a fost adăugat în CRM și am legat ${linkedActivities} activități existente la el.`
          : 'Lead-ul a fost adăugat în CRM.',
      );

      await refreshAll(false, {
        channel: selectedConversation.channel,
        externalUserId: selectedConversation.externalUserId,
        integrationId: selectedConversation.integrationId,
      });
    } catch (error: any) {
      setCrmLinkError(error?.response?.data?.message || error?.message || 'Nu am putut adăuga conversația în CRM.');
    } finally {
      setCrmLinkBusy(false);
    }
  };

  const refreshAll = async (
    refreshAccounts = false,
    preferredSelection?: ConversationSelection,
  ) => {
    setRefreshing(true);
    setSendError('');
    setSendSuccess('');
    try {
      await fetchData(refreshAccounts, preferredSelection);
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Could not refresh messages');
    } finally {
      setRefreshing(false);
    }
  };

  const deleteSingleMessage = async (messageId: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Sigur vrei să ștergi acest mesaj?')) return;
    setConversations((prev) => applyStreamDeletion(prev, { messageId }));
    try {
      await api.delete(`/integrations/meta-messaging/inbox/message/${messageId}`);
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut șterge mesajul.');
    }
  };

  const deleteSelectedConversation = async () => {
    if (!selectedConversation) return;
    if (typeof window !== 'undefined' && !window.confirm('Sigur vrei să ștergi toată conversația?')) return;

    const removedId = selectedConversation.id;
    setActionBusy(true);
    setSendError('');
    setSendSuccess('');
    try {
      await api.delete('/integrations/meta-messaging/inbox/conversation', {
        data: {
          channel: selectedConversation.channel,
          externalUserId: selectedConversation.externalUserId,
          integrationId: selectedConversation.integrationId || undefined,
        },
      });
      setConversations((prev) => prev.filter((conversation) => conversation.id !== removedId));
      setSelectedId('');
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut șterge conversația.');
    } finally {
      setActionBusy(false);
    }
  };

  const setConversationRead = async (conversationId: string, unread = false) => {
    if (!conversationId) return;
    // Optimistic: clear/raise the local badge immediately.
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: unread ? Math.max(1, conversation.unreadCount || 1) : 0 }
          : conversation,
      ),
    );
    try {
      await api.post('/integrations/meta-messaging/inbox/read', { conversationId, unread });
    } catch {
      // Non-fatal — the next inbox refresh reconciles the real state.
    }
  };

  const selectConversation = (conversationId: string) => {
    setSelectedId(conversationId);
    void setConversationRead(conversationId, false);
  };

  const markSelectedUnread = () => {
    if (!selectedConversation) return;
    void setConversationRead(selectedConversation.id, true);
  };

  const saveMessageProfile = async (account: MetaAccount) => {
    const draft = profileDrafts[account.integrationId] || {
      selection: account.messageProfileId || 'standalone',
      newName: '',
    };

    let nextProfile: { id: string; name: string } | null = null;

    if (draft.selection === '__new__') {
      const profileName = draft.newName.trim();
      if (!profileName) {
        setProfileError('Scrie numele profilului înainte să-l salvezi.');
        setProfileSuccess('');
        return;
      }

      const existingProfile = messageProfiles.find(
        (item) => item.name.trim().toLowerCase() === profileName.toLowerCase(),
      );

      nextProfile = existingProfile
        ? { id: existingProfile.id, name: existingProfile.name }
        : {
            id: `profile_${profileName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'message'}_${Date.now().toString(36)}`,
            name: profileName,
          };
    } else if (draft.selection !== 'standalone') {
      const existingProfile = messageProfiles.find((item) => item.id === draft.selection);
      if (!existingProfile) {
        setProfileError('Profilul selectat nu mai există. Reîmprospătează lista și încearcă din nou.');
        setProfileSuccess('');
        return;
      }

      nextProfile = { id: existingProfile.id, name: existingProfile.name };
    }

    setProfileBusyIntegrationId(account.integrationId);
    setProfileError('');
    setProfileSuccess('');

    try {
      await api.patch(`/integrations/${account.integrationId}`, {
        config: {
          messageProfile: nextProfile,
        },
      });

      setProfileDrafts((current) => ({
        ...current,
        [account.integrationId]: {
          selection: nextProfile?.id || 'standalone',
          newName: nextProfile?.name || '',
        },
      }));
      setProfileSuccess(
        nextProfile
          ? `Contul a fost legat la profilul ${nextProfile.name}.`
          : 'Contul a fost lăsat standalone.',
      );
      await refreshAll(true, selectedConversation
        ? {
            channel: selectedConversation.channel,
            externalUserId: selectedConversation.externalUserId,
            integrationId: selectedConversation.integrationId,
          }
        : undefined);
    } catch (error: any) {
      setProfileError(error?.response?.data?.message || error?.message || 'Nu am putut salva profilul de mesaje.');
    } finally {
      setProfileBusyIntegrationId(null);
    }
  };

  const uploadAudioFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subfolder', 'meta-audio');
    const response = await api.post('/upload/single', formData);
    const url = String(response.data?.url || '').trim();

    if (!url) {
      throw new Error('Upload did not return a URL');
    }

    setOutboundAudioUrl(url);
    setOutboundAudioName(file.name);
  };

  const sendText = async () => {
    if (!outboundText.trim()) {
      setSendError('Scrie mai întâi mesajul text.');
      return;
    }

    if (!activeRecipient) {
      setSendError('Alege o conversație sau completează recipientul manual.');
      return;
    }

    setActionBusy(true);
    setSendError('');
    setSendSuccess('');
    try {
      const response = await api.post('/integrations/meta-messaging/send/text', {
        channel: activeChannel,
        to: activeRecipient,
        message: outboundText.trim(),
        integrationId: activeIntegration?.integrationId,
        simulate: outboundWillSimulate,
      });
      const simulated = !!response.data?.simulated;
      setSendSuccess(simulated ? 'Mesajul a fost simulat local și salvat în inbox.' : 'Mesajul a fost trimis către Meta.');
      setOutboundText('');
      await refreshAll(false, {
        channel: activeChannel,
        externalUserId: activeRecipient,
        integrationId: activeIntegration?.integrationId,
      });
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut trimite mesajul text.');
    } finally {
      setActionBusy(false);
    }
  };

  const sendAudio = async () => {
    if (!outboundAudioUrl.trim()) {
      setSendError('Atașează sau completează un audio URL.');
      return;
    }

    if (!activeRecipient) {
      setSendError('Alege o conversație sau completează recipientul manual.');
      return;
    }

    setActionBusy(true);
    setSendError('');
    setSendSuccess('');
    try {
      const response = await api.post('/integrations/meta-messaging/send/audio', {
        channel: activeChannel,
        to: activeRecipient,
        audioUrl: outboundAudioUrl.trim(),
        attachmentName: outboundAudioName || undefined,
        integrationId: activeIntegration?.integrationId,
        simulate: outboundWillSimulate,
      });
      const simulated = !!response.data?.simulated;
      setSendSuccess(simulated ? 'Audio-ul a fost simulat local și salvat în inbox.' : 'Audio-ul a fost trimis către Meta.');
      setOutboundAudioUrl('');
      setOutboundAudioName('');
      await refreshAll(false, {
        channel: activeChannel,
        externalUserId: activeRecipient,
        integrationId: activeIntegration?.integrationId,
      });
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut trimite audio-ul.');
    } finally {
      setActionBusy(false);
    }
  };

  const loadAudioTemplates = async () => {
    if (activeChannel !== 'messenger') {
      setAudioTemplates([]);
      return;
    }
    try {
      const response = await api.get('/integrations/meta-messaging/audio-templates', {
        params: {
          channel: 'messenger',
          integrationId: activeIntegration?.integrationId,
        },
      });
      setAudioTemplates(Array.isArray(response.data) ? response.data : []);
    } catch {
      setAudioTemplates([]);
    }
  };

  const stopAudioStream = () => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  };

  const startRecording = async () => {
    if (isRecording) return;
    setSendError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
      const mimeType = candidates.find(
        (c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c),
      );
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioRecorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopAudioStream();
        setIsRecording(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        audioChunksRef.current = [];
        if (!blob.size) {
          setSendError('Înregistrarea audio este goală. Încearcă din nou.');
          return;
        }
        setRecordedBlob(blob);
        setRecordedPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      };
      recorder.start(250);
      setIsRecording(true);
    } catch (error: any) {
      stopAudioStream();
      setIsRecording(false);
      const name = String(error?.name || '').trim();
      setSendError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Permisiunea pentru microfon a fost refuzată. Activează accesul în setările browserului.'
          : 'Nu am putut porni înregistrarea audio.',
      );
    }
  };

  const stopRecording = () => {
    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      audioRecorderRef.current.stop();
    }
  };

  const discardRecording = () => {
    setRecordedBlob(null);
    setRecordedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setNewTemplateName('');
  };

  const recordedToFile = (): File => {
    const ext = (recordedBlob?.type || '').includes('ogg') ? 'ogg' : 'webm';
    return new File([recordedBlob as Blob], `recording.${ext}`, {
      type: recordedBlob?.type || 'audio/webm',
    });
  };

  const sendRecordingNow = async () => {
    if (!recordedBlob) {
      setSendError('Înregistrează mai întâi un mesaj audio.');
      return;
    }
    if (!activeRecipient) {
      setSendError('Alege o conversație sau completează recipientul manual.');
      return;
    }
    setActionBusy(true);
    setSendError('');
    setSendSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', recordedToFile());
      formData.append('channel', activeChannel);
      formData.append('to', activeRecipient);
      if (activeIntegration?.integrationId) formData.append('integrationId', activeIntegration.integrationId);
      if (outboundWillSimulate) formData.append('simulate', 'true');
      const response = await api.post('/integrations/meta-messaging/send/audio-file', formData);
      const simulated = !!response.data?.simulated;
      setSendSuccess(simulated ? 'Audio-ul a fost simulat local și salvat în inbox.' : 'Audio-ul a fost trimis ca mesaj redabil.');
      discardRecording();
      await refreshAll(false, {
        channel: activeChannel,
        externalUserId: activeRecipient,
        integrationId: activeIntegration?.integrationId,
      });
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut trimite audio-ul.');
    } finally {
      setActionBusy(false);
    }
  };

  const saveRecordingAsTemplate = async () => {
    if (!recordedBlob) {
      setSendError('Înregistrează mai întâi un mesaj audio.');
      return;
    }
    setTemplatesBusy(true);
    setSendError('');
    setSendSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', recordedToFile());
      formData.append('channel', 'messenger');
      formData.append('name', newTemplateName.trim() || `Audio ${new Date().toLocaleDateString()}`);
      if (activeIntegration?.integrationId) formData.append('integrationId', activeIntegration.integrationId);
      await api.post('/integrations/meta-messaging/audio-templates', formData);
      setSendSuccess('Template audio salvat.');
      discardRecording();
      await loadAudioTemplates();
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut salva template-ul audio.');
    } finally {
      setTemplatesBusy(false);
    }
  };

  const sendTemplate = async (templateId: string) => {
    if (!activeRecipient) {
      setSendError('Alege o conversație sau completează recipientul manual.');
      return;
    }
    setActionBusy(true);
    setSendError('');
    setSendSuccess('');
    try {
      const response = await api.post('/integrations/meta-messaging/send/audio-template', {
        channel: 'messenger',
        to: activeRecipient,
        templateId,
        integrationId: activeIntegration?.integrationId,
        simulate: outboundWillSimulate,
      });
      const simulated = !!response.data?.simulated;
      setSendSuccess(simulated ? 'Template-ul a fost simulat local și salvat în inbox.' : 'Template-ul audio a fost trimis.');
      await refreshAll(false, {
        channel: activeChannel,
        externalUserId: activeRecipient,
        integrationId: activeIntegration?.integrationId,
      });
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut trimite template-ul.');
    } finally {
      setActionBusy(false);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    setTemplatesBusy(true);
    try {
      await api.delete(`/integrations/meta-messaging/audio-templates/${templateId}`, {
        params: { integrationId: activeIntegration?.integrationId },
      });
      await loadAudioTemplates();
    } catch (error: any) {
      setSendError(error?.response?.data?.message || error?.message || 'Nu am putut șterge template-ul.');
    } finally {
      setTemplatesBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Încărcăm inboxul...
        </div>
      </div>
    );
  }

  if (accessResolved && !hasMessagesAccess) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="max-w-lg">
          <h1 className="text-2xl font-semibold text-slate-950">Messages</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Nu ai acces la `Messenger` sau `Instagram` pe acest user. Un admin poate activa canalele din `Team Members`.
          </p>
        </div>
      </div>
    );
  }

  if (accessResolved && !hasConnectedVisibleChannels) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-slate-950">Messages</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            În workspace-ul curent nu există încă un cont `Messenger` sau `Instagram` conectat pentru tine. Când canalul este conectat, apare automat aici în aceeași pagină.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/integrations"
              className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Open integrations
            </a>
            <button
              onClick={() => refreshAll(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh channels
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm xl:h-[calc(100dvh-6.5rem)]">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-slate-950">Messages</h1>
            </div>

            <div className="flex flex-1 items-center justify-end gap-3 xl:max-w-3xl">
              <div className="relative w-full max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search through inbox conversations"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400"
                />
              </div>

              <button
                onClick={() => refreshAll(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                Refresh
              </button>

              <button
                onClick={() => setShowTools(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <Settings2 className="h-4 w-4" />
                Tools
              </button>
            </div>
          </div>
        </div>

        {(sendError || sendSuccess) && (
          <div
            className={cn(
              'border-b px-5 py-3 text-sm',
              sendError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
            )}
          >
            {sendError || sendSuccess}
          </div>
        )}

        <div className="border-b border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'all', count: inboxStats.all },
                ...(canAccessMessenger ? [{ key: 'messenger', count: inboxStats.messenger }] : []),
                ...(canAccessInstagram ? [{ key: 'instagram', count: inboxStats.instagram }] : []),
                { key: 'unread', count: inboxStats.unread },
              ] as { key: InboxFilter; count: number }[]
            ).map((item) => {
              const active = activeFilter === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveFilter(item.key)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition',
                    active ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                  )}
                >
                  <span>{filterLabels[item.key]}</span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[11px]', active ? 'bg-white text-slate-600' : 'bg-slate-100 text-slate-500')}>
                    {item.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {accountFilters.length > 2 && (
          <div className="border-b border-slate-200 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {accountFilters.map((item) => {
                const active = activeAccountFilter === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveAccountFilter(item.key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                    )}
                  >
                    <span>{item.label}</span>
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500')}>
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          className={cn(
            'grid min-h-[600px] xl:min-h-0 xl:flex-1 xl:overflow-hidden',
            showDetails ? 'xl:grid-cols-[300px_minmax(0,1fr)_280px]' : 'xl:grid-cols-[300px_minmax(0,1fr)]',
          )}
        >
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">Open chats</div>
                  <div className="text-xs text-slate-400">{visibleConversations.length} conversations</div>
                </div>
                <button
                  onClick={() => {
                    setSelectedId('');
                    setManualRecipient('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
              </div>
            </div>

            <div className="max-h-[600px] overflow-y-auto xl:max-h-none xl:flex-1">
              {visibleConversations.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">Nu există conversații pe filtrul curent.</div>
              ) : (
                visibleConversations.map((conversation) => {
                  const active = selectedId === conversation.id;
                  const theme = channelTheme[conversation.channel];
                  const Icon = theme.icon;

                  return (
                    <button
                      key={conversation.id}
                      onClick={() => selectConversation(conversation.id)}
                      className={cn(
                        'flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition',
                        theme.rowAccent,
                        active ? 'bg-slate-50' : 'bg-white hover:bg-slate-50/70',
                      )}
                    >
                      <ContactAvatar
                        name={conversation.contactName}
                        avatarUrl={conversation.avatarUrl}
                        className={cn('mt-0.5 h-10 w-10 text-xs font-semibold', theme.subtleIcon, theme.avatarRing)}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium text-slate-950">{conversation.contactName}</p>
                              {conversation.unreadCount > 0 && <span className="h-2 w-2 rounded-full bg-[#0a66ff]" />}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                              <Icon className={cn('h-3.5 w-3.5', theme.listAccent)} />
                              <span className={cn('font-semibold', theme.listAccent)}>{theme.label}</span>
                              {conversation.messageProfileName && (
                                <>
                                  <span>•</span>
                                  <span className="truncate font-medium text-slate-500">{conversation.messageProfileName}</span>
                                </>
                              )}
                              {conversation.accountName && (
                                <>
                                  <span>•</span>
                                  <span className="truncate">{conversation.accountName}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(conversation.lastMessageTime)}</span>
                        </div>

                        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-500">{conversation.lastMessage}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main
            className={cn(
              'flex min-h-0 flex-col bg-white',
              selectedConversation
                ? channelTheme[selectedConversation.channel].panelBorder
                : 'border-2 border-transparent',
            )}
          >
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  {selectedConversation ? (
                    <div className="flex items-center gap-3">
                      <ContactAvatar
                        name={selectedConversation.contactName}
                        avatarUrl={selectedConversation.avatarUrl}
                        className={cn(
                          'h-11 w-11 text-xs font-semibold',
                          channelTheme[selectedConversation.channel].subtleIcon,
                          channelTheme[selectedConversation.channel].avatarRing,
                        )}
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-slate-950">{selectedConversation.contactName}</h2>
                          <ChannelBadge channel={selectedConversation.channel} />
                          <StatusBadge liveReady={!!activeIntegration?.liveReady} />
                          {selectedConversation.messageProfileName && (
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700">
                              {selectedConversation.messageProfileName}
                            </span>
                          )}
                          {selectedConversation.accountName && (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                              {selectedConversation.accountName}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{selectedConversation.externalUserId}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <AssignmentPill label="Setter" user={currentSetterUser} />
                          <AssignmentPill label="Closer" user={currentCloserUser} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">New conversation</h2>
                      <p className="mt-1 text-sm text-slate-500">Completează canalul și recipientul manual.</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDetails((value) => !value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    {showDetails ? 'Hide details' : 'Show details'}
                  </button>
                  {selectedConversation && (
                    <button
                      onClick={markSelectedUnread}
                      title="Marchează ca necitit"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      <CircleDot className="h-4 w-4" />
                      Necitit
                    </button>
                  )}
                  {selectedConversation && (
                    <button
                      onClick={deleteSelectedConversation}
                      disabled={actionBusy}
                      title="Șterge conversația"
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Șterge
                    </button>
                  )}
                </div>
              </div>

              {!selectedConversation && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <select
                    value={manualChannel}
                    onChange={(event) => setManualChannel(event.target.value as MetaChannel)}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  >
                    {canAccessMessenger && <option value="messenger">Messenger</option>}
                    {canAccessInstagram && <option value="instagram">Instagram</option>}
                  </select>
                  <select
                    value={manualIntegrationId}
                    onChange={(event) => setManualIntegrationId(event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  >
                    {(manualChannel === 'messenger' ? messengerAccounts : instagramAccounts).map((account) => (
                      <option key={account.integrationId} value={account.integrationId}>
                        {getAccountDisplayName(null, account)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={manualRecipient}
                    onChange={(event) => setManualRecipient(event.target.value)}
                    placeholder="Recipient ID manual"
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto bg-[#fbfbfc] px-5 py-6">
              {selectedMessages.length > 0 ? (
                <div className="mx-auto flex max-w-4xl flex-col gap-4">
                  {selectedMessages.map((message) => {
                    const inbound = message.direction === 'inbound';
                    const theme = channelTheme[selectedConversation?.channel || activeChannel];

                    return (
                      <div key={message.id} className={cn('group flex', inbound ? 'justify-start' : 'justify-end')}>
                        <div className="max-w-[78%]">
                          <div className={cn('mb-1 flex items-center gap-2 px-1 text-xs text-slate-400', inbound ? 'justify-start' : 'justify-end')}>
                            <span>{formatTime(message.occurredAt)}</span>
                            <button
                              onClick={() => deleteSingleMessage(message.id)}
                              title="Șterge mesajul"
                              className="opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div
                            className={cn(
                              'rounded-[22px] border px-4 py-3 text-[15px] shadow-sm',
                              inbound ? 'border-slate-200 bg-white text-slate-800' : `border-transparent ${theme.outboundBubble}`,
                            )}
                          >
                            {(() => {
                              const kind = getMediaKind(message);
                              const url = message.metadata.attachmentUrl;
                              const showText =
                                message.description && !(kind && isBracketPlaceholder(message.description));
                              return (
                                <>
                                  {showText && (
                                    <p className="whitespace-pre-wrap leading-6">{message.description}</p>
                                  )}

                                  {kind === 'image' && url && (
                                    <a href={url} target="_blank" rel="noreferrer">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={url}
                                        alt={message.metadata.attachmentName || 'Photo'}
                                        className="mt-1 max-h-80 rounded-2xl object-cover"
                                      />
                                    </a>
                                  )}

                                  {kind === 'video' && url && (
                                    <video controls src={url} className="mt-1 max-h-80 w-full rounded-2xl" />
                                  )}

                                  {kind === 'audio' && url && (
                                    <div className={cn('mt-2 rounded-2xl p-3', inbound ? 'bg-slate-50' : 'bg-white/10')}>
                                      <div className={cn('mb-2 flex items-center gap-2 text-xs', inbound ? 'text-slate-500' : 'text-white/75')}>
                                        <Mic className="h-3.5 w-3.5" />
                                        {message.metadata.attachmentName || 'Audio message'}
                                      </div>
                                      <audio className="w-full" controls src={url} />
                                    </div>
                                  )}

                                  {kind === 'share' && (
                                    <a
                                      href={url || '#'}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cn(
                                        'mt-1 flex items-center gap-3 rounded-2xl border p-3 no-underline',
                                        inbound ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-white/25 bg-white/10 text-white',
                                      )}
                                    >
                                      {url ? (
                                        // Attempt a thumbnail; Meta share/story URLs expire, so hide on error.
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={url}
                                          alt=""
                                          className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
                                          onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <Share2 className="h-5 w-5 flex-shrink-0 opacity-70" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                          {message.metadata.attachmentTitle
                                            || message.metadata.attachmentName
                                            || 'Shared post'}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs opacity-70">
                                          <ExternalLink className="h-3 w-3" /> Open in {selectedConversation?.channel === 'instagram' ? 'Instagram' : 'Messenger'}
                                        </div>
                                      </div>
                                    </a>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                    <div className="max-w-md text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-lg font-medium text-slate-900">Selectează o conversație</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Mesajele vechi nu se importă automat. După webhook setup, conversațiile noi intră aici din conturile conectate.
                      </p>
                    </div>
                  </div>
                )}
            </div>

            <div
              className={cn(
                'bg-white px-5 py-4',
                channelTheme[selectedConversation?.channel || activeChannel].composerDivider,
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div
                  className={cn(
                    'inline-flex rounded-full border bg-slate-50 p-1',
                    channelTheme[selectedConversation?.channel || activeChannel].composerPill,
                  )}
                >
                  <button
                    onClick={() => setComposerMode('text')}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                      composerMode === 'text'
                        ? cn('bg-white shadow-sm', channelTheme[selectedConversation?.channel || activeChannel].listAccent)
                        : 'text-slate-500',
                    )}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setComposerMode('audio')}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                      composerMode === 'audio'
                        ? cn('bg-white shadow-sm', channelTheme[selectedConversation?.channel || activeChannel].listAccent)
                        : 'text-slate-500',
                    )}
                  >
                    Audio
                  </button>
                </div>

                <div className="text-xs text-slate-400">
                  {outboundWillSimulate
                    ? 'Salvare locală în inbox'
                    : `Trimite live via ${activeProfileName || activeAccountName}`}
                </div>
              </div>

              {composerMode === 'text' ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <AudioLibraryPicker
                      channel={activeChannel}
                      to={selectedConversation?.externalUserId}
                      integrationId={activeIntegration?.integrationId}
                      onSent={() =>
                        void refreshAll(false, {
                          channel: activeChannel,
                          externalUserId: selectedConversation?.externalUserId || '',
                          integrationId: activeIntegration?.integrationId,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px]">
                    <textarea
                      value={outboundText}
                      onChange={(event) => setOutboundText(event.target.value)}
                      placeholder="Write a reply..."
                      rows={3}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    />
                    <button
                      onClick={sendText}
                      disabled={actionBusy}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {/* Record / send a playable audio message */}
                  <div className="flex flex-wrap items-center gap-3">
                    {!isRecording && !recordedBlob && (
                      <button
                        onClick={startRecording}
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        <Mic className="h-4 w-4" />
                        Înregistrează
                      </button>
                    )}
                    {isRecording && (
                      <button
                        onClick={stopRecording}
                        className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-red-500"
                      >
                        <Square className="h-4 w-4" />
                        Oprește înregistrarea
                      </button>
                    )}
                    {recordedBlob && (
                      <>
                        <audio controls src={recordedPreviewUrl} className="h-10" />
                        <button
                          onClick={sendRecordingNow}
                          disabled={actionBusy || !activeRecipient}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Trimite acum
                        </button>
                        <button
                          onClick={discardRecording}
                          disabled={actionBusy}
                          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          <X className="h-4 w-4" />
                          Renunță
                        </button>
                      </>
                    )}
                  </div>

                  {/* Save recording as a reusable template (Messenger only) */}
                  {recordedBlob && activeChannel === 'messenger' && (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-3">
                      <input
                        value={newTemplateName}
                        onChange={(event) => setNewTemplateName(event.target.value)}
                        placeholder="Nume template (ex. Salut inițial)"
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-slate-400"
                      />
                      <button
                        onClick={saveRecordingAsTemplate}
                        disabled={templatesBusy}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {templatesBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvează ca template
                      </button>
                    </div>
                  )}

                  {/* Saved templates picker (Messenger only) */}
                  {activeChannel === 'messenger' && audioTemplates.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Template-uri audio salvate
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {audioTemplates.map((template) => (
                          <div
                            key={template.id}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-sm"
                          >
                            <button
                              onClick={() => sendTemplate(template.id)}
                              disabled={actionBusy || !activeRecipient}
                              className="inline-flex items-center gap-1.5 font-medium text-slate-700 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <AudioLines className="h-3.5 w-3.5" />
                              {template.name}
                            </button>
                            <button
                              onClick={() => deleteTemplate(template.id)}
                              disabled={templatesBusy}
                              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-red-500 disabled:opacity-60"
                              aria-label="Șterge template"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeChannel === 'messenger' && (
                    <p className="text-xs text-slate-400">
                      Pe Messenger audio apare ca player redabil (nu ca fișier). Voice note-ul nativ cu waveform nu e suportat de API-ul Meta.
                    </p>
                  )}

                  {/* Manual URL / file upload fallback */}
                  <details className="rounded-2xl border border-slate-200 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-600">
                      Trimite din URL sau fișier (avansat)
                    </summary>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_120px]">
                      <input
                        value={outboundAudioUrl}
                        onChange={(event) => setOutboundAudioUrl(event.target.value)}
                        placeholder="Audio URL"
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                      />
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                        <AudioLines className="h-4 w-4" />
                        {outboundAudioName || 'Upload audio'}
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            setActionBusy(true);
                            setSendError('');
                            try {
                              await uploadAudioFile(file);
                            } catch (error: any) {
                              setSendError(error?.response?.data?.message || error?.message || 'Nu am putut urca audio-ul outbound.');
                            } finally {
                              setActionBusy(false);
                              event.target.value = '';
                            }
                          }}
                        />
                      </label>
                      <button
                        onClick={sendAudio}
                        disabled={actionBusy}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
                        Send
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </main>

          {showDetails && (
            <aside className="border-l border-slate-200 bg-slate-50/40">
              <div className="border-b border-slate-200 px-4 py-4">
                <div className="text-sm font-semibold text-slate-950">Details</div>
              </div>

              <div className="space-y-6 p-4 text-sm">
                {selectedConversation ? (
                  <>
                    <div>
                      <div className="flex items-center gap-3">
                        <ContactAvatar
                          name={selectedConversation.contactName}
                          avatarUrl={selectedConversation.avatarUrl}
                          className={cn(
                            'h-12 w-12 text-xs font-semibold',
                            channelTheme[selectedConversation.channel].subtleIcon,
                            channelTheme[selectedConversation.channel].avatarRing,
                          )}
                        />
                        <div>
                          <div className="font-medium text-slate-950">{selectedConversation.contactName}</div>
                          <div className="mt-1 text-slate-500">{selectedConversation.contactSource || 'Meta contact'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-slate-200 pt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Team</div>
                      <div className="space-y-3">
                        <div>
                          <div className="mb-1.5 text-xs text-slate-400">Setter</div>
                          <select
                            value={currentSetterId}
                            disabled={teamLoading || contactLoading || assignmentBusy === 'setterId' || assignmentMode === 'unavailable'}
                            onChange={(event) => void updateAssignment('setterId', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <option value="">{teamLoading ? 'Loading team...' : 'Unassigned'}</option>
                            {setterOptions.map((user) => (
                              <option key={user.id} value={user.id}>
                                {getUserDisplayName(user)} {formatRole(user.role) ? `· ${formatRole(user.role)}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div className="mb-1.5 text-xs text-slate-400">Closer</div>
                          <select
                            value={currentCloserId}
                            disabled={teamLoading || contactLoading || assignmentBusy === 'closerId' || assignmentMode === 'unavailable'}
                            onChange={(event) => void updateAssignment('closerId', event.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <option value="">{teamLoading ? 'Loading team...' : 'Unassigned'}</option>
                            {closerOptions.map((user) => (
                              <option key={user.id} value={user.id}>
                                {getUserDisplayName(user)} {formatRole(user.role) ? `· ${formatRole(user.role)}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-500">
                          {assignmentMode === 'crm' && 'Assignment-ul se salvează direct pe contactul din CRM, exact pentru thread-ul curent.'}
                          {assignmentMode === 'unavailable' && 'Conversația nu este încă legată de un contact CRM, deci assignment-ul nu poate fi salvat.'}
                        </div>

                        {(assignmentError || assignmentSuccess) && (
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2.5 text-xs',
                              assignmentError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700',
                            )}
                          >
                            {assignmentError || assignmentSuccess}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-slate-200 pt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Contact</div>
                      <div className="space-y-3 text-slate-600">
                        {!selectedConversation.contactId && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-slate-900">Not added as lead yet</div>
                                <div className="mt-1 text-xs leading-5 text-slate-500">
                                  Putem crea contactul direct din conversația asta și îl legăm automat la istoricul Meta existent.
                                </div>
                              </div>
                              <button
                                onClick={() => void addConversationToCrm()}
                                disabled={crmLinkBusy}
                                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {crmLinkBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Add to Lead
                              </button>
                            </div>
                          </div>
                        )}

                        {(crmLinkError || crmLinkSuccess) && (
                          <div
                            className={cn(
                              'rounded-2xl px-3 py-2.5 text-xs',
                              crmLinkError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700',
                            )}
                          >
                            {crmLinkError || crmLinkSuccess}
                          </div>
                        )}

                        <div>
                          <div className="text-xs text-slate-400">Lead in CRM</div>
                          <div className="mt-1 text-slate-900">
                            {contactLoading
                              ? 'Loading contact...'
                              : selectedConversation.contactId
                                ? getContactDisplayName(contactDetails) || selectedConversation.contactName
                                : 'Not added yet'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Email</div>
                          <div className="mt-1 text-slate-900">{contactDetails?.email || 'Not available yet'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Phone</div>
                          <div className="mt-1 text-slate-900">{contactDetails?.phone || 'Not available yet'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Owner</div>
                          <div className="mt-1 text-slate-900">{getUserDisplayName(contactDetails?.owner) || 'Unassigned'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Channel</div>
                          <div className="mt-1"><ChannelBadge channel={selectedConversation.channel} /></div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Profile</div>
                          <div className="mt-1 text-slate-900">{selectedConversation.messageProfileName || 'Standalone account'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Account</div>
                          <div className="mt-1 text-slate-900">{selectedConversation.accountName || activeAccountName}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">External user id</div>
                          <div className="mt-1 break-all text-slate-900">{selectedConversation.externalUserId}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Thread id</div>
                          <div className="mt-1 break-all text-slate-900">{selectedConversation.externalThreadId}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-slate-200 pt-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Routing</div>
                      <div className="space-y-3 text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>Status</span>
                          <StatusBadge liveReady={!!activeIntegration?.liveReady} />
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Profile</div>
                          <div className="mt-1 text-slate-900">{activeProfileName || 'Standalone account'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Account</div>
                          <div className="mt-1 text-slate-900">{activeAccountName}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Last activity</div>
                          <div className="mt-1 text-slate-900">{formatTime(selectedConversation.lastMessageTime)}</div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full min-h-[240px] items-center justify-center text-center text-sm leading-6 text-slate-500">
                    Selectează o conversație pentru detalii de contact și rutare.
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {showTools && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20 backdrop-blur-[1px]">
          <div className="h-full w-full max-w-[440px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-slate-950">Tools & profiles</div>
                  <div className="mt-1 text-sm text-slate-500">Aici stau profilurile, conturile și setup-ul live, separat de inboxul curat.</div>
                </div>
                <button
                  onClick={() => setShowTools(false)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-6 p-5">
              <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <UserCircle2 className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-950">Connected accounts & profiles</h3>
                </div>
                <p className="text-sm leading-6 text-slate-500">
                  Leagă un cont Facebook și unul Instagram sub același profil dacă aparțin aceleiași persoane sau aceluiași brand.
                </p>

                {messageProfiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {messageProfiles.map((profile) => (
                      <span
                        key={profile.id}
                        className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700"
                      >
                        {profile.name}
                      </span>
                    ))}
                  </div>
                )}

                {(profileError || profileSuccess) && (
                  <div
                    className={cn(
                      'rounded-2xl px-3 py-2.5 text-xs',
                      profileError ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700',
                    )}
                  >
                    {profileError || profileSuccess}
                  </div>
                )}

                {accounts.length === 0 ? (
                  <p className="text-sm leading-6 text-slate-500">Nu există încă integrări Meta conectate.</p>
                ) : (
                  accounts.map((account) => {
                    const channel = account.provider === 'facebook' ? 'messenger' : 'instagram';
                    const draft = profileDrafts[account.integrationId] || {
                      selection: account.messageProfileId || 'standalone',
                      newName: '',
                    };
                    const currentProfileLabel = account.messageProfileName || 'Standalone account';
                    return (
                      <div key={account.integrationId} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <ChannelBadge channel={channel} />
                          <StatusBadge liveReady={account.liveReady} />
                        </div>
                        <div className="mt-2 text-sm font-medium text-slate-900">{account.name}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {account.account?.pageName || 'Page nealeasă încă'}
                          {account.account?.igUsername ? ` • @${account.account.igUsername}` : ''}
                        </div>
                        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          Current profile: <span className="font-semibold text-slate-900">{currentProfileLabel}</span>
                        </div>
                        <div className="mt-3 space-y-3">
                          <select
                            value={draft.selection}
                            onChange={(event) => {
                              const value = event.target.value;
                              setProfileDrafts((current) => ({
                                ...current,
                                [account.integrationId]: {
                                  ...draft,
                                  selection: value,
                                },
                              }));
                            }}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
                          >
                            <option value="standalone">Standalone account</option>
                            {messageProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name}
                              </option>
                            ))}
                            <option value="__new__">Create new profile...</option>
                          </select>

                          {draft.selection === '__new__' && (
                            <input
                              value={draft.newName}
                              onChange={(event) => {
                                const value = event.target.value;
                                setProfileDrafts((current) => ({
                                  ...current,
                                  [account.integrationId]: {
                                    ...draft,
                                    newName: value,
                                  },
                                }));
                              }}
                              placeholder="Ex: Alex, Maria, Brand A"
                              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
                            />
                          )}

                          <button
                            onClick={() => void saveMessageProfile(account)}
                            disabled={profileBusyIntegrationId === account.integrationId}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {profileBusyIntegrationId === account.integrationId ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <UserCircle2 className="h-4 w-4" />
                            )}
                            Save profile
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </section>

              <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-950">Webhook setup</h3>
                </div>
                {setupInfo.length === 0 ? (
                  <p className="text-sm leading-6 text-slate-500">După conectarea integrărilor, aici apar URL-urile și token-urile de verificare.</p>
                ) : (
                  setupInfo.map((item) => {
                    const channel = item.provider === 'facebook' ? 'messenger' : 'instagram';
                    return (
                      <div key={item.integrationId} className="space-y-3 rounded-xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <ChannelBadge channel={channel} />
                            {item.accountCount ? (
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
                                {item.accountCount} accounts
                              </span>
                            ) : null}
                          </div>
                          <a
                            href="/integrations"
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-700"
                          >
                            Integrations
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                            <span>Callback URL</span>
                            <button onClick={() => copyText(item.webhookUrl)}>
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-2 break-all text-sm text-slate-700">{item.webhookUrl}</div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                            <span>Verify Token</span>
                            <button onClick={() => copyText(item.verifyToken)}>
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-2 break-all text-sm text-slate-700">{item.verifyToken}</div>
                        </div>

                        {item.accounts?.length ? (
                          <div className="rounded-xl bg-slate-50 p-3">
                            <div className="text-xs text-slate-400">Connected accounts on this webhook</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {item.accounts.map((accountName) => (
                                <span
                                  key={`${item.integrationId}:${accountName}`}
                                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
                                >
                                  {accountName}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
