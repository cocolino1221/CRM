import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ScrollView, RefreshControl,
} from 'react-native';
import { Search, Plus, X, Phone, Mail, ChevronRight, WifiOff, RefreshCw, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLeadsStore } from '../stores/leads-store';
import { SOURCE_OPTIONS } from '../lib/lead-filters';
import { leadStage } from '../lib/lead-stage';
import DispositionDialog from '../components/DispositionDialog';
import Avatar from '../components/Avatar';
import type { LeadsStackParams } from '../navigation/LeadsStack';
import type { Contact } from '../types';

type Nav = NativeStackNavigationProp<LeadsStackParams, 'LeadsList'>;


const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};


/** "17 oct." — short enough for a row, unambiguous about the month. */
function formatLeadDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const MONTHS = [
  'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun',
  'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec',
];

export default function LeadsListScreen() {
  const {
    contacts, isLoading, fetchError, total, hasMore, loadMore, bookedIds,
    search, setSearch, source, setSource, month, setMonth, year,
    fetchContacts,
  } = useLeadsStore();
  const [dispositionFor, setDispositionFor] = useState<any | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchContacts();
  }, []);

  useEffect(() => {
    // Every filter is applied on the server, so the list is the whole
    // workspace narrowed — not 200 rows narrowed in the phone.
    fetchContacts();
  }, [search, source, month, year]);

  const onRefresh = useCallback(() => {
    fetchContacts();
  }, []);

  const renderItem = ({ item: contact }: { item: Contact }) => {
    const firstName = asText(contact.firstName) || 'Lead';
    const lastName = asText(contact.lastName);
    const email = asText(contact.email);
    const phone = asText(contact.phone);
    // Nou / Programat / Neprogramat — the three words a caller scanning a
    // list actually uses. The pipeline stage that used to be here ("Contacted")
    // answered a question nobody was asking, and meant nothing once the list
    // stopped being scoped to one pipeline.
    const stage = leadStage(contact as any, bookedIds);
    const ownerName = `${asText(contact.owner?.firstName)} ${asText(contact.owner?.lastName)}`.trim();
    const tags: string[] = Array.isArray(contact.tags)
      ? contact.tags
      : typeof contact.tags === 'string'
        ? (contact.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];

    return (
      <TouchableOpacity
        onPress={() => {
          if (!contact.id) return;
          // Tapping a lead asks what happened with it — the same dialog the
          // web opens, and the same one that fires after a call. Moving
          // someone to Programat or recording a sale is the thing a caller
          // does twenty times a shift; the full record is a button away
          // inside it.
          setDispositionFor(contact);
        }}
        className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-2.5 flex-row items-center gap-3"
        activeOpacity={0.7}
      >
        <Avatar name={`${firstName} ${lastName}`.trim()} />
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>
            {firstName} {lastName}
          </Text>
          <View className="flex-row items-center gap-3 mt-0.5">
            {phone && (
              <View className="flex-row items-center gap-1">
                <Phone size={11} color="#64748b" />
                <Text className="text-[11px] text-slate-500">{phone}</Text>
              </View>
            )}
            {email && !email.includes('placeholder') && (
              <View className="flex-row items-center gap-1 flex-1">
                <Mail size={11} color="#64748b" />
                <Text className="text-[11px] text-slate-500" numberOfLines={1}>{email}</Text>
              </View>
            )}
          </View>
          <View className="mt-1.5 flex-row items-center gap-2">
            <View
              className="px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${stage.color}20` }}
            >
              <Text className="text-[10px] font-semibold" style={{ color: stage.color }}>
                {stage.label}
              </Text>
            </View>
            {/* When the lead arrived — the first thing you want when a list
                is sorted newest first. */}
            {contact.createdAt && (
              <Text className="text-[10px] text-slate-400">
                {formatLeadDate(contact.createdAt)}
              </Text>
            )}
          </View>
          {ownerName && (
            <View className="flex-row items-center gap-1 mt-1.5">
              <User size={11} color="#0284c7" />
              <Text className="text-[11px] text-sky-700 font-medium" numberOfLines={1}>
                Assigned: {ownerName}
              </Text>
            </View>
          )}
          {tags.length > 0 && (
            <View className="flex-row gap-1 mt-1.5">
              {tags.slice(0, 3).map(tag => (
                <View key={tag} className="bg-slate-100 px-1.5 py-0.5 rounded-full">
                  <Text className="text-[10px] text-slate-600">{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {contact.leadScore != null && contact.leadScore > 0 && (
          <View
            className="h-8 w-8 rounded-full items-center justify-center"
            style={{
              backgroundColor: contact.leadScore >= 70 ? '#10b981' : contact.leadScore >= 40 ? '#f59e0b' : '#f87171',
            }}
          >
            <Text className="text-[10px] font-bold text-white">{contact.leadScore}</Text>
          </View>
        )}
        <ChevronRight size={16} color="#cbd5e1" />
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-4 pb-4 bg-sky-900" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-sky-200">Pipeline</Text>
            <Text className="text-2xl font-extrabold text-white">Leads</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <TouchableOpacity
              onPress={() => setShowSearch(!showSearch)}
              className="p-2 rounded-xl bg-white/15 border border-white/20"
            >
              {showSearch ? <X size={20} color="#fff" /> : <Search size={20} color="#fff" />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('LeadForm', { contact: null })}
              className="p-2 rounded-xl bg-white/18 border border-white/25"
            >
              <Plus size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <View className="flex-row gap-2 mt-3">
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{contacts.length} total</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{total || contacts.length} leaduri</Text>
          </View>
        </View>
        {showSearch && (
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search leads..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            autoFocus
            className="mt-3 px-3.5 py-2.5 rounded-xl bg-white/15 border border-white/25 text-white text-sm"
          />
        )}
        {/* Source filter — the same list the web uses. */}
        <View className="mt-3 -mx-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
          >
            {SOURCE_OPTIONS.map((option) => {
              const isActive = option.value === source;
              return (
                <TouchableOpacity
                  key={option.value || 'all'}
                  onPress={() => setSource(option.value)}
                  className={`px-3.5 py-2 rounded-full border ${
                    isActive ? 'bg-white border-white' : 'bg-white/10 border-white/25'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${isActive ? 'text-sky-900' : 'text-white'}`}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Month filter */}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 6 }}
        >
          <TouchableOpacity
            onPress={() => setMonth(null)}
            className={`px-3 py-2 rounded-xl border ${
              month === null ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
            }`}
          >
            <Text className={`text-xs font-semibold ${month === null ? 'text-white' : 'text-slate-600'}`}>
              Toate lunile
            </Text>
          </TouchableOpacity>
          {MONTHS.map((label, index) => {
            const isActive = month === index;
            return (
              <TouchableOpacity
                key={label}
                onPress={() => setMonth(index)}
                className={`px-3 py-2 rounded-xl border ${
                  isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
                }`}
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-slate-600'}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Error */}
      {fetchError && !isLoading && (
        <View className="mx-3 mb-2 flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff size={20} color="#f87171" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-rose-700">Connection error</Text>
            <Text className="text-xs text-rose-500 mt-0.5" numberOfLines={1}>{fetchError}</Text>
          </View>
          <TouchableOpacity onPress={onRefresh} className="p-2 rounded-lg bg-rose-100">
            <RefreshCw size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <FlatList
        data={contacts}
        keyExtractor={(item, index) => item.id || `lead-${index}`}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0c4a6e" />
        }
        // Pages of 50 from the server, appended as the caller scrolls. The
        // screen used to pull a flat 200 and show nothing beyond them.
        onEndReached={() => { void loadMore(); }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          hasMore ? (
            <View className="py-6 items-center">
              <Text className="text-xs text-slate-400">Se încarcă…</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-16">
              <Text className="text-sm font-medium text-slate-500">Niciun lead pentru filtrele alese</Text>
              <Text className="text-xs text-slate-400 mt-1">Schimbă sursa sau luna, ori apasă + pentru a adăuga unul.</Text>
            </View>
          ) : null
        }
      />

      {dispositionFor && (
        <DispositionDialog
          contactId={dispositionFor.id}
          contactName={
            `${dispositionFor.firstName ?? ''} ${dispositionFor.lastName ?? ''}`.trim() ||
            dispositionFor.phone ||
            dispositionFor.email ||
            'Contact'
          }
          phone={dispositionFor.phone}
          onViewDetails={() => {
            const contact = dispositionFor;
            setDispositionFor(null);
            navigation.navigate('LeadDetail', {
              contactId: contact.id,
              contact,
              contactIds: contacts.map((c: any) => c.id),
            });
          }}
          onClose={() => setDispositionFor(null)}
          onSaved={() => {
            setDispositionFor(null);
            // The badge changes the moment someone is booked, so the list is
            // re-read rather than left showing the state from before.
            fetchContacts();
          }}
        />
      )}

    </View>
  );
}
