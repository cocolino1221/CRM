'use client';

import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import api from '@/lib/api';

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
type CampaignChannel = 'email' | 'whatsapp';
type WhatsAppCampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';

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
  const [isCreatingWhatsAppCampaign, setIsCreatingWhatsAppCampaign] = useState(false);
  const [isSendingWhatsAppCampaign, setIsSendingWhatsAppCampaign] = useState<string | null>(null);

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
      const res = await api.get('/integrations/whatsapp/campaigns');
      setWhatsAppCampaigns(Array.isArray(res.data) ? res.data : []);
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
      const res = await api.post(`/email-campaigns/${id}/send`);
      alert(`Campaign sent! ${res.data.sent} sent, ${res.data.failed} failed out of ${res.data.total} contacts.`);
      fetchCampaigns();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send campaign');
    } finally {
      setIsSending(null);
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

  const previewWhatsAppAudience = async () => {
    setIsPreviewingAudience(true);
    try {
      const res = await api.post('/integrations/whatsapp/campaigns/preview-audience', {
        tags: whatsAppTags.length ? whatsAppTags : undefined,
        status: whatsAppStatuses.length ? whatsAppStatuses : undefined,
      });
      setAudiencePreview(res.data);
    } catch (err) {
      console.error('Failed to preview WhatsApp audience', err);
      setAudiencePreview(null);
    } finally {
      setIsPreviewingAudience(false);
    }
  };

  const resetWhatsAppForm = () => {
    setWhatsAppName('');
    setWhatsAppTagInput('');
    setWhatsAppTags([]);
    setWhatsAppStatuses([]);
    setAudiencePreview(null);
    setWhatsAppFormError('');
    setShowWhatsAppForm(false);
    if (approvedTemplates[0]) {
      setWhatsAppTemplate(approvedTemplates[0].name);
      setWhatsAppLanguage(approvedTemplates[0].language || 'en_US');
    } else {
      setWhatsAppTemplate('');
      setWhatsAppLanguage('en_US');
    }
  };

  const createWhatsAppCampaign = async (sendNow: boolean) => {
    if (!whatsAppName.trim()) {
      setWhatsAppFormError('Campaign name is required');
      return;
    }
    if (!whatsAppTemplate.trim()) {
      setWhatsAppFormError('Template is required');
      return;
    }

    setIsCreatingWhatsAppCampaign(true);
    setWhatsAppFormError('');
    try {
      const createRes = await api.post('/integrations/whatsapp/campaigns', {
        name: whatsAppName.trim(),
        templateName: whatsAppTemplate.trim(),
        language: whatsAppLanguage.trim() || 'en_US',
        filter: {
          tags: whatsAppTags.length ? whatsAppTags : undefined,
          status: whatsAppStatuses.length ? whatsAppStatuses : undefined,
        },
      });

      const createdCampaign = createRes.data as WhatsAppCampaign;
      if (sendNow && createdCampaign?.id) {
        setIsSendingWhatsAppCampaign(createdCampaign.id);
        await api.post(`/integrations/whatsapp/campaigns/${createdCampaign.id}/send`);
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

  const sendWhatsAppCampaign = async (campaignId: string) => {
    setIsSendingWhatsAppCampaign(campaignId);
    try {
      await api.post(`/integrations/whatsapp/campaigns/${campaignId}/send`);
      fetchWhatsAppCampaigns();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send campaign');
    } finally {
      setIsSendingWhatsAppCampaign(null);
    }
  };

  const deleteWhatsAppCampaign = async (campaignId: string) => {
    if (!confirm('Delete this WhatsApp campaign?')) return;
    try {
      await api.delete(`/integrations/whatsapp/campaigns/${campaignId}`);
      setWhatsAppCampaigns((prev) => prev.filter((campaign) => campaign.id !== campaignId));
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
                      <div className="flex items-center gap-2 shrink-0">
                        {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                          <>
                            <button
                              onClick={() => handleEdit(campaign)}
                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
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
                              Send
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDelete(campaign.id)}
                          className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
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
                          {audiencePreview.count} contacts matched
                        </p>
                      )}
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
                      <button
                        type="button"
                        onClick={() => createWhatsAppCampaign(true)}
                        disabled={isCreatingWhatsAppCampaign || !whatsAppName.trim() || !whatsAppTemplate.trim()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        {isCreatingWhatsAppCampaign ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Create & Send
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
                            <td className="px-4 py-3 font-medium text-gray-900">{campaign.name}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 font-mono">{campaign.templateName}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                campaign.status === 'sent'
                                  ? 'bg-green-100 text-green-700'
                                  : campaign.status === 'sending'
                                    ? 'bg-amber-100 text-amber-700'
                                    : campaign.status === 'failed'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-gray-100 text-gray-700'
                              }`}>
                                {campaign.status}
                              </span>
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
                                {campaign.status === 'draft' && (
                                  <button
                                    onClick={() => sendWhatsAppCampaign(campaign.id)}
                                    disabled={isSendingWhatsAppCampaign === campaign.id}
                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {isSendingWhatsAppCampaign === campaign.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <Send className="h-3.5 w-3.5" />}
                                    Send
                                  </button>
                                )}
                                <button
                                  onClick={() => deleteWhatsAppCampaign(campaign.id)}
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
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

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
      const payload = {
        name,
        subject,
        htmlBody: htmlBody || null,
        textBody: textBody || null,
        filters: buildFilters(),
      };
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
