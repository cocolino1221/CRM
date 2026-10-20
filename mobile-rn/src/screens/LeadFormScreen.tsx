import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { X, UserPlus, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useLeadsStore } from '../stores/leads-store';
import type { CreateContactError } from '../stores/leads-store';
import { useAuthStore } from '../stores/auth-store';
import { assignableAs, defaultSetterFor } from '../lib/team-roles';
import { useToastStore } from '../stores/toast-store';
import Avatar from '../components/Avatar';
import type { LeadsStackParams } from '../navigation/LeadsStack';

type FormRoute = RouteProp<LeadsStackParams, 'LeadForm'>;

// value is what the API stores; label is what the chip says. The chips used
// to send their labels ("Social Media"), which the API rejected.
const SOURCES: Array<{ value: string; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'typeform', label: 'Typeform' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Recomandare' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'cold_outreach', label: 'Cold Call' },
  { value: 'other', label: 'Altă sursă' },
];

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

export default function LeadFormScreen() {
  const route = useRoute<FormRoute>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { createContact, updateContact, selectedPipeline, pipelines, fetchPipelines, users, fetchUsers } = useLeadsStore();
  const currentUser = useAuthStore((state) => state.user);
  const showToast = useToastStore(s => s.show);
  const contact = route.params?.contact;
  const isEdit = !!contact;
  const contactEmail = asText(contact?.email);
  const contactStage = asStageName(contact?.pipelineStage);

  const [firstName, setFirstName] = useState(contact?.firstName || '');
  const [lastName, setLastName] = useState(contact?.lastName || '');
  const [email, setEmail] = useState(
    contactEmail.includes('placeholder') ? '' : contactEmail
  );
  const [phone, setPhone] = useState(contact?.phone || '');
  const [notes, setNotes] = useState(contact?.notes || '');
  // Editing an existing lead must default to ITS pipeline, not whichever
  // pipeline board happens to be selected in the list view — otherwise
  // saving would silently move the lead to the wrong pipeline.
  const initialPipeline = isEdit
    ? pipelines.find(p => p.id === (contact as any)?.pipelineId) || selectedPipeline
    : selectedPipeline;
  const [formPipeline, setFormPipeline] = useState(initialPipeline);
  const firstStage = formPipeline?.stages?.[0];
  const [stage, setStage] = useState(contactStage || asStageName(firstStage));
  const [source, setSource] = useState(contact?.source || '');
  const [ownerId, setOwnerId] = useState(contact?.owner?.id || '');
  // Who booked this lead. A manual add starts credited to whoever is adding
  // it, which is what "the setter who added it" means — empty when their
  // role does not do that job, so nothing is credited falsely.
  const [setterId, setSetterId] = useState(
    contact?.setterId || defaultSetterFor(users as any, currentUser as any),
  );
  const [showSetterPicker, setShowSetterPicker] = useState(false);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<CreateContactError | null>(null);

  const eligibleSetters = assignableAs(users as any, 'setter');
  const setterUser = users.find((u) => u.id === setterId);
  const setterName = `${setterUser?.firstName ?? ''} ${setterUser?.lastName ?? ''}`.trim();

  useEffect(() => { fetchUsers(); }, []);

  // This screen is reachable without ever visiting the leads list (deep
  // links, "Edit" straight from search, etc.) — don't rely on some other
  // screen having already populated the store, or the whole Pipeline
  // section silently disappears with zero indication why.
  useEffect(() => {
    if (pipelines.length === 0) void fetchPipelines();
  }, []);

  // Once pipelines arrive (possibly after this screen already mounted with
  // an empty list), pick a sensible default if nothing's selected yet.
  useEffect(() => {
    if (formPipeline || pipelines.length === 0) return;
    const fallback = isEdit
      ? pipelines.find(p => p.id === (contact as any)?.pipelineId) || pipelines.find(p => p.isDefault) || pipelines[0]
      : pipelines.find(p => p.isDefault) || pipelines[0];
    setFormPipeline(fallback);
    if (!contactStage) {
      const stageNames = (fallback?.stages || []).map(s => asStageName(s)).filter(Boolean);
      setStage(stageNames[0] || '');
    }
  }, [pipelines]);

  const stageNames = (formPipeline?.stages || [])
    .map(stageValue => asStageName(stageValue))
    .filter(Boolean);

  const handleSelectPipeline = (pipeline: typeof formPipeline) => {
    setFormPipeline(pipeline);
    const newStageNames = (pipeline?.stages || []).map(s => asStageName(s)).filter(Boolean);
    if (!newStageNames.includes(stage)) {
      setStage(newStageNames[0] || '');
    }
  };

  const handleSave = async () => {
    if (!firstName.trim()) return;
    setIsSaving(true);
    const data: any = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
      pipelineStage: stage || undefined,
      pipelineId: formPipeline?.id,
      source: source || undefined,
      ownerId: ownerId || undefined,
      setterId: setterId || undefined,
    };

    setFormError(null);
    const result = isEdit
      ? await updateContact(contact!.id, data)
      : await createContact(data);

    setIsSaving(false);
    if (result) {
      // Shown in the form itself: a toast lands on the list behind this
      // modal, where nobody sees it until they close the form.
      setFormError(typeof result === 'string' ? { message: result } : result);
    } else {
      showToast(isEdit ? 'Lead updated' : 'Lead created', 'success');
      navigation.goBack();
    }
  };

  const openExisting = (id: string) => {
    // Replace the form with the lead that already has this phone/email.
    (navigation as any).replace('LeadDetail', { contactId: id });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Text className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Lead' : 'New Lead'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-1.5 rounded-xl bg-slate-100">
          <X size={20} color="#64748b" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
        {/* Name row */}
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1">
            <Text className="text-xs font-semibold text-slate-500 mb-1">First Name *</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-semibold text-slate-500 mb-1">Last Name</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
            />
          </View>
        </View>

        {/* Phone */}
        <View className="mb-4">
          <Text className="text-xs font-semibold text-slate-500 mb-1">Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+40..."
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
          />
        </View>

        {/* Email */}
        <View className="mb-4">
          <Text className="text-xs font-semibold text-slate-500 mb-1">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900"
          />
        </View>

        {/* Pipeline */}
        {pipelines.length > 0 && (
          <View className="mb-4">
            <Text className="text-xs font-semibold text-slate-500 mb-2">Pipeline</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {pipelines.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => handleSelectPipeline(p)}
                    className={`px-3 py-2 rounded-xl border ${
                      formPipeline?.id === p.id ? 'bg-sky-900 border-sky-900' : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${formPipeline?.id === p.id ? 'text-white' : 'text-slate-600'}`}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Pipeline Stage */}
        {stageNames.length > 0 && (
          <View className="mb-4">
            <Text className="text-xs font-semibold text-slate-500 mb-2">Pipeline Stage</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {stageNames.map(s => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setStage(s)}
                    className={`px-3 py-2 rounded-xl border ${
                      stage === s ? 'bg-sky-900 border-sky-900' : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${stage === s ? 'text-white' : 'text-slate-600'}`}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Source */}
        <View className="mb-4">
          <Text className="text-xs font-semibold text-slate-500 mb-2">Source</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {SOURCES.map(s => (
                <TouchableOpacity
                  key={s.value}
                  onPress={() => setSource(source === s.value ? '' : s.value)}
                  className={`px-3 py-2 rounded-xl border ${
                    source === s.value ? 'bg-sky-900 border-sky-900' : 'bg-white border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${source === s.value ? 'text-white' : 'text-slate-600'}`}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Setter — who booked this lead */}
        <View className="mb-4">
          <Text className="text-xs font-semibold text-slate-500 mb-2">
            Setter <Text className="font-normal text-slate-400">(cine l-a adăugat)</Text>
          </Text>
          <TouchableOpacity
            onPress={() => setShowSetterPicker(true)}
            className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
          >
            {setterId ? (
              <>
                <Avatar name={setterName} size="sm" />
                <Text className="text-sm text-slate-900 flex-1">{setterName}</Text>
                <TouchableOpacity onPress={() => setSetterId('')} hitSlop={8}>
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <UserPlus size={16} color="#94a3b8" />
                <Text className="text-sm text-slate-400 flex-1">Nimeni</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Assignee */}
        {users.length > 0 && (
          <View className="mb-4">
            <Text className="text-xs font-semibold text-slate-500 mb-2">Assign To</Text>
            <TouchableOpacity
              onPress={() => setShowUserPicker(true)}
              className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
            >
              {ownerId ? (
                <>
                  <Avatar name={`${users.find(u => u.id === ownerId)?.firstName || ''} ${users.find(u => u.id === ownerId)?.lastName || ''}`} size="sm" />
                  <Text className="text-sm text-slate-900 flex-1">
                    {users.find(u => u.id === ownerId)?.firstName} {users.find(u => u.id === ownerId)?.lastName}
                  </Text>
                  <TouchableOpacity onPress={() => setOwnerId('')} hitSlop={8}>
                    <X size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <UserPlus size={16} color="#94a3b8" />
                  <Text className="text-sm text-slate-400 flex-1">Select team member</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Notes */}
        <View className="mb-6">
          <Text className="text-xs font-semibold text-slate-500 mb-1">Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 min-h-[80px]"
          />
        </View>

        {formError && (
          <View className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <Text className="text-sm font-semibold text-rose-700">{formError.message}</Text>
            {formError.existingContact && (
              <>
                <Text className="text-xs text-rose-700 mt-1">
                  Este deja în CRM ca{' '}
                  <Text className="font-bold">
                    {`${formError.existingContact.firstName || ''} ${formError.existingContact.lastName || ''}`.trim() || 'contact fără nume'}
                  </Text>
                  {formError.existingContact.phone ? ` · ${formError.existingContact.phone}` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => openExisting(formError.existingContact!.id)}
                  className="mt-2 self-start rounded-lg bg-rose-600 px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-white">Deschide lead-ul existent</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={!firstName.trim() || isSaving}
          className="w-full py-3 bg-sky-800 rounded-xl items-center justify-center flex-row gap-2 mb-8"
          style={{ opacity: (!firstName.trim() || isSaving) ? 0.5 : 1 }}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-semibold text-base">{isEdit ? 'Save Changes' : 'Create Lead'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* User picker modal */}
      <Modal visible={showUserPicker} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[70%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">Assign To</Text>
              <TouchableOpacity onPress={() => setShowUserPicker(false)} className="p-1.5 rounded-xl bg-slate-100">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={users}
              keyExtractor={u => u.id}
              renderItem={({ item: user }) => (
                <TouchableOpacity
                  onPress={() => { setOwnerId(user.id); setShowUserPicker(false); }}
                  className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-50"
                >
                  <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-900">{user.firstName} {user.lastName}</Text>
                  </View>
                  {ownerId === user.id && <Check size={18} color="#0284c7" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
      {/* Only the people who could plausibly have booked it. Filtering to
          the literal role "setter" left this empty in a workspace that has
          admins and closers and nobody holding that role. */}
      <Modal visible={showSetterPicker} animationType="slide" transparent>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[70%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }}>
            <View className="flex-row items-center justify-between px-4 py-3 border-b border-slate-100">
              <Text className="text-base font-bold text-slate-900">Cine l-a adăugat</Text>
              <TouchableOpacity onPress={() => setShowSetterPicker(false)} className="p-1.5 rounded-xl bg-slate-100">
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={eligibleSetters}
              keyExtractor={(u: any) => u.id}
              ListEmptyComponent={
                <Text className="text-sm text-slate-400 px-4 py-6 text-center">
                  Nimeni din echipă nu poate fi setter.
                </Text>
              }
              renderItem={({ item: user }: any) => (
                <TouchableOpacity
                  onPress={() => { setSetterId(user.id); setShowSetterPicker(false); }}
                  className="flex-row items-center gap-3 px-4 py-3 border-b border-slate-50"
                >
                  <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-slate-900">
                      {user.firstName} {user.lastName}
                      {user.id === currentUser?.id ? ' (tu)' : ''}
                    </Text>
                  </View>
                  {setterId === user.id && <Check size={18} color="#0284c7" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}
