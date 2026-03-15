'use client';

import { useState, useEffect } from 'react';
import { Mail, Plus, Send, Trash2, Edit, Eye, Users, X, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

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

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isSending, setIsSending] = useState<string | null>(null);

  useEffect(() => { fetchCampaigns(); }, []);

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
          <h1 className="text-2xl font-bold text-gray-900">Email Campaigns</h1>
          <p className="text-sm text-gray-500 mt-1">Create and send bulk email campaigns to your contacts</p>
        </div>
        <button
          onClick={() => { setEditingCampaign(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No campaigns yet. Create your first one!</p>
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
