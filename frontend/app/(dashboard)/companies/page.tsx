'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Building2, MapPin, Users, DollarSign, TrendingUp, Loader2, X, Edit, Trash2, AlertCircle, Globe, Mail, Phone, MoreVertical } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
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
  _count?: {
    contacts: number;
    deals: number;
  };
}

interface CompaniesResponse {
  data: Company[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CompanyFormData {
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  size?: string;
  employeeCount?: number;
  phone?: string;
  email?: string;
  description?: string;
}

export default function CompaniesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCompanies, setTotalCompanies] = useState(0);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const [formData, setFormData] = useState<CompanyFormData>({
    name: '',
    domain: '',
    website: '',
    industry: 'technology',
    size: 'small',
    employeeCount: 0,
    phone: '',
    email: '',
    description: '',
  });

  const fetchCompanies = async () => {
    try {
      setIsLoading(true);
      const params: any = {
        page: 1,
        limit: 50,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      const response = await api.get<CompaniesResponse>('/companies', { params });
      setCompanies(response.data.data);
      setTotalCompanies(response.data.total);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
      setError('Failed to load companies');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [searchQuery]);

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      await api.post('/companies', formData);
      setShowAddModal(false);
      resetForm();
      fetchCompanies();
    } catch (err: any) {
      console.error('Failed to create company:', err);
      setModalError(err.response?.data?.message || 'Failed to create company');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    setModalError('');
    setIsSubmitting(true);

    try {
      await api.put(`/companies/${selectedCompany.id}`, formData);
      setShowEditModal(false);
      resetForm();
      fetchCompanies();
    } catch (err: any) {
      console.error('Failed to update company:', err);
      setModalError(err.response?.data?.message || 'Failed to update company');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompany) return;

    setIsSubmitting(true);

    try {
      await api.delete(`/companies/${selectedCompany.id}`);
      setShowDeleteModal(false);
      setSelectedCompany(null);
      fetchCompanies();
    } catch (err: any) {
      console.error('Failed to delete company:', err);
      setModalError(err.response?.data?.message || 'Failed to delete company');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (company: Company) => {
    setSelectedCompany(company);
    setFormData({
      name: company.name,
      website: company.website || '',
      industry: company.industry || 'technology',
      size: company.size || 'small',
      employeeCount: company.employeeCount || 0,
      phone: company.phone || '',
      email: company.email || '',
      description: '',
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (company: Company) => {
    setSelectedCompany(company);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      domain: '',
      website: '',
      industry: 'technology',
      size: 'small',
      employeeCount: 0,
      phone: '',
      email: '',
      description: '',
    });
    setSelectedCompany(null);
    setModalError('');
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
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your business accounts and relationships ({totalCompanies} total)
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Company
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Companies List */}
      <div className="space-y-4">
        {companies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No companies found. Add your first company to get started!</p>
          </div>
        ) : (
          companies.map((company) => (
            <div
              key={company.id}
              onClick={() => router.push(`/companies/${company.id}`)}
              className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-6 transition-all hover:border-blue-200 hover:shadow-md"
            >
              <div className="flex items-start gap-6">
                {/* Company Icon */}
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                  <Building2 className="h-8 w-8" />
                </div>

                {/* Company Info */}
                <div className="flex-1">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">{company.name}</h3>
                      {company.industry && (
                        <p className="mt-1 text-sm text-gray-600 capitalize">{company.industry.replace(/_/g, ' ')}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {company.website && (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Visit website
                        </a>
                      )}
                      <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="rounded-lg p-1.5 hover:bg-gray-100">
                          <MoreVertical className="h-4 w-4 text-gray-600" />
                        </button>
                        <div className="absolute right-0 mt-1 w-32 rounded-lg bg-white shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                          <button
                            onClick={() => openEditModal(company)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <Edit className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => openDeleteModal(company)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {company.size && (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Size</p>
                          <p className="text-sm font-medium text-gray-900 capitalize">{company.size}</p>
                        </div>
                      </div>
                    )}

                    {company._count && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Activity</p>
                          <p className="text-sm font-medium text-gray-900">
                            {company._count.contacts} contacts, {company._count.deals} deals
                          </p>
                        </div>
                      </div>
                    )}

                    {company.employeeCount && (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-xs text-gray-500">Employees</p>
                          <p className="text-sm font-medium text-gray-900">{company.employeeCount}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Company Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setShowAddModal(false); resetForm(); }}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Company</h2>

            {modalError && (
              <div className="mb-6 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleAddCompany} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    placeholder="Acme Corporation"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Website</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="https://acme.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                      placeholder="contact@acme.com"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Industry</label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="technology">Technology</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="finance">Finance</option>
                    <option value="education">Education</option>
                    <option value="retail">Retail</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="consulting">Consulting</option>
                    <option value="real_estate">Real Estate</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Company Size</label>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="startup">Startup (1-10)</option>
                    <option value="small">Small (11-50)</option>
                    <option value="medium">Medium (51-200)</option>
                    <option value="large">Large (201-1000)</option>
                    <option value="enterprise">Enterprise (1000+)</option>
                  </select>
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Employee Count</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.employeeCount}
                    onChange={(e) => setFormData({ ...formData, employeeCount: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    placeholder="50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none"
                  placeholder="Brief description of the company..."
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
                  {isSubmitting ? 'Creating...' : 'Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {showEditModal && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => { setShowEditModal(false); resetForm(); }}
              className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <X className="h-6 w-6" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Company</h2>

            {modalError && (
              <div className="mb-6 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <form onSubmit={handleEditCompany} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Website</label>
                  <div className="relative">
                    <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Industry</label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="technology">Technology</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="finance">Finance</option>
                    <option value="education">Education</option>
                    <option value="retail">Retail</option>
                    <option value="manufacturing">Manufacturing</option>
                    <option value="consulting">Consulting</option>
                    <option value="real_estate">Real Estate</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Company Size</label>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  >
                    <option value="startup">Startup (1-10)</option>
                    <option value="small">Small (11-50)</option>
                    <option value="medium">Medium (51-200)</option>
                    <option value="large">Large (201-1000)</option>
                    <option value="enterprise">Enterprise (1000+)</option>
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
      {showDeleteModal && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
              Delete Company?
            </h2>
            <p className="text-gray-600 text-center mb-6">
              Are you sure you want to delete <strong>{selectedCompany.name}</strong>? This action cannot be undone.
            </p>

            {modalError && (
              <div className="mb-4 flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => { setShowDeleteModal(false); setSelectedCompany(null); }}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCompany}
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
