import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { X, UserPlus, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useLeadsStore } from '../stores/leads-store';
import { useToastStore } from '../stores/toast-store';
import Avatar from '../components/Avatar';
import type { LeadsStackParams } from '../navigation/LeadsStack';

type FormRoute = RouteProp<LeadsStackParams, 'LeadForm'>;

const SOURCES = ['Website', 'Referral', 'Social Media', 'Cold Call', 'Typeform', 'WhatsApp', 'Other'];

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
  const { createContact, updateContact, selectedPipeline, pipelines, users, fetchUsers } = useLeadsStore();
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
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { fetchUsers(); }, []);

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
    };

    const error = isEdit
      ? await updateContact(contact!.id, data)
      : await createContact(data);

    setIsSaving(false);
    if (error) {
      showToast(error, 'error');
    } else {
      showToast(isEdit ? 'Lead updated' : 'Lead created', 'success');
      navigation.goBack();
    }
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
                  key={s}
                  onPress={() => setSource(source === s ? '' : s)}
                  className={`px-3 py-2 rounded-xl border ${
                    source === s ? 'bg-sky-900 border-sky-900' : 'bg-white border-slate-200'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${source === s ? 'text-white' : 'text-slate-600'}`}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
    </KeyboardAvoidingView>
  );
}
