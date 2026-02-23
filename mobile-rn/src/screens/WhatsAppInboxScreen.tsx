import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, RefreshControl, Modal, ScrollView } from 'react-native';
import { Search, Plus, X, WifiOff, RefreshCw, Users, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../lib/api';
import { useWhatsAppStore } from '../stores/whatsapp-store';
import { useAuthStore } from '../stores/auth-store';
import Avatar from '../components/Avatar';
import type { WhatsAppStackParams } from '../navigation/WhatsAppStack';
import type { Conversation } from '../types';

type Nav = NativeStackNavigationProp<WhatsAppStackParams, 'Inbox'>;

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

type InboxFilter = 'all' | 'unassigned' | 'mine' | 'unread' | 'today';

function isSameDay(dateStr: string): boolean {
  const source = new Date(dateStr);
  const today = new Date();
  return source.toDateString() === today.toDateString();
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
    openConversation,
  } = useWhatsAppStore();
  const currentUser = useAuthStore(s => s.user);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const [assignTarget, setAssignTarget] = useState<Conversation | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<any[]>([]);
  const [manualPhone, setManualPhone] = useState('');
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchInbox();
    fetchAssignments();
    fetchTeamUsers();
    intervalRef.current = setInterval(fetchInbox, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const matchesFilter = useCallback((conv: Conversation, filter: InboxFilter) => {
    if (filter === 'unassigned') return !conv.assignment;
    if (filter === 'mine') return !!currentUser?.id && conv.assignment?.userId === currentUser.id;
    if (filter === 'unread') return conv.unreadCount > 0;
    if (filter === 'today') return isSameDay(conv.lastMessageTime);
    return true;
  }, [currentUser?.id]);

  const byFilter = conversations.filter(conv => matchesFilter(conv, inboxFilter));

  const filtered = search
    ? byFilter.filter(c =>
        c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
      )
    : byFilter;

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const activeSessions = conversations.filter(sessionOpen).length;
  const filterCounts = {
    all: conversations.length,
    unassigned: conversations.filter(conv => matchesFilter(conv, 'unassigned')).length,
    mine: conversations.filter(conv => matchesFilter(conv, 'mine')).length,
    unread: conversations.filter(conv => matchesFilter(conv, 'unread')).length,
    today: conversations.filter(conv => matchesFilter(conv, 'today')).length,
  };

  const onRefresh = useCallback(() => {
    fetchInbox();
    fetchAssignments();
  }, [fetchInbox, fetchAssignments]);

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

  const renderItem = ({ item: conv }: { item: Conversation }) => {
    const isActive = sessionOpen(conv);
    const assigned = conv.assignment;
    return (
      <TouchableOpacity
        onPress={() => openChat(conv)}
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
          <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
            {conv.lastMessage}
          </Text>
        </View>
        <View className="items-end gap-1.5">
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
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          {([
            ['all', 'All'],
            ['unassigned', 'Unassigned'],
            ['mine', 'My leads'],
            ['unread', 'Unread'],
            ['today', 'Today'],
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
    </View>
  );
}
