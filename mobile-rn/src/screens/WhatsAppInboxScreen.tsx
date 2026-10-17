import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, RefreshControl, Modal, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Search, Plus, X, WifiOff, RefreshCw, Users, Check, Archive, ArchiveRestore, Trash2, MailOpen, Pin, BellOff, Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../lib/api';
import { useWhatsAppStore } from '../stores/whatsapp-store';
import { useAuthStore } from '../stores/auth-store';
import Avatar from '../components/Avatar';
import type { WhatsAppStackParams } from '../navigation/WhatsAppStack';
import type { Conversation } from '../types';
import { useToastStore } from '../stores/toast-store';

type Nav = NativeStackNavigationProp<WhatsAppStackParams, 'WhatsAppInbox'>;
type TemplateItem = {
  name: string;
  language: string;
  status?: string;
  category?: string;
  requiresMediaHeader?: boolean;
  requiresDynamicParams?: boolean;
  headerMediaType?: 'image' | 'video' | 'document';
  headerMediaId?: string;
  headerMediaUrl?: string;
  hasReusableHeaderMedia?: boolean;
  components?: any[];
};

function buildTemplateParameters(template: TemplateItem, fallbackName?: string): any[] {
  const components = Array.isArray(template.components) ? template.components : [];
  if (!components.length) return [];
  const baseName = String(fallbackName || '').trim() || 'there';
  const built: any[] = [];

  for (const component of components) {
    const type = String(component?.type || '').toUpperCase();
    if (!['HEADER', 'BODY'].includes(type)) continue;
    const text = String(component?.text || '');
    const placeholders = Array.from(text.matchAll(/\{\{\d+\}\}/g));
    if (!placeholders.length) continue;
    built.push({
      type: type.toLowerCase(),
      parameters: placeholders.map((_, index) => ({
        type: 'text',
        text: index === 0 ? baseName : '-',
      })),
    });
  }

  return built;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function sessionOpen(conv: Conversation): boolean {
  if (!conv.lastInboundTime) return false;
  return (Date.now() - new Date(conv.lastInboundTime).getTime()) < 24 * 60 * 60 * 1000;
}

function getInitials(name?: string): string {
  const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return '??';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase();
}

function formatSourceLabel(source?: string | null): string {
  const raw = String(source || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  if (normalized === 'manychat') return 'ManyChat';
  if (normalized === 'typeform') return 'Typeform';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSourceValue(source?: string | null): string {
  return String(source || '').trim().toLowerCase();
}

type InboxFilter = 'all' | 'unassigned' | 'mine' | 'unread' | 'today' | 'pinned' | 'archived' | 'no_reply';

function isSameDay(dateStr: string): boolean {
  const source = new Date(dateStr);
  const today = new Date();
  return source.toDateString() === today.toDateString();
}

function isMuted(conv: Conversation): boolean {
  const mutedUntil = String(conv.mutedUntil || '').trim();
  if (!mutedUntil) return false;
  const parsed = new Date(mutedUntil);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
}

export default function WhatsAppInboxScreen() {
  const {
    conversations,
    teamUsers,
    isLoading,
    fetchError,
    fetchInbox,
    fetchAssignments,
    fetchTeamUsers,
    assignConversation,
    markUnread,
    archiveConversation,
    pinConversation,
    muteConversation,
    deleteConversation,
    pendingOutboxCount,
    syncOutbox,
    openConversation,
  } = useWhatsAppStore();
  const showToast = useToastStore(s => s.show);
  const currentUser = useAuthStore(s => s.user);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [assignTarget, setAssignTarget] = useState<Conversation | null>(null);
  const [actionTarget, setActionTarget] = useState<Conversation | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<any[]>([]);
  const [manualPhone, setManualPhone] = useState('');
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSendingTemplate, setIsSendingTemplate] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchInbox();
    fetchAssignments();
    fetchTeamUsers();
    syncOutbox();
    intervalRef.current = setInterval(fetchInbox, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const matchesFilter = useCallback((conv: Conversation, filter: InboxFilter) => {
    if (filter === 'archived') return !!conv.archived;
    if (conv.archived) return false;
    if (filter === 'pinned') return !!conv.pinned;
    if (filter === 'unassigned') return !conv.assignment;
    if (filter === 'mine') return !!currentUser?.id && conv.assignment?.userId === currentUser.id;
    if (filter === 'unread') return conv.unreadCount > 0;
    if (filter === 'today') return isSameDay(conv.lastMessageTime);
    if (filter === 'no_reply') return !conv.lastInboundTime && conv.messageCount > 0;
    return true;
  }, [currentUser?.id]);

  const byFilter = conversations.filter(conv => matchesFilter(conv, inboxFilter));
  const sourceOptions = useMemo(() => {
    const items = new Map<string, string>();
    for (const conv of byFilter) {
      const normalized = normalizeSourceValue(conv.contactSource);
      if (!normalized || items.has(normalized)) continue;
      items.set(normalized, formatSourceLabel(conv.contactSource));
    }
    return [
      { value: 'all', label: 'All sources' },
      ...Array.from(items.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [byFilter]);

  useEffect(() => {
    if (sourceFilter === 'all') return;
    if (!sourceOptions.some(option => option.value === sourceFilter)) {
      setSourceFilter('all');
    }
  }, [sourceFilter, sourceOptions]);

  const bySource = sourceFilter === 'all'
    ? byFilter
    : byFilter.filter(conv => normalizeSourceValue(conv.contactSource) === sourceFilter);

  const filtered = search
    ? bySource.filter(c =>
        c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
      )
    : bySource;

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const activeSessions = conversations.filter(sessionOpen).length;
  const filterCounts = {
    all: conversations.length,
    unassigned: conversations.filter(conv => matchesFilter(conv, 'unassigned')).length,
    mine: conversations.filter(conv => matchesFilter(conv, 'mine')).length,
    unread: conversations.filter(conv => matchesFilter(conv, 'unread')).length,
    today: conversations.filter(conv => matchesFilter(conv, 'today')).length,
    pinned: conversations.filter(conv => matchesFilter(conv, 'pinned')).length,
    archived: conversations.filter(conv => matchesFilter(conv, 'archived')).length,
    no_reply: conversations.filter(conv => matchesFilter(conv, 'no_reply')).length,
  };

  const onRefresh = useCallback(() => {
    fetchInbox();
    fetchAssignments();
    syncOutbox();
  }, [fetchInbox, fetchAssignments, syncOutbox]);

  const handleAssign = async (userId: string | null) => {
    if (!assignTarget || isAssigning) return;
    setIsAssigning(true);
    const user = userId ? teamUsers.find((candidate) => candidate.id === userId) || null : null;
    await assignConversation(assignTarget.waId, user);
    setIsAssigning(false);
    setAssignTarget(null);
  };

  const openChat = (conv: Conversation) => {
    openConversation({
      waId: conv.waId,
      phone: conv.phone,
      contactName: conv.contactName,
      contactId: conv.contactId,
    });
    navigation.navigate('Chat', {
      waId: conv.waId,
      contactName: conv.contactName,
      phone: conv.phone,
    });
  };

  const handleMarkUnread = async () => {
    if (!actionTarget || isApplyingAction) return;
    setIsApplyingAction(true);
    await markUnread(actionTarget.waId);
    setIsApplyingAction(false);
    setActionTarget(null);
  };

  const handleArchiveToggle = async () => {
    if (!actionTarget || isApplyingAction) return;
    setIsApplyingAction(true);
    await archiveConversation(actionTarget.waId, !actionTarget.archived);
    setIsApplyingAction(false);
    setActionTarget(null);
  };

  const handlePinToggle = async () => {
    if (!actionTarget || isApplyingAction) return;
    setIsApplyingAction(true);
    await pinConversation(actionTarget.waId, !actionTarget.pinned);
    setIsApplyingAction(false);
    setActionTarget(null);
  };

  const handleMuteToggle = async () => {
    if (!actionTarget || isApplyingAction) return;
    setIsApplyingAction(true);
    const currentlyMuted = isMuted(actionTarget);
    const mutedUntil = currentlyMuted ? null : new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString();
    await muteConversation(actionTarget.waId, mutedUntil);
    setIsApplyingAction(false);
    setActionTarget(null);
  };

  const handleDeleteConversation = () => {
    if (!actionTarget || isApplyingAction) return;
    Alert.alert(
      'Delete conversation?',
      'This will permanently remove all messages with ' + actionTarget.contactName,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsApplyingAction(true);
            await deleteConversation(actionTarget.waId);
            setIsApplyingAction(false);
            setActionTarget(null);
          },
        },
      ],
    );
  };

  const searchContacts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setContactResults([]);
      return;
    }
    setIsSearchingContacts(true);
    try {
      const res = await api.get('/contacts', { params: { search: query.trim(), limit: 12 } });
      setContactResults(res.data?.data || res.data?.contacts || []);
    } catch {
      setContactResults([]);
    } finally {
      setIsSearchingContacts(false);
    }
  }, []);

  useEffect(() => {
    const q = contactQuery.trim();
    if (!showNewModal || !q) {
      if (!q) setContactResults([]);
      return;
    }
    const t = setTimeout(() => searchContacts(q), 250);
    return () => clearTimeout(t);
  }, [contactQuery, showNewModal, searchContacts]);

  const loadTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await api.get('/integrations/whatsapp/templates');
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      const mapped: TemplateItem[] = rows
        .map((tpl: any) => {
          const components = Array.isArray(tpl?.components) ? tpl.components : [];
          const headerComponent = components.find((component: any) => {
            const componentType = String(component?.type || '').toUpperCase();
            const headerFormat = String(component?.format || '').toUpperCase();
            return componentType === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat);
          });
          const headerMediaType = headerComponent
            ? String(headerComponent?.format || '').trim().toLowerCase() as TemplateItem['headerMediaType']
            : undefined;
          const headerMediaId = String(tpl?.headerMediaId || '').trim() || undefined;
          const headerMediaUrl = String(tpl?.headerMediaUrl || '').trim() || undefined;
          const requiresMediaHeader = Boolean(headerMediaType);
          const requiresDynamicParams = components.some((component: any) => {
            const text = String(component?.text || '');
            return /\{\{\d+\}\}/.test(text);
          });
          return {
            name: String(tpl?.name || '').trim(),
            language: String(tpl?.language || '').trim() || 'en',
            status: String(tpl?.status || '').trim(),
            category: String(tpl?.category || '').trim(),
            requiresMediaHeader,
            requiresDynamicParams,
            headerMediaType,
            headerMediaId,
            headerMediaUrl,
            hasReusableHeaderMedia: requiresMediaHeader && Boolean(headerMediaId || headerMediaUrl),
            components,
          };
        })
        .filter((tpl: TemplateItem) => tpl.name && String(tpl.status || '').toUpperCase() === 'APPROVED')
        .sort((a: TemplateItem, b: TemplateItem) => `${a.name}_${a.language}`.localeCompare(`${b.name}_${b.language}`));

      setTemplates(mapped);
      setSelectedTemplate((current) => {
        if (!current) return mapped[0] || null;
        const stillExists = mapped.some((tpl) => tpl.name === current.name && tpl.language === current.language);
        return stillExists ? current : (mapped[0] || null);
      });
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to load templates', 'error');
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!showNewModal) return;
    loadTemplates();
  }, [showNewModal, loadTemplates]);

  const startConversation = async (input: { phone?: string; contactName?: string; contactId?: string | null }) => {
    const waId = String(input.phone || '').replace(/[^0-9]/g, '');
    if (!waId) return;
    const phone = `+${waId}`;
    await openConversation({
      waId,
      phone,
      contactName: input.contactName || phone,
      contactId: input.contactId || null,
    });
    setShowNewModal(false);
    setContactQuery('');
    setContactResults([]);
    setManualPhone('');
    navigation.navigate('Chat', {
      waId,
      contactName: input.contactName || phone,
      phone,
    });
  };

  const sendTemplateToNewNumber = async () => {
    const waId = String(manualPhone || '').replace(/[^0-9]/g, '');
    if (!waId) {
      showToast('Add a phone number first', 'error');
      return;
    }
    if (!selectedTemplate) {
      showToast('Select a template first', 'error');
      return;
    }
    if (selectedTemplate.requiresMediaHeader && !selectedTemplate.hasReusableHeaderMedia) {
      showToast('This template needs saved header media. Send it once from web first, then mobile can reuse it.', 'error');
      return;
    }

    setIsSendingTemplate(true);
    try {
      const parameters = buildTemplateParameters(selectedTemplate, '');
      await api.post('/integrations/whatsapp/send/template', {
        to: waId,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language || 'en',
        ...(parameters.length ? { parameters } : {}),
        ...(selectedTemplate.headerMediaType ? { headerMediaType: selectedTemplate.headerMediaType } : {}),
        ...(selectedTemplate.headerMediaId ? { headerMediaId: selectedTemplate.headerMediaId } : {}),
        ...(selectedTemplate.headerMediaUrl ? { headerMediaUrl: selectedTemplate.headerMediaUrl } : {}),
      });
      showToast(`Template sent: ${selectedTemplate.name}`, 'success');
      await startConversation({ phone: manualPhone });
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Template send failed', 'error');
    } finally {
      setIsSendingTemplate(false);
    }
  };

  const renderItem = ({ item: conv }: { item: Conversation }) => {
    const isActive = sessionOpen(conv);
    const assigned = conv.assignment;
    const sourceLabel = formatSourceLabel(conv.contactSource);
    const muted = isMuted(conv);
    return (
      <TouchableOpacity
        onPress={() => openChat(conv)}
        onLongPress={() => setActionTarget(conv)}
        className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-2.5 flex-row items-center gap-3"
        activeOpacity={0.7}
      >
        <View>
          <Avatar name={conv.contactName} />
          {isActive && (
            <View className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-emerald-400 rounded-full border-2 border-white" />
          )}
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
              {conv.contactName}
            </Text>
            <Text className="text-[10px] text-slate-400 ml-2">{timeAgo(conv.lastMessageTime)}</Text>
          </View>
          {!!sourceLabel && (
            <Text className="text-[11px] text-sky-700 mt-0.5" numberOfLines={1}>
              {sourceLabel}
            </Text>
          )}
          <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
            {conv.lastMessage}
          </Text>
        </View>
        <View className="items-end gap-1.5">
          <View className="flex-row items-center gap-1">
            {conv.pinned ? <Pin size={12} color="#0369a1" /> : null}
            {muted ? <BellOff size={12} color="#64748b" /> : null}
          </View>
          <TouchableOpacity
            onPress={() => setAssignTarget(conv)}
            className="h-8 w-8 rounded-full items-center justify-center border border-slate-200"
            style={{ backgroundColor: assigned?.color || '#e2e8f0' }}
          >
            {assigned ? (
              <Text className="text-[10px] font-bold text-white">{getInitials(assigned.userName)}</Text>
            ) : (
              <Users size={14} color="#64748b" />
            )}
          </TouchableOpacity>
          {conv.unreadCount > 0 && (
            <View className="bg-teal-500 rounded-full min-w-[20px] h-5 items-center justify-center px-1.5">
              <Text className="text-white text-[10px] font-bold">{conv.unreadCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View
        className="px-4 pb-4 bg-sky-800"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-sky-200">Messages</Text>
            <Text className="text-2xl font-extrabold text-white">WhatsApp</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => setShowNewModal(true)}
              className="p-2 rounded-xl bg-white/15 border border-white/20"
            >
              <Plus size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowSearch(!showSearch)}
              className="p-2 rounded-xl bg-white/15 border border-white/20"
            >
              {showSearch ? <X size={20} color="#fff" /> : <Search size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
        <View className="flex-row gap-2 mt-3">
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{conversations.length} chats</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{totalUnread} unread</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{activeSessions} active</Text>
          </View>
          {pendingOutboxCount > 0 && (
            <View className="bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full">
              <Text className="text-[11px] font-semibold text-amber-700">retry {pendingOutboxCount}</Text>
            </View>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          {([
            ['all', 'All'],
            ['unassigned', 'Unassigned'],
            ['mine', 'My leads'],
            ['unread', 'Unread'],
            ['today', 'Today'],
            ['no_reply', 'No Reply'],
            ['pinned', 'Pinned'],
            ['archived', 'Archived'],
          ] as Array<[InboxFilter, string]>).map(([key, label]) => {
            const active = inboxFilter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setInboxFilter(key)}
                className={`px-3 py-1.5 rounded-full border ${active ? 'bg-white border-white' : 'bg-white/10 border-white/25'}`}
              >
                <Text className={`text-[11px] font-semibold ${active ? 'text-sky-800' : 'text-white'}`}>
                  {label} ({filterCounts[key]})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
          {sourceOptions.map((option) => {
            const active = sourceFilter === option.value;
            const count = option.value === 'all'
              ? byFilter.length
              : byFilter.filter(conv => normalizeSourceValue(conv.contactSource) === option.value).length;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setSourceFilter(option.value)}
                className={`px-3 py-1.5 rounded-full border ${active ? 'bg-white border-white' : 'bg-white/10 border-white/25'}`}
              >
                <Text className={`text-[11px] font-semibold ${active ? 'text-sky-800' : 'text-white'}`}>
                  {option.label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {showSearch && (
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            autoFocus
            className="mt-3 px-3.5 py-2.5 rounded-xl bg-white/15 border border-white/25 text-white text-sm"
          />
        )}
      </View>

      {/* Error */}
      {fetchError && !isLoading && conversations.length === 0 && (
        <View className="mx-3 mt-3 flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-100">
          <WifiOff size={20} color="#f87171" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-red-700">Connection error</Text>
            <Text className="text-xs text-red-500 mt-0.5" numberOfLines={1}>{fetchError}</Text>
          </View>
          <TouchableOpacity onPress={fetchInbox} className="p-2 rounded-lg bg-red-100">
            <RefreshCw size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.waId}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0c4a6e" />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-20">
              <View className="h-14 w-14 rounded-2xl bg-white border border-slate-200 items-center justify-center">
                <Search size={28} color="#94a3b8" />
              </View>
              <Text className="text-sm font-medium text-slate-500 mt-3">No conversations</Text>
              <Text className="text-xs text-slate-400 mt-1">Pull to refresh</Text>
            </View>
          ) : null
        }
      />

      <Modal visible={showNewModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 justify-end"
        >
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[78%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">New WhatsApp chat</Text>
              <TouchableOpacity onPress={() => setShowNewModal(false)} className="p-1.5 rounded-xl bg-slate-100">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="px-4 pt-3">
              <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Choose existing contact</Text>
              <TextInput
                value={contactQuery}
                onChangeText={setContactQuery}
                placeholder="Search by name, phone or email"
                placeholderTextColor="#94a3b8"
                className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
              />
            </View>

            {isSearchingContacts ? (
              <View className="px-4 py-3 flex-row items-center gap-2">
                <RefreshCw size={14} color="#64748b" />
                <Text className="text-xs text-slate-500">Searching contacts...</Text>
              </View>
            ) : (
              <FlatList
                data={contactResults}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 220 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10 }}
                renderItem={({ item }) => {
                  const phone = String(item.phone || '');
                  const name = `${item.firstName || ''} ${item.lastName || ''}`.trim() || phone;
                  return (
                    <TouchableOpacity
                      onPress={() => startConversation({ phone, contactName: name, contactId: item.id })}
                      className="py-2.5 border-b border-slate-100 flex-row items-center gap-2"
                    >
                      <Avatar name={name} size="sm" />
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-slate-800">{name}</Text>
                        <Text className="text-xs text-slate-500">{phone || '-'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  contactQuery.trim()
                    ? <Text className="text-xs text-slate-400 py-3">No contacts found</Text>
                    : null
                }
              />
            )}

            <View className="px-4 pt-3">
              <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Or add new number</Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={manualPhone}
                  onChangeText={(v) => setManualPhone(v.replace(/[^0-9+]/g, ''))}
                  placeholder="+40712345678"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
                />
                <TouchableOpacity
                  onPress={() => startConversation({ phone: manualPhone })}
                  disabled={!manualPhone.trim()}
                  className={`px-4 py-2.5 rounded-xl ${manualPhone.trim() ? 'bg-teal-600' : 'bg-slate-300'}`}
                >
                  <Text className="text-xs font-semibold text-white">Start</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="px-4 pt-4 pb-2">
              <Text className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Send template to new number</Text>
              <TouchableOpacity
                onPress={() => setShowTemplatePicker(true)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200"
              >
                <Text className="text-sm text-slate-800" numberOfLines={1}>
                  {selectedTemplate ? `${selectedTemplate.name} (${selectedTemplate.language})` : (isLoadingTemplates ? 'Loading templates...' : 'Select template')}
                </Text>
              </TouchableOpacity>
              {selectedTemplate?.requiresMediaHeader ? (
                <Text className="text-[11px] text-amber-600 mt-1.5">
                  {selectedTemplate.hasReusableHeaderMedia
                    ? `Saved ${selectedTemplate.headerMediaType || 'header'} media will be reused from your web setup.`
                    : 'This template needs header media. Send it once from web first so mobile can reuse it.'}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={sendTemplateToNewNumber}
                disabled={!manualPhone.trim() || !selectedTemplate || isSendingTemplate || Boolean(selectedTemplate?.requiresMediaHeader && !selectedTemplate?.hasReusableHeaderMedia)}
                className={`mt-2 px-4 py-2.5 rounded-xl ${
                  manualPhone.trim()
                    && selectedTemplate
                    && !isSendingTemplate
                    && !(selectedTemplate.requiresMediaHeader && !selectedTemplate.hasReusableHeaderMedia)
                    ? 'bg-sky-700'
                    : 'bg-slate-300'
                }`}
              >
                <Text className="text-xs font-semibold text-white text-center">
                  {isSendingTemplate ? 'Sending...' : 'Send Template'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showTemplatePicker} animationType="slide" transparent onRequestClose={() => setShowTemplatePicker(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[72%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <Text className="text-base font-bold text-slate-900">Select template</Text>
              <TouchableOpacity onPress={() => setShowTemplatePicker(false)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={templates}
              keyExtractor={(item) => `${item.name}_${item.language}`}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
              renderItem={({ item }) => {
                const isSelected = selectedTemplate?.name === item.name && selectedTemplate?.language === item.language;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedTemplate(item);
                      setShowTemplatePicker(false);
                    }}
                    className={`py-2.5 px-1 rounded-xl flex-row items-center gap-2 mb-1 ${isSelected ? 'bg-sky-50' : ''}`}
                  >
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text className="text-xs text-slate-500" numberOfLines={1}>
                        {item.language} • {item.category || 'template'}
                      </Text>
                    </View>
                    {isSelected && <Check size={16} color="#0284c7" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View className="py-4">
                  <Text className="text-xs text-slate-400">
                    {isLoadingTemplates ? 'Loading templates...' : 'No approved templates found'}
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal visible={!!assignTarget} animationType="slide" transparent onRequestClose={() => setAssignTarget(null)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-bold text-slate-900">Assign conversation</Text>
                <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{assignTarget?.contactName}</Text>
              </View>
              <TouchableOpacity onPress={() => setAssignTarget(null)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={teamUsers}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 340 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10 }}
              renderItem={({ item }) => {
                const fullName = `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email;
                const isCurrent = assignTarget?.assignment?.userId === item.id;
                return (
                  <TouchableOpacity
                    onPress={() => handleAssign(item.id)}
                    disabled={isAssigning}
                    className={`py-2.5 px-1 rounded-xl flex-row items-center gap-2 mb-1 ${isCurrent ? 'bg-sky-50' : ''}`}
                  >
                    <View className="h-8 w-8 rounded-full bg-teal-700 items-center justify-center">
                      <Text className="text-[11px] font-semibold text-white">{getInitials(fullName)}</Text>
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-sm font-medium text-slate-800" numberOfLines={1}>{fullName}</Text>
                      <Text className="text-xs text-slate-500" numberOfLines={1}>{item.email}</Text>
                    </View>
                    {isCurrent && <Check size={16} color="#0284c7" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text className="text-xs text-slate-400 py-4">No team users available</Text>}
            />
            {assignTarget?.assignment && (
              <View className="px-4 pt-1">
                <TouchableOpacity
                  onPress={() => handleAssign(null)}
                  disabled={isAssigning}
                  className="px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 items-center"
                >
                  <Text className="text-xs font-semibold text-rose-600">Unassign</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!actionTarget} animationType="slide" transparent onRequestClose={() => setActionTarget(null)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-base font-bold text-slate-900">Conversation actions</Text>
                <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{actionTarget?.contactName}</Text>
              </View>
              <TouchableOpacity onPress={() => setActionTarget(null)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="px-4 pt-3 gap-2">
              <TouchableOpacity
                onPress={handleMarkUnread}
                disabled={isApplyingAction}
                className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 flex-row items-center gap-2"
              >
                <MailOpen size={16} color="#334155" />
                <Text className="text-sm font-medium text-slate-700">Mark as unread</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePinToggle}
                disabled={isApplyingAction}
                className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 flex-row items-center gap-2"
              >
                <Pin size={16} color="#334155" />
                <Text className="text-sm font-medium text-slate-700">
                  {actionTarget?.pinned ? 'Unpin' : 'Pin'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleMuteToggle}
                disabled={isApplyingAction}
                className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 flex-row items-center gap-2"
              >
                {actionTarget && isMuted(actionTarget) ? <Bell size={16} color="#334155" /> : <BellOff size={16} color="#334155" />}
                <Text className="text-sm font-medium text-slate-700">
                  {actionTarget && isMuted(actionTarget) ? 'Unmute' : 'Mute 8h'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleArchiveToggle}
                disabled={isApplyingAction}
                className="px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 flex-row items-center gap-2"
              >
                {actionTarget?.archived ? <ArchiveRestore size={16} color="#334155" /> : <Archive size={16} color="#334155" />}
                <Text className="text-sm font-medium text-slate-700">
                  {actionTarget?.archived ? 'Unarchive' : 'Archive'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDeleteConversation}
                disabled={isApplyingAction}
                className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 flex-row items-center gap-2"
              >
                <Trash2 size={16} color="#dc2626" />
                <Text className="text-sm font-semibold text-rose-600">Delete conversation</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
