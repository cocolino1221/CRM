import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowRight, Instagram, MessageCircle, RefreshCw } from 'lucide-react-native';
import api from '../lib/api';
import { hasChannelAccess } from '../lib/channel-access';
import {
  DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY,
  fetchWorkspaceChannelAvailability,
} from '../lib/workspace-channel-availability';
import { useAuthStore } from '../stores/auth-store';
import type { MetaAccount } from '../types';
import type { WhatsAppStackParams } from '../navigation/WhatsAppStack';

type Nav = NativeStackNavigationProp<WhatsAppStackParams, 'Hub'>;

type WhatsAppAccountsResponse = {
  data?: Array<Record<string, any>>;
};

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function MessagesHubScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availability, setAvailability] = useState(DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY);
  const [whatsAppAccountsCount, setWhatsAppAccountsCount] = useState(0);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);

  const loadData = useCallback(async () => {
    const [availabilityData, waAccountsRes, metaAccountsRes] = await Promise.all([
      fetchWorkspaceChannelAvailability().catch(() => DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY),
      api.get<WhatsAppAccountsResponse>('/integrations/whatsapp/accounts').catch(() => ({ data: { data: [] } })),
      api.get<MetaAccount[]>('/integrations/meta-messaging/accounts').catch(() => ({ data: [] as MetaAccount[] })),
    ]);

    setAvailability(availabilityData);
    setWhatsAppAccountsCount(Array.isArray(waAccountsRes.data?.data) ? waAccountsRes.data.data.length : 0);
    setMetaAccounts(Array.isArray(metaAccountsRes.data) ? metaAccountsRes.data : []);
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

  const messengerAccount = useMemo(
    () => metaAccounts.find(account => account.provider === 'facebook') || null,
    [metaAccounts],
  );
  const instagramAccount = useMemo(
    () => metaAccounts.find(account => account.provider === 'instagram') || null,
    [metaAccounts],
  );

  const channels = useMemo(() => {
    const items: Array<{
      key: string;
      title: string;
      subtitle: string;
      accent: string;
      onPress: () => void;
      icon: typeof MessageCircle;
    }> = [];

    if (hasChannelAccess(user, 'whatsapp') && availability.whatsapp) {
      items.push({
        key: 'whatsapp',
        title: 'WhatsApp',
        subtitle: whatsAppAccountsCount > 0
          ? `${pluralize(whatsAppAccountsCount, 'connected number', 'connected numbers')}`
          : 'Open inbox, templates and voice notes',
        accent: '#0f766e',
        onPress: () => navigation.navigate('WhatsAppInbox'),
        icon: MessageCircle,
      });
    }

    if (hasChannelAccess(user, 'messenger') && availability.messenger) {
      items.push({
        key: 'messenger',
        title: 'Messenger',
        subtitle: messengerAccount?.account?.pageName
          ? `${messengerAccount.account.pageName}`
          : 'Facebook Page connected',
        accent: '#2563eb',
        onPress: () => navigation.navigate('SocialInbox', { initialChannel: 'messenger' }),
        icon: MessageCircle,
      });
    }

    if (hasChannelAccess(user, 'instagram') && availability.instagram) {
      items.push({
        key: 'instagram',
        title: 'Instagram',
        subtitle: instagramAccount?.account?.igUsername
          ? `@${instagramAccount.account.igUsername}`
          : 'Instagram account connected',
        accent: '#c026d3',
        onPress: () => navigation.navigate('SocialInbox', { initialChannel: 'instagram' }),
        icon: Instagram,
      });
    }

    return items;
  }, [
    availability.instagram,
    availability.messenger,
    availability.whatsapp,
    instagramAccount?.account?.igUsername,
    messengerAccount?.account?.pageName,
    navigation,
    user,
    whatsAppAccountsCount,
  ]);

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f766e" />}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      >
        <View className="px-4 pb-10 bg-slate-900" style={{ paddingTop: insets.top + 12 }}>
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 min-w-0">
              <Text className="text-[11px] uppercase tracking-[2px] text-slate-400">Inbox</Text>
              <Text className="text-3xl font-extrabold text-white">Messages</Text>
              <Text className="mt-2 text-sm leading-5 text-slate-300">
                WhatsApp, Messenger si Instagram intr-un singur loc.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onRefresh}
              className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 items-center justify-center border border-white/10"
              activeOpacity={0.8}
            >
              <RefreshCw size={18} color="#e2e8f0" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-4 -mt-5">
          <View className="bg-white rounded-[28px] border border-slate-100 p-5 shadow-sm">
            <Text className="text-base font-bold text-slate-900">Connected channels</Text>
            <Text className="mt-1 text-sm text-slate-500">
              Alege canalul pe care vrei sa raspunzi. Apar doar conturile conectate in workspace.
            </Text>

            {loading ? (
              <View className="py-12 items-center justify-center">
                <ActivityIndicator color="#0f766e" />
                <Text className="mt-3 text-sm text-slate-500">Checking connected channels...</Text>
              </View>
            ) : channels.length === 0 ? (
              <View className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6">
                <Text className="text-base font-semibold text-slate-900">No connected messaging channels</Text>
                <Text className="mt-2 text-sm leading-6 text-slate-500">
                  Daca legi WhatsApp, Messenger sau Instagram in workspace, canalul apare automat aici.
                </Text>
              </View>
            ) : (
              <View className="mt-4 gap-3">
                {channels.map((item) => {
                  const Icon = item.icon;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={item.onPress}
                      className="rounded-3xl border border-slate-200 bg-white px-4 py-4"
                      activeOpacity={0.85}
                    >
                      <View className="flex-row items-center gap-3">
                        <View className="h-12 w-12 shrink-0 rounded-2xl items-center justify-center" style={{ backgroundColor: `${item.accent}15` }}>
                          <Icon size={22} color={item.accent} />
                        </View>
                        <View className="flex-1 min-w-0">
                          <Text className="text-base font-bold text-slate-900" numberOfLines={1}>{item.title}</Text>
                          <Text className="mt-0.5 text-sm text-slate-500" numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        </View>
                        <ArrowRight size={18} color="#94a3b8" className="shrink-0" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
