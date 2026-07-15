import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, ChevronRight, Instagram, MessageCircle, RefreshCw, Search } from 'lucide-react-native';
import api from '../lib/api';
import Avatar from '../components/Avatar';
import { hasChannelAccess } from '../lib/channel-access';
import { useAuthStore } from '../stores/auth-store';
import type { MetaAccount, MetaConversation, MetaInboxFilter } from '../types';
import type { WhatsAppStackParams } from '../navigation/WhatsAppStack';

type Nav = NativeStackNavigationProp<WhatsAppStackParams, 'SocialInbox'>;
type ScreenRoute = RouteProp<WhatsAppStackParams, 'SocialInbox'>;

const FILTER_LABELS: Record<MetaInboxFilter, string> = {
  all: 'All',
  messenger: 'Messenger',
  instagram: 'Instagram',
};

type ProfileFilterOption = {
  key: string;
  label: string;
  count: number;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function buildSyntheticProfileKey(channel: 'messenger' | 'instagram', profileName?: string | null): string {
  const normalized = String(profileName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${channel}:${normalized || 'standalone'}`;
}

function getConversationProfileKey(
  conversation: Pick<MetaConversation, 'channel' | 'integrationId' | 'accountName' | 'messageProfileId' | 'messageProfileName'>,
): string {
  if (conversation.messageProfileId) {
    return `profile:${conversation.messageProfileId}`;
  }

  if (conversation.messageProfileName) {
    return `profile:${buildSyntheticProfileKey(conversation.channel, conversation.messageProfileName)}`;
  }

  if (conversation.integrationId) {
    return `standalone:${conversation.integrationId}`;
  }

  const label = String(conversation.accountName || '').trim().toLowerCase() || 'default';
  return `preview:${conversation.channel}:${label}`;
}

export default function SocialInboxScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ScreenRoute>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [conversations, setConversations] = useState<MetaConversation[]>([]);
  const [activeFilter, setActiveFilter] = useState<MetaInboxFilter>(route.params?.initialChannel || 'all');
  const [activeAccountFilter, setActiveAccountFilter] = useState('all');
  const [activeSetterFilter, setActiveSetterFilter] = useState('all');
  const [activeCloserFilter, setActiveCloserFilter] = useState('all');

  const loadData = useCallback(async () => {
    const [accountsRes, inboxRes] = await Promise.all([
      api.get<MetaAccount[]>('/integrations/meta-messaging/accounts').catch(() => ({ data: [] as MetaAccount[] })),
      api.get('/integrations/meta-messaging/inbox').catch(() => ({ data: { data: [] as MetaConversation[] } })),
    ]);

    setAccounts(Array.isArray(accountsRes.data) ? accountsRes.data : []);
    setConversations(Array.isArray(inboxRes.data?.data) ? inboxRes.data.data : []);
  }, []);

  useEffect(() => {
    let active = true;

    void loadData()
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const messengerVisible = hasChannelAccess(user, 'messenger') && accounts.some(account => account.provider === 'facebook');
  const instagramVisible = hasChannelAccess(user, 'instagram') && accounts.some(account => account.provider === 'instagram');
  const hasVisibleChannel = messengerVisible || instagramVisible;
  const accountsById = useMemo(
    () => new Map(accounts.map(account => [account.integrationId, account])),
    [accounts],
  );

  const availableFilters = useMemo(() => {
    const items: MetaInboxFilter[] = [];
    if (messengerVisible && instagramVisible) {
      items.push('all');
    }
    if (messengerVisible) items.push('messenger');
    if (instagramVisible) items.push('instagram');
    return items;
  }, [instagramVisible, messengerVisible]);

  useEffect(() => {
    if (!availableFilters.length) {
      return;
    }

    if (!availableFilters.includes(activeFilter)) {
      setActiveFilter(availableFilters[0]);
    }
  }, [activeFilter, availableFilters]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      if (conversation.channel === 'messenger' && !messengerVisible) return false;
      if (conversation.channel === 'instagram' && !instagramVisible) return false;
      if (activeFilter !== 'all' && conversation.channel !== activeFilter) return false;

      return true;
    });
  }, [activeFilter, conversations, instagramVisible, messengerVisible]);

  const accountFilters = useMemo<ProfileFilterOption[]>(() => {
    const options = new Map<string, ProfileFilterOption>();

    for (const conversation of filteredConversations) {
      const key = getConversationProfileKey(conversation);
      const linkedAccount = conversation.integrationId ? accountsById.get(conversation.integrationId) : undefined;
      const label =
        String(conversation.messageProfileName || '').trim()
        || String(linkedAccount?.messageProfileName || '').trim()
        || String(conversation.accountName || '').trim()
        || String(linkedAccount?.account?.igUsername || '').trim()
        || String(linkedAccount?.account?.pageName || '').trim()
        || linkedAccount?.name
        || (conversation.channel === 'instagram' ? 'Instagram account' : 'Messenger account');
      const current = options.get(key);

      if (current) {
        current.count += 1;
        continue;
      }

      options.set(key, { key, label, count: 1 });
    }

    const allLabel =
      activeFilter === 'messenger'
        ? 'All Messenger profiles'
        : activeFilter === 'instagram'
          ? 'All Instagram profiles'
          : 'All profiles';

    return [
      { key: 'all', label: allLabel, count: filteredConversations.length },
      ...Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, 'ro')),
    ];
  }, [accountsById, activeFilter, filteredConversations]);

  useEffect(() => {
    if (!accountFilters.some(item => item.key === activeAccountFilter)) {
      setActiveAccountFilter('all');
    }
  }, [accountFilters, activeAccountFilter]);

  // Setter/Closer chips — derived from the loaded conversations (Task 7 fields).
  const setterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of filteredConversations) {
      if (c.setterId && c.setterName) map.set(c.setterId, c.setterName);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }, [filteredConversations]);

  const closerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of filteredConversations) {
      if (c.closerId && c.closerName) map.set(c.closerId, c.closerName);
    }
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ro'));
  }, [filteredConversations]);

  useEffect(() => {
    if (activeSetterFilter !== 'all' && !setterOptions.some(o => o.id === activeSetterFilter)) {
      setActiveSetterFilter('all');
    }
  }, [activeSetterFilter, setterOptions]);

  useEffect(() => {
    if (activeCloserFilter !== 'all' && !closerOptions.some(o => o.id === activeCloserFilter)) {
      setActiveCloserFilter('all');
    }
  }, [activeCloserFilter, closerOptions]);

  const visibleConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return filteredConversations
      .filter((conversation) => {
        if (activeAccountFilter !== 'all' && getConversationProfileKey(conversation) !== activeAccountFilter) {
          return false;
        }
        if (activeSetterFilter !== 'all' && conversation.setterId !== activeSetterFilter) {
          return false;
        }
        if (activeCloserFilter !== 'all' && conversation.closerId !== activeCloserFilter) {
          return false;
        }

        if (!query) return true;
        const haystack = [
          conversation.contactName,
          conversation.lastMessage,
          conversation.contactSource || '',
          conversation.externalUserId,
          conversation.accountName || '',
          conversation.messageProfileName || '',
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  }, [activeAccountFilter, activeCloserFilter, activeSetterFilter, filteredConversations, search]);

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pb-4 bg-white border-b border-slate-200" style={{ paddingTop: insets.top + 10 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              className="h-11 w-11 rounded-2xl bg-slate-100 items-center justify-center"
              activeOpacity={0.8}
            >
              <ArrowLeft size={18} color="#0f172a" />
            </TouchableOpacity>
            <View>
              <Text className="text-[11px] uppercase tracking-[2px] text-slate-400">Social</Text>
              <Text className="text-2xl font-extrabold text-slate-900">Messenger & Instagram</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            className="h-11 w-11 rounded-2xl bg-slate-100 items-center justify-center"
            activeOpacity={0.8}
          >
            <RefreshCw size={18} color="#334155" />
          </TouchableOpacity>
        </View>

        <View className="mt-4 flex-row items-center rounded-2xl border border-slate-200 bg-slate-50 px-3">
          <Search size={16} color="#94a3b8" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations"
            placeholderTextColor="#94a3b8"
            className="flex-1 px-3 py-3.5 text-[15px] text-slate-900"
          />
        </View>

        {availableFilters.length > 0 && (
          <View className="mt-4 flex-row gap-2">
            {availableFilters.map((filter) => (
              <TouchableOpacity
                key={filter}
                onPress={() => setActiveFilter(filter)}
                className={`px-4 py-2.5 rounded-2xl border ${
                  activeFilter === filter
                    ? 'bg-slate-900 border-slate-900'
                    : 'bg-white border-slate-200'
                }`}
                activeOpacity={0.85}
              >
                <Text className={`text-sm font-semibold ${activeFilter === filter ? 'text-white' : 'text-slate-600'}`}>
                  {FILTER_LABELS[filter]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {accountFilters.length > 2 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
            <View className="flex-row gap-2 pr-4">
              {accountFilters.map((filter) => (
                <TouchableOpacity
                  key={filter.key}
                  onPress={() => setActiveAccountFilter(filter.key)}
                  className={`px-4 py-2.5 rounded-2xl border ${
                    activeAccountFilter === filter.key
                      ? 'bg-slate-900 border-slate-900'
                      : 'bg-white border-slate-200'
                  }`}
                  activeOpacity={0.85}
                >
                  <Text className={`text-sm font-semibold ${activeAccountFilter === filter.key ? 'text-white' : 'text-slate-600'}`}>
                    {filter.label} ({filter.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {(setterOptions.length > 0 || closerOptions.length > 0) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
            <View className="flex-row items-center gap-2 pr-4">
              {setterOptions.length > 0 && (
                <>
                  <Text className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Setter</Text>
                  <TouchableOpacity
                    onPress={() => setActiveSetterFilter('all')}
                    className={`px-3 py-1.5 rounded-full border ${
                      activeSetterFilter === 'all' ? 'bg-teal-600 border-teal-600' : 'bg-white border-slate-200'
                    }`}
                    activeOpacity={0.85}
                  >
                    <Text className={`text-xs font-semibold ${activeSetterFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>All</Text>
                  </TouchableOpacity>
                  {setterOptions.map((option) => (
                    <TouchableOpacity
                      key={`setter-${option.id}`}
                      onPress={() => setActiveSetterFilter(option.id)}
                      className={`px-3 py-1.5 rounded-full border ${
                        activeSetterFilter === option.id ? 'bg-teal-600 border-teal-600' : 'bg-white border-slate-200'
                      }`}
                      activeOpacity={0.85}
                    >
                      <Text className={`text-xs font-semibold ${activeSetterFilter === option.id ? 'text-white' : 'text-slate-600'}`}>
                        {option.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {closerOptions.length > 0 && (
                <>
                  <Text className="ml-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Closer</Text>
                  <TouchableOpacity
                    onPress={() => setActiveCloserFilter('all')}
                    className={`px-3 py-1.5 rounded-full border ${
                      activeCloserFilter === 'all' ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'
                    }`}
                    activeOpacity={0.85}
                  >
                    <Text className={`text-xs font-semibold ${activeCloserFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>All</Text>
                  </TouchableOpacity>
                  {closerOptions.map((option) => (
                    <TouchableOpacity
                      key={`closer-${option.id}`}
                      onPress={() => setActiveCloserFilter(option.id)}
                      className={`px-3 py-1.5 rounded-full border ${
                        activeCloserFilter === option.id ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200'
                      }`}
                      activeOpacity={0.85}
                    >
                      <Text className={`text-xs font-semibold ${activeCloserFilter === option.id ? 'text-white' : 'text-slate-600'}`}>
                        {option.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0f766e" />
          <Text className="mt-3 text-sm text-slate-500">Loading social inbox...</Text>
        </View>
      ) : !hasVisibleChannel ? (
        <View className="flex-1 px-4 pt-6">
          <View className="rounded-[28px] border border-slate-200 bg-white p-5">
            <Text className="text-lg font-bold text-slate-900">No connected social inbox</Text>
            <Text className="mt-2 text-sm leading-6 text-slate-500">
              Messenger sau Instagram nu sunt conectate pentru userul curent, asa ca nu le afisam aici.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f766e" />}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom, gap: 10 }}
          ListEmptyComponent={(
            <View className="rounded-[28px] border border-dashed border-slate-200 bg-white px-5 py-8">
              <Text className="text-base font-bold text-slate-900">No conversations</Text>
              <Text className="mt-2 text-sm leading-6 text-slate-500">
                Inca nu exista conversatii pe filtrul ales sau dupa cautarea curenta.
              </Text>
            </View>
          )}
          renderItem={({ item }) => {
            const isInstagram = item.channel === 'instagram';
            const Icon = isInstagram ? Instagram : MessageCircle;
            const accent = isInstagram ? '#c026d3' : '#2563eb';

            return (
              <TouchableOpacity
                onPress={() => navigation.navigate('SocialChat', { conversation: item })}
                className="rounded-[28px] border border-slate-200 bg-white px-4 py-4"
                activeOpacity={0.85}
              >
                <View className="flex-row items-center gap-3">
                  <Avatar name={item.contactName} size="lg" />
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="text-base font-bold text-slate-900 flex-1" numberOfLines={1}>
                        {item.contactName}
                      </Text>
                      <Text className="text-xs text-slate-400">{timeAgo(item.lastMessageTime)}</Text>
                    </View>
                      <View className="mt-1 flex-row items-center gap-2">
                        <View className="px-2 py-1 rounded-full" style={{ backgroundColor: `${accent}15` }}>
                          <View className="flex-row items-center gap-1">
                            <Icon size={12} color={accent} />
                            <Text style={{ color: accent }} className="text-[11px] font-semibold">
                              {isInstagram ? 'Instagram' : 'Messenger'}
                            </Text>
                          </View>
                        </View>
                      {!!item.messageProfileName && (
                        <View className="px-2 py-1 rounded-full bg-emerald-50">
                          <Text className="text-[11px] font-semibold text-emerald-700" numberOfLines={1}>
                            {item.messageProfileName}
                          </Text>
                        </View>
                      )}
                      {!!item.accountName && (
                        <View className="px-2 py-1 rounded-full bg-slate-100">
                          <Text className="text-[11px] font-semibold text-slate-600" numberOfLines={1}>
                            {item.accountName}
                          </Text>
                        </View>
                      )}
                      {!!item.unreadCount && (
                        <View className="px-2 py-1 rounded-full bg-rose-50">
                          <Text className="text-[11px] font-semibold text-rose-600">
                            {item.unreadCount}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="mt-2 text-sm text-slate-500" numberOfLines={2}>
                      {item.lastMessage}
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#94a3b8" />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}
