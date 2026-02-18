'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, Plus, Mail, Phone, MoreVertical, Star, Loader2, X, Edit, Trash2, AlertCircle, User, Briefcase, Building2, Grid3x3, List, Calendar, Tag, FileText, ExternalLink, Clock, MessageSquare, Eye, Send } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import api from '@/lib/api';

const PHONE_PREFIXES = [
  { code: '+40', country: 'RO', flag: '🇷🇴' },
  { code: '+1', country: 'US', flag: '🇺🇸' },
  { code: '+44', country: 'UK', flag: '🇬🇧' },
  { code: '+49', country: 'DE', flag: '🇩🇪' },
  { code: '+33', country: 'FR', flag: '🇫🇷' },
  { code: '+39', country: 'IT', flag: '🇮🇹' },
  { code: '+34', country: 'ES', flag: '🇪🇸' },
  { code: '+31', country: 'NL', flag: '🇳🇱' },
  { code: '+32', country: 'BE', flag: '🇧🇪' },
  { code: '+43', country: 'AT', flag: '🇦🇹' },
  { code: '+41', country: 'CH', flag: '🇨🇭' },
  { code: '+48', country: 'PL', flag: '🇵🇱' },
  { code: '+36', country: 'HU', flag: '🇭🇺' },
  { code: '+359', country: 'BG', flag: '🇧🇬' },
  { code: '+373', country: 'MD', flag: '🇲🇩' },
  { code: '+380', country: 'UA', flag: '🇺🇦' },
  { code: '+90', country: 'TR', flag: '🇹🇷' },
  { code: '+972', country: 'IL', flag: '🇮🇱' },
  { code: '+971', country: 'AE', flag: '🇦🇪' },
  { code: '+91', country: 'IN', flag: '🇮🇳' },
  { code: '+55', country: 'BR', flag: '🇧🇷' },
  { code: '+52', country: 'MX', flag: '🇲🇽' },
  { code: '+61', country: 'AU', flag: '🇦🇺' },
  { code: '+81', country: 'JP', flag: '🇯🇵' },
  { code: '+86', country: 'CN', flag: '🇨🇳' },
];

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: { name: string };
  jobTitle?: string;
  status: string;
  score?: number;
  source?: string;
  createdAt?: string;
  customFields?: Record<string, any>;
  tags?: string[];
  notes?: string;
  leadScore?: number;
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
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  status?: string;
  source?: string;
  leadScore?: number;
  notes?: string;
  tags?: string[];
  companyId?: string;
  ownerId?: string;
}

export default function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // WhatsApp quick send from detail modal
  const [showWaDropdown, setShowWaDropdown] = useState(false);
  const [showWaSendForm, setShowWaSendForm] = useState(false);
  const [waTemplates, setWaTemplates] = useState<any[]>([]);
  const [waSelectedTemplate, setWaSelectedTemplate] = useState('');
  const [waSelectedLang, setWaSelectedLang] = useState('en_US');
  const [waSending, setWaSending] = useState(false);
  const [waSendResult, setWaSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form data
  const [phonePrefix, setPhonePrefix] = useState('+40');
  const [formData, setFormData] = useState<ContactFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
    status: 'lead',
    source: 'website',
    leadScore: 0,
    notes: '',
  });

  const fetchContacts = async () => {
    try {
      setIsLoading(true);
      const params: any = {
        page: 1,
        limit: 50,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      if (selectedFilter !== 'all') {
        if (selectedFilter === 'leads') params.status = 'lead';
        else if (selectedFilter === 'customers') params.status = 'customer';
        else if (selectedFilter === 'prospects') params.status = 'prospect';
      }

      if (selectedMonth) {
        // Filter by month/year (format: YYYY-MM)
        const [year, month] = selectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
        params.createdFrom = startDate.toISOString();
        params.createdTo = endDate.toISOString();
      }

      const response = await api.get<any>('/contacts', { params });
      console.log('Contacts response:', response.data);
      // Backend returns { contacts: [...], total: 3 } not { data: [...], total: 3 }
      setContacts(response.data.contacts || response.data.data || []);
      setTotalContacts(response.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      console.error('Error details:', err);
      setError('Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [searchQuery, selectedFilter, selectedMonth]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      // Clean form data - only send defined fields
      const cleanedData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        status: formData.status || 'lead',
        source: formData.source || 'manual',
      };

      // Only add optional fields if they have values
      if (formData.phone?.trim()) {
        const rawPhone = formData.phone.trim().replace(/[^0-9]/g, '');
        cleanedData.phone = rawPhone ? `${phonePrefix}${rawPhone}` : undefined;
      }
      if (formData.jobTitle?.trim()) cleanedData.jobTitle = formData.jobTitle.trim();
      if (formData.notes?.trim()) cleanedData.notes = formData.notes.trim();
      if (formData.leadScore !== undefined) cleanedData.leadScore = formData.leadScore;
      if (formData.tags && formData.tags.length > 0) cleanedData.tags = formData.tags;
      if (formData.ownerId) cleanedData.ownerId = formData.ownerId;
      if (formData.companyId) cleanedData.companyId = formData.companyId;

      console.log('Sending contact data:', cleanedData);
      await api.post('/contacts', cleanedData);
      setShowAddModal(false);
      resetForm();
      fetchContacts();
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      console.error('Error response:', err.response?.data);
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to create contact';
      const validationErrors = err.response?.data?.errors;
      if (validationErrors) {
        console.error('Validation errors:', validationErrors);
        setModalError(`${errorMsg}: ${JSON.stringify(validationErrors)}`);
      } else {
        setModalError(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContact) return;

    setModalError('');
    setIsSubmitting(true);

    try {
      const editData = { ...formData };
      if (editData.phone?.trim()) {
        const rawPhone = editData.phone.trim().replace(/[^0-9]/g, '');
        editData.phone = rawPhone ? `${phonePrefix}${rawPhone}` : editData.phone.trim();
      }
      await api.put(`/contacts/${selectedContact.id}`, editData);
      setShowEditModal(false);
      resetForm();
      fetchContacts();
    } catch (err: any) {
      console.error('Failed to update contact:', err);
      setModalError(err.response?.data?.message || 'Failed to update contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!selectedContact) return;

    setIsSubmitting(true);

    try {
      await api.delete(`/contacts/${selectedContact.id}`);
      setShowDeleteModal(false);
      setSelectedContact(null);
      fetchContacts();
    } catch (err: any) {
      console.error('Failed to delete contact:', err);
      setModalError(err.response?.data?.message || 'Failed to delete contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (contact: Contact) => {
    setSelectedContact(contact);
    // Parse phone prefix from stored number (e.g., "+40712345678" → prefix="+40", number="712345678")
    let parsedPhone = contact.phone || '';
    if (parsedPhone.startsWith('+')) {
      const match = PHONE_PREFIXES.find(p => parsedPhone.startsWith(p.code));
      if (match) {
        setPhonePrefix(match.code);
        parsedPhone = parsedPhone.slice(match.code.length);
      }
    }
    setFormData({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: parsedPhone,
      jobTitle: contact.jobTitle || '',
      status: contact.status,
      source: contact.source || 'website',
      leadScore: contact.score || 0,
      notes: '',
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (contact: Contact) => {
    setSelectedContact(contact);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      jobTitle: '',
      status: 'lead',
      source: 'website',
      leadScore: 0,
      notes: '',
    });
    setSelectedContact(null);
    setModalError('');
  };

  const openDetailModal = async (contact: Contact) => {
    setShowDetailModal(true);
    setDetailContact(contact);
    setIsLoadingDetail(true);
    setShowWaDropdown(false);
    setShowWaSendForm(false);
    setWaSendResult(null);
    try {
      const response = await api.get(`/contacts/${contact.id}`, {
        params: { relations: 'company,owner' },
      });
      setDetailContact(response.data);
    } catch (err) {
      console.error('Failed to fetch contact details:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const fetchWaTemplates = async () => {
    if (waTemplates.length > 0) return;
    try {
      const res = await api.get('/integrations/whatsapp/templates');
      setWaTemplates(res.data.data || []);
    } catch { /* silent */ }
  };

  const sendWaTemplate = async () => {
    if (!detailContact?.phone || !waSelectedTemplate) return;
    setWaSending(true);
    setWaSendResult(null);
    try {
      const phone = detailContact.phone.replace(/[^0-9]/g, '');
      await api.post('/integrations/whatsapp/send/template', {
        to: phone,
        templateName: waSelectedTemplate,
        language: waSelectedLang,
      });
      setWaSendResult({ ok: true, msg: 'Template sent!' });
      setTimeout(() => setWaSendResult(null), 3000);
    } catch (err: any) {
      setWaSendResult({ ok: false, msg: err.response?.data?.message || 'Failed to send' });
    } finally {
      setWaSending(false);
    }
  };

  const getTypeformData = (contact: Contact) => {
    if (!contact.customFields) return null;
    const { typeformMetadata, ...answers } = contact.customFields;
    const hasAnswers = Object.keys(answers).length > 0;
    if (!typeformMetadata && !hasAnswers) return null;
    return { metadata: typeformMetadata, answers };
  };

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const filters = [
    { id: 'all', name: 'All Contacts' },
    { id: 'leads', name: 'Leads' },
    { id: 'prospects', name: 'Prospects' },
    { id: 'customers', name: 'Customers' },
  ];

  const statusColors: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-700',
    prospect: 'bg-purple-100 text-purple-700',
    qualified: 'bg-green-100 text-green-700',
    customer: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-gray-100 text-gray-700',
    churned: 'bg-red-100 text-red-700',
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your contacts and leads ({totalContacts} total)
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSelectedFilter(filter.id)}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                selectedFilter === filter.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
              }`}
            >
              {filter.name}
            </button>
          ))}
        </div>
      </div>

      {/* View Mode and Month Filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-gray-400" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Filter by month"
          />
          {selectedMonth && (
            <button
              onClick={() => setSelectedMonth('')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-2 transition-colors ${
              viewMode === 'grid'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Grid3x3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-md p-2 transition-colors ${
              viewMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Contacts Display */}
      {!contacts || contacts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No contacts found. Add your first contact to get started!</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => openDetailModal(contact)}
              className="group relative rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-blue-200 hover:shadow-md cursor-pointer"
            >
              {/* Dropdown Menu */}
              <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="relative">
                  <button className="rounded-lg p-1 hover:bg-gray-100 transition-colors">
                    <MoreVertical className="h-3.5 w-3.5 text-gray-600" />
                  </button>
                  <div className="absolute right-0 mt-1 w-28 rounded-lg bg-white shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(contact); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeleteModal(contact); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-2">
                {/* Avatar */}
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white flex-shrink-0">
                  {getInitials(`${contact.firstName} ${contact.lastName}`)}
                </div>
                <div className="min-w-0">
                  {/* Name */}
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {contact.firstName} {contact.lastName}
                  </h3>
                  {/* Job Title & Company */}
                  {(contact.jobTitle || contact.company) && (
                    <p className="text-xs text-gray-500 truncate">
                      {contact.jobTitle}{contact.jobTitle && contact.company ? ' · ' : ''}{contact.company?.name}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Mail className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{contact.email}</span>
                </div>
                {contact.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Phone className="h-3 w-3 flex-shrink-0" />
                    <span>{contact.phone}</span>
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="mt-2 flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColors[contact.status] || 'bg-gray-100 text-gray-700'}`}>
                  {contact.status}
                </span>
                {contact.score !== undefined && (
                  <div className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs font-semibold text-gray-900">{contact.score}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contacts.map((contact) => (
                <tr key={contact.id} onClick={() => openDetailModal(contact)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm">
                          {getInitials(`${contact.firstName} ${contact.lastName}`)}
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {contact.firstName} {contact.lastName}
                        </div>
                        {contact.jobTitle && (
                          <div className="text-sm text-gray-500">{contact.jobTitle}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <Mail className="h-4 w-4 text-gray-400 mr-2" />
                      {contact.email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {contact.phone ? (
                      <div className="flex items-center">
                        <Phone className="h-4 w-4 text-gray-400 mr-2" />
                        {contact.phone}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {contact.company ? (
                      <div className="flex items-center">
                        <Building2 className="h-4 w-4 text-gray-400 mr-2" />
                        {contact.company.name}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColors[contact.status] || 'bg-gray-100 text-gray-700'}`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {contact.score !== undefined ? (
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mr-1" />
                        <span className="text-sm font-semibold text-gray-900">{contact.score}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditModal(contact); }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openDeleteModal(contact); }}
                        className="text-red-600 hover:text-red-900"
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

      {/* Contact Detail Modal */}
      {showDetailModal && detailContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 rounded-t-2xl p-6 flex items-start justify-between z-10">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-bold text-white flex-shrink-0">
                  {getInitials(`${detailContact.firstName} ${detailContact.lastName}`)}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {detailContact.firstName} {detailContact.lastName}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${statusColors[detailContact.status] || 'bg-gray-100 text-gray-700'}`}>
                      {detailContact.status}
                    </span>
                    {detailContact.source && (
                      <span className="rounded-full px-3 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600">
                        {detailContact.source}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Email button */}
                {detailContact.email && !detailContact.email.includes('@whatsapp.placeholder') && (
                  <a
                    href={`mailto:${detailContact.email}`}
                    className="rounded-lg p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-all"
                    title={`Email ${detailContact.email}`}
                  >
                    <Mail className="h-5 w-5" />
                  </a>
                )}
                {/* WhatsApp button */}
                <div className="relative">
                  <button
                    onClick={() => {
                      if (!detailContact.phone) return;
                      setShowWaDropdown(!showWaDropdown);
                      fetchWaTemplates();
                    }}
                    className={`rounded-lg p-2 transition-all ${detailContact.phone ? 'text-green-600 hover:bg-green-50' : 'text-gray-300 cursor-not-allowed'}`}
                    title={detailContact.phone ? `WhatsApp ${detailContact.phone}` : 'No phone number'}
                  >
                    <MessageSquare className="h-5 w-5" />
                  </button>
                  {showWaDropdown && detailContact.phone && (
                    <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                      <a
                        href={`/whatsapp?phone=${encodeURIComponent(detailContact.phone)}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
                        onClick={() => setShowWaDropdown(false)}
                      >
                        <ExternalLink className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Open in WhatsApp Inbox</p>
                          <p className="text-xs text-gray-500">View full conversation</p>
                        </div>
                      </a>
                      <button
                        onClick={() => setShowWaSendForm(!showWaSendForm)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors w-full text-left"
                      >
                        <Send className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Send Template Now</p>
                          <p className="text-xs text-gray-500">Quick send an approved template</p>
                        </div>
                      </button>
                      {showWaSendForm && (
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 space-y-2">
                          <select
                            value={waSelectedTemplate}
                            onChange={e => {
                              setWaSelectedTemplate(e.target.value);
                              const t = waTemplates.find((t: any) => t.name === e.target.value);
                              if (t?.language) setWaSelectedLang(t.language);
                            }}
                            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
                          >
                            <option value="">Select template...</option>
                            {waTemplates.filter((t: any) => t.status === 'APPROVED').map((t: any) => (
                              <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <input
                              value={waSelectedLang}
                              onChange={e => setWaSelectedLang(e.target.value)}
                              placeholder="Language"
                              className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
                            />
                            <button
                              onClick={sendWaTemplate}
                              disabled={waSending || !waSelectedTemplate}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              {waSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              Send
                            </button>
                          </div>
                          {waSendResult && (
                            <p className={`text-xs ${waSendResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                              {waSendResult.msg}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Edit button */}
                <button
                  onClick={() => { setShowDetailModal(false); openEditModal(detailContact); }}
                  className="rounded-lg p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-all"
                  title="Edit"
                >
                  <Edit className="h-5 w-5" />
                </button>
                <button
                  onClick={() => { setShowDetailModal(false); setDetailContact(null); setShowWaDropdown(false); }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {isLoadingDetail ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Contact Information */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <Mail className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-sm font-medium text-gray-900">{detailContact.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <Phone className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="text-sm font-medium text-gray-900">{detailContact.phone || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <Briefcase className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Job Title</p>
                        <p className="text-sm font-medium text-gray-900">{detailContact.jobTitle || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <Building2 className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Company</p>
                        <p className="text-sm font-medium text-gray-900">{detailContact.company?.name || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <Star className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Lead Score</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900">{detailContact.leadScore ?? detailContact.score ?? 0}</p>
                          <div className="flex-1 w-24 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${(detailContact.leadScore ?? detailContact.score ?? 0) >= 75 ? 'bg-green-500' : (detailContact.leadScore ?? detailContact.score ?? 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(detailContact.leadScore ?? detailContact.score ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <Clock className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Created</p>
                        <p className="text-sm font-medium text-gray-900">
                          {detailContact.createdAt ? new Date(detailContact.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {detailContact.tags && detailContact.tags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailContact.tags.map((tag, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                          <Tag className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {detailContact.notes && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Notes</h3>
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{detailContact.notes}</p>
                    </div>
                  </div>
                )}

                {/* Typeform Data */}
                {(() => {
                  const tfData = getTypeformData(detailContact);
                  if (!tfData) return null;
                  return (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Typeform Responses
                      </h3>

                      {/* Typeform Metadata */}
                      {tfData.metadata && (
                        <div className="mb-4 p-4 bg-purple-50 border border-purple-100 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-purple-900">
                              {tfData.metadata.formTitle || 'Form Submission'}
                            </h4>
                            {tfData.metadata.score !== undefined && tfData.metadata.score !== null && (
                              <span className="px-2 py-0.5 bg-purple-200 text-purple-800 rounded-full text-xs font-bold">
                                Score: {tfData.metadata.score}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-purple-700">
                            {tfData.metadata.submittedAt && (
                              <span>Submitted: {new Date(tfData.metadata.submittedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            {tfData.metadata.formId && (
                              <span>Form ID: {tfData.metadata.formId}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Form Answers */}
                      {tfData.answers && Object.keys(tfData.answers).length > 0 && (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                          <table className="min-w-full">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Question</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Answer</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {Object.entries(tfData.answers).map(([key, value], i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm font-medium text-gray-700 capitalize w-1/3">
                                    {key.replace(/_/g, ' ')}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    {formatFieldValue(value)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Owner */}
                {detailContact.owner && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Assigned To</h3>
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xs">
                        {getInitials(`${detailContact.owner.firstName} ${detailContact.owner.lastName}`)}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{detailContact.owner.firstName} {detailContact.owner.lastName}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setShowAddModal(false); resetForm(); }}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Contact</h2>

            {modalError && (
              <div className="mb-6 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleAddContact} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="John"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    placeholder="john@company.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                  <div className="flex gap-2">
                    <select
                      value={phonePrefix}
                      onChange={(e) => setPhonePrefix(e.target.value)}
                      className="w-28 px-2 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none text-sm"
                    >
                      {PHONE_PREFIXES.map(p => (
                        <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                        placeholder="712345678"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Job Title</label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="Sales Manager"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="lead">Lead</option>
                    <option value="prospect">Prospect</option>
                    <option value="qualified">Qualified</option>
                    <option value="customer">Customer</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Source</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="social_media">Social Media</option>
                    <option value="email_campaign">Email Campaign</option>
                    <option value="cold_outreach">Cold Outreach</option>
                    <option value="event">Event</option>
                    <option value="slack">Slack</option>
                    <option value="typeform">Typeform</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none"
                  placeholder="Additional notes about this contact..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating...' : 'Create Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {showEditModal && selectedContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setShowEditModal(false); resetForm(); }}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Contact</h2>

            {modalError && (
              <div className="mb-6 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleEditContact} className="space-y-6">
              {/* Same form fields as Add Modal */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                  <div className="flex gap-2">
                    <select
                      value={phonePrefix}
                      onChange={(e) => setPhonePrefix(e.target.value)}
                      className="w-28 px-2 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none text-sm"
                    >
                      {PHONE_PREFIXES.map(p => (
                        <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                        placeholder="712345678"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Job Title</label>
                  <div className="relative">
                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="lead">Lead</option>
                    <option value="prospect">Prospect</option>
                    <option value="qualified">Qualified</option>
                    <option value="customer">Customer</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Source</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="social_media">Social Media</option>
                    <option value="email_campaign">Email Campaign</option>
                    <option value="cold_outreach">Cold Outreach</option>
                    <option value="event">Event</option>
                    <option value="slack">Slack</option>
                    <option value="typeform">Typeform</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); resetForm(); }}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
              Delete Contact?
            </h2>
            <p className="text-gray-600 text-center mb-6">
              Are you sure you want to delete <strong>{selectedContact.firstName} {selectedContact.lastName}</strong>? This action cannot be undone.
            </p>

            {modalError && (
              <div className="mb-4 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => { setShowDeleteModal(false); setSelectedContact(null); }}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteContact}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
