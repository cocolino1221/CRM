'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';
import {
  Mail,
  Plus,
  Send,
  Trash2,
  Edit,
  Users,
  X,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  MessageCircle,
  FileText,
  PlugZap,
  Calendar,
  Upload,
  Info,
  Lock,
} from 'lucide-react';
import api from '@/lib/api';

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
type CampaignChannel = 'email' | 'whatsapp';
type WhatsAppCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  filters: { tags?: string[]; statuses?: string[]; sources?: string[] };
  stats: { total?: number; sent?: number; failed?: number };
  createdAt: string;
}

interface WhatsAppSenderAccount {
  id: string;
  name: string;
  status: string;
  phoneDisplay?: string | null;
  isDefault?: boolean;
}

interface MetaTemplate {
  name: string;
  language: string;
  status: string;
}

interface WhatsAppCampaign {
  id: string;
  name: string;
  templateName: string;
  language: string;
  status: WhatsAppCampaignStatus;
  createdAt: string;
  sentAt: string | null;
  results?: {
    total?: number;
    sent?: number;
    failed?: number;
    error?: string;
  } | null;
}

interface WhatsAppAudiencePreview {
  count: number;
  sample: Array<{ id: string; name: string; phone: string }>;
}

type WhatsAppAudienceMode = 'crm_filters' | 'direct_list';

interface CampaignRecipient {
  phone: string;
  firstName?: string;
  lastName?: string;
}

interface CsvImportRow {
  phone: string;
  firstName?: string;
  lastName?: string;
}

interface CsvImportResult {
  imported: number;
  created: number;
  updated: number;
  sent: number;
  failed: number;
  results: Array<{
    phone: string;
    status: string;
    sent?: boolean;
    sendError?: string;
    reason?: string;
  }>;
}

const statusConfig: Record<CampaignStatus, { label: string; color: string; icon: any }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: Edit },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', icon: Clock },
  sending: { label: 'Sending', color: 'bg-amber-100 text-amber-700', icon: Loader2 },
  sent: { label: 'Sent', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const allStatuses = ['active', 'lead', 'prospect', 'qualified', 'customer', 'inactive', 'churned'];
const allSources = [
  'manual', 'website', 'referral', 'social_media', 'email_campaign', 'cold_outreach',
  'event', 'slack', 'typeform', 'whatsapp', 'facebook', 'instagram', 'linkedin',
  'google-ads', 'kajabi', 'manychat', 'other',
];

const csvPhoneHeaders = ['phone', 'telefon', 'number', 'phone_number', 'mobile', 'telephone', 'mobile_phone', 'whatsapp'];
const csvFirstNameHeaders = ['first_name', 'firstname', 'first', 'name', 'prenume'];
const csvLastNameHeaders = ['last_name', 'lastname', 'last', 'surname', 'nume'];

const normalizeCsvHeader = (value: string) => value.toLowerCase().trim().replace(/\s+/g, '_');
const normalizeRecipientKey = (phone: string) => phone.replace(/[^0-9+]/g, '').trim();

const dedupeRecipients = (rows: CampaignRecipient[]): CampaignRecipient[] => {
  const byPhone = new Map<string, CampaignRecipient>();
  for (const row of rows) {
    const rawPhone = String(row.phone || '').trim();
    if (!rawPhone) continue;
    const key = normalizeRecipientKey(rawPhone);
    if (!key || key.length < 7) continue;
    byPhone.set(key, {
      phone: rawPhone,
      firstName: String(row.firstName || '').trim() || undefined,
      lastName: String(row.lastName || '').trim() || undefined,
    });
  }
  return Array.from(byPhone.values());
};

export default function EmailCampaignsPage() {
  const [activeChannel, setActiveChannel] = useState<CampaignChannel>('email');

  // Email campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isSending, setIsSending] = useState<string | null>(null);

  // WhatsApp campaigns
  const [isLoadingWhatsApp, setIsLoadingWhatsApp] = useState(true);
  const [senderAccounts, setSenderAccounts] = useState<WhatsAppSenderAccount[]>([]);
  const [whatsAppTemplates, setWhatsAppTemplates] = useState<MetaTemplate[]>([]);
  const [whatsAppCampaigns, setWhatsAppCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [isLoadingWhatsAppCampaigns, setIsLoadingWhatsAppCampaigns] = useState(false);
  const [showWhatsAppForm, setShowWhatsAppForm] = useState(false);
  const [whatsAppName, setWhatsAppName] = useState('');
  const [whatsAppTemplate, setWhatsAppTemplate] = useState('');
  const [whatsAppLanguage, setWhatsAppLanguage] = useState('en_US');
  const [whatsAppTagInput, setWhatsAppTagInput] = useState('');
  const [whatsAppTags, setWhatsAppTags] = useState<string[]>([]);
  const [whatsAppStatuses, setWhatsAppStatuses] = useState<string[]>([]);
  const [audiencePreview, setAudiencePreview] = useState<WhatsAppAudiencePreview | null>(null);
  const [isPreviewingAudience, setIsPreviewingAudience] = useState(false);
  const [whatsAppFormError, setWhatsAppFormError] = useState('');
  const [whatsAppAudienceMode, setWhatsAppAudienceMode] = useState<WhatsAppAudienceMode>('crm_filters');
  const [manualRecipients, setManualRecipients] = useState<CampaignRecipient[]>([]);
  const [manualRecipientsInput, setManualRecipientsInput] = useState('');
  const [manualRecipientsError, setManualRecipientsError] = useState('');
  const [isCreatingWhatsAppCampaign, setIsCreatingWhatsAppCampaign] = useState(false);
  const [isSendingWhatsAppCampaign, setIsSendingWhatsAppCampaign] = useState<string | null>(null);

  // WhatsApp campaign scheduling
  const [waScheduledAt, setWaScheduledAt] = useState('');
  const [schedulingEmailId, setSchedulingEmailId] = useState<string | null>(null);
  const [scheduleEmailDate, setScheduleEmailDate] = useState('');

  // Template parameters for WA campaign form
  const [waHeaderParamType, setWaHeaderParamType] = useState<'' | 'text' | 'image' | 'video' | 'document'>('');
  const [waHeaderParamValue, setWaHeaderParamValue] = useState('');
  const [waBodyParams, setWaBodyParams] = useState<string[]>(['']);

  // Info / Edit modals
  const [infoEmailCampaign, setInfoEmailCampaign] = useState<Campaign | null>(null);
  const [infoWaCampaign, setInfoWaCampaign] = useState<any | null>(null);
  const [editWaCampaign, setEditWaCampaign] = useState<any | null>(null);

  // WhatsApp CSV import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvRows, setCsvRows] = useState<CsvImportRow[]>([]);
  const [csvParseError, setCsvParseError] = useState('');
  const [csvAddTags, setCsvAddTags] = useState('');
  const [csvSendTemplate, setCsvSendTemplate] = useState(false);
  const [csvTemplateName, setCsvTemplateName] = useState('');
  const [csvTemplateLanguage, setCsvTemplateLanguage] = useState('en_US');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvImportError, setCsvImportError] = useState('');
  const [csvImportResult, setCsvImportResult] = useState<CsvImportResult | null>(null);

  useEffect(() => { fetchCampaigns(); }, []);
  useEffect(() => {
    if (activeChannel === 'whatsapp') {
      fetchWhatsAppData();
    }
  }, [activeChannel]);

  const approvedTemplates = useMemo(
    () => whatsAppTemplates.filter((tpl) => String(tpl.status || '').toUpperCase() === 'APPROVED'),
    [whatsAppTemplates],
  );

  const isWhatsAppConnected = senderAccounts.length > 0;

  const fetchCampaigns = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<Campaign[]>('/email-campaigns');
      setCampaigns(res.data);
    } catch (err) {
      console.error('Failed to fetch campaigns', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWhatsAppAccounts = async () => {
    const res = await api.get('/integrations/whatsapp/accounts');
    const accounts = Array.isArray(res.data?.data) ? res.data.data : [];
    setSenderAccounts(accounts);
  };

  const fetchWhatsAppTemplates = async () => {
    const res = await api.get('/integrations/whatsapp/templates');
    const templates = Array.isArray(res.data?.data) ? res.data.data : [];
    setWhatsAppTemplates(templates);
  };

  const fetchWhatsAppCampaigns = async () => {
    setIsLoadingWhatsAppCampaigns(true);
    try {
      const [legacyRes, bulkRes] = await Promise.allSettled([
        api.get('/integrations/whatsapp/campaigns'),
        api.get('/integrations/whatsapp/bulk-campaigns'),
      ]);
      const legacy = legacyRes.status === 'fulfilled' && Array.isArray(legacyRes.value.data) ? legacyRes.value.data : [];
      const bulk = bulkRes.status === 'fulfilled' && Array.isArray(bulkRes.value.data)
        ? bulkRes.value.data.map((c: any) => ({
            ...c,
            results: c.stats,
            _isBulk: true,
          }))
        : [];
      // Merge and sort by createdAt desc
      const all = [...bulk, ...legacy].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setWhatsAppCampaigns(all);
    } catch (err) {
      console.error('Failed to fetch WhatsApp campaigns', err);
      setWhatsAppCampaigns([]);
    } finally {
      setIsLoadingWhatsAppCampaigns(false);
    }
  };

  const fetchWhatsAppData = async () => {
    try {
      setIsLoadingWhatsApp(true);
      await Promise.all([
        fetchWhatsAppAccounts(),
        fetchWhatsAppTemplates(),
        fetchWhatsAppCampaigns(),
      ]);
    } catch (err) {
      console.error('Failed to fetch WhatsApp campaign data', err);
    } finally {
      setIsLoadingWhatsApp(false);
    }
  };

  useEffect(() => {
    if (!approvedTemplates.length) return;
    if (!whatsAppTemplate) {
      setWhatsAppTemplate(approvedTemplates[0].name);
      setWhatsAppLanguage(approvedTemplates[0].language || 'en_US');
    }
    if (!csvTemplateName) {
      setCsvTemplateName(approvedTemplates[0].name);
      setCsvTemplateLanguage(approvedTemplates[0].language || 'en_US');
    }
  }, [approvedTemplates, whatsAppTemplate, csvTemplateName]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;
    await api.delete(`/email-campaigns/${id}`);
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSend = async (id: string) => {
    if (!confirm('Send this campaign now? Emails will be sent to all matching contacts.')) return;
    setIsSending(id);
    try {
      await api.post(`/email-campaigns/${id}/send`);
      fetchCampaigns();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send campaign');
    } finally {
      setIsSending(null);
    }
  };

  const handleScheduleEmail = async (id: string, scheduledAt: string) => {
    if (!scheduledAt) return;
    try {
      await api.post(`/email-campaigns/${id}/schedule`, { scheduledAt: new Date(scheduledAt).toISOString() });
      setSchedulingEmailId(null);
      setScheduleEmailDate('');
      fetchCampaigns();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to schedule campaign');
    }
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingCampaign(null);
    fetchCampaigns();
  };

  const addTag = () => {
    const tag = whatsAppTagInput.trim();
    if (!tag) return;
    setWhatsAppTags((prev) => Array.from(new Set([...prev, tag])));
    setWhatsAppTagInput('');
    setAudiencePreview(null);
  };

  const toggleWhatsAppStatus = (status: string) => {
    setWhatsAppStatuses((prev) => (
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    ));
    setAudiencePreview(null);
  };

  const addManualRecipientsFromInput = () => {
    const chunks = manualRecipientsInput
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!chunks.length) {
      setManualRecipientsError('Paste at least one phone number');
      return;
    }

    const rows = chunks.map((phone) => ({ phone }));
    const merged = dedupeRecipients([...manualRecipients, ...rows]);

    if (!merged.length) {
      setManualRecipientsError('No valid phone numbers found');
      return;
    }

    setManualRecipients(merged);
    setManualRecipientsInput('');
    setManualRecipientsError('');
    setAudiencePreview(null);
  };

  const removeManualRecipient = (phone: string) => {
    const keyToRemove = normalizeRecipientKey(phone);
    setManualRecipients((prev) => prev.filter((recipient) => normalizeRecipientKey(recipient.phone) !== keyToRemove));
    setAudiencePreview(null);
  };

  const handleManualRecipientsCsv = (file: File) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const fields = Array.isArray(result.meta.fields) ? result.meta.fields : [];
        const headerMap = new Map<string, string>();
        for (const field of fields) {
          headerMap.set(normalizeCsvHeader(field), field);
        }

        const phoneHeader = csvPhoneHeaders.map((candidate) => headerMap.get(candidate)).find(Boolean);
        const firstNameHeader = csvFirstNameHeaders.map((candidate) => headerMap.get(candidate)).find(Boolean);
        const lastNameHeader = csvLastNameHeaders.map((candidate) => headerMap.get(candidate)).find(Boolean);

        if (!phoneHeader) {
          setManualRecipientsError('CSV must contain a phone column (phone, telefon, number, mobile)');
          return;
        }

        const rows: CampaignRecipient[] = [];
        for (const row of result.data || []) {
          const phone = String(row[phoneHeader] ?? '').trim();
          if (!phone) continue;
          const firstName = firstNameHeader ? String(row[firstNameHeader] ?? '').trim() : '';
          const lastName = lastNameHeader ? String(row[lastNameHeader] ?? '').trim() : '';
          rows.push({
            phone,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
          });
        }

        const merged = dedupeRecipients([...manualRecipients, ...rows]);
        if (!merged.length) {
          setManualRecipientsError('No valid recipients found in CSV');
          return;
        }

        setManualRecipients(merged);
        setManualRecipientsError('');
        setAudiencePreview(null);
      },
      error: (error) => {
        setManualRecipientsError(`Failed to parse CSV: ${error.message}`);
      },
    });
  };

  const previewWhatsAppAudience = async () => {
    const payload = whatsAppAudienceMode === 'direct_list'
      ? { recipients: manualRecipients }
      : {
          tags: whatsAppTags.length ? whatsAppTags : undefined,
          status: whatsAppStatuses.length ? whatsAppStatuses : undefined,
        };

    setIsPreviewingAudience(true);
    try {
      const res = await api.post('/integrations/whatsapp/campaigns/preview-audience', payload);
      setAudiencePreview(res.data);
    } catch (err) {
      console.error('Failed to preview WhatsApp audience', err);
      setAudiencePreview(null);
    } finally {
      setIsPreviewingAudience(false);
    }
  };

  const buildWaTemplateParams = () => {
    const params: any[] = [];
    if (waHeaderParamType && waHeaderParamValue.trim()) {
      const headerParam = waHeaderParamType === 'text'
        ? { type: 'text', text: waHeaderParamValue.trim() }
        : { type: waHeaderParamType, [waHeaderParamType]: { link: waHeaderParamValue.trim() } };
      params.push({ type: 'header', parameters: [headerParam] });
    }
    const bodyVars = waBodyParams.filter(p => p.trim());
    if (bodyVars.length) {
      params.push({ type: 'body', parameters: bodyVars.map(v => ({ type: 'text', text: v.trim() })) });
    }
    return params;
  };

  const resetWhatsAppForm = () => {
    setWhatsAppName('');
    setWhatsAppTagInput('');
    setWhatsAppTags([]);
    setWhatsAppStatuses([]);
    setAudiencePreview(null);
    setWhatsAppFormError('');
    setWhatsAppAudienceMode('crm_filters');
    setManualRecipients([]);
    setManualRecipientsInput('');
    setManualRecipientsError('');
    setWaScheduledAt('');
    setWaHeaderParamType('');
    setWaHeaderParamValue('');
    setWaBodyParams(['']);
    setShowWhatsAppForm(false);
    if (approvedTemplates[0]) {
      setWhatsAppTemplate(approvedTemplates[0].name);
      setWhatsAppLanguage(approvedTemplates[0].language || 'en_US');
    } else {
      setWhatsAppTemplate('');
      setWhatsAppLanguage('en_US');
    }
  };

  const createWhatsAppCampaign = async (action: boolean | 'schedule') => {
    if (!whatsAppName.trim()) {
      setWhatsAppFormError('Campaign name is required');
      return;
    }
    if (!whatsAppTemplate.trim()) {
      setWhatsAppFormError('Template is required');
      return;
    }
    if (whatsAppAudienceMode === 'direct_list' && manualRecipients.length === 0) {
      setWhatsAppFormError('Add at least one recipient for direct list sending');
      return;
    }

    setIsCreatingWhatsAppCampaign(true);
    setWhatsAppFormError('');
    try {
      // Direct list mode → use new DB-persisted bulk-campaigns endpoint
      if (whatsAppAudienceMode === 'direct_list') {
        const templateParams = buildWaTemplateParams();
        const payload: any = {
          name: whatsAppName.trim(),
          templateName: whatsAppTemplate.trim(),
          language: whatsAppLanguage.trim() || 'en_US',
          csvRecipients: manualRecipients,
          ...(templateParams.length ? { templateParams } : {}),
        };
        if (action === 'schedule' && waScheduledAt) payload.scheduledAt = new Date(waScheduledAt).toISOString();

        const createRes = await api.post('/integrations/whatsapp/bulk-campaigns', payload);
        const created = createRes.data;
        if (action === true && created?.id) {
          setIsSendingWhatsAppCampaign(created.id);
          await api.post(`/integrations/whatsapp/bulk-campaigns/${created.id}/send`);
        }
      } else {
        // CRM filters mode → use existing config-based endpoint
        const filterPayload = {
          tags: whatsAppTags.length ? whatsAppTags : undefined,
          status: whatsAppStatuses.length ? whatsAppStatuses : undefined,
        };
        const createRes = await api.post('/integrations/whatsapp/campaigns', {
          name: whatsAppName.trim(),
          templateName: whatsAppTemplate.trim(),
          language: whatsAppLanguage.trim() || 'en_US',
          filter: filterPayload,
        });
        const createdCampaign = createRes.data as WhatsAppCampaign;
        if (action === true && createdCampaign?.id) {
          setIsSendingWhatsAppCampaign(createdCampaign.id);
          await api.post(`/integrations/whatsapp/campaigns/${createdCampaign.id}/send`);
        }
      }

      resetWhatsAppForm();
      fetchWhatsAppCampaigns();
    } catch (err: any) {
      setWhatsAppFormError(err?.response?.data?.message || 'Failed to create WhatsApp campaign');
    } finally {
      setIsCreatingWhatsAppCampaign(false);
      setIsSendingWhatsAppCampaign(null);
    }
  };

  const sendWhatsAppCampaign = async (campaign: any) => {
    setIsSendingWhatsAppCampaign(campaign.id);
    try {
      const endpoint = campaign._isBulk
        ? `/integrations/whatsapp/bulk-campaigns/${campaign.id}/send`
        : `/integrations/whatsapp/campaigns/${campaign.id}/send`;
      await api.post(endpoint);
      fetchWhatsAppCampaigns();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send campaign');
    } finally {
      setIsSendingWhatsAppCampaign(null);
    }
  };

  const deleteWhatsAppCampaign = async (campaign: any) => {
    if (!confirm('Delete this WhatsApp campaign?')) return;
    try {
      const endpoint = campaign._isBulk
        ? `/integrations/whatsapp/bulk-campaigns/${campaign.id}`
        : `/integrations/whatsapp/campaigns/${campaign.id}`;
      await api.delete(endpoint);
      setWhatsAppCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to delete campaign');
    }
  };

  const handleCsvFile = (file: File) => {
    setCsvFile(file);
    setCsvRows([]);
    setCsvParseError('');
    setCsvImportError('');
    setCsvImportResult(null);

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const fields = Array.isArray(result.meta.fields) ? result.meta.fields : [];
        const headerMap = new Map<string, string>();
        for (const field of fields) {
          headerMap.set(normalizeCsvHeader(field), field);
        }

        const phoneHeader = csvPhoneHeaders.map((candidate) => headerMap.get(candidate)).find(Boolean);
        const firstNameHeader = csvFirstNameHeaders.map((candidate) => headerMap.get(candidate)).find(Boolean);
        const lastNameHeader = csvLastNameHeaders.map((candidate) => headerMap.get(candidate)).find(Boolean);

        if (!phoneHeader) {
          setCsvRows([]);
          setCsvParseError('CSV must contain a phone column (phone, telefon, number, mobile)');
          return;
        }

        const mappedRows: CsvImportRow[] = [];
        for (const row of result.data || []) {
          const phone = String(row[phoneHeader] ?? '').trim();
          if (!phone) continue;
          const firstName = firstNameHeader ? String(row[firstNameHeader] ?? '').trim() : '';
          const lastName = lastNameHeader ? String(row[lastNameHeader] ?? '').trim() : '';
          mappedRows.push({
            phone,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
          });
        }

        if (!mappedRows.length) {
          setCsvRows([]);
          setCsvParseError('No valid rows found in CSV');
          return;
        }

        setCsvRows(mappedRows);
        setCsvParseError('');
      },
      error: (error) => {
        setCsvRows([]);
        setCsvParseError(`Failed to parse CSV: ${error.message}`);
      },
    });
  };

  const importCsvAndSendTemplate = async () => {
    if (!csvRows.length) {
      setCsvImportError('No CSV rows to import');
      return;
    }
    if (csvSendTemplate && !csvTemplateName.trim()) {
      setCsvImportError('Template is required when "send template" is enabled');
      return;
    }

    setIsImportingCsv(true);
    setCsvImportError('');
    setCsvImportResult(null);

    try {
      const addTags = csvAddTags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const response = await api.post('/integrations/whatsapp/bulk/csv-import', {
        rows: csvRows,
        addTags: addTags.length ? addTags : undefined,
        sendTemplate: csvSendTemplate
          ? {
              name: csvTemplateName.trim(),
              language: csvTemplateLanguage.trim() || 'en_US',
            }
          : undefined,
      });

      setCsvImportResult(response.data);
    } catch (err: any) {
      setCsvImportError(err?.response?.data?.message || 'CSV import failed');
    } finally {
      setIsImportingCsv(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeChannel === 'email'
              ? 'Create and send bulk email campaigns to your contacts'
              : 'Create WhatsApp template campaigns and send bulk messages from CSV'}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
          <button
            onClick={() => setActiveChannel('email')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeChannel === 'email'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Mail className="h-4 w-4" />
            Email
          </button>
          <button
            onClick={() => setActiveChannel('whatsapp')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeChannel === 'whatsapp'
                ? 'bg-green-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </button>
        </div>
      </div>

      {activeChannel === 'email' && (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => { setEditingCampaign(null); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Email Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No email campaigns yet. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => {
                const sc = statusConfig[campaign.status];
                const Icon = sc.icon;
                return (
                  <div key={campaign.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-base font-semibold text-gray-900 truncate">{campaign.name}</h3>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.color}`}>
                            <Icon className="h-3 w-3" />
                            {sc.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1 truncate">Subject: {campaign.subject}</p>
                        {campaign.status === 'scheduled' && campaign.scheduledAt && (
                          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Scheduled for {new Date(campaign.scheduledAt).toLocaleString()}
                          </p>
                        )}
                        {campaign.status === 'sent' && campaign.stats && (
                          <p className="text-xs text-gray-400 mt-1">
                            Sent {campaign.stats.sent}/{campaign.stats.total} emails
                            {campaign.stats.failed ? ` (${campaign.stats.failed} failed)` : ''}
                            {campaign.sentAt && ` on ${new Date(campaign.sentAt).toLocaleDateString()}`}
                          </p>
                        )}
                        {campaign.filters && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {campaign.filters.tags?.map((t) => (
                              <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">tag: {t}</span>
                            ))}
                            {campaign.filters.statuses?.map((s) => (
                              <span key={s} className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">status: {s}</span>
                            ))}
                            {campaign.filters.sources?.map((s) => (
                              <span key={s} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">source: {s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setInfoEmailCampaign(campaign)}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                            title="Info"
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </div>
                        {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                          <div className="flex items-center gap-2">
                            {(() => {
                              const isLocked = campaign.status === 'scheduled' && campaign.scheduledAt
                                ? new Date(campaign.scheduledAt).getTime() - Date.now() < 5 * 60 * 1000
                                : false;
                              return (
                                <button
                                  onClick={() => !isLocked && handleEdit(campaign)}
                                  disabled={isLocked}
                                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={isLocked ? 'Locked — less than 5 min to send' : 'Edit'}
                                >
                                  {isLocked ? <Lock className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                                </button>
                              );
                            })()}
                            <button
                              onClick={() => {
                                setSchedulingEmailId(schedulingEmailId === campaign.id ? null : campaign.id);
                                setScheduleEmailDate('');
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-300 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
                              title="Schedule"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              Schedule
                            </button>
                            <button
                              onClick={() => handleSend(campaign.id)}
                              disabled={isSending === campaign.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              {isSending === campaign.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              Send now
                            </button>
                          </div>
                        )}
                        {schedulingEmailId === campaign.id && (
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={scheduleEmailDate}
                              onChange={e => setScheduleEmailDate(e.target.value)}
                              className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => handleScheduleEmail(campaign.id, scheduleEmailDate)}
                              disabled={!scheduleEmailDate}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
                            >
                              Confirm
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => handleDelete(campaign.id)}
                          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors self-end"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showForm && (
            <CampaignForm campaign={editingCampaign} onClose={handleFormClose} />
          )}
        </>
      )}

      {activeChannel === 'whatsapp' && (
        <>
          {isLoadingWhatsApp ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : !isWhatsAppConnected ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
              <PlugZap className="h-10 w-10 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">Connect WhatsApp first</h3>
              <p className="text-sm text-gray-500 mt-1">
                You can create and send WhatsApp campaigns only after connecting at least one WhatsApp number.
              </p>
              <Link
                href="/integrations"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <PlugZap className="h-4 w-4" />
                Open Integrations
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
                <p className="text-sm text-green-800 font-medium">
                  WhatsApp connected: {senderAccounts.length} sender number{senderAccounts.length > 1 ? 's' : ''}.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                      <Send className="h-4 w-4 text-green-600" />
                      WhatsApp Campaigns
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Create campaign drafts with approved templates and send in bulk</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowWhatsAppForm((prev) => !prev);
                      setWhatsAppFormError('');
                      setAudiencePreview(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    New Campaign
                  </button>
                </div>

                {showWhatsAppForm && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Campaign Name *</label>
                      <input
                        type="text"
                        value={whatsAppName}
                        onChange={(e) => setWhatsAppName(e.target.value)}
                        placeholder="e.g. Spring WhatsApp Promo"
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-700">Template *</label>
                        <button
                          type="button"
                          onClick={fetchWhatsAppTemplates}
                          className="text-xs text-green-600 hover:text-green-700"
                        >
                          Reload templates
                        </button>
                      </div>
                      <select
                        value={whatsAppTemplate}
                        onChange={(e) => {
                          const selected = approvedTemplates.find((tpl) => tpl.name === e.target.value);
                          setWhatsAppTemplate(e.target.value);
                          if (selected?.language) setWhatsAppLanguage(selected.language);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        <option value="">Select approved template</option>
                        {approvedTemplates.map((tpl) => (
                          <option key={`${tpl.name}_${tpl.language}`} value={tpl.name}>
                            {tpl.name} ({tpl.language})
                          </option>
                        ))}
                      </select>
                      {approvedTemplates.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          No approved template available. Create and approve templates from the WhatsApp page.
                        </p>
                      )}
                    </div>

                    {/* Template Parameters */}
                    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
                      <p className="text-xs font-medium text-gray-700">Template Parameters <span className="font-normal text-gray-400">(optional — only if your template requires them)</span></p>

                      {/* Header param */}
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Header component</label>
                        <div className="flex items-center gap-2">
                          <select
                            value={waHeaderParamType}
                            onChange={e => setWaHeaderParamType(e.target.value as any)}
                            className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            <option value="">None</option>
                            <option value="text">Text</option>
                            <option value="image">Image URL</option>
                            <option value="video">Video URL</option>
                            <option value="document">Document URL</option>
                          </select>
                          {waHeaderParamType && (
                            <input
                              type="text"
                              value={waHeaderParamValue}
                              onChange={e => setWaHeaderParamValue(e.target.value)}
                              placeholder={waHeaderParamType === 'text' ? 'Header text value' : 'https://...'}
                              className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                          )}
                        </div>
                      </div>

                      {/* Body params */}
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Body variables &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;...</label>
                        <div className="space-y-1.5">
                          {waBodyParams.map((val, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 w-7 text-right shrink-0">&#123;&#123;{idx + 1}&#125;&#125;</span>
                              <input
                                type="text"
                                value={val}
                                onChange={e => {
                                  const next = [...waBodyParams];
                                  next[idx] = e.target.value;
                                  setWaBodyParams(next);
                                }}
                                placeholder={`Value for {{${idx + 1}}}`}
                                className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              {waBodyParams.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setWaBodyParams(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-gray-400 hover:text-red-500"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {waBodyParams.length < 8 && (
                            <button
                              type="button"
                              onClick={() => setWaBodyParams(prev => [...prev, ''])}
                              className="text-xs text-green-600 hover:text-green-700 font-medium"
                            >
                              + Add variable
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Audience source</label>
                      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsAppAudienceMode('crm_filters');
                            setAudiencePreview(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            whatsAppAudienceMode === 'crm_filters'
                              ? 'bg-green-600 text-white'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          CRM filters
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWhatsAppAudienceMode('direct_list');
                            setAudiencePreview(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            whatsAppAudienceMode === 'direct_list'
                              ? 'bg-green-600 text-white'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          Direct list (no CRM save)
                        </button>
                      </div>
                    </div>

                    {whatsAppAudienceMode === 'crm_filters' ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Tags</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={whatsAppTagInput}
                              onChange={(e) => setWhatsAppTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addTag();
                                }
                              }}
                              placeholder="type tag and press Enter"
                              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <button
                              type="button"
                              onClick={addTag}
                              className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-100"
                            >
                              Add
                            </button>
                          </div>
                          {whatsAppTags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {whatsAppTags.map((tag) => (
                                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                  {tag}
                                  <button onClick={() => setWhatsAppTags((prev) => prev.filter((entry) => entry !== tag))}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Contact Status</label>
                          <div className="flex flex-wrap gap-1.5">
                            {allStatuses.map((status) => (
                              <button
                                key={status}
                                onClick={() => toggleWhatsAppStatus(status)}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                  whatsAppStatuses.includes(status)
                                    ? 'bg-green-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Phone list (one per line)</label>
                          <textarea
                            value={manualRecipientsInput}
                            onChange={(e) => setManualRecipientsInput(e.target.value)}
                            placeholder="+40712345678&#10;+40722111222"
                            rows={4}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={addManualRecipientsFromInput}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-100"
                            >
                              Add numbers
                            </button>
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
                              CSV list
                              <input
                                type="file"
                                accept=".csv,text/csv"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleManualRecipientsCsv(file);
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setManualRecipients([]);
                                setAudiencePreview(null);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600"
                            >
                              Clear list
                            </button>
                          </div>
                          {manualRecipientsError && <p className="text-xs text-red-600 mt-2">{manualRecipientsError}</p>}
                        </div>

                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-1">Selected recipients: {manualRecipients.length}</p>
                          {manualRecipients.length === 0 ? (
                            <p className="text-xs text-gray-400">No recipients added yet.</p>
                          ) : (
                            <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-100">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr>
                                    <th className="text-left px-2 py-1 font-medium text-gray-500">Phone</th>
                                    <th className="text-left px-2 py-1 font-medium text-gray-500">Name</th>
                                    <th className="text-right px-2 py-1 font-medium text-gray-500">Remove</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {manualRecipients.map((recipient) => (
                                    <tr key={normalizeRecipientKey(recipient.phone)}>
                                      <td className="px-2 py-1.5 font-mono">{recipient.phone}</td>
                                      <td className="px-2 py-1.5">{`${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() || '-'}</td>
                                      <td className="px-2 py-1.5 text-right">
                                        <button
                                          type="button"
                                          onClick={() => removeManualRecipient(recipient.phone)}
                                          className="text-gray-400 hover:text-red-500"
                                        >
                                          <X className="h-3.5 w-3.5 inline-block" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={previewWhatsAppAudience}
                        disabled={isPreviewingAudience}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                      >
                        {isPreviewingAudience ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                        Preview Audience
                      </button>
                      {audiencePreview && (
                        <p className="text-sm font-semibold text-green-700">
                          {audiencePreview.count} {whatsAppAudienceMode === 'direct_list' ? 'recipients ready' : 'contacts matched'}
                        </p>
                      )}
                    </div>

                    {/* Scheduling */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Schedule send (optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={waScheduledAt}
                        onChange={e => setWaScheduledAt(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <p className="text-xs text-gray-400 mt-1">Leave empty to send immediately or save as draft</p>
                    </div>

                    {whatsAppFormError && <p className="text-sm text-red-600">{whatsAppFormError}</p>}

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={resetWhatsAppForm}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => createWhatsAppCampaign(false)}
                        disabled={isCreatingWhatsAppCampaign || !whatsAppName.trim() || !whatsAppTemplate.trim()}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                      >
                        Save Draft
                      </button>
                      {waScheduledAt && (
                        <button
                          type="button"
                          onClick={() => createWhatsAppCampaign('schedule')}
                          disabled={isCreatingWhatsAppCampaign || !whatsAppName.trim() || !whatsAppTemplate.trim()}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isCreatingWhatsAppCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                          Schedule
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => createWhatsAppCampaign(true)}
                        disabled={isCreatingWhatsAppCampaign || !whatsAppName.trim() || !whatsAppTemplate.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        {isCreatingWhatsAppCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send now
                      </button>
                    </div>
                  </div>
                )}

                {isLoadingWhatsAppCampaigns ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : whatsAppCampaigns.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                    <MessageCircle className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">No WhatsApp campaigns yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Campaign</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Template</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Results</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {whatsAppCampaigns.map((campaign) => (
                          <tr key={campaign.id}>
                            <td className="px-4 py-3">
                              <span className="font-medium text-gray-900">{campaign.name}</span>
                              {(campaign as any)._isBulk && (
                                <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">CSV</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 font-mono">{campaign.templateName}</td>
                            <td className="px-4 py-3">
                              <div>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  campaign.status === 'sent'
                                    ? 'bg-green-100 text-green-700'
                                    : campaign.status === 'sending'
                                      ? 'bg-amber-100 text-amber-700'
                                      : campaign.status === 'scheduled'
                                        ? 'bg-blue-100 text-blue-700'
                                        : campaign.status === 'failed'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {campaign.status}
                                </span>
                                {campaign.status === 'scheduled' && (campaign as any).scheduledAt && (
                                  <p className="text-[10px] text-blue-600 mt-0.5">
                                    {new Date((campaign as any).scheduledAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {campaign.results?.error ? (
                                <span className="text-red-600">{campaign.results.error}</span>
                              ) : campaign.results ? (
                                <>
                                  <span className="text-green-600 font-medium">{campaign.results.sent ?? 0}</span> sent
                                  {typeof campaign.results.failed === 'number' && campaign.results.failed > 0 && (
                                    <> / <span className="text-red-500 font-medium">{campaign.results.failed}</span> failed</>
                                  )}
                                  {typeof campaign.results.total === 'number' && <> / {campaign.results.total} total</>}
                                </>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setInfoWaCampaign(campaign)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                                  title="Info"
                                >
                                  <Info className="h-4 w-4" />
                                </button>
                                {(campaign as any)._isBulk && (campaign.status === 'draft' || campaign.status === 'scheduled') && (() => {
                                  const isLocked = campaign.status === 'scheduled' && (campaign as any).scheduledAt
                                    ? new Date((campaign as any).scheduledAt).getTime() - Date.now() < 5 * 60 * 1000
                                    : false;
                                  return (
                                    <button
                                      onClick={() => !isLocked && setEditWaCampaign(campaign)}
                                      disabled={isLocked}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                      title={isLocked ? 'Locked — less than 5 min to send' : 'Edit'}
                                    >
                                      {isLocked ? <Lock className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                                    </button>
                                  );
                                })()}
                                {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                                  <button
                                    onClick={() => sendWhatsAppCampaign(campaign)}
                                    disabled={isSendingWhatsAppCampaign === campaign.id}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {isSendingWhatsAppCampaign === campaign.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <Send className="h-3.5 w-3.5" />}
                                    Send now
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteWhatsAppCampaign(campaign)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                                  title="Delete campaign"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    CSV Bulk Import + Template Send
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Upload CSV contacts and optionally send an approved WhatsApp template in bulk.
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Expected headers: <span className="font-mono">phone</span> (required), <span className="font-mono">first_name</span>, <span className="font-mono">last_name</span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">CSV File *</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
                      <FileText className="h-4 w-4" />
                      {csvFile?.name || 'Choose CSV file'}
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCsvFile(file);
                        }}
                      />
                    </label>
                    {csvRows.length > 0 && (
                      <span className="text-sm font-medium text-green-600">{csvRows.length} rows ready</span>
                    )}
                  </div>
                  {csvParseError && <p className="text-sm text-red-600 mt-1">{csvParseError}</p>}
                </div>

                {csvRows.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Phone</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">First Name</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Last Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {csvRows.slice(0, 25).map((row, idx) => (
                          <tr key={`${row.phone}_${idx}`}>
                            <td className="px-3 py-1.5 font-mono">{row.phone}</td>
                            <td className="px-3 py-1.5">{row.firstName || '-'}</td>
                            <td className="px-3 py-1.5">{row.lastName || '-'}</td>
                          </tr>
                        ))}
                        {csvRows.length > 25 && (
                          <tr>
                            <td className="px-3 py-1.5 text-gray-400" colSpan={3}>
                              ... and {csvRows.length - 25} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tags to add (comma separated)</label>
                  <input
                    type="text"
                    value={csvAddTags}
                    onChange={(e) => setCsvAddTags(e.target.value)}
                    placeholder="e.g. imported, april-campaign"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={csvSendTemplate}
                      onChange={(e) => setCsvSendTemplate(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    Send template after import
                  </label>
                </div>

                {csvSendTemplate && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                    <select
                      value={csvTemplateName}
                      onChange={(e) => {
                        const selected = approvedTemplates.find((tpl) => tpl.name === e.target.value);
                        setCsvTemplateName(e.target.value);
                        if (selected?.language) setCsvTemplateLanguage(selected.language);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    >
                      <option value="">Select approved template</option>
                      {approvedTemplates.map((tpl) => (
                        <option key={`${tpl.name}_${tpl.language}`} value={tpl.name}>
                          {tpl.name} ({tpl.language})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {csvImportError && <p className="text-sm text-red-600">{csvImportError}</p>}

                <button
                  onClick={importCsvAndSendTemplate}
                  disabled={isImportingCsv || !csvRows.length}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {isImportingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {isImportingCsv ? 'Importing...' : 'Import Contacts'}
                </button>

                {csvImportResult && (
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="font-semibold text-gray-700">Imported: {csvImportResult.imported}</span>
                      <span className="text-green-600">Created: {csvImportResult.created}</span>
                      <span className="text-blue-600">Updated: {csvImportResult.updated}</span>
                      {csvSendTemplate && <span className="text-green-700 font-semibold">Sent: {csvImportResult.sent}</span>}
                      {csvSendTemplate && csvImportResult.failed > 0 && <span className="text-red-600 font-semibold">Failed: {csvImportResult.failed}</span>}
                    </div>

                    <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Phone</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Action</th>
                            {csvSendTemplate && <th className="px-3 py-2 text-left font-medium text-gray-500">Template</th>}
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {csvImportResult.results.map((row, idx) => (
                            <tr key={`${row.phone}_${idx}`} className={row.sendError ? 'bg-red-50' : ''}>
                              <td className="px-3 py-1.5 font-mono">{row.phone}</td>
                              <td className="px-3 py-1.5">{row.status}</td>
                              {csvSendTemplate && <td className="px-3 py-1.5">{row.sent ? 'sent' : row.sendError ? 'failed' : '-'}</td>}
                              <td className="px-3 py-1.5 text-gray-500">{row.sendError || row.reason || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {/* Email campaign info modal */}
      {infoEmailCampaign && (
        <EmailCampaignInfoModal campaign={infoEmailCampaign} onClose={() => setInfoEmailCampaign(null)} />
      )}

      {/* WhatsApp campaign info modal */}
      {infoWaCampaign && (
        <WaCampaignInfoModal campaign={infoWaCampaign} onClose={() => setInfoWaCampaign(null)} />
      )}

      {/* WhatsApp campaign edit modal */}
      {editWaCampaign && (
        <WaCampaignEditModal
          campaign={editWaCampaign}
          approvedTemplates={approvedTemplates}
          onClose={() => setEditWaCampaign(null)}
          onSaved={() => { setEditWaCampaign(null); fetchWhatsAppCampaigns(); }}
        />
      )}
    </div>
  );
}

function EmailCampaignInfoModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const sc = statusConfig[campaign.status];
  const Icon = sc.icon;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Campaign Info</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.color}`}>
              <Icon className="h-3 w-3" />{sc.label}
            </span>
            <span className="font-semibold text-gray-900">{campaign.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Subject</p>
              <p className="text-gray-800">{campaign.subject}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Created</p>
              <p className="text-gray-800">{new Date(campaign.createdAt).toLocaleString()}</p>
            </div>
            {campaign.scheduledAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Scheduled for</p>
                <p className="text-blue-600">{new Date(campaign.scheduledAt).toLocaleString()}</p>
              </div>
            )}
            {campaign.sentAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Sent at</p>
                <p className="text-gray-800">{new Date(campaign.sentAt).toLocaleString()}</p>
              </div>
            )}
          </div>
          {campaign.stats && (campaign.stats.total ?? 0) > 0 && (
            <div className="rounded-xl bg-gray-50 p-3 flex gap-6">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{campaign.stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-600">{campaign.stats.sent ?? 0}</p>
                <p className="text-xs text-gray-500">Sent</p>
              </div>
              {(campaign.stats.failed ?? 0) > 0 && (
                <div className="text-center">
                  <p className="text-lg font-bold text-red-500">{campaign.stats.failed}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
              )}
            </div>
          )}
          {(campaign.filters?.tags?.length || campaign.filters?.statuses?.length || campaign.filters?.sources?.length) ? (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Audience Filters</p>
              <div className="flex flex-wrap gap-1.5">
                {campaign.filters.tags?.map(t => (
                  <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">tag: {t}</span>
                ))}
                {campaign.filters.statuses?.map(s => (
                  <span key={s} className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">status: {s}</span>
                ))}
                {campaign.filters.sources?.map(s => (
                  <span key={s} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">source: {s}</span>
                ))}
              </div>
            </div>
          ) : null}
          {campaign.htmlBody && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Email Body (HTML preview)</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs font-mono text-gray-600 whitespace-pre-wrap break-all">
                {campaign.htmlBody.slice(0, 1000)}{campaign.htmlBody.length > 1000 ? '...' : ''}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}

function WaCampaignInfoModal({ campaign, onClose }: { campaign: any; onClose: () => void }) {
  const recipients: any[] = campaign.csvRecipients || [];
  const stats = campaign.results || campaign.stats || {};
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">WhatsApp Campaign Info</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              campaign.status === 'sent' ? 'bg-green-100 text-green-700'
              : campaign.status === 'sending' ? 'bg-amber-100 text-amber-700'
              : campaign.status === 'scheduled' ? 'bg-blue-100 text-blue-700'
              : campaign.status === 'failed' ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-700'
            }`}>{campaign.status}</span>
            <span className="font-semibold text-gray-900">{campaign.name}</span>
            {campaign._isBulk && <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">CSV</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Template</p>
              <p className="font-mono text-gray-800">{campaign.templateName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Language</p>
              <p className="text-gray-800">{campaign.language}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Created</p>
              <p className="text-gray-800">{new Date(campaign.createdAt).toLocaleString()}</p>
            </div>
            {campaign.scheduledAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Scheduled for</p>
                <p className="text-blue-600">{new Date(campaign.scheduledAt).toLocaleString()}</p>
              </div>
            )}
            {campaign.sentAt && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Sent at</p>
                <p className="text-gray-800">{new Date(campaign.sentAt).toLocaleString()}</p>
              </div>
            )}
          </div>
          {(stats.total ?? stats.sent ?? stats.failed) !== undefined && (
            <div className="rounded-xl bg-gray-50 p-3 flex gap-6">
              {stats.total !== undefined && (
                <div className="text-center"><p className="text-lg font-bold text-gray-900">{stats.total}</p><p className="text-xs text-gray-500">Total</p></div>
              )}
              {stats.sent !== undefined && (
                <div className="text-center"><p className="text-lg font-bold text-green-600">{stats.sent}</p><p className="text-xs text-gray-500">Sent</p></div>
              )}
              {(stats.failed ?? 0) > 0 && (
                <div className="text-center"><p className="text-lg font-bold text-red-500">{stats.failed}</p><p className="text-xs text-gray-500">Failed</p></div>
              )}
            </div>
          )}
          {stats.error && (
            <div className="rounded-xl bg-red-50 border border-red-100 p-3">
              <p className="text-xs text-red-600 font-medium">Error</p>
              <p className="text-sm text-red-700 mt-1">{stats.error}</p>
            </div>
          )}
          {recipients.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Recipients ({recipients.length})</p>
              <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-500">Phone</th>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-500">Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {recipients.slice(0, 100).map((r: any, i: number) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono">{r.phone}</td>
                        <td className="px-3 py-1.5">{`${r.firstName || ''} ${r.lastName || ''}`.trim() || '-'}</td>
                      </tr>
                    ))}
                    {recipients.length > 100 && (
                      <tr><td className="px-3 py-1.5 text-gray-400" colSpan={2}>... and {recipients.length - 100} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}

function WaCampaignEditModal({
  campaign,
  approvedTemplates,
  onClose,
  onSaved,
}: {
  campaign: any;
  approvedTemplates: { name: string; language: string; status: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(campaign.name || '');
  const [templateName, setTemplateName] = useState(campaign.templateName || '');
  const [language, setLanguage] = useState(campaign.language || 'en_US');
  const [scheduledAt, setScheduledAt] = useState(
    campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '',
  );

  // Pre-fill template params from existing campaign
  const existingParams: any[] = campaign.templateParams || [];
  const existingHeader = existingParams.find((c: any) => c.type === 'header');
  const existingBody = existingParams.find((c: any) => c.type === 'body');
  const initHeaderParam = existingHeader?.parameters?.[0];
  const initHeaderType = initHeaderParam ? (initHeaderParam.type as 'text' | 'image' | 'video' | 'document') : '' as const;
  const initHeaderValue = initHeaderParam
    ? (initHeaderParam.text || initHeaderParam.image?.link || initHeaderParam.video?.link || initHeaderParam.document?.link || '')
    : '';
  const initBodyParams: string[] = existingBody?.parameters?.map((p: any) => p.text || '') || [''];

  const [headerType, setHeaderType] = useState<'' | 'text' | 'image' | 'video' | 'document'>(initHeaderType);
  const [headerValue, setHeaderValue] = useState(initHeaderValue);
  const [bodyParams, setBodyParams] = useState<string[]>(initBodyParams.length ? initBodyParams : ['']);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const buildTemplateParams = () => {
    const params: any[] = [];
    if (headerType && headerValue.trim()) {
      const hp = headerType === 'text'
        ? { type: 'text', text: headerValue.trim() }
        : { type: headerType, [headerType]: { link: headerValue.trim() } };
      params.push({ type: 'header', parameters: [hp] });
    }
    const bodyVars = bodyParams.filter(p => p.trim());
    if (bodyVars.length) {
      params.push({ type: 'body', parameters: bodyVars.map(v => ({ type: 'text', text: v.trim() })) });
    }
    return params;
  };

  const isLocked = campaign.scheduledAt
    ? new Date(campaign.scheduledAt).getTime() - Date.now() < 5 * 60 * 1000
    : false;

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setIsSaving(true);
    setError('');
    try {
      const tp = buildTemplateParams();
      await api.put(`/integrations/whatsapp/bulk-campaigns/${campaign.id}`, {
        name: name.trim(),
        templateName: templateName.trim(),
        language: language.trim() || 'en_US',
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        ...(tp.length ? { templateParams: tp } : { templateParams: [] }),
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Edit WhatsApp Campaign</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
        </div>
        {isLocked ? (
          <div className="p-5 text-center space-y-3">
            <Lock className="h-10 w-10 text-amber-400 mx-auto" />
            <p className="text-sm font-semibold text-gray-800">Campaign is locked</p>
            <p className="text-xs text-gray-500">Less than 5 minutes before the scheduled send. Editing is not allowed.</p>
            <button onClick={onClose} className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">Close</button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Campaign Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Template</label>
                <select
                  value={templateName}
                  onChange={e => {
                    const sel = approvedTemplates.find(t => t.name === e.target.value);
                    setTemplateName(e.target.value);
                    if (sel?.language) setLanguage(sel.language);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select approved template</option>
                  {approvedTemplates.map(t => (
                    <option key={`${t.name}_${t.language}`} value={t.name}>{t.name} ({t.language})</option>
                  ))}
                </select>
              </div>
              {/* Template Parameters */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
                <p className="text-xs font-medium text-gray-700">Template Parameters <span className="font-normal text-gray-400">(header/body vars)</span></p>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Header component</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={headerType}
                      onChange={e => setHeaderType(e.target.value as any)}
                      className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">None</option>
                      <option value="text">Text</option>
                      <option value="image">Image URL</option>
                      <option value="video">Video URL</option>
                      <option value="document">Document URL</option>
                    </select>
                    {headerType && (
                      <input
                        type="text"
                        value={headerValue}
                        onChange={e => setHeaderValue(e.target.value)}
                        placeholder={headerType === 'text' ? 'Header text' : 'https://...'}
                        className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Body variables</label>
                  <div className="space-y-1.5">
                    {bodyParams.map((val, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-7 text-right shrink-0">&#123;&#123;{idx + 1}&#125;&#125;</span>
                        <input
                          type="text"
                          value={val}
                          onChange={e => { const n = [...bodyParams]; n[idx] = e.target.value; setBodyParams(n); }}
                          placeholder={`Value for {{${idx + 1}}}`}
                          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        {bodyParams.length > 1 && (
                          <button type="button" onClick={() => setBodyParams(p => p.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {bodyParams.length < 8 && (
                      <button type="button" onClick={() => setBodyParams(p => [...p, ''])} className="text-xs text-green-600 hover:text-green-700 font-medium">
                        + Add variable
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />Schedule send (optional)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">Clear to revert to draft</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button
                onClick={handleSave}
                disabled={isSaving || !name.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CampaignForm({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const [name, setName] = useState(campaign?.name || '');
  const [subject, setSubject] = useState(campaign?.subject || '');
  const [htmlBody, setHtmlBody] = useState(campaign?.htmlBody || '');
  const [textBody, setTextBody] = useState(campaign?.textBody || '');
  const [filterTags, setFilterTags] = useState(campaign?.filters?.tags?.join(', ') || '');
  const [filterStatuses, setFilterStatuses] = useState<string[]>(campaign?.filters?.statuses || []);
  const [filterSources, setFilterSources] = useState<string[]>(campaign?.filters?.sources || []);
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduledAt ? new Date(campaign.scheduledAt).toISOString().slice(0, 16) : '',
  );
  const [csvText, setCsvText] = useState('');
  const [csvCount, setCsvCount] = useState(0);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setCsvText(text);
      const lines = text.trim().split('\n').filter(l => l.trim());
      setCsvCount(Math.max(0, lines.length - 1));
    };
    reader.readAsText(file);
  };

  const buildFilters = () => {
    const filters: any = {};
    const tags = filterTags.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length) filters.tags = tags;
    if (filterStatuses.length) filters.statuses = filterStatuses;
    if (filterSources.length) filters.sources = filterSources;
    return filters;
  };

  const previewAudience = async () => {
    setIsPreviewing(true);
    try {
      const res = await api.post('/email-campaigns/preview-audience', { filters: buildFilters() });
      setAudienceCount(res.data.count);
    } catch {
      setAudienceCount(null);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) return;
    setIsSaving(true);
    try {
      // Parse CSV recipients if file was uploaded
      let csvRecipients: Array<{ email: string; name?: string }> | undefined;
      if (csvText.trim()) {
        const lines = csvText.trim().split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
        csvRecipients = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
          const row: Record<string, string> = {};
          headers.forEach((h, i) => { row[h] = vals[i] || ''; });
          return {
            email: row.email || row['e-mail'] || row.mail || '',
            name: row.name || row.nome || row.firstname || row.first_name || '',
          };
        }).filter(r => r.email);
      }

      const payload: any = {
        name,
        subject,
        htmlBody: htmlBody || null,
        textBody: textBody || null,
        filters: buildFilters(),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      };
      if (csvRecipients?.length) payload.csvRecipients = csvRecipients;

      if (campaign) {
        await api.put(`/email-campaigns/${campaign.id}`, payload);
      } else {
        await api.post('/email-campaigns', payload);
      }
      onClose();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = (s: string) => {
    setFilterStatuses((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    setAudienceCount(null);
  };

  const toggleSource = (s: string) => {
    setFilterSources((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    setAudienceCount(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{campaign ? 'Edit Campaign' : 'New Campaign'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., February Newsletter"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Check out our latest updates!"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* HTML Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Body (HTML)</label>
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              placeholder="Paste your HTML email content here..."
              rows={8}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Text Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plain Text Fallback (optional)</label>
            <textarea
              value={textBody}
              onChange={(e) => setTextBody(e.target.value)}
              placeholder="Plain text version for email clients that don't support HTML..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Filters */}
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Audience Filters</h3>

            {/* Tags */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={filterTags}
                onChange={(e) => { setFilterTags(e.target.value); setAudienceCount(null); }}
                placeholder="e.g., vip, newsletter"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Statuses */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Contact Status</label>
              <div className="flex flex-wrap gap-1.5">
                {allStatuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filterStatuses.includes(s)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Sources */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Contact Source</label>
              <div className="flex flex-wrap gap-1.5">
                {allSources.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSource(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      filterSources.includes(s)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={previewAudience}
                disabled={isPreviewing}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Preview Audience
              </button>
              {audienceCount !== null && (
                <span className="text-sm font-semibold text-indigo-600">
                  {audienceCount} contact{audienceCount !== 1 ? 's' : ''} match
                </span>
              )}
            </div>
          </div>

          {/* CSV Recipients (optional) */}
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">CSV Recipients (optional)</h3>
            <p className="text-xs text-gray-500 mb-3">
              Upload a CSV to send to a specific list instead of CRM filters.
              Columns: <code className="bg-gray-100 px-1 rounded">email</code>, <code className="bg-gray-100 px-1 rounded">name</code>
            </p>
            <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            <button
              type="button"
              onClick={() => csvFileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
              <Upload className="h-4 w-4" />
              {csvCount > 0 ? `${csvCount} email recipients loaded` : 'Upload CSV (optional)'}
            </button>
          </div>

          {/* Schedule */}
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-blue-500" />
              Schedule send (optional)
            </h3>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">Leave empty to save as draft and send manually</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim() || !subject.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {campaign ? 'Update' : 'Create'} Campaign
          </button>
        </div>
      </div>
    </div>
  );
}
