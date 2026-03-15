import { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Linking,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, ExternalLink, WifiOff, RefreshCw, Plus, X, Check } from 'lucide-react-native';
import api from '../lib/api';
import { useDocumentsStore } from '../stores/documents-store';
import { useToastStore } from '../stores/toast-store';
import type { Document } from '../types';

interface EsemneazaTemplate {
  id: string;
  name: string;
  description?: string;
}

interface PayfunnelLinkOption {
  id: string;
  name: string;
  url: string;
}

type PaymentLinkMode = 'generate' | 'manual' | 'payfunnel';
type PickerType = 'documentType' | 'template' | 'payfunnelLink' | null;

const documentTypeOptions = [
  { value: 'contract', label: 'Contract' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'quote', label: 'Quote' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'nda', label: 'NDA' },
  { value: 'sow', label: 'SOW' },
  { value: 'msa', label: 'MSA' },
  { value: 'other', label: 'Other' },
] as const;

interface CreateDocumentForm {
  name: string;
  type: string;
  templateId: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  autoSendPaymentLink: boolean;
  sendPaymentEmail: boolean;
  sendPaymentWhatsApp: boolean;
  paymentLinkMode: PaymentLinkMode;
  paymentLinkUrl: string;
  selectedPayfunnelLinkUrl: string;
  selectedPayfunnelLinkName: string;
}

const initialCreateForm: CreateDocumentForm = {
  name: '',
  type: 'contract',
  templateId: '',
  recipientName: '',
  recipientEmail: '',
  recipientPhone: '',
  autoSendPaymentLink: true,
  sendPaymentEmail: true,
  sendPaymentWhatsApp: false,
  paymentLinkMode: 'generate',
  paymentLinkUrl: '',
  selectedPayfunnelLinkUrl: '',
  selectedPayfunnelLinkName: '',
};

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function getStatusChip(status?: string): { bg: string; text: string } {
  const key = String(status || '').toLowerCase();
  if (['signed', 'completed'].includes(key)) return { bg: '#dcfce7', text: '#166534' };
  if (['sent', 'viewed', 'pending'].includes(key)) return { bg: '#dbeafe', text: '#1d4ed8' };
  if (['declined', 'voided', 'expired'].includes(key)) return { bg: '#fee2e2', text: '#b91c1c' };
  return { bg: '#e2e8f0', text: '#334155' };
}

function getPaymentChip(status?: string): { bg: string; text: string } {
  const key = String(status || '').toLowerCase();
  if (key === 'paid') return { bg: '#dcfce7', text: '#166534' };
  if (key === 'failed') return { bg: '#fee2e2', text: '#b91c1c' };
  if (key === 'pending') return { bg: '#fef3c7', text: '#92400e' };
  if (key === 'awaiting_signature') return { bg: '#dbeafe', text: '#1d4ed8' };
  return { bg: '#e2e8f0', text: '#475569' };
}

async function openExternalUrl(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    // no-op
  }
}

export default function DocumentsScreen() {
  const { documents, isLoading, fetchError, fetchDocuments } = useDocumentsStore();
  const insets = useSafeAreaInsets();
  const showToast = useToastStore(s => s.show);
  const [templates, setTemplates] = useState<EsemneazaTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [syncingEsemneaza, setSyncingEsemneaza] = useState(false);
  const [isLoadingPayfunnelLinks, setIsLoadingPayfunnelLinks] = useState(false);
  const [payfunnelLinksError, setPayfunnelLinksError] = useState('');
  const [payfunnelLinks, setPayfunnelLinks] = useState<PayfunnelLinkOption[]>([]);
  const [form, setForm] = useState<CreateDocumentForm>(initialCreateForm);
  const [activePicker, setActivePicker] = useState<PickerType>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId) || null,
    [templates, form.templateId],
  );
  const selectedDocumentTypeLabel = useMemo(
    () => documentTypeOptions.find((item) => item.value === form.type)?.label || 'Select document type',
    [form.type],
  );
  const selectedPayfunnelLink = useMemo(
    () => payfunnelLinks.find((item) => item.url === form.selectedPayfunnelLinkUrl) || null,
    [form.selectedPayfunnelLinkUrl, payfunnelLinks],
  );

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoadingTemplates(true);
      setTemplatesError('');
      const response = await api.get('/documents/esemneaza/templates');
      const rows = Array.isArray(response.data?.templates)
        ? response.data.templates
        : Array.isArray(response.data)
          ? response.data
          : [];

      const normalized = rows
        .map((row: any): EsemneazaTemplate | null => {
          const id = String(row?.id || row?.templateId || '').trim();
          const name = String(row?.name || row?.docName || row?.title || '').trim();
          if (!id || !name) return null;
          return {
            id,
            name,
            description: row?.description ? String(row.description) : undefined,
          };
        })
        .filter((row: EsemneazaTemplate | null): row is EsemneazaTemplate => !!row);

      setTemplates(normalized);
      setForm(prev => {
        if (prev.templateId) return prev;
        const fallback = normalized[0];
        if (!fallback) return prev;
        return {
          ...prev,
          templateId: fallback.id,
          name: prev.name || fallback.name,
        };
      });
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Nu am putut incarca template-urile eSemneaza';
      setTemplatesError(message);
      setTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  const fetchPayfunnelLinks = useCallback(async () => {
    try {
      setIsLoadingPayfunnelLinks(true);
      setPayfunnelLinksError('');
      const response = await api.get('/documents/payfunnel/link-options');
      const rows = Array.isArray(response.data?.links) ? response.data.links : [];
      const normalized = rows
        .map((row: any): PayfunnelLinkOption | null => {
          const id = String(row?.id || row?.url || '').trim();
          const name = String(row?.name || row?.title || row?.url || '').trim();
          const url = String(row?.url || '').trim();
          if (!id || !url) return null;
          return { id, name: name || url, url };
        })
        .filter((row: PayfunnelLinkOption | null): row is PayfunnelLinkOption => !!row);

      setPayfunnelLinks(normalized);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Nu am putut incarca link-urile PayFunnels';
      setPayfunnelLinksError(message);
      setPayfunnelLinks([]);
    } finally {
      setIsLoadingPayfunnelLinks(false);
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await Promise.all([fetchDocuments(), fetchTemplates(), fetchPayfunnelLinks()]);
    };
    void initialize();
  }, [fetchDocuments, fetchTemplates, fetchPayfunnelLinks]);

  const onRefresh = useCallback(() => {
    void Promise.all([fetchDocuments(), fetchTemplates(), fetchPayfunnelLinks()]);
  }, [fetchDocuments, fetchTemplates, fetchPayfunnelLinks]);

  const onPressCreate = useCallback((template?: EsemneazaTemplate) => {
    const fallbackTemplate = template || templates[0] || null;
    setCreateError('');
    setForm({
      ...initialCreateForm,
      templateId: fallbackTemplate?.id || '',
      name: fallbackTemplate?.name || '',
    });
    setShowCreateModal(true);
    void fetchPayfunnelLinks();
  }, [fetchPayfunnelLinks, templates]);

  const handleSyncEsemneaza = useCallback(async () => {
    try {
      setSyncingEsemneaza(true);
      const response = await api.post('/documents/esemneaza/sync');
      const imported = Number(response.data?.imported || 0);
      const updated = Number(response.data?.updated || 0);
      const skipped = Number(response.data?.skipped || 0);
      showToast(`Sync eSemneaza: importate ${imported}, actualizate ${updated}, omise ${skipped}`, 'success');
      await Promise.all([fetchDocuments(), fetchTemplates()]);
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Nu am putut face sync din eSemneaza';
      showToast(message, 'error');
    } finally {
      setSyncingEsemneaza(false);
    }
  }, [fetchDocuments, fetchTemplates, showToast]);

  const handleSubmit = useCallback(async () => {
    setCreateError('');
    const name = form.name.trim();
    const recipientName = form.recipientName.trim();
    const recipientEmail = form.recipientEmail.trim();
    const recipientPhone = form.recipientPhone.trim();
    const manualLink = form.paymentLinkUrl.trim();

    if (!form.templateId) {
      setCreateError('Selecteaza un template eSemneaza.');
      return;
    }
    if (!name) {
      setCreateError('Completeaza numele documentului.');
      return;
    }
    if (!recipientName) {
      setCreateError('Completeaza numele destinatarului.');
      return;
    }
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setCreateError('Completeaza un email valid.');
      return;
    }
    if (form.autoSendPaymentLink && !form.sendPaymentEmail && !form.sendPaymentWhatsApp) {
      setCreateError('Alege cel putin un canal pentru link-ul de plata: Email sau WhatsApp.');
      return;
    }
    if (form.autoSendPaymentLink && form.sendPaymentWhatsApp && !recipientPhone) {
      setCreateError('Pentru trimitere pe WhatsApp completeaza telefonul destinatarului.');
      return;
    }
    if (form.autoSendPaymentLink && form.paymentLinkMode === 'manual' && !manualLink) {
      setCreateError('Completeaza link-ul manual de plata.');
      return;
    }
    if (form.autoSendPaymentLink && form.paymentLinkMode === 'manual' && !/^https?:\/\//i.test(manualLink)) {
      setCreateError('Link-ul manual trebuie sa inceapa cu http:// sau https://');
      return;
    }
    if (form.autoSendPaymentLink && form.paymentLinkMode === 'payfunnel' && !form.selectedPayfunnelLinkUrl) {
      setCreateError('Selecteaza un link din lista PayFunnels.');
      return;
    }

    try {
      setIsSubmitting(true);
      const selectedPayfunnelLink = payfunnelLinks.find((item) => item.url === form.selectedPayfunnelLinkUrl);
      const paymentLinkUrl =
        !form.autoSendPaymentLink
          ? undefined
          : form.paymentLinkMode === 'manual'
            ? manualLink
            : form.paymentLinkMode === 'payfunnel'
              ? form.selectedPayfunnelLinkUrl || undefined
              : undefined;
      const paymentLinkName =
        !form.autoSendPaymentLink
          ? undefined
          : form.paymentLinkMode === 'payfunnel'
            ? (selectedPayfunnelLink?.name || form.selectedPayfunnelLinkName || undefined)
            : undefined;

      await api.post('/documents/esemneaza', {
        name,
        type: form.type,
        templateId: form.templateId,
        templateName: selectedTemplate?.name || undefined,
        recipient: {
          name: recipientName,
          email: recipientEmail,
          phone: recipientPhone || undefined,
        },
        autoSendPaymentLink: form.autoSendPaymentLink,
        sendPaymentEmail: form.sendPaymentEmail,
        sendPaymentWhatsApp: form.sendPaymentWhatsApp,
        paymentLinkUrl,
        paymentLinkName,
      });

      setShowCreateModal(false);
      showToast('Document trimis la semnat.', 'success');
      await fetchDocuments();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Nu am putut trimite documentul.';
      setCreateError(message);
      showToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [fetchDocuments, form, payfunnelLinks, selectedTemplate?.name, showToast]);

  const renderItem = ({ item }: { item: Document }) => {
    const statusChip = getStatusChip(item.status);
    const paymentStatus = item.metadata?.payment?.status;
    const paymentChip = getPaymentChip(paymentStatus);
    const recipient = item.recipients?.[0]?.email || '-';
    const signUrl = String(item.signingUrl || '').trim();
    const paymentUrl = String(item.metadata?.payment?.paymentLink || '').trim();

    return (
      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-2.5">
        <Text className="text-sm font-semibold text-slate-900" numberOfLines={1}>{item.name}</Text>
        <Text className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>{recipient}</Text>

        <View className="flex-row items-center gap-2 mt-2.5">
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: statusChip.bg }}>
            <Text className="text-[10px] font-semibold" style={{ color: statusChip.text }}>{item.status}</Text>
          </View>
          <View className="px-2 py-1 rounded-full" style={{ backgroundColor: paymentChip.bg }}>
            <Text className="text-[10px] font-semibold" style={{ color: paymentChip.text }}>{paymentStatus || 'n/a'}</Text>
          </View>
          <Text className="text-[11px] text-slate-400 ml-auto">{formatDate(item.createdAt)}</Text>
        </View>

        {item.metadata?.payment?.failureReason && (
          <Text className="text-xs text-rose-600 mt-2" numberOfLines={2}>{item.metadata.payment.failureReason}</Text>
        )}

        {(signUrl || paymentUrl) && (
          <View className="flex-row gap-2 mt-3">
            {signUrl ? (
              <TouchableOpacity
                onPress={() => openExternalUrl(signUrl)}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50"
              >
                <ExternalLink size={14} color="#047857" />
                <Text className="text-xs font-semibold text-emerald-700">Sign Link</Text>
              </TouchableOpacity>
            ) : null}
            {paymentUrl ? (
              <TouchableOpacity
                onPress={() => openExternalUrl(paymentUrl)}
                className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50"
              >
                <ExternalLink size={14} color="#4338ca" />
                <Text className="text-xs font-semibold text-indigo-700">Payment Link</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      <View className="flex-row gap-2 mb-3">
        <TouchableOpacity
          onPress={() => onPressCreate()}
          disabled={isLoadingTemplates || templates.length === 0}
          className="flex-1 flex-row items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-sky-700"
          style={{ opacity: isLoadingTemplates || templates.length === 0 ? 0.5 : 1 }}
        >
          <Plus size={14} color="#fff" />
          <Text className="text-xs font-semibold text-white">Trimite Document</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSyncEsemneaza}
          disabled={syncingEsemneaza}
          className="px-3 py-2.5 rounded-xl bg-white border border-slate-200"
          style={{ opacity: syncingEsemneaza ? 0.6 : 1 }}
        >
          <Text className="text-xs font-semibold text-slate-700">{syncingEsemneaza ? 'Sync...' : 'Sync'}</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-white/90 border border-slate-100 rounded-2xl p-3.5 mb-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-slate-900">Template-uri eSemneaza</Text>
          <TouchableOpacity
            onPress={fetchTemplates}
            disabled={isLoadingTemplates}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100"
          >
            <Text className="text-[11px] font-semibold text-slate-700">
              {isLoadingTemplates ? 'Loading...' : 'Refresh'}
            </Text>
          </TouchableOpacity>
        </View>

        {templatesError ? (
          <Text className="text-xs text-rose-600 mt-2">{templatesError}</Text>
        ) : null}

        {isLoadingTemplates ? (
          <View className="py-4 items-center">
            <ActivityIndicator size="small" color="#334155" />
          </View>
        ) : templates.length === 0 ? (
          <Text className="text-xs text-slate-500 mt-2">Nu exista template-uri sincronizate.</Text>
        ) : (
          <View className="mt-2">
            {templates.map((template) => (
              <TouchableOpacity
                key={template.id}
                onPress={() => onPressCreate(template)}
                className="py-2 border-b border-slate-100 last:border-b-0"
              >
                <Text className="text-xs font-medium text-slate-900" numberOfLines={1}>{template.name}</Text>
                <Text className="text-[11px] text-slate-500 mt-0.5" numberOfLines={1}>{template.id}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pb-4 bg-slate-700" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[11px] uppercase tracking-widest text-slate-300">Contracts</Text>
            <Text className="text-2xl font-extrabold text-white">Documents</Text>
          </View>
          <View className="bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
            <Text className="text-[11px] font-semibold text-white">{documents.length} total</Text>
          </View>
        </View>
      </View>

      {fetchError && !isLoading && (
        <View className="mx-3 mt-3 flex-row items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff size={20} color="#f87171" />
          <View className="flex-1">
            <Text className="text-sm font-medium text-rose-700">Connection error</Text>
            <Text className="text-xs text-rose-500 mt-0.5" numberOfLines={1}>{fetchError}</Text>
          </View>
          <TouchableOpacity onPress={fetchDocuments} className="p-2 rounded-lg bg-rose-100">
            <RefreshCw size={16} color="#dc2626" />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={documents}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#475569" />}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center justify-center py-20">
              <View className="h-14 w-14 rounded-2xl bg-white border border-slate-200 items-center justify-center">
                <FileText size={28} color="#94a3b8" />
              </View>
              <Text className="text-sm font-medium text-slate-500 mt-3">No documents</Text>
              <Text className="text-xs text-slate-400 mt-1">Documentele vor aparea aici.</Text>
            </View>
          ) : null
        }
      />

      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="bg-white rounded-t-3xl max-h-[88%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 14 }}>
              <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
                <View>
                  <Text className="text-base font-bold text-slate-900">Trimite Contract</Text>
                  <Text className="text-xs text-slate-500 mt-0.5">eSemneaza template send</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCreateModal(false)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                  <X size={14} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
                <Text className="text-xs font-semibold text-slate-500 mb-2">Template</Text>
                <TouchableOpacity
                  onPress={() => setActivePicker('template')}
                  className="h-11 rounded-xl border border-slate-200 px-3 bg-slate-50 flex-row items-center justify-between"
                >
                  <Text className={`text-sm flex-1 ${selectedTemplate ? 'text-slate-900' : 'text-slate-400'}`} numberOfLines={1}>
                    {selectedTemplate?.name || (isLoadingTemplates ? 'Loading templates...' : 'Select template')}
                  </Text>
                  <Text className="text-slate-400">▼</Text>
                </TouchableOpacity>

                <Text className="text-xs text-slate-500 mt-3 mb-1.5">Document Type</Text>
                <TouchableOpacity
                  onPress={() => setActivePicker('documentType')}
                  className="h-11 rounded-xl border border-slate-200 px-3 bg-slate-50 flex-row items-center justify-between"
                >
                  <Text className="text-sm text-slate-900">{selectedDocumentTypeLabel}</Text>
                  <Text className="text-slate-400">▼</Text>
                </TouchableOpacity>

                <Text className="text-xs text-slate-500 mt-3 mb-1.5">Document Name</Text>
                <TextInput
                  value={form.name}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))}
                  placeholder="Contract teamra2"
                  placeholderTextColor="#94a3b8"
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 bg-slate-50"
                />

                <Text className="text-xs text-slate-500 mt-3 mb-1.5">Recipient Name</Text>
                <TextInput
                  value={form.recipientName}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, recipientName: value }))}
                  placeholder="Nume client"
                  placeholderTextColor="#94a3b8"
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 bg-slate-50"
                />

                <Text className="text-xs text-slate-500 mt-3 mb-1.5">Recipient Email</Text>
                <TextInput
                  value={form.recipientEmail}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, recipientEmail: value }))}
                  placeholder="client@email.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 bg-slate-50"
                />

                <Text className="text-xs text-slate-500 mt-3 mb-1.5">Recipient Phone (optional)</Text>
                <TextInput
                  value={form.recipientPhone}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, recipientPhone: value }))}
                  placeholder="+4074..."
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 bg-slate-50"
                />

                <TouchableOpacity
                  onPress={() => setForm((prev) => ({ ...prev, autoSendPaymentLink: !prev.autoSendPaymentLink }))}
                  className="flex-row items-center gap-2 mt-4"
                >
                  <View className={`h-5 w-5 rounded border items-center justify-center ${form.autoSendPaymentLink ? 'bg-sky-600 border-sky-600' : 'bg-white border-slate-300'}`}>
                    {form.autoSendPaymentLink ? <Check size={12} color="#fff" /> : null}
                  </View>
                  <Text className="text-xs text-slate-700">Auto link plata dupa semnare</Text>
                </TouchableOpacity>

                {form.autoSendPaymentLink ? (
                  <View className="mt-2 ml-0.5">
                    <TouchableOpacity
                      onPress={() => setForm((prev) => ({ ...prev, sendPaymentEmail: !prev.sendPaymentEmail }))}
                      className="flex-row items-center gap-2 mt-2"
                    >
                      <View className={`h-5 w-5 rounded border items-center justify-center ${form.sendPaymentEmail ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}>
                        {form.sendPaymentEmail ? <Check size={12} color="#fff" /> : null}
                      </View>
                      <Text className="text-xs text-slate-700">Trimite link-ul pe Email</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setForm((prev) => ({ ...prev, sendPaymentWhatsApp: !prev.sendPaymentWhatsApp }))}
                      className="flex-row items-center gap-2 mt-2"
                    >
                      <View className={`h-5 w-5 rounded border items-center justify-center ${form.sendPaymentWhatsApp ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}>
                        {form.sendPaymentWhatsApp ? <Check size={12} color="#fff" /> : null}
                      </View>
                      <Text className="text-xs text-slate-700">Trimite link-ul pe WhatsApp</Text>
                    </TouchableOpacity>

                    <Text className="text-xs text-slate-500 mt-3 mb-1.5">Link de plata</Text>
                    <View className="flex-row gap-2">
                      {(['generate', 'manual', 'payfunnel'] as PaymentLinkMode[]).map((mode) => {
                        const isSelected = form.paymentLinkMode === mode;
                        const label = mode === 'generate' ? 'Generate' : mode === 'manual' ? 'Manual' : 'PayFunnels';
                        return (
                          <TouchableOpacity
                            key={mode}
                            onPress={() => setForm((prev) => ({ ...prev, paymentLinkMode: mode }))}
                            className={`px-3 py-2 rounded-xl border ${isSelected ? 'bg-sky-50 border-sky-300' : 'bg-white border-slate-200'}`}
                          >
                            <Text className={`text-xs font-semibold ${isSelected ? 'text-sky-700' : 'text-slate-600'}`}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {form.paymentLinkMode === 'manual' ? (
                      <View className="mt-2">
                        <TextInput
                          value={form.paymentLinkUrl}
                          onChangeText={(value) => setForm((prev) => ({ ...prev, paymentLinkUrl: value }))}
                          placeholder="https://..."
                          placeholderTextColor="#94a3b8"
                          autoCapitalize="none"
                          className="h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 bg-slate-50"
                        />
                      </View>
                    ) : null}

                    {form.paymentLinkMode === 'payfunnel' ? (
                      <View className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        {isLoadingPayfunnelLinks ? (
                          <View className="py-2 items-center">
                            <ActivityIndicator size="small" color="#334155" />
                          </View>
                        ) : payfunnelLinks.length === 0 ? (
                          <Text className="text-xs text-slate-500">
                            {payfunnelLinksError || 'Nu exista link-uri PayFunnels disponibile.'}
                          </Text>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setActivePicker('payfunnelLink')}
                            className="h-11 rounded-xl border border-slate-200 px-3 bg-white flex-row items-center justify-between"
                          >
                            <Text className={`text-sm flex-1 ${selectedPayfunnelLink ? 'text-slate-900' : 'text-slate-400'}`} numberOfLines={1}>
                              {selectedPayfunnelLink?.name || 'Select PayFunnels link'}
                            </Text>
                            <Text className="text-slate-400">▼</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {createError ? (
                  <View className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                    <Text className="text-xs text-rose-700">{createError}</Text>
                  </View>
                ) : null}
              </ScrollView>

              <View className="px-4 pt-2">
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                  className={`h-11 rounded-xl items-center justify-center ${isSubmitting ? 'bg-slate-300' : 'bg-sky-700'}`}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-sm font-semibold text-white">Trimite la semnat</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={activePicker !== null} animationType="slide" transparent onRequestClose={() => setActivePicker(null)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[70%]" style={{ paddingBottom: insets.bottom > 0 ? insets.bottom : 14 }}>
            <View className="px-4 py-3 border-b border-slate-100 flex-row items-center justify-between">
              <Text className="text-base font-bold text-slate-900">
                {activePicker === 'template'
                  ? 'Select template'
                  : activePicker === 'documentType'
                    ? 'Select document type'
                    : 'Select PayFunnels link'}
              </Text>
              <TouchableOpacity onPress={() => setActivePicker(null)} className="h-8 w-8 rounded-full bg-slate-100 items-center justify-center">
                <X size={14} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
              {activePicker === 'template' && templates.map((template) => {
                const isSelected = template.id === form.templateId;
                return (
                  <TouchableOpacity
                    key={template.id}
                    onPress={() => {
                      setForm((prev) => ({
                        ...prev,
                        templateId: template.id,
                        name: prev.name.trim() ? prev.name : template.name,
                      }));
                      setActivePicker(null);
                    }}
                    className={`py-3 px-3 rounded-xl mb-2 border ${isSelected ? 'bg-sky-50 border-sky-300' : 'bg-white border-slate-200'}`}
                  >
                    <Text className={`text-sm font-semibold ${isSelected ? 'text-sky-700' : 'text-slate-900'}`}>{template.name}</Text>
                    <Text className="text-[11px] text-slate-500 mt-1">{template.id}</Text>
                  </TouchableOpacity>
                );
              })}

              {activePicker === 'documentType' && documentTypeOptions.map((option) => {
                const isSelected = option.value === form.type;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, type: option.value }));
                      setActivePicker(null);
                    }}
                    className={`py-3 px-3 rounded-xl mb-2 border ${isSelected ? 'bg-sky-50 border-sky-300' : 'bg-white border-slate-200'}`}
                  >
                    <Text className={`text-sm font-semibold ${isSelected ? 'text-sky-700' : 'text-slate-900'}`}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}

              {activePicker === 'payfunnelLink' && payfunnelLinks.map((link) => {
                const isSelected = form.selectedPayfunnelLinkUrl === link.url;
                return (
                  <TouchableOpacity
                    key={link.id}
                    onPress={() => {
                      setForm((prev) => ({
                        ...prev,
                        selectedPayfunnelLinkUrl: link.url,
                        selectedPayfunnelLinkName: link.name,
                      }));
                      setActivePicker(null);
                    }}
                    className={`py-3 px-3 rounded-xl mb-2 border ${isSelected ? 'bg-sky-50 border-sky-300' : 'bg-white border-slate-200'}`}
                  >
                    <Text className={`text-sm font-semibold ${isSelected ? 'text-sky-700' : 'text-slate-900'}`} numberOfLines={1}>{link.name}</Text>
                    <Text className="text-[11px] text-slate-500 mt-1" numberOfLines={1}>{link.url}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
