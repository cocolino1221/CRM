'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  Users,
  Briefcase,
  Activity,
  ArrowLeft,
  Loader2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Plus,
  Trash2,
  UserPlus,
  DollarSign,
  Target,
  PhoneCall,
  XCircle
} from 'lucide-react';
import api from '@/lib/api';

interface Company {
  id: string;
  name: string;
  industry?: string;
  location?: string;
  size?: string;
  website?: string;
  phone?: string;
  email?: string;
  employeeCount?: number;
  description?: string;
}

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: string;
  leadScore: number;
  tags?: string[];
  createdAt: string;
}

interface Lead {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: string;
  leadScore: number;
  tags?: string[];
  company?: { name: string };
}

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const [contactFormData, setContactFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    status: 'lead',
  });

  useEffect(() => {
    fetchCompanyDetails();
    if (activeTab === 'team' || activeTab === 'contacts') {
      fetchContacts();
    }
    if (activeTab === 'leads') {
      fetchLeads();
    }
  }, [companyId, activeTab]);

  const fetchCompanyDetails = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<Company>(`/companies/${companyId}`);
      setCompany(response.data);
    } catch (err) {
      console.error('Failed to fetch company:', err);
      setError('Failed to load company details');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const response = await api.get<{ data: Contact[] }>(`/contacts`, {
        params: { companyId: companyId }
      });
      setContacts(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  };

  const fetchLeads = async () => {
    try {
      const response = await api.get<{ data: Lead[] }>(`/contacts`, {
        params: { companyId: companyId, status: 'lead' }
      });
      setLeads(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      await api.post('/contacts', {
        ...contactFormData,
        companyId: companyId,
      });
      setShowAddContactModal(false);
      setContactFormData({ email: '', firstName: '', lastName: '', phone: '', status: 'lead' });
      fetchContacts();
    } catch (err: any) {
      console.error('Failed to add contact:', err);
      setModalError(err.response?.data?.message || 'Failed to add contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTag = async (leadId: string, tag: string, currentTags: string[]) => {
    try {
      if (currentTags.includes(tag)) {
        await api.delete(`/contacts/${leadId}/tags`, { data: { tags: [tag] } });
      } else {
        await api.post(`/contacts/${leadId}/tags`, { tags: [tag] });
      }
      fetchLeads();
    } catch (err) {
      console.error('Failed to toggle tag:', err);
    }
  };

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Building2 },
    { id: 'team', name: 'Team Members', icon: Users },
    { id: 'contacts', name: 'Contacts', icon: UserPlus },
    { id: 'leads', name: 'Leads', icon: Briefcase },
    { id: 'activity', name: 'Activity', icon: Activity },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 font-semibold">{error || 'Company not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Companies
        </button>

        <div className="flex items-start gap-6">
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <Building2 className="h-10 w-10" />
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
            {company.industry && (
              <p className="mt-1 text-sm text-gray-600 capitalize">
                {company.industry.replace(/_/g, ' ')}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-4">
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"
                >
                  <Globe className="h-4 w-4" />
                  {company.website}
                </a>
              )}
              {company.email && (
                <a
                  href={`mailto:${company.email}`}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"
                >
                  <Mail className="h-4 w-4" />
                  {company.email}
                </a>
              )}
              {company.phone && (
                <a
                  href={`tel:${company.phone}`}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"
                >
                  <Phone className="h-4 w-4" />
                  {company.phone}
                </a>
              )}
              {company.location && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4" />
                  {company.location}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Company Size</label>
                  <p className="text-gray-900 capitalize">{company.size || 'Not specified'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Employee Count</label>
                  <p className="text-gray-900">{company.employeeCount || 'Not specified'}</p>
                </div>
              </div>

              {company.description && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                  <p className="text-gray-900">{company.description}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Company Employees</h2>
              <button
                onClick={() => setShowAddContactModal(true)}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Employee
              </button>
            </div>

            <div className="space-y-3">
              {contacts.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No employees yet. Add your first employee to get started!</p>
                </div>
              ) : (
                contacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:border-blue-200 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                        {contact.firstName[0]}{contact.lastName[0]}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {contact.firstName} {contact.lastName}
                        </h3>
                        <p className="text-sm text-gray-600">{contact.email}</p>
                        {contact.phone && (
                          <p className="text-sm text-gray-500">{contact.phone}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900 capitalize">{contact.status}</p>
                        <p className="text-xs text-gray-500">
                          Score: {contact.leadScore}/100
                        </p>
                      </div>
                      <button
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove contact"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="text-center py-12">
            <p className="text-gray-500">Contacts view coming soon...</p>
          </div>
        )}

        {activeTab === 'leads' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Company Leads</h2>
              <div className="text-sm text-gray-600">
                {leads.length} lead{leads.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="space-y-3">
              {leads.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No leads yet for this company.</p>
                </div>
              ) : (
                leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-200 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                          {lead.firstName[0]}{lead.lastName[0]}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">
                            {lead.firstName} {lead.lastName}
                          </h3>
                          <p className="text-sm text-gray-600">{lead.email}</p>
                          {lead.phone && (
                            <p className="text-sm text-gray-500">{lead.phone}</p>
                          )}

                          <div className="flex flex-wrap gap-2 mt-3">
                            <button
                              onClick={() => handleToggleTag(lead.id, 'high-ticket', lead.tags || [])}
                              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                lead.tags?.includes('high-ticket')
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <DollarSign className="h-3 w-3" />
                              High-Ticket
                            </button>
                            <button
                              onClick={() => handleToggleTag(lead.id, 'low-ticket', lead.tags || [])}
                              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                lead.tags?.includes('low-ticket')
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <Target className="h-3 w-3" />
                              Low-Ticket
                            </button>
                            <button
                              onClick={() => handleToggleTag(lead.id, 'follow-up', lead.tags || [])}
                              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                lead.tags?.includes('follow-up')
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <PhoneCall className="h-3 w-3" />
                              Follow-Up
                            </button>
                            <button
                              onClick={() => handleToggleTag(lead.id, 'lost', lead.tags || [])}
                              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                lead.tags?.includes('lost')
                                  ? 'bg-red-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              <XCircle className="h-3 w-3" />
                              Lost
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 capitalize">
                          {lead.status}
                        </span>
                        <p className="text-sm text-gray-500 mt-2">
                          Score: <span className="font-semibold text-gray-900">{lead.leadScore}/100</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="text-center py-12">
            <p className="text-gray-500">Activity view coming soon...</p>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add Employee</h2>
              <button
                onClick={() => {
                  setShowAddContactModal(false);
                  setContactFormData({ email: '', firstName: '', lastName: '', phone: '', status: 'lead' });
                  setModalError('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <Plus className="h-5 w-5 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleAddContact} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={contactFormData.email}
                  onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="john@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactFormData.firstName}
                    onChange={(e) => setContactFormData({ ...contactFormData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactFormData.lastName}
                    onChange={(e) => setContactFormData({ ...contactFormData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={contactFormData.phone}
                  onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddContactModal(false);
                    setContactFormData({ email: '', firstName: '', lastName: '', phone: '', status: 'lead' });
                    setModalError('');
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Adding...' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
