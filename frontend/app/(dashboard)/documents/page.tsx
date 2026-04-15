'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface EsemneazaTemplate {
  id: string;
  name: string;
  description?: string;
}

interface Document {
  id: string;
  name: string;
  type: string;
  status: string;
  provider: string;
  createdAt: string;
  sentAt?: string;
  signedAt?: string;
  contact?: {
    id: string;
    name: string;
    email: string;
  };
  deal?: {
    id: string;
    name: string;
  };
  recipients?: Array<{
    email: string;
    name?: string;
    status: string;
  }>;
  documentUrl?: string;
  signingUrl?: string;
  metadata?: {
    provider?: string;
    payment?: {
      status?: string;
      amount?: number;
      currency?: string;
      paymentLink?: string;
      failureReason?: string;
    };
  };
}

interface CreateEsemneazaForm {
  name: string;
  type: string;
  templateId: string;
  fileName: string;
  templateName: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  contactId: string;
  dealId: string;
  paymentAmount: string;
  paymentCurrency: string;
  autoSendPaymentLink: boolean;
  autoSendViaEmail: boolean;
  autoSendViaWhatsApp: boolean;
  paymentLinkMode: 'generate' | 'manual' | 'payfunnel';
  paymentLinkUrl: string;
  selectedPayfunnelLinkUrl: string;
  selectedPayfunnelLinkName: string;
}

interface EsemneazaSyncResult {
  imported: number;
  updated: number;
  skipped: number;
  totalFetched: number;
  message?: string;
}

interface TemplatePaymentAutomationRule {
  templateId: string;
  autoSendPaymentLink: boolean;
  amount?: number;
  currency?: string;
  description?: string;
  paymentLinkUrl?: string;
  paymentLinkName?: string;
}

interface PayfunnelLinkOption {
  id: string;
  name: string;
  url: string;
  source?: 'integration_config' | 'payfunnel_api';
}

export default function DocumentsPage() {
  const initialCreateForm: CreateEsemneazaForm = {
    name: '',
    type: 'contract',
    templateId: '',
    fileName: '',
    templateName: '',
    recipientName: '',
    recipientEmail: '',
    recipientPhone: '',
    contactId: '',
    dealId: '',
    paymentAmount: '',
    paymentCurrency: 'EUR',
    autoSendPaymentLink: true,
    autoSendViaEmail: true,
    autoSendViaWhatsApp: true,
    paymentLinkMode: 'generate',
    paymentLinkUrl: '',
    selectedPayfunnelLinkUrl: '',
    selectedPayfunnelLinkName: '',
  };

  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'pandadoc' | 'docusign' | 'esemneaza'>('esemneaza');
  const [templates, setTemplates] = useState<EsemneazaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingTemplateAutomation, setLoadingTemplateAutomation] = useState(false);
  const [savingTemplateAutomation, setSavingTemplateAutomation] = useState(false);
  const [syncingEsemneaza, setSyncingEsemneaza] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncResult, setSyncResult] = useState<EsemneazaSyncResult | null>(null);
  const [templateAutomationError, setTemplateAutomationError] = useState('');
  const [templateAutomationRules, setTemplateAutomationRules] = useState<TemplatePaymentAutomationRule[]>([]);
  const [payfunnelLinks, setPayfunnelLinks] = useState<PayfunnelLinkOption[]>([]);
  const [loadingPayfunnelLinks, setLoadingPayfunnelLinks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [esemneazaSource, setEsemneazaSource] = useState<'template' | 'file'>('template');
  const [uploadedFileLabel, setUploadedFileLabel] = useState('');
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderEmail, setReminderEmail] = useState('');
  const [reminderDoc, setReminderDoc] = useState<Document | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [signingDocumentId, setSigningDocumentId] = useState('');
  const [createError, setCreateError] = useState('');
  const [showSendPaymentModal, setShowSendPaymentModal] = useState(false);
  const [sendPaymentDocument, setSendPaymentDocument] = useState<Document | null>(null);
  const [sendPaymentMode, setSendPaymentMode] = useState<'generate' | 'manual' | 'payfunnel'>('generate');
  const [sendPaymentManualUrl, setSendPaymentManualUrl] = useState('');
  const [sendPaymentSelectedLinkUrl, setSendPaymentSelectedLinkUrl] = useState('');
  const [sendPaymentSelectedLinkName, setSendPaymentSelectedLinkName] = useState('');
  const [sendPaymentViaEmail, setSendPaymentViaEmail] = useState(true);
  const [sendPaymentViaWhatsApp, setSendPaymentViaWhatsApp] = useState(false);
  const [sendingPayment, setSendingPayment] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState('');

  const [form, setForm] = useState<CreateEsemneazaForm>(initialCreateForm);

  const resetCreateForm = () => {
    setForm(initialCreateForm);
    setEsemneazaSource('template');
    setUploadedFileLabel('');
  };

  useEffect(() => {
    const initialize = async () => {
      await syncEsemneazaDocuments(true);
      await fetchDocuments();
      await fetchEsemneazaTemplates();
      await fetchTemplateAutomationRules();
      await fetchPayfunnelLinkOptions();
    };
    initialize();
  }, []);

  useEffect(() => {
    if (showCreateModal && selectedProvider === 'esemneaza') {
      fetchEsemneazaTemplates();
      fetchPayfunnelLinkOptions();
    }
  }, [showCreateModal, selectedProvider]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/documents');
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEsemneazaTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const response = await api.get('/documents/esemneaza/templates');
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Failed to fetch eSemneaza templates:', error);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchPayfunnelLinkOptions = async () => {
    try {
      setLoadingPayfunnelLinks(true);
      const response = await api.get('/documents/payfunnel/link-options');
      setPayfunnelLinks(Array.isArray(response.data?.links) ? response.data.links : []);
    } catch (error: any) {
      console.error('Failed to fetch PayFunnels links:', error);
      setPayfunnelLinks([]);
    } finally {
      setLoadingPayfunnelLinks(false);
    }
  };

  const fetchTemplateAutomationRules = async () => {
    try {
      setLoadingTemplateAutomation(true);
      setTemplateAutomationError('');
      const response = await api.get('/documents/esemneaza/template-automation');
      setTemplateAutomationRules(Array.isArray(response.data?.rules) ? response.data.rules : []);
    } catch (error: any) {
      console.error('Failed to fetch template payment automation:', error);
      setTemplateAutomationError(error?.response?.data?.message || 'Nu am putut incarca regulile de automatizare.');
      setTemplateAutomationRules([]);
    } finally {
      setLoadingTemplateAutomation(false);
    }
  };

  const syncEsemneazaDocuments = async (silent = false) => {
    if (!silent) {
      setSyncingEsemneaza(true);
    }
    setSyncError('');
    setSyncResult(null);

    try {
      const response = await api.post('/documents/esemneaza/sync');
      const data = response.data || {};
      setSyncResult({
        imported: Number(data.imported || 0),
        updated: Number(data.updated || 0),
        skipped: Number(data.skipped || 0),
        totalFetched: Number(data.totalFetched || 0),
        message: data.message,
      });

      if (!silent) {
        await fetchDocuments();
        await fetchEsemneazaTemplates();
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Nu am putut sincroniza documentele din eSemneaza.';
      setSyncError(message);
      setSyncResult(null);
    } finally {
      if (!silent) {
        setSyncingEsemneaza(false);
      }
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-blue-100 text-blue-800',
      viewed: 'bg-purple-100 text-purple-800',
      signed: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      declined: 'bg-red-100 text-red-800',
      voided: 'bg-gray-100 text-gray-800',
      expired: 'bg-orange-100 text-orange-800',
    };
    return colors[status.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const getPaymentStatusColor = (status?: string) => {
    if (!status) return 'bg-gray-100 text-gray-700';
    const key = status.toLowerCase();
    if (key === 'paid') return 'bg-green-100 text-green-800';
    if (key === 'failed') return 'bg-red-100 text-red-800';
    if (key === 'pending') return 'bg-yellow-100 text-yellow-800';
    if (key === 'awaiting_payment') return 'bg-amber-100 text-amber-800';
    if (key === 'awaiting_signature') return 'bg-blue-100 text-blue-800';
    return 'bg-gray-100 text-gray-700';
  };

  const normalizeDocumentPaymentStatus = (documentStatus: string, paymentStatus?: string) => {
    const paymentKey = String(paymentStatus || '').toLowerCase();
    const documentKey = String(documentStatus || '').toLowerCase();
    if (paymentKey === 'awaiting_signature' && (documentKey === 'signed' || documentKey === 'completed')) {
      return 'awaiting_payment';
    }
    return paymentStatus;
  };

  const getProviderKey = (doc: Document) => {
    if (doc.metadata?.provider === 'esemneaza') return 'esemneaza';
    return doc.provider;
  };

  const getProviderLogo = (provider: string) => {
    if (provider === 'pandadoc') return '📄';
    if (provider === 'docusign') return '✍️';
    if (provider === 'esemneaza') return '🖊️';
    return '📝';
  };

  const getProviderLabel = (provider: string) => {
    if (provider === 'esemneaza') return 'eSemneaza';
    return provider;
  };

  const getTemplatePaymentRule = (templateId?: string) => {
    const normalizedTemplateId = String(templateId || '').trim();
    if (!normalizedTemplateId) return undefined;
    return templateAutomationRules.find((rule) => rule.templateId === normalizedTemplateId);
  };

  const upsertTemplatePaymentRule = (
    templateId: string,
    patch: Partial<TemplatePaymentAutomationRule>,
  ) => {
    const normalizedTemplateId = String(templateId || '').trim();
    if (!normalizedTemplateId) return;

    setTemplateAutomationRules((prev) => {
      const index = prev.findIndex((rule) => rule.templateId === normalizedTemplateId);
      const current: TemplatePaymentAutomationRule =
        index >= 0 ? prev[index] : { templateId: normalizedTemplateId, autoSendPaymentLink: false };
      const next: TemplatePaymentAutomationRule = {
        ...current,
        ...patch,
        templateId: normalizedTemplateId,
      };

      const hasAmount = typeof next.amount === 'number' && Number.isFinite(next.amount) && next.amount > 0;
      const hasCurrency = !!String(next.currency || '').trim();
      const hasDescription = !!String(next.description || '').trim();
      const hasPaymentLinkUrl = !!String(next.paymentLinkUrl || '').trim();
      const shouldKeep = next.autoSendPaymentLink || hasAmount || hasCurrency || hasDescription || hasPaymentLinkUrl;
      if (!shouldKeep) {
        return prev.filter((rule) => rule.templateId !== normalizedTemplateId);
      }

      if (index >= 0) {
        const copy = [...prev];
        copy[index] = next;
        return copy;
      }
      return [...prev, next];
    });
  };

  const saveTemplatePaymentAutomation = async () => {
    try {
      setSavingTemplateAutomation(true);
      setTemplateAutomationError('');
      const payloadRules = templateAutomationRules.map((rule) => ({
        templateId: rule.templateId,
        autoSendPaymentLink: rule.autoSendPaymentLink === true,
        amount: rule.amount,
        currency: rule.currency,
        description: rule.description,
        paymentLinkUrl: rule.paymentLinkUrl,
        paymentLinkName: rule.paymentLinkName,
      }));
      const response = await api.post('/documents/esemneaza/template-automation', {
        rules: payloadRules,
      });
      setTemplateAutomationRules(Array.isArray(response.data?.rules) ? response.data.rules : []);
      alert('Regulile de plata pe template au fost salvate.');
    } catch (error: any) {
      console.error('Failed to save template payment automation:', error);
      setTemplateAutomationError(error?.response?.data?.message || 'Nu am putut salva regulile de automatizare.');
    } finally {
      setSavingTemplateAutomation(false);
    }
  };

  const handleFormChange = (key: keyof CreateEsemneazaForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTemplateChange = (value: string) => {
    const selectedTemplate = templates.find((t) => t.id === value);
    const rule = getTemplatePaymentRule(value);
    setForm((prev) => ({
      ...prev,
      templateId: value,
      templateName: selectedTemplate?.name || prev.templateName,
      autoSendPaymentLink: rule ? rule.autoSendPaymentLink : initialCreateForm.autoSendPaymentLink,
      paymentAmount:
        rule && typeof rule.amount === 'number' && Number.isFinite(rule.amount)
          ? String(rule.amount)
          : '',
      paymentCurrency: rule?.currency || initialCreateForm.paymentCurrency,
      paymentLinkMode: rule?.paymentLinkUrl
        ? (payfunnelLinks.some((link) => link.url === rule.paymentLinkUrl) ? 'payfunnel' : 'manual')
        : 'generate',
      paymentLinkUrl:
        rule?.paymentLinkUrl && !payfunnelLinks.some((link) => link.url === rule.paymentLinkUrl)
          ? rule.paymentLinkUrl
          : '',
      selectedPayfunnelLinkUrl:
        rule?.paymentLinkUrl && payfunnelLinks.some((link) => link.url === rule.paymentLinkUrl)
          ? rule.paymentLinkUrl
          : '',
      selectedPayfunnelLinkName: rule?.paymentLinkName || '',
    }));
  };

  const openCreateFromTemplate = (template: EsemneazaTemplate) => {
    const rule = getTemplatePaymentRule(template.id);
    setCreateError('');
    setSelectedProvider('esemneaza');
    setEsemneazaSource('template');
    setUploadedFileLabel('');
    setForm({
      ...initialCreateForm,
      name: template.name || '',
      templateId: template.id,
      templateName: template.name,
      autoSendPaymentLink: rule ? rule.autoSendPaymentLink : initialCreateForm.autoSendPaymentLink,
      paymentAmount:
        rule && typeof rule.amount === 'number' && Number.isFinite(rule.amount)
          ? String(rule.amount)
          : '',
      paymentCurrency: rule?.currency || initialCreateForm.paymentCurrency,
      paymentLinkMode: rule?.paymentLinkUrl
        ? (payfunnelLinks.some((link) => link.url === rule.paymentLinkUrl) ? 'payfunnel' : 'manual')
        : 'generate',
      paymentLinkUrl:
        rule?.paymentLinkUrl && !payfunnelLinks.some((link) => link.url === rule.paymentLinkUrl)
          ? rule.paymentLinkUrl
          : '',
      selectedPayfunnelLinkUrl:
        rule?.paymentLinkUrl && payfunnelLinks.some((link) => link.url === rule.paymentLinkUrl)
          ? rule.paymentLinkUrl
          : '',
      selectedPayfunnelLinkName: rule?.paymentLinkName || '',
    });
    setShowCreateModal(true);
  };

  const handleUploadEsemneazaFile = async (file: File | null) => {
    if (!file) return;
    setCreateError('');

    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/documents/esemneaza/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setForm((prev) => ({
        ...prev,
        fileName: response.data?.fileName || '',
        templateId: '',
      }));
      setUploadedFileLabel(response.data?.originalName || file.name);
    } catch (error: any) {
      console.error('Failed to upload eSemneaza file:', error);
      setCreateError(error?.response?.data?.message || 'Nu am putut urca fisierul pentru eSemneaza.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleCreateEsemneaza = async () => {
    setCreateError('');
    const hasTemplate = esemneazaSource === 'template' && !!form.templateId;
    const hasFile = esemneazaSource === 'file' && !!form.fileName;

    if (!form.name || !form.recipientEmail || !form.recipientName || (!hasTemplate && !hasFile)) {
      setCreateError('Completeaza toate campurile obligatorii.');
      return;
    }

    if (form.autoSendPaymentLink && form.paymentLinkMode === 'manual' && !form.paymentLinkUrl.trim()) {
      setCreateError('Completeaza linkul manual pentru plata.');
      return;
    }
    if (form.autoSendPaymentLink && form.paymentLinkMode === 'payfunnel' && !form.selectedPayfunnelLinkUrl) {
      setCreateError('Selecteaza un link din PayFunnels.');
      return;
    }
    if (form.autoSendPaymentLink && !form.autoSendViaEmail && !form.autoSendViaWhatsApp) {
      setCreateError('Alege cel putin un canal de trimitere: Email sau WhatsApp.');
      return;
    }
    if (form.autoSendPaymentLink && form.autoSendViaWhatsApp && !form.recipientPhone.trim() && !form.contactId.trim()) {
      setCreateError('Pentru trimitere pe WhatsApp completeaza Recipient Phone sau selecteaza Contact ID cu telefon.');
      return;
    }

    try {
      setSubmitting(true);
      const selectedPayfunnelLink = payfunnelLinks.find((link) => link.url === form.selectedPayfunnelLinkUrl);
      const chosenPaymentLinkUrl = !form.autoSendPaymentLink
        ? undefined
        : form.paymentLinkMode === 'manual'
          ? (form.paymentLinkUrl.trim() || undefined)
          : form.paymentLinkMode === 'payfunnel'
            ? (form.selectedPayfunnelLinkUrl || undefined)
            : undefined;
      const chosenPaymentLinkName = !form.autoSendPaymentLink
        ? undefined
        : form.paymentLinkMode === 'payfunnel'
          ? (selectedPayfunnelLink?.name || form.selectedPayfunnelLinkName || undefined)
          : undefined;
      const chosenPaymentLinkId = !form.autoSendPaymentLink
        ? undefined
        : form.paymentLinkMode === 'payfunnel'
          ? (selectedPayfunnelLink?.id || undefined)
          : undefined;

      await api.post('/documents/esemneaza', {
        name: form.name,
        type: form.type,
        templateId: hasTemplate ? form.templateId : undefined,
        fileName: hasFile ? form.fileName : undefined,
        templateName: form.templateName || undefined,
        contactId: form.contactId || undefined,
        dealId: form.dealId || undefined,
        recipient: {
          name: form.recipientName,
          email: form.recipientEmail,
          phone: form.recipientPhone.trim() || undefined,
        },
        autoSendPaymentLink: form.autoSendPaymentLink,
        sendPaymentEmail: form.autoSendViaEmail,
        sendPaymentWhatsApp: form.autoSendViaWhatsApp,
        paymentAmount: form.paymentAmount ? Number(form.paymentAmount) : undefined,
        paymentCurrency: form.paymentCurrency || 'EUR',
        paymentLinkUrl: chosenPaymentLinkUrl,
        paymentLinkName: chosenPaymentLinkName,
        paymentLinkId: chosenPaymentLinkId,
      });

      setShowCreateModal(false);
      resetCreateForm();
      await fetchDocuments();
    } catch (error: any) {
      console.error('Failed to create eSemneaza document:', error);
      setCreateError(error?.response?.data?.message || 'Nu am putut crea documentul.');
    } finally {
      setSubmitting(false);
    }
  };

  const openSendPaymentModal = (doc: Document) => {
    setSendPaymentDocument(doc);
    setSendPaymentMode('generate');
    setSendPaymentManualUrl('');
    setSendPaymentSelectedLinkUrl('');
    setSendPaymentSelectedLinkName('');
    setSendPaymentViaEmail(true);
    setSendPaymentViaWhatsApp(false);
    setShowSendPaymentModal(true);
  };

  const handleGeneratePaymentLink = async (documentId: string) => {
    try {
      setSendingPayment(true);
      const selectedLink = payfunnelLinks.find((link) => link.url === sendPaymentSelectedLinkUrl);
      if (sendPaymentMode === 'manual' && !sendPaymentManualUrl.trim()) {
        alert('Completeaza linkul manual de plata.');
        return;
      }
      if (sendPaymentMode === 'payfunnel' && !sendPaymentSelectedLinkUrl) {
        alert('Selecteaza un link PayFunnels.');
        return;
      }
      if (!sendPaymentViaEmail && !sendPaymentViaWhatsApp) {
        alert('Alege cel putin un canal: Email sau WhatsApp.');
        return;
      }
      const paymentLinkUrl =
        sendPaymentMode === 'manual'
          ? (sendPaymentManualUrl.trim() || undefined)
          : sendPaymentMode === 'payfunnel'
            ? (sendPaymentSelectedLinkUrl || undefined)
            : undefined;
      const paymentLinkId =
        sendPaymentMode === 'payfunnel'
          ? (selectedLink?.id || undefined)
          : undefined;

      await api.post(`/documents/${documentId}/payment-link`, {
        sendEmail: sendPaymentViaEmail,
        sendWhatsApp: sendPaymentViaWhatsApp,
        paymentLinkUrl,
        paymentLinkId,
        paymentLinkName: sendPaymentMode === 'payfunnel'
          ? (selectedLink?.name || sendPaymentSelectedLinkName || undefined)
          : undefined,
      });
      setShowSendPaymentModal(false);
      setSendPaymentDocument(null);
      await fetchDocuments();
    } catch (error) {
      console.error('Failed to generate payment link:', error);
      alert('Nu am putut genera/salva link-ul de plata.');
    } finally {
      setSendingPayment(false);
    }
  };

  const openReminderModal = (doc: Document) => {
    setReminderDoc(doc);
    setReminderEmail(doc.recipients?.[0]?.email || '');
    setShowReminderModal(true);
  };

  const handleSendReminder = async () => {
    if (!reminderDoc?.id) return;
    const email = reminderEmail.trim();
    if (!email || !email.includes('@')) {
      alert('Completeaza un email valid.');
      return;
    }

    try {
      setSendingReminder(true);
      await api.post(`/documents/${reminderDoc.id}/esemneaza/remind`, { email });
      setShowReminderModal(false);
      setReminderDoc(null);
      setReminderEmail('');
      alert('Reminder trimis cu succes.');
      await fetchDocuments();
    } catch (error: any) {
      console.error('Failed to send reminder:', error);
      alert(error?.response?.data?.message || 'Nu am putut trimite reminder.');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleSignByApi = async (doc: Document) => {
    if (!doc?.id) return;
    try {
      setSigningDocumentId(doc.id);
      await api.post(`/documents/${doc.id}/esemneaza/sign`);
      alert('Semnarea a fost initiata. Statusul se actualizeaza prin webhook.');
      await fetchDocuments();
    } catch (error: any) {
      console.error('Failed to sign document:', error);
      alert(error?.response?.data?.message || 'Nu am putut initia semnarea.');
    } finally {
      setSigningDocumentId('');
    }
  };

  const handleDeleteDocument = async (doc: Document) => {
    const recipientInfo = doc.recipients?.[0]?.email || doc.contact?.email;
    const confirmMessage = [
      `Stergi documentul "${doc.name}"?`,
      recipientInfo ? `Destinatar: ${recipientInfo}` : '',
      'Aceasta actiune sterge documentul si scoate automat tranzactia asociata din Payments.',
    ]
      .filter(Boolean)
      .join('\n');

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setDeletingDocumentId(doc.id);
      await api.delete(`/documents/${doc.id}`);
      await fetchDocuments();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Nu am putut sterge documentul.');
    } finally {
      setDeletingDocumentId('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
            <p className="text-gray-600 mt-1">
              Contracte, semnare electronica si incasari
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => syncEsemneazaDocuments(false)}
              disabled={syncingEsemneaza}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {syncingEsemneaza ? 'Syncing...' : 'Sync eSemneaza'}
            </button>
            <button
              onClick={() => {
                setCreateError('');
                resetCreateForm();
                setSelectedProvider('esemneaza');
                setEsemneazaSource('template');
                setShowCreateModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Create Document
            </button>
            <button
              onClick={() => {
                setCreateError('');
                resetCreateForm();
                setSelectedProvider('esemneaza');
                setEsemneazaSource('file');
                setShowCreateModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Upload + Send
            </button>
          </div>
        </div>
      </div>

      {syncError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {syncError}
        </div>
      )}

      {syncResult && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="font-semibold">eSemneaza Sync:</span>{' '}
          fetched {syncResult.totalFetched}, imported {syncResult.imported}, updated {syncResult.updated}, skipped {syncResult.skipped}
          {syncResult.message ? ` - ${syncResult.message}` : ''}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Total Documents</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{documents.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Awaiting Signature</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {documents.filter((d) => d.status === 'sent' || d.status === 'viewed').length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Signed</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {documents.filter((d) => d.status === 'signed' || d.status === 'completed').length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Paid</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {documents.filter((d) => d.metadata?.payment?.status === 'paid').length}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">eSemneaza Templates</h3>
            <p className="text-sm text-gray-600">Template-uri aduse din dashboard-ul eSemneaza + reguli automate de plata</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={saveTemplatePaymentAutomation}
              disabled={savingTemplateAutomation || loadingTemplateAutomation}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {savingTemplateAutomation ? 'Saving...' : 'Save rules'}
            </button>
            <button
              onClick={async () => {
                await fetchEsemneazaTemplates();
                await fetchTemplateAutomationRules();
              }}
              disabled={loadingTemplates || loadingTemplateAutomation}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              {loadingTemplates || loadingTemplateAutomation ? 'Loading...' : 'Refresh templates'}
            </button>
          </div>
        </div>

        {templateAutomationError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {templateAutomationError}
          </div>
        )}

        {loadingTemplates || loadingTemplateAutomation ? (
          <div className="text-sm text-gray-500">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-gray-500">
            Nu exista template-uri sincronizate. Verifica API URL + listTemplatesPath in integrarea eSemneaza.
          </div>
        ) : (
          <div className="max-h-56 overflow-auto border border-gray-100 rounded-lg">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Template</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auto plata</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Suma</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Moneda</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Link plata</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => {
                  const rule = getTemplatePaymentRule(template.id);
                  return (
                    <tr key={template.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-2 text-sm text-gray-900">{template.name}</td>
                      <td className="px-4 py-2 text-xs text-gray-600">{template.id}</td>
                      <td className="px-4 py-2">
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={rule?.autoSendPaymentLink === true}
                            onChange={(e) =>
                              upsertTemplatePaymentRule(template.id, {
                                autoSendPaymentLink: e.target.checked,
                                currency: rule?.currency || 'EUR',
                              })
                            }
                          />
                          Auto
                        </label>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          value={rule?.amount ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const amount = raw ? Number(raw) : undefined;
                            upsertTemplatePaymentRule(template.id, {
                              amount:
                                typeof amount === 'number' && Number.isFinite(amount) && amount > 0
                                  ? amount
                                  : undefined,
                            });
                          }}
                          className="w-24 border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="1000"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={rule?.currency || 'EUR'}
                          onChange={(e) =>
                            upsertTemplatePaymentRule(template.id, {
                              currency: e.target.value.toUpperCase(),
                            })
                          }
                          className="w-20 border border-gray-300 rounded px-2 py-1 text-xs"
                          placeholder="EUR"
                        />
                      </td>
                      <td className="px-4 py-2 min-w-[260px]">
                        <div className="space-y-1">
                          <select
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                            value={rule?.paymentLinkUrl || ''}
                            onChange={(e) => {
                              const selectedUrl = e.target.value;
                              const selectedLink = payfunnelLinks.find((link) => link.url === selectedUrl);
                              upsertTemplatePaymentRule(template.id, {
                                paymentLinkUrl: selectedUrl || undefined,
                                paymentLinkName: selectedLink?.name || undefined,
                              });
                            }}
                          >
                            <option value="">Genereaza automat</option>
                            {payfunnelLinks.map((link) => (
                              <option key={`${template.id}-${link.id}-${link.url}`} value={link.url}>
                                {link.name}
                              </option>
                            ))}
                          </select>
                          <input
                            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                            value={rule?.paymentLinkUrl || ''}
                            onChange={(e) =>
                              upsertTemplatePaymentRule(template.id, {
                                paymentLinkUrl: e.target.value.trim() || undefined,
                              })
                            }
                            placeholder="sau link manual https://..."
                          />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => openCreateFromTemplate(template)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                        >
                          Select & Send
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No documents yet</h3>
            <p className="text-gray-600 mb-6">Create your first document to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create Document
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Document</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {documents.map((doc) => {
                  const providerKey = getProviderKey(doc);
                  const paymentStatus = doc.metadata?.payment?.status;
                  const normalizedPaymentStatus = normalizeDocumentPaymentStatus(doc.status, paymentStatus);
                  const paymentLink = doc.metadata?.payment?.paymentLink;
                  const isEsemneazaDoc = providerKey === 'esemneaza';
                  const canSignByApi =
                    isEsemneazaDoc &&
                    !['signed', 'completed', 'declined', 'voided', 'expired'].includes(String(doc.status || '').toLowerCase());
                  const canGeneratePaymentLink =
                    (doc.status === 'signed' || doc.status === 'completed') &&
                    normalizedPaymentStatus !== 'paid';

                  return (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{doc.name}</div>
                        {doc.recipients && doc.recipients.length > 0 && (
                          <div className="text-xs text-gray-500">{doc.recipients[0].email}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(doc.status)}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 inline-flex w-fit text-xs font-semibold rounded-full ${getPaymentStatusColor(normalizedPaymentStatus)}`}>
                            {normalizedPaymentStatus || 'n/a'}
                          </span>
                          {doc.metadata?.payment?.failureReason && (
                            <span className="text-xs text-red-600">{doc.metadata.payment.failureReason}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getProviderLogo(providerKey)}</span>
                          <span className="text-sm text-gray-900 capitalize">{getProviderLabel(providerKey)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
                          {doc.signingUrl && (
                            <a href={doc.signingUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-900">
                              Sign Link
                            </a>
                          )}
                          {isEsemneazaDoc && (
                            <button
                              onClick={() => openReminderModal(doc)}
                              className="text-amber-600 hover:text-amber-800"
                            >
                              Remind
                            </button>
                          )}
                          {canSignByApi && (
                            <button
                              onClick={() => handleSignByApi(doc)}
                              disabled={signingDocumentId === doc.id}
                              className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                            >
                              {signingDocumentId === doc.id ? 'Signing...' : 'Sign API'}
                            </button>
                          )}
                          {paymentLink && (
                            <a href={paymentLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-900">
                              Payment Link
                            </a>
                          )}
                          {canGeneratePaymentLink && (
                            <button
                              onClick={() => openSendPaymentModal(doc)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              Send Payment
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteDocument(doc)}
                            disabled={deletingDocumentId === doc.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {deletingDocumentId === doc.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showReminderModal && reminderDoc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Trimite Reminder</h3>
            <p className="text-sm text-gray-600 mb-4">
              Document: <span className="font-medium text-gray-900">{reminderDoc.name}</span>
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Email destinatar*</label>
            <input
              type="email"
              value={reminderEmail}
              onChange={(e) => setReminderEmail(e.target.value)}
              placeholder="client@email.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4"
            />

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowReminderModal(false);
                  setReminderDoc(null);
                  setReminderEmail('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendReminder}
                disabled={sendingReminder}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {sendingReminder ? 'Sending...' : 'Send Reminder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSendPaymentModal && sendPaymentDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Trimite Link Plata</h3>
            <p className="text-sm text-gray-600 mb-4">
              Document: <span className="font-medium text-gray-900">{sendPaymentDocument.name}</span>
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Sursa link</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3"
              value={sendPaymentMode}
              onChange={(e) => setSendPaymentMode(e.target.value as 'generate' | 'manual' | 'payfunnel')}
            >
              <option value="generate">Genereaza automat din PayFunnels API</option>
              <option value="payfunnel">Alege link existent din PayFunnels</option>
              <option value="manual">Introdu link manual</option>
            </select>

            {sendPaymentMode === 'payfunnel' && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Link PayFunnels</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={sendPaymentSelectedLinkUrl}
                  onChange={(e) => {
                    const selectedUrl = e.target.value;
                    const selectedLink = payfunnelLinks.find((link) => link.url === selectedUrl);
                    setSendPaymentSelectedLinkUrl(selectedUrl);
                    setSendPaymentSelectedLinkName(selectedLink?.name || '');
                  }}
                >
                  <option value="">Selecteaza link</option>
                  {payfunnelLinks.map((link) => (
                    <option key={`send-${link.id}-${link.url}`} value={link.url}>
                      {link.name}
                    </option>
                  ))}
                </select>
                {loadingPayfunnelLinks && (
                  <p className="text-xs text-gray-500 mt-1">Incarc link-uri PayFunnels...</p>
                )}
              </div>
            )}

            {sendPaymentMode === 'manual' && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Link plata manual</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  value={sendPaymentManualUrl}
                  onChange={(e) => setSendPaymentManualUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}

            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">Trimite prin</label>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={sendPaymentViaEmail}
                    onChange={(e) => setSendPaymentViaEmail(e.target.checked)}
                  />
                  Email
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={sendPaymentViaWhatsApp}
                    onChange={(e) => setSendPaymentViaWhatsApp(e.target.checked)}
                  />
                  WhatsApp
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSendPaymentModal(false);
                  setSendPaymentDocument(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => sendPaymentDocument?.id && handleGeneratePaymentLink(sendPaymentDocument.id)}
                disabled={sendingPayment}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {sendingPayment ? 'Sending...' : 'Send Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Create Document</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Choose Provider</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setSelectedProvider('esemneaza')}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      selectedProvider === 'esemneaza'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">🖊️</div>
                    <div className="font-semibold text-sm">eSemneaza</div>
                  </button>
                  <button
                    onClick={() => setSelectedProvider('pandadoc')}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      selectedProvider === 'pandadoc'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">📄</div>
                    <div className="font-semibold text-sm">PandaDoc</div>
                  </button>
                  <button
                    onClick={() => setSelectedProvider('docusign')}
                    className={`p-3 border-2 rounded-lg transition-all ${
                      selectedProvider === 'docusign'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-2xl mb-1">✍️</div>
                    <div className="font-semibold text-sm">DocuSign</div>
                  </button>
                </div>
              </div>

              {selectedProvider === 'esemneaza' ? (
                <div className="space-y-4">
                  {createError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {createError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Name*</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.name}
                        onChange={(e) => handleFormChange('name', e.target.value)}
                        placeholder="Contract servicii"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Document Type</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.type}
                        onChange={(e) => handleFormChange('type', e.target.value)}
                        placeholder="contract"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Document Source*</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEsemneazaSource('template')}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          esemneazaSource === 'template'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        Use Template
                      </button>
                      <button
                        type="button"
                        onClick={() => setEsemneazaSource('file')}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          esemneazaSource === 'file'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                            : 'border-gray-300 bg-white text-gray-700'
                        }`}
                      >
                        Upload File
                      </button>
                    </div>
                  </div>

                  {esemneazaSource === 'template' ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Template*</label>
                      {loadingTemplates ? (
                        <div className="text-sm text-gray-500">Loading templates...</div>
                      ) : templates.length > 0 ? (
                        <select
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          value={form.templateId}
                          onChange={(e) => handleTemplateChange(e.target.value)}
                        >
                          <option value="">Select template</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          value={form.templateId}
                          onChange={(e) => handleFormChange('templateId', e.target.value)}
                          placeholder="Template ID"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Upload file (.pdf, .doc, .docx)*</label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={(e) => handleUploadEsemneazaFile(e.target.files?.[0] || null)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                      />
                      <div className="text-xs text-gray-500">
                        Max 15MB. Fisierul este uploadat in eSemneaza, apoi trimis la semnat.
                      </div>
                      {uploadingFile && <div className="text-sm text-blue-600">Uploading file...</div>}
                      {!uploadingFile && form.fileName && (
                        <div className="text-sm text-emerald-700">
                          Uploaded: {uploadedFileLabel || form.fileName}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Name*</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.recipientName}
                        onChange={(e) => handleFormChange('recipientName', e.target.value)}
                        placeholder="Nume client"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Email*</label>
                      <input
                        type="email"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.recipientEmail}
                        onChange={(e) => handleFormChange('recipientEmail', e.target.value)}
                        placeholder="client@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Phone (optional)</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.recipientPhone}
                        onChange={(e) => handleFormChange('recipientPhone', e.target.value)}
                        placeholder="+407..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact ID (optional)</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.contactId}
                        onChange={(e) => handleFormChange('contactId', e.target.value)}
                        placeholder="UUID contact"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Deal ID (optional)</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.dealId}
                        onChange={(e) => handleFormChange('dealId', e.target.value)}
                        placeholder="UUID deal"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount (optional)</label>
                      <input
                        type="number"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.paymentAmount}
                        onChange={(e) => handleFormChange('paymentAmount', e.target.value)}
                        placeholder="1000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment Currency</label>
                      <input
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        value={form.paymentCurrency}
                        onChange={(e) => handleFormChange('paymentCurrency', e.target.value.toUpperCase())}
                        placeholder="EUR"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.autoSendPaymentLink}
                      onChange={(e) => handleFormChange('autoSendPaymentLink', e.target.checked)}
                    />
                    Trimite automat link de plata dupa semnare
                  </label>

                  {form.autoSendPaymentLink && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sursa link plata</label>
                        <select
                          className="w-full border border-gray-300 rounded-lg px-3 py-2"
                          value={form.paymentLinkMode}
                          onChange={(e) => handleFormChange('paymentLinkMode', e.target.value as CreateEsemneazaForm['paymentLinkMode'])}
                        >
                          <option value="generate">Genereaza automat din PayFunnels API</option>
                          <option value="payfunnel">Alege link existent din PayFunnels</option>
                          <option value="manual">Introdu link manual</option>
                        </select>
                      </div>

                      {form.paymentLinkMode === 'payfunnel' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Link PayFunnels</label>
                          <select
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            value={form.selectedPayfunnelLinkUrl}
                            onChange={(e) => {
                              const selectedUrl = e.target.value;
                              const selectedLink = payfunnelLinks.find((link) => link.url === selectedUrl);
                              setForm((prev) => ({
                                ...prev,
                                selectedPayfunnelLinkUrl: selectedUrl,
                                selectedPayfunnelLinkName: selectedLink?.name || '',
                              }));
                            }}
                          >
                            <option value="">Selecteaza link</option>
                            {payfunnelLinks.map((link) => (
                              <option key={`${link.id}-${link.url}`} value={link.url}>
                                {link.name}
                              </option>
                            ))}
                          </select>
                          {loadingPayfunnelLinks && (
                            <p className="text-xs text-gray-500 mt-1">Incarc link-uri din PayFunnels...</p>
                          )}
                        </div>
                      )}

                      {form.paymentLinkMode === 'manual' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Link plata manual</label>
                          <input
                            className="w-full border border-gray-300 rounded-lg px-3 py-2"
                            value={form.paymentLinkUrl}
                            onChange={(e) => handleFormChange('paymentLinkUrl', e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Canal trimitere link</label>
                        <div className="flex flex-wrap gap-4">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={form.autoSendViaEmail}
                              onChange={(e) => handleFormChange('autoSendViaEmail', e.target.checked)}
                            />
                            Email
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={form.autoSendViaWhatsApp}
                              onChange={(e) => handleFormChange('autoSendViaWhatsApp', e.target.checked)}
                            />
                            WhatsApp
                          </label>
                        </div>
                        {form.autoSendViaWhatsApp && (
                          <p className="text-xs text-gray-500 mt-1">
                            Pentru WhatsApp ai nevoie de telefon pe contact sau in campul Recipient Phone.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowCreateModal(false);
                        resetCreateForm();
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateEsemneaza}
                      disabled={submitting || uploadingFile}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {uploadingFile ? 'Uploading...' : submitting ? 'Creating...' : 'Create & Send'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm text-blue-800">
                    Configure {selectedProvider === 'pandadoc' ? 'PandaDoc' : 'DocuSign'} in Integrations, then use existing endpoints.
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => {
                        window.location.href = '/integrations';
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Open Integrations
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
