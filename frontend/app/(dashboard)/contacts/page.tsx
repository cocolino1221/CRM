'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, Plus, Mail, Phone, MoreVertical, Star, Loader2, X, Edit, Trash2, AlertCircle, User, Briefcase, Building2 } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import api from '@/lib/api';

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
  companyId?: string;
}

export default function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form data
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

      const response = await api.get<ContactsResponse>('/contacts', { params });
      setContacts(response.data.data);
      setTotalContacts(response.data.total);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      setError('Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [searchQuery, selectedFilter]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      await api.post('/contacts', formData);
      setShowAddModal(false);
      resetForm();
      fetchContacts();
    } catch (err: any) {
      console.error('Failed to create contact:', err);
      setModalError(err.response?.data?.message || 'Failed to create contact');
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
      await api.put(`/contacts/${selectedContact.id}`, formData);
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
    setFormData({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone || '',
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

      {/* Contacts Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {!contacts || contacts.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-500">No contacts found. Add your first contact to get started!</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="group relative rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-blue-200 hover:shadow-md"
            >
              {/* Dropdown Menu */}
              <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="relative">
                  <button className="rounded-lg p-1.5 hover:bg-gray-100 transition-colors">
                    <MoreVertical className="h-4 w-4 text-gray-600" />
                  </button>
                  <div className="absolute right-0 mt-1 w-32 rounded-lg bg-white shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <button
                      onClick={() => openEditModal(contact)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Edit className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => openDeleteModal(contact)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {/* Avatar */}
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xl font-bold text-white">
                {getInitials(`${contact.firstName} ${contact.lastName}`)}
              </div>

              {/* Name */}
              <h3 className="mb-1 text-lg font-semibold text-gray-900">
                {contact.firstName} {contact.lastName}
              </h3>

              {/* Job Title & Company */}
              {contact.jobTitle && (
                <p className="text-sm text-gray-600">{contact.jobTitle}</p>
              )}
              {contact.company && (
                <p className="text-sm text-gray-500">{contact.company.name}</p>
              )}

              {/* Contact Info */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-4 w-4" />
                  <span className="truncate">{contact.email}</span>
                </div>
                {contact.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="h-4 w-4" />
                    <span>{contact.phone}</span>
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="mt-4 flex items-center justify-between">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[contact.status] || 'bg-gray-100 text-gray-700'}`}>
                  {contact.status}
                </span>
                {contact.score !== undefined && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    <span className="text-sm font-semibold text-gray-900">{contact.score}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="+1 (555) 123-4567"
                    />
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
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
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
