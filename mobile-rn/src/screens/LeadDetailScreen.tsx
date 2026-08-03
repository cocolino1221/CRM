import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  Linking, Modal, FlatList,
} from 'react-native';
import {
  ArrowLeft, Edit, Phone, Mail, Building2, Briefcase, Tag, MessageCircle,
  ChevronLeft, ChevronRight, UserPlus, Check, X, Clock, FileText,
  CheckCircle2, Circle,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import api from '../lib/api';
import { useLeadsStore } from '../stores/leads-store';
import { useWhatsAppStore } from '../stores/whatsapp-store';
import { useToastStore } from '../stores/toast-store';
import Avatar from '../components/Avatar';
import type { LeadsStackParams } from '../navigation/LeadsStack';
import type { Contact, User } from '../types';

type DetailRoute = RouteProp<LeadsStackParams, 'LeadDetail'>;
type Nav = NativeStackNavigationProp<LeadsStackParams, 'LeadDetail'>;

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

const normalizeContact = (raw: unknown): Contact | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = asText(value.id);
  if (!id) return null;

  return {
    ...(value as unknown as Partial<Contact>),
    id,
    firstName: asText(value.firstName) || 'Lead',
    lastName: asText(value.lastName),
    email: asText(value.email) || undefined,
    phone: asText(value.phone) || undefined,
    pipelineStage: asStageName(value.pipelineStage) || undefined,
    status: asText(value.status) || 'NEW',
    createdAt: asText(value.createdAt) || new Date().toISOString(),
  };
};

interface Activity {
  id: string;
  type: string;
  title: string;
  description?: string;
  occurredAt: string;
}

export default function LeadDetailScreen() {
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const showToast = useToastStore(s => s.show);
  const { users, fetchUsers, assignContact } = useLeadsStore();
  const openConversation = useWhatsAppStore(s => s.openConversation);
  const initialContact = normalizeContact(route.params.contact);
  const [contact, setContact] = useState<Contact | null>(initialContact);
  const [isLoading, setIsLoading] = useState(!initialContact);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  // Next/back navigation
  const contactIds = route.params.contactIds || [];
  const currentIndex = contactIds.indexOf(route.params.contactId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < contactIds.length - 1;

  const goToContact = (id: string) => {
    navigation.replace('LeadDetail', { contactId: id, contactIds });
  };

  const fetchContact = async () => {
    const fallbackContact = normalizeContact(route.params.contact);
    const hasLocalContact = Boolean(contact || fallbackContact);
    if (!hasLocalContact) {
      setIsLoading(true);
    }
    try {
      const res = await api.get(`/contacts/${route.params.contactId}`, { params: { include: 'company,owner' } });
      const normalized = normalizeContact(res.data);
      if (normalized) {
        setContact(normalized);
      } else if (fallbackContact) {
        setContact(fallbackContact);
      }
    } catch {
      try {
        const fallback = await api.get(`/contacts/${route.params.contactId}`);
        const normalized = normalizeContact(fallback.data);
        if (normalized) {
          setContact(normalized);
        } else if (fallbackContact) {
          setContact(fallbackContact);
        }
      } catch (err: any) {
        showToast(err?.response?.data?.message || 'Failed to load contact', 'error');
        if (!hasLocalContact) navigation.goBack();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePreluat = async () => {
    if (!contact) return;
    const previousValue = contact.preluat;
    const nextValue = !previousValue;
    setContact(prev => (prev ? { ...prev, preluat: nextValue } : prev));
    try {
      await api.put(`/contacts/${contact.id}/preluat`, { value: nextValue });
    } catch (err: any) {
      setContact(prev => (prev ? { ...prev, preluat: previousValue } : prev));
      showToast(err?.response?.data?.message || 'Failed to update preluat', 'error');
    }
  };

  const fetchActivities = async () => {
    try {
      const res = await api.get(`/activities`, {
        params: { contactId: route.params.contactId, limit: 10, sort: 'occurredAt', order: 'DESC' },
      });
      const list = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.activities) ? res.data.activities : [];
      setActivities(list);
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    fetchContact();
    fetchActivities();
    fetchUsers();
  }, [route.params.contactId]);

  const handleAssign = async (user: User) => {
    setShowUserPicker(false);
    setIsAssigning(true);
    const error = await assignContact(route.params.contactId, user.id);
    setIsAssigning(false);
    if (error) {
      showToast(error, 'error');
    } else {
      showToast(`Assigned to ${user.firstName}`, 'success');
      setContact(prev => prev ? { ...prev, owner: { id: user.id, firstName: user.firstName, lastName: user.lastName } } : prev);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  if (!contact) return null;
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const stageName = asStageName(contact.pipelineStage);
  const email = asText(contact.email);
  const phone = asText(contact.phone);
  const tags: string[] = Array.isArray(contact.tags)
    ? contact.tags
    : typeof contact.tags === 'string'
      ? (contact.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

  // Typeform Q&A from customFields
  const customFields = contact.customFields as Record<string, unknown> | undefined;
  const typeformMeta = customFields?.typeformMetadata as Record<string, unknown> | undefined;
  const typeformQA = customFields
    ? Object.entries(customFields)
        .filter(([key]) => key !== 'typeformMetadata')
        .map(([question, answer]) => ({ question, answer: asText(answer) }))
        .filter(qa => qa.answer)
    : [];

  return (
    <View className="flex-1 bg-slate-50">
      {/* Header */}
      <View className="px-3 pb-6 bg-sky-900" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 rounded-xl bg-white/15 border border-white/20">
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>

          {/* Next/Back navigation */}
          {contactIds.length > 1 && (
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-sky-200 mr-1">{currentIndex + 1}/{contactIds.length}</Text>
              <TouchableOpacity
                onPress={() => hasPrev && goToContact(contactIds[currentIndex - 1])}
                disabled={!hasPrev}
                className="p-2 rounded-xl bg-white/15 border border-white/20"
                style={{ opacity: hasPrev ? 1 : 0.3 }}
              >
                <ChevronLeft size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => hasNext && goToContact(contactIds[currentIndex + 1])}
                disabled={!hasNext}
                className="p-2 rounded-xl bg-white/15 border border-white/20"
                style={{ opacity: hasNext ? 1 : 0.3 }}
              >
                <ChevronRight size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={() => navigation.navigate('LeadForm', { contact })} className="p-2 rounded-xl bg-white/15 border border-white/20">
            <Edit size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile card overlapping header */}
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="bg-white rounded-3xl p-5 -mt-6 shadow-sm border border-slate-100">
          <View className="flex-row items-center gap-4">
            <Avatar name={name} size="lg" />
            <View className="flex-1 min-w-0">
              <Text className="text-lg font-bold text-slate-900" numberOfLines={1}>{name}</Text>
              {contact.jobTitle && <Text className="text-sm text-slate-500">{contact.jobTitle}</Text>}
              <View className="flex-row items-center gap-2 mt-1">
                <View className={`px-2 py-0.5 rounded-full ${
                  contact.status === 'ACTIVE' ? 'bg-emerald-100' :
                  contact.status === 'NEW' ? 'bg-sky-100' : 'bg-slate-100'
                }`}>
                  <Text className={`text-[11px] font-semibold ${
                    contact.status === 'ACTIVE' ? 'text-emerald-700' :
                    contact.status === 'NEW' ? 'text-sky-700' : 'text-slate-600'
                  }`}>{contact.status}</Text>
                </View>
                {stageName && (
                  <View className="bg-teal-100 px-2 py-0.5 rounded-full">
                    <Text className="text-[11px] font-semibold text-teal-700">{stageName}</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => void handleTogglePreluat()}
              className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg border ${contact.preluat ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}
            >
              {contact.preluat ? <CheckCircle2 size={14} color="#16a34a" /> : <Circle size={14} color="#94a3b8" />}
              <Text className={`text-[11px] font-semibold ${contact.preluat ? 'text-green-700' : 'text-slate-500'}`}>Preluat</Text>
            </TouchableOpacity>
          </View>

          {contact.leadScore != null && contact.leadScore > 0 && (
            <View className="mt-4">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs text-slate-500">Lead score</Text>
                <Text className="text-xs font-semibold text-slate-800">{contact.leadScore}/100</Text>
              </View>
              <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${contact.leadScore}%`,
                    backgroundColor: contact.leadScore >= 70 ? '#10b981' : contact.leadScore >= 40 ? '#f59e0b' : '#f87171',
                  }}
                />
              </View>
            </View>
          )}
        </View>

        {/* Assigned to / Assign button */}
        <View className="bg-white rounded-2xl p-4 mt-3 border border-slate-100">
          <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Assigned to</Text>
          {contact.owner ? (
            <View className="flex-row items-center gap-3">
              <Avatar name={`${contact.owner.firstName} ${contact.owner.lastName}`} size="sm" />
              <Text className="text-sm text-slate-700 flex-1">{contact.owner.firstName} {contact.owner.lastName}</Text>
              <TouchableOpacity
                onPress={() => setShowUserPicker(true)}
                className="px-3 py-1.5 rounded-lg bg-sky-50"
                disabled={isAssigning}
              >
                {isAssigning ? (
                  <ActivityIndicator size="small" color="#0284c7" />
                ) : (
                  <Text className="text-xs font-semibold text-sky-700">Reassign</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowUserPicker(true)}
              className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-200"
              disabled={isAssigning}
            >
              {isAssigning ? (
                <ActivityIndicator size="small" color="#0284c7" />
              ) : (
                <>
                  <UserPlus size={16} color="#94a3b8" />
                  <Text className="text-sm text-slate-400">Tap to assign a team member</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Contact info */}
        <View className="bg-white rounded-2xl p-4 mt-3 border border-slate-100">
          <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Contact info</Text>
          {phone && (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${phone}`)} className="flex-row items-center gap-3 mb-3">
              <Phone size={16} color="#0284c7" />
              <Text className="text-sm text-slate-700">{phone}</Text>
            </TouchableOpacity>
          )}
          {email && !email.includes('placeholder') && (
            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${email}`)} className="flex-row items-center gap-3 mb-3">
              <Mail size={16} color="#0284c7" />
              <Text className="text-sm text-slate-700">{email}</Text>
            </TouchableOpacity>
          )}
          {contact.company && (
            <View className="flex-row items-center gap-3 mb-3">
              <Building2 size={16} color="#0284c7" />
              <Text className="text-sm text-slate-700">{contact.company.name}</Text>
            </View>
          )}
          {contact.source && (
            <View className="flex-row items-center gap-3">
              <Briefcase size={16} color="#0284c7" />
              <Text className="text-sm text-slate-700">Source: {contact.source}</Text>
            </View>
          )}
        </View>

        {/* Tags */}
        {tags.length > 0 && (
          <View className="bg-white rounded-2xl p-4 mt-3 border border-slate-100">
            <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Tags</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {tags.map(tag => (
                <View key={tag} className="flex-row items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-full">
                  <Tag size={12} color="#475569" />
                  <Text className="text-xs text-slate-700">{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        {contact.notes && (
          <View className="bg-white rounded-2xl p-4 mt-3 border border-slate-100">
            <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Notes</Text>
            <Text className="text-sm text-slate-700">{contact.notes}</Text>
          </View>
        )}

        {/* Typeform Q&A */}
        {typeformQA.length > 0 && (
          <View className="bg-white rounded-2xl p-4 mt-3 border border-slate-100">
            <View className="flex-row items-center gap-2 mb-3">
              <FileText size={14} color="#94a3b8" />
              <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                Form Answers
                {typeformMeta?.formTitle ? ` - ${asText(typeformMeta.formTitle)}` : ''}
              </Text>
            </View>
            {typeformQA.map((qa, i) => (
              <View key={i} className={`${i > 0 ? 'mt-3 pt-3 border-t border-slate-50' : ''}`}>
                <Text className="text-xs text-slate-500 mb-0.5">{qa.question}</Text>
                <Text className="text-sm text-slate-800">{qa.answer}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Deals */}
        {contact.deals && contact.deals.length > 0 && (
          <View className="bg-white rounded-2xl p-4 mt-3 border border-slate-100">
            <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Deals</Text>
            {contact.deals.map(deal => (
              <View key={deal.id} className="flex-row items-center justify-between py-2 border-b border-slate-50">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-800">{deal.title}</Text>
                  {deal.stage && <Text className="text-xs text-slate-400">{deal.stage}</Text>}
                </View>
                {deal.value != null && (
                  <Text className="text-sm font-semibold text-emerald-600">
                    ${deal.value.toLocaleString()}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Activity timeline */}
        {activities.length > 0 && (
          <View className="bg-white rounded-2xl p-4 mt-3 border border-slate-100">
            <Text className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Recent Activity</Text>
            {activities.map((act, i) => (
              <View key={act.id} className={`flex-row gap-3 ${i > 0 ? 'mt-3 pt-3 border-t border-slate-50' : ''}`}>
                <View className="w-7 h-7 rounded-full bg-sky-50 items-center justify-center mt-0.5">
                  <Clock size={14} color="#0284c7" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-slate-800">{act.title}</Text>
                  {act.description && (
                    <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={2}>{act.description}</Text>
                  )}
                  <Text className="text-[10px] text-slate-400 mt-1">
                    {new Date(act.occurredAt).toLocaleDateString()} {new Date(act.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Created at */}
        <View className="mt-3 px-2 pb-4">
          <Text className="text-[10px] text-slate-400 text-center">
            Created {new Date(contact.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom actions */}
      {phone && (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 bg-white/95 border-t border-slate-100"
          style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16, paddingTop: 12 }}
        >
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${phone}`)}
              className="flex-1 flex-row items-center justify-center gap-2 py-3 bg-sky-50 rounded-xl"
            >
              <Phone size={16} color="#0369a1" />
              <Text className="text-sm font-semibold text-sky-700">Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                const waId = phone.replace(/[^0-9]/g, '');
                await openConversation({
                  waId,
                  phone,
                  contactName: name,
                  contactId: contact.id,
                });
                navigation.getParent()?.navigate('WhatsApp', {
                  screen: 'Chat',
                  params: {
                    waId,
                    contactName: name,
                    phone,
                  },
                });
              }}
              className="flex-1 flex-row items-center justify-center gap-2 py-3 bg-teal-50 rounded-xl"
            >
              <MessageCircle size={16} color="#0f766e" />
              <Text className="text-sm font-semibold text-teal-700">WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* User picker modal */}
      <Modal visible={showUserPicker} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[70%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">Assign Lead</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)} className="p-1.5 rounded-xl bg-slate-100">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={users}
              keyExtractor={u => u.id}
              renderItem={({ item: user }) => (
                <TouchableOpacity
                  onPress={() => handleAssign(user)}
                  className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-50"
                >
                  <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-900">{user.firstName} {user.lastName}</Text>
                    <Text className="text-xs text-slate-400">{user.role}</Text>
                  </View>
                  {contact?.owner?.id === user.id && <Check size={18} color="#0284c7" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
