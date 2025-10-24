'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Phone, Video, Trophy, TrendingUp, TrendingDown, UserCheck, Loader2, Mail, Building, Calendar, DollarSign, MoreVertical, Edit, Trash2, X, AlertCircle, Settings, Users } from 'lucide-react';
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
  pipelineId?: string;
  pipelineStageId?: string;
  pipelineStage?: PipelineStage;
  pipeline?: Pipeline;
  setterId?: string;
  callerId?: string;
  closerId?: string;
  setter?: User;
  caller?: User;
  closer?: User;
}

interface Pipeline {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  displayOrder: number;
  stages: PipelineStage[];
}

interface PipelineStage {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  color: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
  pipelineId: string;
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
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
  pipelineId?: string;
  pipelineStageId?: string;
  setterId?: string;
  callerId?: string;
  closerId?: string;
}

export default function LeadsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
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
    tags: [],
  });

  const fetchPipelines = async () => {
    try {
      const response = await api.get<Pipeline[]>('/pipelines');
      setPipelines(response.data);
      // Select default pipeline or first pipeline
      const defaultPipeline = response.data.find(p => p.isDefault) || response.data[0];
      setSelectedPipeline(defaultPipeline);
      return true;
    } catch (err) {
      console.error('Failed to fetch pipelines:', err);
      setError('Failed to load pipelines. Please refresh the page or try logging in again.');
      return false;
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get<User[]>('/users');
      setUsers(response.data);
      return true;
    } catch (err) {
      console.error('Failed to fetch users:', err);
      return false;
    }
  };

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

      if (selectedPipeline) {
        params.pipelineId = selectedPipeline.id;
      }

      const response = await api.get<any>('/contacts', { params });
      console.log('Leads response:', response.data);
      setContacts(response.data.contacts || response.data.data || []);
      setTotalContacts(response.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      setError('Failed to load leads');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      const [pipelinesSuccess] = await Promise.all([fetchPipelines(), fetchUsers()]);
      // If pipelines failed to load, stop loading
      if (!pipelinesSuccess) {
        setIsLoading(false);
      }
      // Otherwise, fetchContacts will be triggered by the second useEffect
    };
    initializeData();
  }, []);

  useEffect(() => {
    if (selectedPipeline) {
      fetchContacts();
    }
  }, [searchQuery, selectedPipeline]);

  const resetForm = () => {
    setFormData({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      status: 'lead',
      source: 'manual',
      tags: [],
      pipelineId: selectedPipeline?.id,
      pipelineStageId: selectedPipeline?.stages[0]?.id,
    });
    setModalError('');
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      const cleanedData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        status: formData.status,
        source: formData.source,
        tags: formData.tags,
      };

      if (formData.phone?.trim()) {
        cleanedData.phone = formData.phone.trim();
      }
      if (formData.notes?.trim()) {
        cleanedData.notes = formData.notes.trim();
      }
      if (formData.companyId) {
        cleanedData.companyId = formData.companyId;
      }
      if (formData.pipelineId) {
        cleanedData.pipelineId = formData.pipelineId;
      }
      if (formData.pipelineStageId) {
        cleanedData.pipelineStageId = formData.pipelineStageId;
      }
      if (formData.setterId) {
        cleanedData.setterId = formData.setterId;
      }
      if (formData.callerId) {
        cleanedData.callerId = formData.callerId;
      }
      if (formData.closerId) {
        cleanedData.closerId = formData.closerId;
      }

      console.log('Sending contact data:', cleanedData);
      const response = await api.post('/contacts', cleanedData);
      setShowAddModal(false);
      resetForm();

      if (response.data) {
        setContacts(prev => [response.data, ...prev]);
        setTotalContacts(prev => prev + 1);
      }

      setTimeout(() => {
        fetchContacts();
      }, 500);
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to create lead';
      setModalError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact) return;

    setModalError('');
    setIsSubmitting(true);

    try {
      const cleanedData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        status: formData.status,
        source: formData.source,
      };

      if (formData.phone?.trim()) {
        cleanedData.phone = formData.phone.trim();
      }
      if (formData.notes?.trim()) {
        cleanedData.notes = formData.notes.trim();
      }

      // Update pipeline assignment
      if (formData.pipelineId || formData.pipelineStageId || formData.setterId || formData.callerId || formData.closerId) {
        const pipelineData: any = {};
        if (formData.pipelineId) pipelineData.pipelineId = formData.pipelineId;
        if (formData.pipelineStageId) pipelineData.pipelineStageId = formData.pipelineStageId;
        if (formData.setterId) pipelineData.setterId = formData.setterId;
        if (formData.callerId) pipelineData.callerId = formData.callerId;
        if (formData.closerId) pipelineData.closerId = formData.closerId;

        await api.put(`/pipelines/contacts/${editingContact.id}`, pipelineData);
      }

      // Update contact info
      await api.put(`/contacts/${editingContact.id}`, cleanedData);

      setShowEditModal(false);
      setEditingContact(null);
      resetForm();
      fetchContacts();
    } catch (err: any) {
      console.error('Failed to update contact:', err);
      const errorMsg = err.response?.data?.message || 'Failed to update lead';
      setModalError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone || '',
      status: contact.status,
      source: contact.source,
      notes: contact.notes,
      tags: contact.tags,
      pipelineId: contact.pipelineId,
      pipelineStageId: contact.pipelineStageId,
      setterId: contact.setterId,
      callerId: contact.callerId,
      closerId: contact.closerId,
    });
    setShowEditModal(true);
  };

  const getLeadsForStage = (stageId: string): Contact[] => {
    return contacts.filter(contact => contact.pipelineStageId === stageId);
  };

  const getLeadScoreColor = (score: number) => {
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getColorClasses = (color: string) => {
    const hex = color.replace('#', '');
    return {
      gradient: `linear-gradient(135deg, ${color}, ${color}dd)`,
      bg: color,
    };
  };

  const setters = users.filter(u => u.role === 'setter');
  const callers = users.filter(u => u.role === 'caller');
  const closers = users.filter(u => u.role === 'closer');

  if (isLoading && pipelines.length === 0) {
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

      {/* Pipeline Selector and Search */}
      <div className="flex items-center gap-4">
        <div className="relative w-64">
          <select
            value={selectedPipeline?.id || ''}
            onChange={(e) => {
              const pipeline = pipelines.find(p => p.id === e.target.value);
              setSelectedPipeline(pipeline || null);
            }}
            className="w-full rounded-xl border border-gray-300 bg-white py-3 px-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {pipelines.map(pipeline => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name} {pipeline.isDefault && '(Default)'}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-400" />
          <input
            type="text"
            placeholder="Search leads by name, email, or company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-indigo-200/50 bg-white/50 py-3 pl-11 pr-4 text-sm placeholder:text-gray-500 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Pipeline Board */}
      {selectedPipeline && (
        <div className="flex-1 overflow-x-auto pb-6">
          <div className="flex gap-4 min-w-max h-full">
            {selectedPipeline.stages.sort((a, b) => a.displayOrder - b.displayOrder).map((stage) => {
              const stageLeads = getLeadsForStage(stage.id);
              const colorStyles = getColorClasses(stage.color);

              return (
                <div
                  key={stage.id}
                  className="flex flex-col w-80 bg-gray-50 rounded-xl border border-gray-200 shadow-sm"
                >
                  {/* Stage Header */}
                  <div
                    className="p-4 rounded-t-xl"
                    style={{ background: colorStyles.gradient }}
                  >
                    <div className="flex items-center justify-between text-white">
                      <div className="flex items-center gap-2">
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
                          onClick={() => openEditModal(contact)}
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

                          {/* Team Assignments */}
                          {(contact.setter || contact.caller || contact.closer) && (
                            <div className="mb-3 p-2 bg-gray-50 rounded text-xs space-y-1">
                              {contact.setter && (
                                <div className="flex items-center gap-1">
                                  <Users className="h-3 w-3 text-blue-600" />
                                  <span className="text-gray-600">Setter:</span>
                                  <span className="font-medium">{contact.setter.firstName}</span>
                                </div>
                              )}
                              {contact.caller && (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-purple-600" />
                                  <span className="text-gray-600">Caller:</span>
                                  <span className="font-medium">{contact.caller.firstName}</span>
                                </div>
                              )}
                              {contact.closer && (
                                <div className="flex items-center gap-1">
                                  <Trophy className="h-3 w-3 text-green-600" />
                                  <span className="text-gray-600">Closer:</span>
                                  <span className="font-medium">{contact.closer.firstName}</span>
                                </div>
                              )}
                            </div>
                          )}

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

                          {/* Date */}
                          <div className="text-xs text-gray-400">
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
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-3xl mx-4 glass-effect rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
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
                    Pipeline
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.pipelineId || selectedPipeline?.id}
                    onChange={(e) => {
                      const pipeline = pipelines.find(p => p.id === e.target.value);
                      setFormData({
                        ...formData,
                        pipelineId: e.target.value,
                        pipelineStageId: pipeline?.stages[0]?.id,
                      });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    {pipelines.map(pipeline => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Stage
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.pipelineStageId || ''}
                    onChange={(e) => setFormData({ ...formData, pipelineStageId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    {pipelines
                      .find(p => p.id === (formData.pipelineId || selectedPipeline?.id))
                      ?.stages.sort((a, b) => a.displayOrder - b.displayOrder)
                      .map(stage => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Setter
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.setterId || ''}
                    onChange={(e) => setFormData({ ...formData, setterId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="">None</option>
                    {setters.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Caller
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.callerId || ''}
                    onChange={(e) => setFormData({ ...formData, callerId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="">None</option>
                    {callers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Closer
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.closerId || ''}
                    onChange={(e) => setFormData({ ...formData, closerId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="">None</option>
                    {closers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
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

      {/* Edit Contact Modal */}
      {showEditModal && editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-3xl mx-4 glass-effect rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-2xl font-bold text-gray-900">Edit Lead</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingContact(null);
                  resetForm();
                }}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleUpdateContact} className="p-6 space-y-5">
              {modalError && (
                <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900">Error</p>
                    <p className="text-sm text-red-700 mt-1">{modalError}</p>
                  </div>
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
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pipeline
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.pipelineId || ''}
                    onChange={(e) => {
                      const pipeline = pipelines.find(p => p.id === e.target.value);
                      setFormData({
                        ...formData,
                        pipelineId: e.target.value,
                        pipelineStageId: pipeline?.stages[0]?.id,
                      });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    {pipelines.map(pipeline => (
                      <option key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Stage
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.pipelineStageId || ''}
                    onChange={(e) => setFormData({ ...formData, pipelineStageId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    {pipelines
                      .find(p => p.id === formData.pipelineId)
                      ?.stages.sort((a, b) => a.displayOrder - b.displayOrder)
                      .map(stage => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Setter
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.setterId || ''}
                    onChange={(e) => setFormData({ ...formData, setterId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="">None</option>
                    {setters.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Caller
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.callerId || ''}
                    onChange={(e) => setFormData({ ...formData, callerId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="">None</option>
                    {callers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Closer
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.closerId || ''}
                    onChange={(e) => setFormData({ ...formData, closerId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    <option value="">None</option>
                    {closers.map(user => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName}
                      </option>
                    ))}
                  </select>
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
                    setShowEditModal(false);
                    setEditingContact(null);
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
                      Updating...
                    </>
                  ) : (
                    <>
                      <Edit className="h-4 w-4" />
                      Update Lead
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
