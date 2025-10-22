'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Phone, Video, Trophy, TrendingUp, TrendingDown, UserCheck, Loader2, Mail, Building, Calendar, DollarSign, MoreVertical, Edit, Trash2, X, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: { name: string; id: string };
  status: string;
  source?: string;
  leadScore: number;
  tags?: string[];
  notes?: string;
  createdAt: string;
  owner?: { firstName: string; lastName: string };
}

interface ContactsResponse {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ContactFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  companyId?: string;
  status?: string;
  source?: string;
  notes?: string;
  tags?: string[];
}

type PipelineStage = 'new-lead' | 'call-1' | 'call-2' | 'zoom' | 'win' | 'high' | 'low' | 'follow-up';

interface PipelineColumn {
  id: PipelineStage;
  name: string;
  icon: any;
  color: string;
  bgColor: string;
  textColor: string;
}

export default function LeadsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form data
  const [formData, setFormData] = useState<ContactFormData>({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    status: 'lead',
    source: 'manual',
    tags: ['new-lead'],
  });

  const pipelineStages: PipelineColumn[] = [
    { id: 'new-lead', name: 'New Lead', icon: UserCheck, color: 'from-blue-500 to-blue-600', bgColor: 'bg-blue-50', textColor: 'text-blue-700' },
    { id: 'call-1', name: 'Call 1', icon: Phone, color: 'from-purple-500 to-purple-600', bgColor: 'bg-purple-50', textColor: 'text-purple-700' },
    { id: 'call-2', name: 'Call 2', icon: Phone, color: 'from-indigo-500 to-indigo-600', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700' },
    { id: 'zoom', name: 'Zoom', icon: Video, color: 'from-cyan-500 to-cyan-600', bgColor: 'bg-cyan-50', textColor: 'text-cyan-700' },
    { id: 'win', name: 'Win', icon: Trophy, color: 'from-emerald-500 to-emerald-600', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700' },
    { id: 'high', name: 'High', icon: TrendingUp, color: 'from-green-500 to-green-600', bgColor: 'bg-green-50', textColor: 'text-green-700' },
    { id: 'low', name: 'Low', icon: TrendingDown, color: 'from-amber-500 to-amber-600', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
    { id: 'follow-up', name: 'Follow Up', icon: Calendar, color: 'from-orange-500 to-orange-600', bgColor: 'bg-orange-50', textColor: 'text-orange-700' },
  ];

  const fetchContacts = async () => {
    try {
      setIsLoading(true);
      const params: any = {
        page: 1,
        limit: 200,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      const response = await api.get<ContactsResponse>('/contacts', { params });
      setContacts(response.data.data || []);
      setTotalContacts(response.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      setError('Failed to load leads');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [searchQuery]);

  const resetForm = () => {
    setFormData({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      status: 'lead',
      source: 'manual',
      tags: ['new-lead'],
    });
    setModalError('');
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      const response = await api.post('/contacts', formData);
      setShowAddModal(false);
      resetForm();

      // Optimistic update: add new contact to state immediately
      if (response.data) {
        setContacts(prev => [response.data, ...prev]);
        setTotalContacts(prev => prev + 1);
      }

      // Force refresh after a short delay to ensure backend consistency
      setTimeout(() => {
        fetchContacts();
      }, 500);
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      setModalError(err.response?.data?.message || 'Failed to create lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  const moveToStage = async (contact: Contact, newStage: PipelineStage) => {
    try {
      // Optimistic update
      setContacts(prevContacts =>
        prevContacts.map(c =>
          c.id === contact.id
            ? { ...c, tags: [newStage, ...(c.tags?.filter(t => !pipelineStages.map(s => s.id).includes(t as PipelineStage)) || [])] }
            : c
        )
      );

      // Remove all stage tags
      const stageTags = pipelineStages.map(s => s.id);
      const currentStageTags = contact.tags?.filter(t => stageTags.includes(t as PipelineStage)) || [];

      if (currentStageTags.length > 0) {
        await api.delete(`/contacts/${contact.id}/tags`, { data: { tags: currentStageTags } });
      }

      // Add new stage tag
      await api.post(`/contacts/${contact.id}/tags`, { tags: [newStage] });

      // Refresh to ensure consistency
      setTimeout(() => fetchContacts(), 300);
    } catch (err) {
      console.error('Failed to move lead:', err);
      // Revert on error
      fetchContacts();
    }
  };

  const getLeadsForStage = (stageId: PipelineStage): Contact[] => {
    return contacts.filter(contact =>
      contact.tags?.includes(stageId)
    );
  };

  const getLeadScoreColor = (score: number) => {
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 font-semibold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your leads through the sales pipeline ({totalContacts} total)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchContacts}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl bg-white border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-400" />
        <input
          type="text"
          placeholder="Search leads by name, email, or company..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-indigo-200/50 bg-white/50 py-3 pl-11 pr-4 text-sm placeholder:text-gray-500 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
        />
      </div>

      {/* Pipeline Board */}
      <div className="flex-1 overflow-x-auto pb-6">
        <div className="flex gap-4 min-w-max h-full">
          {pipelineStages.map((stage) => {
            const Icon = stage.icon;
            const stageLeads = getLeadsForStage(stage.id);

            return (
              <div
                key={stage.id}
                className="flex flex-col w-80 bg-gray-50 rounded-xl border border-gray-200 shadow-sm"
              >
                {/* Stage Header */}
                <div className={`p-4 rounded-t-xl bg-gradient-to-r ${stage.color}`}>
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      <h3 className="font-semibold">{stage.name}</h3>
                    </div>
                    <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-bold">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                {/* Stage Cards */}
                <div className="flex-1 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)]">
                  {stageLeads.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No leads in this stage
                    </div>
                  ) : (
                    stageLeads.map((contact) => (
                      <div
                        key={contact.id}
                        className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                      >
                        {/* Lead Name */}
                        <div className="mb-3">
                          <h4 className="font-semibold text-gray-900 text-sm mb-1">
                            {contact.firstName} {contact.lastName}
                          </h4>
                          <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{contact.email}</span>
                          </div>
                          {contact.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
                              <Phone className="h-3 w-3" />
                              <span>{contact.phone}</span>
                            </div>
                          )}
                          {contact.company && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600">
                              <Building className="h-3 w-3" />
                              <span>{contact.company.name}</span>
                            </div>
                          )}
                        </div>

                        {/* Lead Score */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-gray-600">Lead Score</span>
                            <span className="text-xs font-bold text-gray-900">{contact.leadScore}/100</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${getLeadScoreColor(contact.leadScore)}`}
                              style={{ width: `${contact.leadScore}%` }}
                            />
                          </div>
                        </div>

                        {/* Move Actions */}
                        <div className="pt-3 border-t border-gray-100">
                          <select
                            onChange={(e) => moveToStage(contact, e.target.value as PipelineStage)}
                            value={stage.id}
                            className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                          >
                            <option value={stage.id}>Move to...</option>
                            {pipelineStages
                              .filter(s => s.id !== stage.id)
                              .map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                          </select>
                        </div>

                        {/* Date */}
                        <div className="mt-2 text-xs text-gray-400">
                          Added {new Date(contact.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Add New Lead</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleAddContact} className="p-6 space-y-5">
              {modalError && (
                <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900">Error</p>
                    <p className="text-sm text-red-700 mt-1">{modalError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalError('')}
                    className="text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="John"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    disabled={isSubmitting}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    disabled={isSubmitting}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Source
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="manual">Manual</option>
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="social_media">Social Media</option>
                    <option value="email_campaign">Email Campaign</option>
                    <option value="cold_outreach">Cold Outreach</option>
                    <option value="event">Event</option>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="google-ads">Google Ads</option>
                    <option value="slack">Slack</option>
                    <option value="typeform">Typeform</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Initial Stage
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.tags?.[0] || 'new-lead'}
                    onChange={(e) => setFormData({ ...formData, tags: [e.target.value] })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    {pipelineStages.map(stage => (
                      <option key={stage.id} value={stage.id}>{stage.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    disabled={isSubmitting}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="Add any additional notes about this lead..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  disabled={isSubmitting}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Lead
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
