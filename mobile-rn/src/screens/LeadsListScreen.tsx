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
import Avatar from '../components/Avatar';
import type { LeadsStackParams } from '../navigation/LeadsStack';
import type { Contact } from '../types';

type Nav = NativeStackNavigationProp<LeadsStackParams, 'LeadsList'>;

const STAGE_COLORS = ['#0284c7', '#0d9488', '#f59e0b', '#f43f5e', '#06b6d4', '#6366f1'];
const FALLBACK_STAGE_COLOR = '#64748b';

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

const asStageName = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'name' in value) {
    return asText((value as { name?: unknown }).name);
  }
  return '';
};

export default function LeadsListScreen() {
  const {
    contacts, pipelines, selectedPipeline, selectedStage, isLoading, fetchError,
    search, setSearch, fetchPipelines, fetchContacts, selectPipeline, selectStage,
  } = useLeadsStore();
  const [showSearch, setShowSearch] = useState(false);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchPipelines().then(() => fetchContacts());
  }, []);

  useEffect(() => {
    if (selectedPipeline) fetchContacts();
  }, [selectedPipeline, search]);

  const stageObjects = selectedPipeline?.stages || [];
  const stageNames = Array.from(
    new Set(stageObjects.map(stage => asStageName(stage)).filter(Boolean))
  );
  const stageContacts = selectedStage === 'All'
    ? contacts
    : contacts.filter(c => asStageName(c.pipelineStage) === selectedStage);

  const onRefresh = useCallback(() => {
    fetchPipelines().then(() => fetchContacts());
  }, []);

  const renderItem = ({ item: contact }: { item: Contact }) => {
    const firstName = asText(contact.firstName) || 'Lead';
    const lastName = asText(contact.lastName);
    const email = asText(contact.email);
    const phone = asText(contact.phone);
    const stageName = asStageName(contact.pipelineStage);
    const stageIndex = stageNames.indexOf(stageName);
    const stageColor = stageIndex >= 0
      ? STAGE_COLORS[stageIndex % STAGE_COLORS.length]
      : FALLBACK_STAGE_COLOR;
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
          navigation.navigate('LeadDetail', {
            contactId: contact.id,
            contact,
            contactIds: stageContacts.map(c => c.id),
          });
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
          {stageName && (
            <View className="mt-1.5">
              <View
                className="self-start px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${stageColor}20` }}
              >
                <Text
                  className="text-[10px] font-semibold"
                  style={{ color: stageColor }}
                >
                  {stageName}
                </Text>
              </View>
            </View>
          )}
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
            <Text className="text-[11px] font-semibold text-white">{stageContacts.length} in {selectedStage || 'all'}</Text>
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
        {/* Pipeline switcher — only worth showing when there's a choice */}
        {pipelines.length > 1 && (
          <View className="mt-3 -mx-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
          >
            {pipelines.map((pipeline) => {
              const isActive = pipeline.id === selectedPipeline?.id;
              return (
                <TouchableOpacity
                  key={pipeline.id}
                  onPress={() => { if (!isActive) selectPipeline(pipeline); }}
                  className={`px-3.5 py-2 rounded-full border ${
                    isActive ? 'bg-white border-white' : 'bg-white/10 border-white/25'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${isActive ? 'text-sky-900' : 'text-white'}`}>
                    {pipeline.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          </View>
        )}
      </View>

      {/* Stage tabs */}
      {stageNames.length > 0 && (
        <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 6 }}
        >
          <TouchableOpacity
            onPress={() => selectStage('All')}
            className={`px-3 py-2 rounded-xl border ${
              selectedStage === 'All' ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
            }`}
          >
            <Text className={`text-xs font-semibold ${selectedStage === 'All' ? 'text-white' : 'text-slate-600'}`}>
              All
              <Text className={`text-[10px] ${selectedStage === 'All' ? 'text-white/60' : 'text-slate-400'}`}> {contacts.length}</Text>
            </Text>
          </TouchableOpacity>
          {stageNames.map((stageName, i) => {
            const count = contacts.filter(c => asStageName(c.pipelineStage) === stageName).length;
            const isActive = stageName === selectedStage;
            return (
              <TouchableOpacity
                key={`${stageName}-${i}`}
                onPress={() => selectStage(stageName)}
                className={`px-3 py-2 rounded-xl border ${
                  isActive ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-200'
                }`}
              >
                <Text className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-slate-600'}`}>
                  {stageName}
                  <Text className={`text-[10px] ${isActive ? 'text-white/60' : 'text-slate-400'}`}> {count}</Text>
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        </View>
      )}

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
        data={stageContacts}
        keyExtractor={(item, index) => item.id || `lead-${index}`}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0c4a6e" />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-16">
              <Text className="text-sm font-medium text-slate-500">No leads in {selectedStage || 'this stage'}</Text>
              <Text className="text-xs text-slate-400 mt-1">Tap + to create your first lead.</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
