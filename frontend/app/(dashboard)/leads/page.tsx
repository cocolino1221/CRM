'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Phone, Video, Trophy, TrendingUp, TrendingDown, UserCheck, Loader2, Mail, Building, Calendar, DollarSign, MoreVertical, Edit, Trash2, X, AlertCircle, Settings, Users, Tag, FileText, Star, Clock, Briefcase, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MessageSquare, Send, ExternalLink, RefreshCw, Upload, CheckCircle2, Circle, Check } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import api from '@/lib/api';
import { assignableAs, defaultSetterFor } from '@/lib/team-roles';
import { DispositionDialog } from '@/components/calls/DispositionDialog';
import LeadsList from '@/components/leads/LeadsList';
import BookedList from '@/components/queues/BookedList';
import ToCallList from '@/components/queues/ToCallList';
import ScheduleDialog from '@/components/bookings/ScheduleDialog';
import ClosedList from '@/components/queues/ClosedList';
import FollowUpList from '@/components/queues/FollowUpList';
import type { QueueContactRef } from '@/lib/queue-rows';

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
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: { name: string; id: string };
  jobTitle?: string;
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
  customFields?: Record<string, any>;
  preluat?: boolean;
  meetingRecordings?: Array<{ id: string; url: string; label?: string; addedAt: string }>;
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

const getTemplateHeaderMediaType = (template: any): '' | 'image' | 'video' | 'document' => {
  const headerComponent = template?.components?.find((c: any) => c.type === 'HEADER');
  const format = String(headerComponent?.format || '').toUpperCase();
  if (format === 'IMAGE') return 'image';
  if (format === 'VIDEO') return 'video';
  if (format === 'DOCUMENT') return 'document';
  return '';
};

export default function LeadsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalContacts, setTotalContacts] = useState(0);

  // Date filter states
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-11
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);

  // The header's "New Lead" button and the dashboard's Quick Actions both link
  // to /leads?action=new. Read it on the client rather than with
  // useSearchParams, which would need a Suspense boundary around this page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const openNew = () => {
      if (new URLSearchParams(window.location.search).get('action') === 'new') {
        setShowAddModal(true);
      }
    };
    openNew();
    // Clicking the header button while already on /leads changes the query
    // without remounting, so listen for that too.
    window.addEventListener('popstate', openNew);
    window.addEventListener('leads:new', openNew);
    return () => {
      window.removeEventListener('popstate', openNew);
      window.removeEventListener('leads:new', openNew);
    };
  }, []);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // The lead a setter is booking a closer's slot for, from the detail popup.
  const [schedulingContact, setSchedulingContact] = useState<Contact | null>(null);
  // Bumped after a booking so both queues refetch — each owns its own rows.
  const [queueRefresh, setQueueRefresh] = useState(0);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  // A call placed outside the app — the caller still records the outcome.
  const [logCallFor, setLogCallFor] = useState<Contact | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    api
      .get<User>('/auth/me')
      .then((res) => setCurrentUser(res.data))
      .catch(() => setCurrentUser(null));
  }, []);
  type QueueTab = 'all' | 'booked' | 'to-call' | 'won' | 'lost' | 'follow-up';
  const QUEUE_TABS: QueueTab[] = ['all', 'booked', 'to-call', 'won', 'lost', 'follow-up'];
  const [queueTab, setQueueTab] = useState<QueueTab>('all');

  // A convenience for the viewer, not state the server needs — and a blocked
  // or private store must not stop the page rendering.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('leads:queueTab');
      if (saved && (QUEUE_TABS as string[]).includes(saved)) setQueueTab(saved as QueueTab);
    } catch {
      // No stored preference; the default stands.
    }
  }, []);

  const selectQueueTab = (tab: QueueTab) => {
    setQueueTab(tab);
    try {
      localStorage.setItem('leads:queueTab', tab);
    } catch {
      // The tab still switches; it just will not be remembered.
    }
  };
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Recordings (WhatsApp call recordings + manually-added Zoom/Meet links)
  const [detailCallRecordings, setDetailCallRecordings] = useState<any[]>([]);
  const [showAddRecording, setShowAddRecording] = useState(false);
  const [newRecordingUrl, setNewRecordingUrl] = useState('');
  const [newRecordingLabel, setNewRecordingLabel] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);

  // WhatsApp quick send from lead detail
  const [showWaDropdown, setShowWaDropdown] = useState(false);
  const [showWaSendForm, setShowWaSendForm] = useState(false);
  const [waTemplates, setWaTemplates] = useState<any[]>([]);
  const [waSelectedTemplate, setWaSelectedTemplate] = useState('');
  const [waSelectedLang, setWaSelectedLang] = useState('en_US');
  const [waHeaderMediaType, setWaHeaderMediaType] = useState<'' | 'image' | 'video' | 'document'>('');
  const [waHeaderMediaId, setWaHeaderMediaId] = useState('');
  const [waHeaderMediaUrl, setWaHeaderMediaUrl] = useState('');
  const [waUploadingHeader, setWaUploadingHeader] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [waSendResult, setWaSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form data
  const [phonePrefix, setPhonePrefix] = useState('+40');
  const [formData, setFormData] = useState<ContactFormData>({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    status: 'lead',
    source: 'manual',
    tags: [],
  });

  // Payment form data
  const [paymentFormData, setPaymentFormData] = useState({
    paymentMethod: '',
    firm: '',
  });

  const [pendingStageChange, setPendingStageChange] = useState<{
    contact: Contact;
    newStageId: string;
    stage: PipelineStage;
  } | null>(null);

  // Pipeline form data
  const [pipelineFormData, setPipelineFormData] = useState({
    name: '',
    description: '',
    isDefault: false,
  });

  const [pipelineStages, setPipelineStages] = useState([
    { name: 'New Lead', color: '#3B82F6', displayOrder: 0, isClosedWon: false, isClosedLost: false },
    { name: 'Contacted', color: '#8B5CF6', displayOrder: 1, isClosedWon: false, isClosedLost: false },
    { name: 'Qualified', color: '#10B981', displayOrder: 2, isClosedWon: false, isClosedLost: false },
    { name: 'Proposal', color: '#F59E0B', displayOrder: 3, isClosedWon: false, isClosedLost: false },
    { name: 'Negotiation', color: '#EF4444', displayOrder: 4, isClosedWon: false, isClosedLost: false },
    { name: 'Closed Won', color: '#059669', displayOrder: 5, isClosedWon: true, isClosedLost: false },
    { name: 'Closed Lost', color: '#DC2626', displayOrder: 6, isClosedWon: false, isClosedLost: true },
  ]);

  const fetchPipelines = async () => {
    try {
      const response = await api.get<Pipeline[]>('/pipelines');
      console.log('Pipelines response:', response.data);

      // Backend auto-creates pipeline on first GET, so empty array shouldn't happen
      // But if it does, the backend needs to be deployed with the fix
      if (!response.data || response.data.length === 0) {
        console.warn('No pipelines returned from API');
        setPipelines([]);
        setSelectedPipeline(null);
        setError('No pipelines found. The backend may need to be deployed. Please refresh or contact support.');
        return false;
      }

      setPipelines(response.data);
      // Select default pipeline or first pipeline
      const defaultPipeline = response.data.find(p => p.isDefault) || response.data[0];
      console.log('Selected pipeline:', defaultPipeline);
      console.log('Pipeline stages:', defaultPipeline?.stages);
      setSelectedPipeline(defaultPipeline);
      setError(null); // Clear any previous errors
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
      setError(null);
      const params: any = {
        page: 1,
        limit: 200,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      // Deliberately unscoped: a closer must see every lead in the workspace,
      // not the slice belonging to one of several duplicate default pipelines.

      console.log('Fetching contacts with params:', params);
      const response = await api.get<any>('/contacts', { params });
      console.log('Contacts API response:', response.data);

      // Handle different response formats
      let contactsData = [];
      if (Array.isArray(response.data)) {
        contactsData = response.data;
      } else if (response.data.contacts) {
        contactsData = response.data.contacts;
      } else if (response.data.data) {
        contactsData = response.data.data;
      }

      console.log(`Loaded ${contactsData.length} contacts`);
      setContacts(contactsData);
      setTotalContacts(response.data.total || contactsData.length);
    } catch (err: any) {
      console.error('Failed to fetch contacts:', err);
      console.error('Error details:', err.response?.data);
      setError(err.response?.data?.message || 'Failed to load leads. Please try refreshing.');
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

  const applySearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const resetForm = () => {
    const firstStage = selectedPipeline?.stages?.find(s => s && s.id);
    setFormData({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      status: 'lead',
      source: 'manual',
      tags: [],
      pipelineId: selectedPipeline?.id || '',
      pipelineStageId: firstStage?.id || '',
      // A manually added lead starts credited to whoever is adding it —
      // which is what "the setter who added it" means in practice. Empty
      // when that person does not do the job, so nothing is credited falsely.
      setterId: defaultSetterFor(users as any, currentUser as any),
    });
    setModalError('');
  };

  // Listen for Quick Action events
  useEffect(() => {
    const handleOpenModal = () => {
      resetForm();
      setShowMoreFields(false);
      setShowAddModal(true);
    };

    window.addEventListener('openAddLeadModal', handleOpenModal);
    return () => window.removeEventListener('openAddLeadModal', handleOpenModal);
  }, [selectedPipeline]);

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
        const rawPhone = formData.phone.trim().replace(/[^0-9]/g, '');
        cleanedData.phone = rawPhone ? `${phonePrefix}${rawPhone}` : undefined;
      }
      if (formData.notes?.trim()) {
        cleanedData.notes = formData.notes.trim();
      }
      if (formData.companyId) {
        cleanedData.companyId = formData.companyId;
      }

      // Always include pipeline and stage info
      cleanedData.pipelineId = formData.pipelineId;
      cleanedData.pipelineStageId = formData.pipelineStageId;

      // Include team member assignments if selected
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
      setShowMoreFields(false);
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
        const rawPhone = formData.phone.trim().replace(/[^0-9]/g, '');
        cleanedData.phone = rawPhone ? `${phonePrefix}${rawPhone}` : formData.phone.trim();
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

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingStageChange) return;

    setModalError('');
    setIsSubmitting(true);

    try {
      const { contact, newStageId } = pendingStageChange;

      // Update pipeline stage with payment info
      const pipelineData: any = {
        pipelineStageId: newStageId,
        pipelineId: pendingStageChange.stage?.pipelineId,
        paymentMethod: paymentFormData.paymentMethod,
      };

      // Only include firm if payment method is rate or bill
      if (paymentFormData.paymentMethod === 'rate' || paymentFormData.paymentMethod === 'bill') {
        if (!paymentFormData.firm) {
          setModalError('Please select a firm for rate/bill payment method');
          setIsSubmitting(false);
          return;
        }
        pipelineData.firm = paymentFormData.firm;
      }

      await api.put(`/pipelines/contacts/${contact.id}`, pipelineData);

      // Update contact status to customer
      await api.put(`/contacts/${contact.id}`, { status: 'customer' });

      // The lead's own window may still be open behind the payment form.
      setDetailContact(prev => prev?.id === contact.id
        ? { ...prev, pipelineStageId: newStageId, pipelineStage: pendingStageChange.stage, status: 'customer' }
        : prev);

      setShowPaymentModal(false);
      setShowEditModal(false);
      setPendingStageChange(null);
      setEditingContact(null);
      setPaymentFormData({ paymentMethod: '', firm: '' });
      resetForm();
      fetchContacts();
    } catch (err: any) {
      console.error('Failed to update payment details:', err);
      const errorMsg = err.response?.data?.message || 'Failed to update payment details';
      setModalError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
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
      email: contact.email,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: parsedPhone,
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

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setIsSubmitting(true);

    try {
      const response = await api.post('/pipelines', {
        name: pipelineFormData.name,
        description: pipelineFormData.description || undefined,
        isDefault: pipelineFormData.isDefault,
        stages: pipelineStages,
      });

      setPipelines([...pipelines, response.data]);
      setSelectedPipeline(response.data);
      setShowPipelineModal(false);
      setPipelineFormData({ name: '', description: '', isDefault: false });
      setPipelineStages([
        { name: 'New Lead', color: '#3B82F6', displayOrder: 0, isClosedWon: false, isClosedLost: false },
        { name: 'Contacted', color: '#8B5CF6', displayOrder: 1, isClosedWon: false, isClosedLost: false },
        { name: 'Qualified', color: '#10B981', displayOrder: 2, isClosedWon: false, isClosedLost: false },
        { name: 'Proposal', color: '#F59E0B', displayOrder: 3, isClosedWon: false, isClosedLost: false },
        { name: 'Negotiation', color: '#EF4444', displayOrder: 4, isClosedWon: false, isClosedLost: false },
        { name: 'Closed Won', color: '#059669', displayOrder: 5, isClosedWon: true, isClosedLost: false },
        { name: 'Closed Lost', color: '#DC2626', displayOrder: 6, isClosedWon: false, isClosedLost: true },
      ]);
      fetchPipelines();
    } catch (err: any) {
      console.error('Failed to create pipeline:', err);
      const errorMsg = err.response?.data?.message || 'Failed to create pipeline';
      setModalError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addStage = () => {
    setPipelineStages([
      ...pipelineStages,
      {
        name: '',
        color: '#6366F1',
        displayOrder: pipelineStages.length,
        isClosedWon: false,
        isClosedLost: false,
      },
    ]);
  };

  const removeStage = (index: number) => {
    if (pipelineStages.length <= 1) return;
    setPipelineStages(pipelineStages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: string, value: any) => {
    const updated = [...pipelineStages];
    updated[index] = { ...updated[index], [field]: value };
    setPipelineStages(updated);
  };

  const handleDeleteLead = async (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${contact.firstName} ${contact.lastName}? This cannot be undone.`)) return;
    setContacts(prev => prev.filter(c => c.id !== contact.id));
    try {
      await api.delete(`/contacts/${contact.id}`);
    } catch (err: any) {
      console.error('Failed to delete lead:', err);
      setContacts(prev => [...prev, contact]);
    }
  };

  const handleTogglePreluat = async (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextValue = !contact.preluat;
    setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, preluat: nextValue } : c));
    try {
      // Marking as preluat also auto-advances the pipeline stage server-side.
      const res = await api.put(`/contacts/${contact.id}/preluat`, { value: nextValue });
      if (res.data?.pipelineStageId && res.data.pipelineStageId !== contact.pipelineStageId) {
        setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, pipelineStageId: res.data.pipelineStageId, pipelineId: res.data.pipelineId } : c));
      }
    } catch (err: any) {
      console.error('Failed to update preluat:', err);
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, preluat: !nextValue } : c));
    }
  };

  const handleInlineStatusChange = async (contact: Contact, newStatus: string) => {
    try {
      await api.put(`/contacts/${contact.id}`, { status: newStatus });
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, status: newStatus } : c));
    } catch {
      // silent — card shows old value on next render if this fails
    }
  };

  const handleQuickStageChange = async (contact: Contact, newStageId: string) => {
    if (newStageId === contact.pipelineStageId) return;
    const stage = selectedPipeline?.stages.find(s => s.id === newStageId);
    if (!stage) return;

    // Closed-won requires payment info — reuse existing payment modal flow
    if (stage.isClosedWon) {
      setPendingStageChange({ contact, newStageId, stage });
      setShowPaymentModal(true);
      return;
    }

    // Optimistic update
    setContacts(prev => prev.map(c =>
      c.id === contact.id ? { ...c, pipelineStageId: newStageId, pipelineStage: stage, pipelineId: stage.pipelineId } : c
    ));
    setDetailContact(prev => prev?.id === contact.id ? { ...prev, pipelineStageId: newStageId, pipelineStage: stage, pipelineId: stage.pipelineId } : prev);

    try {
      // A lead that never had a pipeline (e.g. from WooCommerce) needs one too,
      // or the board would never show it in the stage it was just moved to.
      await api.put(`/pipelines/contacts/${contact.id}`, { pipelineStageId: newStageId, pipelineId: stage.pipelineId });
    } catch (err: any) {
      console.error('Failed to move lead:', err);
      // Revert on error
      setContacts(prev => prev.map(c =>
        c.id === contact.id ? { ...c, pipelineStageId: contact.pipelineStageId, pipelineStage: contact.pipelineStage } : c
      ));
      setDetailContact(prev => prev?.id === contact.id
        ? { ...prev, pipelineStageId: contact.pipelineStageId, pipelineStage: contact.pipelineStage }
        : prev);
    }
  };

  const getLeadsForStage = (stageId: string): Contact[] => {
    let filteredContacts = contacts.filter(contact => contact.pipelineStageId === stageId);

    // Apply month/year filter if selected
    if (selectedMonth !== null) {
      filteredContacts = filteredContacts.filter(contact => {
        const contactDate = new Date(contact.createdAt);
        return contactDate.getMonth() === selectedMonth && contactDate.getFullYear() === selectedYear;
      });
    }

    return filteredContacts;
  };

  // Get filtered summary stats
  const getFilteredStats = () => {
    let filteredContacts = contacts;

    if (selectedMonth !== null) {
      filteredContacts = filteredContacts.filter(contact => {
        const contactDate = new Date(contact.createdAt);
        return contactDate.getMonth() === selectedMonth && contactDate.getFullYear() === selectedYear;
      });
    }

    return {
      total: filteredContacts.length,
      byStage: selectedPipeline?.stages.reduce((acc, stage) => {
        acc[stage.id] = filteredContacts.filter(c => c.pipelineStageId === stage.id).length;
        return acc;
      }, {} as Record<string, number>) || {},
    };
  };

  const filteredStats = getFilteredStats();

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

  /**
   * A queue row carries only enough of a contact to draw itself. openDetailModal
   * refetches the rest, so seeding it with that partial is enough to show the
   * right name while the request is in flight.
   */
  const openContactFromQueue = (contact: QueueContactRef) => {
    void openDetailModal(contact as Contact);
  };

  const openDetailModal = async (contact: Contact) => {
    setShowDetailModal(true);
    setDetailContact(contact);
    setIsLoadingDetail(true);
    setShowWaDropdown(false);
    setShowWaSendForm(false);
    setWaSendResult(null);
    setWaHeaderMediaType('');
    setWaHeaderMediaId('');
    setWaHeaderMediaUrl('');
    setDetailCallRecordings([]);
    setShowAddRecording(false);
    setNewRecordingUrl('');
    setNewRecordingLabel('');
    try {
      const [contactRes, activitiesRes] = await Promise.all([
        api.get(`/contacts/${contact.id}`, { params: { relations: 'company,owner' } }),
        api.get(`/contacts/${contact.id}/activities`).catch(() => ({ data: [] })),
      ]);
      setDetailContact(contactRes.data);
      const activities = Array.isArray(activitiesRes.data) ? activitiesRes.data : [];
      setDetailCallRecordings(
        activities.filter((a: any) => a?.metadata?.messageType === 'call' && a?.metadata?.recordingUrl),
      );
    } catch (err) {
      console.error('Failed to fetch contact details:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const addMeetingRecording = async () => {
    if (!detailContact || !newRecordingUrl.trim()) return;
    setRecordingBusy(true);
    try {
      const res = await api.post(`/contacts/${detailContact.id}/recordings`, {
        url: newRecordingUrl.trim(),
        label: newRecordingLabel.trim() || undefined,
      });
      setDetailContact(res.data);
      setNewRecordingUrl('');
      setNewRecordingLabel('');
      setShowAddRecording(false);
    } catch (err) {
      console.error('Failed to add recording:', err);
    } finally {
      setRecordingBusy(false);
    }
  };

  const removeMeetingRecording = async (recordingId: string) => {
    if (!detailContact) return;
    setRecordingBusy(true);
    try {
      const res = await api.delete(`/contacts/${detailContact.id}/recordings/${recordingId}`);
      setDetailContact(res.data);
    } catch (err) {
      console.error('Failed to remove recording:', err);
    } finally {
      setRecordingBusy(false);
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
    if (waHeaderMediaType && !waHeaderMediaId.trim() && !waHeaderMediaUrl.trim()) {
      setWaSendResult({ ok: false, msg: `Template needs ${waHeaderMediaType} header media. Upload video/image/file first.` });
      return;
    }

    setWaSending(true);
    setWaSendResult(null);
    try {
      const phone = detailContact.phone.replace(/[^0-9]/g, '');
      await api.post('/integrations/whatsapp/send/template', {
        to: phone,
        templateName: waSelectedTemplate,
        language: waSelectedLang,
        headerMediaType: waHeaderMediaType || undefined,
        headerMediaId: waHeaderMediaId.trim() || undefined,
        headerMediaUrl: waHeaderMediaUrl.trim() || undefined,
      });
      setWaSendResult({ ok: true, msg: 'Template sent!' });
      setTimeout(() => setWaSendResult(null), 3000);
    } catch (err: any) {
      setWaSendResult({ ok: false, msg: err.response?.data?.message || 'Failed to send' });
    } finally {
      setWaSending(false);
    }
  };

  const uploadWaHeaderMedia = async (file: File) => {
    setWaUploadingHeader(true);
    setWaSendResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/integrations/whatsapp/media/upload', formData);
      setWaHeaderMediaId(res.data.id || '');
    } catch (err: any) {
      setWaSendResult({ ok: false, msg: err.response?.data?.message || 'Upload failed' });
    } finally {
      setWaUploadingHeader(false);
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

  const statusColors: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-700',
    prospect: 'bg-purple-100 text-purple-700',
    qualified: 'bg-green-100 text-green-700',
    customer: 'bg-emerald-100 text-emerald-700',
    inactive: 'bg-gray-100 text-gray-700',
    churned: 'bg-red-100 text-red-700',
  };

  // Filtering each slot to the single role of the same name left these
  // dropdowns empty: this workspace has admins, a super_admin and closers,
  // and nobody holding the literal role "setter" — so a manually added lead
  // could not be credited to anyone, including whoever was adding it.
  const setters = assignableAs(users as any, 'setter');
  const callers = assignableAs(users as any, 'caller');
  const closers = assignableAs(users as any, 'closer');

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
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your leads through the sales pipeline
            {selectedMonth !== null ? (
              <span className="font-semibold text-indigo-600">
                {' '}({filteredStats.total} in {new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})
              </span>
            ) : (
              <span> ({totalContacts} total)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            onClick={() => {
              resetForm();
              setShowMoreFields(false);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Lead
          </button>
          <button
            onClick={async () => {
              try {
                const res = await api.post('/contacts/fix-pipeline');
                alert(`Done! ${res.data.updated} contacts assigned to pipeline.`);
                fetchContacts();
              } catch (err: any) {
                alert(err?.response?.data?.message || 'Failed');
              }
            }}
            className="flex items-center gap-2 rounded-xl bg-gray-100 hover:bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-all"
            title="Assign contacts without a pipeline to the default pipeline"
          >
            <RefreshCw className="h-4 w-4" />
            Sync Contacts
          </button>
        </div>
      </div>

      {/* The caller works one page: the board, who is booked, who to ring. */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {([
          { id: 'all' as QueueTab, label: 'Toate leadurile' },
          { id: 'booked' as QueueTab, label: 'Programați' },
          { id: 'to-call' as QueueTab, label: 'De sunat' },
          { id: 'follow-up' as QueueTab, label: 'Follow up' },
          { id: 'won' as QueueTab, label: 'Win' },
          { id: 'lost' as QueueTab, label: 'Pierduți' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => selectQueueTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              queueTab === t.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {queueTab === 'all' && (
        <LeadsList
          onViewDetails={(lead) => openDetailModal(lead as unknown as Contact)}
        />
      )}

      {queueTab === 'booked' && <BookedList key={queueRefresh} onOpenContact={openContactFromQueue} />}
      {queueTab === 'to-call' && <ToCallList key={queueRefresh} onOpenContact={openContactFromQueue} />}
      {queueTab === 'won' && <ClosedList kind="won" onOpenContact={openContactFromQueue} />}
      {queueTab === 'lost' && <ClosedList kind="lost" onOpenContact={openContactFromQueue} />}
      {queueTab === 'follow-up' && <FollowUpList onOpenContact={openContactFromQueue} />}

      {/* Lead Detail Modal */}
      {logCallFor && (
        <DispositionDialog
          contactId={logCallFor.id}
          contactName={
            `${logCallFor.firstName ?? ''} ${logCallFor.lastName ?? ''}`.trim() ||
            logCallFor.phone ||
            logCallFor.email ||
            'Contact'
          }
          phone={logCallFor.phone}
          onViewDetails={() => {
            const contact = logCallFor;
            setLogCallFor(null);
            openDetailModal(contact);
          }}
          onClose={() => setLogCallFor(null)}
          onSaved={() => fetchContacts()}
        />
      )}

      {schedulingContact && (
        <ScheduleDialog
          contact={schedulingContact}
          onClose={() => setSchedulingContact(null)}
          onScheduled={() => {
            // The lead has just left De sunat for Programați; both queues and
            // the main list are now stale.
            setQueueRefresh((n) => n + 1);
            void fetchContacts();
          }}
        />
      )}

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
                    {detailContact.pipelineStage && (
                      <span
                        className="rounded-full px-3 py-0.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: detailContact.pipelineStage.color || '#6366F1' }}
                      >
                        {detailContact.pipelineStage.name}
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
                        onClick={() => { setShowWaSendForm(!showWaSendForm); }}
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
                              const headerType = getTemplateHeaderMediaType(t);
                              setWaHeaderMediaType(headerType);
                              setWaHeaderMediaId('');
                              setWaHeaderMediaUrl('');
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
                              disabled={waSending || !waSelectedTemplate || (!!waHeaderMediaType && !waHeaderMediaId.trim() && !waHeaderMediaUrl.trim())}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              {waSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              Send
                            </button>
                          </div>
                          {waHeaderMediaType && (
                            <div className="p-2 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
                              <p className="text-xs text-amber-800 font-medium">
                                Header media required ({waHeaderMediaType})
                              </p>
                              <div className="flex gap-2">
                                <input
                                  value={waHeaderMediaId}
                                  onChange={(e) => setWaHeaderMediaId(e.target.value)}
                                  placeholder="Meta media_id"
                                  className="flex-1 px-2 py-1.5 text-xs border border-amber-200 rounded-lg"
                                />
                                <label className="px-2 py-1.5 text-xs border border-amber-300 rounded-lg cursor-pointer text-amber-800 hover:bg-amber-100 flex items-center gap-1">
                                  {waUploadingHeader ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                  Upload
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept={waHeaderMediaType === 'image' ? 'image/*' : waHeaderMediaType === 'video' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      await uploadWaHeaderMedia(file);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          )}
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
                {/* Programează manual — the only way a setter gets a lead into Programați */}
                <button
                  onClick={() => setSchedulingContact(detailContact)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-blue-600 transition-all hover:bg-blue-50"
                  title="Programează o întâlnire cu un closer"
                >
                  <Calendar className="h-5 w-5" />
                  <span className="hidden sm:inline">Programează</span>
                </button>
                {/* Edit button */}
                <button
                  onClick={() => { setShowDetailModal(false); setDetailContact(null); openEditModal(detailContact); }}
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
                      <Building className="h-5 w-5 text-gray-400 flex-shrink-0" />
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
                          <p className="text-sm font-bold text-gray-900">{detailContact.leadScore}/100</p>
                          <div className="flex-1 w-24 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${detailContact.leadScore >= 75 ? 'bg-green-500' : detailContact.leadScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(detailContact.leadScore, 100)}%` }}
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
                          {new Date(detailContact.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team Assignments */}
                {(detailContact.setter || detailContact.caller || detailContact.closer || detailContact.owner) && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Team</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {detailContact.owner && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-xs">
                            {getInitials(`${detailContact.owner.firstName} ${detailContact.owner.lastName}`)}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Owner</p>
                            <p className="text-sm font-medium text-gray-900">{detailContact.owner.firstName} {detailContact.owner.lastName}</p>
                          </div>
                        </div>
                      )}
                      {detailContact.setter && (
                        <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                          <Users className="h-5 w-5 text-blue-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-blue-600">Setter</p>
                            <p className="text-sm font-medium text-gray-900">{detailContact.setter.firstName} {detailContact.setter.lastName}</p>
                          </div>
                        </div>
                      )}
                      {detailContact.caller && (
                        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
                          <Phone className="h-5 w-5 text-purple-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-purple-600">Caller</p>
                            <p className="text-sm font-medium text-gray-900">{detailContact.caller.firstName} {detailContact.caller.lastName}</p>
                          </div>
                        </div>
                      )}
                      {detailContact.closer && (
                        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                          <Trophy className="h-5 w-5 text-green-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-green-600">Closer</p>
                            <p className="text-sm font-medium text-gray-900">{detailContact.closer.firstName} {detailContact.closer.lastName}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

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

                {/* Where the lead stands: one click moves it to any stage of its pipeline. */}
                {(() => {
                  const pipeline =
                    pipelines.find(p => p.id === detailContact.pipelineId) ||
                    pipelines.find(p => p.stages?.some(s => s.id === detailContact.pipelineStageId)) ||
                    selectedPipeline;
                  const stages = [...(pipeline?.stages || [])].sort((a, b) => a.displayOrder - b.displayOrder);
                  if (!stages.length) return null;
                  return (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Status</h3>
                      <div className="flex flex-wrap gap-2">
                        {stages.map(stage => {
                          const active = stage.id === detailContact.pipelineStageId;
                          return (
                            <button
                              key={stage.id}
                              type="button"
                              onClick={() => void handleQuickStageChange(detailContact, stage.id)}
                              disabled={active}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                active ? 'text-white shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                              style={active ? { backgroundColor: stage.color || '#6366F1', borderColor: stage.color || '#6366F1' } : undefined}
                            >
                              {!active && (
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color || '#6366F1' }} />
                              )}
                              {active && <Check className="h-3.5 w-3.5" />}
                              {stage.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* A call placed from a handset still needs its outcome recorded. */}
                <div className="mb-5">
                  <button
                    onClick={() => setLogCallFor(detailContact)}
                    className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-300"
                  >
                    <Phone className="h-4 w-4" /> Rezultat apel
                  </button>
                </div>

                {/* Recordings — WhatsApp call recordings + manually-added Zoom/Meet links */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                      <Video className="h-4 w-4" /> Recordings
                    </h3>
                    <button
                      onClick={() => setShowAddRecording((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Zoom / Meet link
                    </button>
                  </div>

                  {showAddRecording && (
                    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <input
                        type="url"
                        value={newRecordingUrl}
                        onChange={(e) => setNewRecordingUrl(e.target.value)}
                        placeholder="https://zoom.us/rec/... or Google Meet link"
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                      />
                      <input
                        type="text"
                        value={newRecordingLabel}
                        onChange={(e) => setNewRecordingLabel(e.target.value)}
                        placeholder="Label (optional) — e.g. Discovery call 12 Aug"
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={addMeetingRecording}
                          disabled={!newRecordingUrl.trim() || recordingBusy}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          Save link
                        </button>
                        <button
                          onClick={() => { setShowAddRecording(false); setNewRecordingUrl(''); setNewRecordingLabel(''); }}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {detailCallRecordings.length === 0 && !(detailContact.meetingRecordings || []).length ? (
                    <p className="text-sm text-gray-400">No call recordings or meeting links yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailCallRecordings.map((activity: any) => (
                        <div key={activity.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-xs font-semibold text-gray-600">
                              WhatsApp call · {new Date(activity.occurredAt).toLocaleString('ro-RO')}
                              {activity.metadata?.callDurationSeconds ? ` · ${Math.floor(activity.metadata.callDurationSeconds / 60)}:${String(activity.metadata.callDurationSeconds % 60).padStart(2, '0')}` : ''}
                            </span>
                          </div>
                          <audio controls src={activity.metadata.recordingUrl} className="w-full h-9" />
                        </div>
                      ))}
                      {(detailContact.meetingRecordings || []).map((rec) => (
                        <div key={rec.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <a
                            href={rec.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 min-w-0 text-sm font-medium text-indigo-600 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{rec.label || rec.url}</span>
                          </a>
                          <button
                            onClick={() => removeMeetingRecording(rec.id)}
                            disabled={recordingBusy}
                            className="flex-shrink-0 text-gray-400 hover:text-rose-600 disabled:opacity-50"
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
              </div>
            )}
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
                  setShowMoreFields(false);
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
                  <div className="flex gap-2">
                    <select
                      disabled={isSubmitting}
                      value={phonePrefix}
                      onChange={(e) => setPhonePrefix(e.target.value)}
                      className="w-28 px-2 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all text-sm"
                    >
                      {PHONE_PREFIXES.map(p => (
                        <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      disabled={isSubmitting}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                      placeholder="712345678"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pipeline
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.pipelineId}
                    onChange={(e) => {
                      const pipeline = pipelines.find(p => p.id === e.target.value);
                      const firstStage = pipeline?.stages?.find(s => s && s.id);
                      setFormData({
                        ...formData,
                        pipelineId: e.target.value,
                        pipelineStageId: firstStage?.id || '',
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
                    value={formData.pipelineStageId}
                    onChange={(e) => setFormData({ ...formData, pipelineStageId: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    {(pipelines
                      .find(p => p.id === formData.pipelineId)
                      ?.stages || [])
                      .filter(stage => stage && stage.id)
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map(stage => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMoreFields(v => !v)}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors mt-1"
              >
                {showMoreFields ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showMoreFields ? 'Hide details' : 'More details (caller, closer, source, notes…)'}
              </button>

              {/* Who booked this lead. On the form rather than behind the
                  toggle: it is the field most worth filling on a manual add,
                  and buried under "More details" it was almost never set. */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Setter <span className="font-normal text-gray-400">(cine l-a adăugat)</span>
                </label>
                <select
                  disabled={isSubmitting}
                  value={formData.setterId || ''}
                  onChange={(e) => setFormData({ ...formData, setterId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                >
                  <option value="">Nimeni</option>
                  {setters.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.firstName} {user.lastName}
                      {user.id === currentUser?.id ? ' (tu)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {showMoreFields && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                  {/* Caller */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Caller</label>
                    <select
                      disabled={isSubmitting}
                      value={formData.callerId || ''}
                      onChange={(e) => setFormData({ ...formData, callerId: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    >
                      <option value="">None</option>
                      {callers.map(user => (
                        <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                      ))}
                    </select>
                  </div>
                  {/* Closer */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Closer</label>
                    <select
                      disabled={isSubmitting}
                      value={formData.closerId || ''}
                      onChange={(e) => setFormData({ ...formData, closerId: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    >
                      <option value="">None</option>
                      {closers.map(user => (
                        <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                      ))}
                    </select>
                  </div>
                  {/* Source */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Source</label>
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
                  {/* Notes */}
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
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
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowMoreFields(false);
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
                  <div className="flex gap-2">
                    <select
                      disabled={isSubmitting}
                      value={phonePrefix}
                      onChange={(e) => setPhonePrefix(e.target.value)}
                      className="w-28 px-2 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all text-sm"
                    >
                      {PHONE_PREFIXES.map(p => (
                        <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      disabled={isSubmitting}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^0-9]/g, '') })}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                      placeholder="712345678"
                    />
                  </div>
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
                      const firstStage = pipeline?.stages?.find(s => s && s.id);
                      setFormData({
                        ...formData,
                        pipelineId: e.target.value,
                        pipelineStageId: firstStage?.id || '',
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
                    onChange={(e) => {
                      const newStageId = e.target.value;
                      const newStage = pipelines
                        .find(p => p.id === formData.pipelineId)
                        ?.stages?.find(s => s.id === newStageId);

                      // If moving to Closed Won stage, show payment modal
                      if (newStage?.isClosedWon && editingContact) {
                        setPendingStageChange({
                          contact: editingContact,
                          newStageId,
                          stage: newStage,
                        });
                        setPaymentFormData({ paymentMethod: '', firm: '' });
                        setShowPaymentModal(true);
                      } else {
                        setFormData({ ...formData, pipelineStageId: newStageId });
                      }
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                  >
                    {(pipelines
                      .find(p => p.id === formData.pipelineId)
                      ?.stages || [])
                      .filter(stage => stage && stage.id)
                      .sort((a, b) => a.displayOrder - b.displayOrder)
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

      {/* Create Pipeline Modal */}
      {showPipelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-4xl mx-4 glass-effect rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-2xl font-bold text-gray-900">Create New Pipeline</h2>
              <button
                onClick={() => {
                  setShowPipelineModal(false);
                  setModalError('');
                }}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleCreatePipeline} className="p-6 space-y-6">
              {modalError && (
                <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900">Error</p>
                    <p className="text-sm text-red-700 mt-1">{modalError}</p>
                  </div>
                </div>
              )}

              {/* Pipeline Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Pipeline Information</h3>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Pipeline Name *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={pipelineFormData.name}
                    onChange={(e) => setPipelineFormData({ ...pipelineFormData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="e.g., Sales Pipeline, Partner Pipeline"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    disabled={isSubmitting}
                    value={pipelineFormData.description}
                    onChange={(e) => setPipelineFormData({ ...pipelineFormData, description: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed transition-all"
                    placeholder="Brief description of this pipeline's purpose"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    disabled={isSubmitting}
                    checked={pipelineFormData.isDefault}
                    onChange={(e) => setPipelineFormData({ ...pipelineFormData, isDefault: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="isDefault" className="text-sm font-medium text-gray-700">
                    Set as default pipeline
                  </label>
                </div>
              </div>

              {/* Pipeline Stages */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Pipeline Stages</h3>
                  <button
                    type="button"
                    onClick={addStage}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add Stage
                  </button>
                </div>

                <div className="space-y-3">
                  {pipelineStages.map((stage, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Stage Name *
                          </label>
                          <input
                            type="text"
                            required
                            disabled={isSubmitting}
                            value={stage.name}
                            onChange={(e) => updateStage(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                            placeholder="e.g., Qualified"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Color
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              disabled={isSubmitting}
                              value={stage.color}
                              onChange={(e) => updateStage(index, 'color', e.target.value)}
                              className="h-9 w-16 rounded-lg border border-gray-300 cursor-pointer disabled:opacity-50"
                            />
                            <input
                              type="text"
                              disabled={isSubmitting}
                              value={stage.color}
                              onChange={(e) => updateStage(index, 'color', e.target.value)}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                              placeholder="#3B82F6"
                            />
                          </div>
                        </div>

                        <div className="col-span-2 flex items-center gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={isSubmitting}
                              checked={stage.isClosedWon}
                              onChange={(e) => {
                                updateStage(index, 'isClosedWon', e.target.checked);
                                if (e.target.checked) updateStage(index, 'isClosedLost', false);
                              }}
                              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                            />
                            <span className="text-xs font-medium text-gray-700">Closed Won</span>
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={isSubmitting}
                              checked={stage.isClosedLost}
                              onChange={(e) => {
                                updateStage(index, 'isClosedLost', e.target.checked);
                                if (e.target.checked) updateStage(index, 'isClosedWon', false);
                              }}
                              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                            />
                            <span className="text-xs font-medium text-gray-700">Closed Lost</span>
                          </label>
                        </div>
                      </div>

                      {pipelineStages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStage(index)}
                          disabled={isSubmitting}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Remove stage"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowPipelineModal(false);
                    setModalError('');
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
                      Create Pipeline
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Method Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">Payment Details</h2>
              <p className="text-sm text-gray-600 mt-1">
                Select payment method for this client
              </p>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-6 space-y-6">
              {modalError && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-800">{modalError}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentFormData.paymentMethod}
                  onChange={(e) => setPaymentFormData({
                    ...paymentFormData,
                    paymentMethod: e.target.value,
                    firm: '' // Reset firm when payment method changes
                  })}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                >
                  <option value="">Select payment method</option>
                  <option value="integral">Integral</option>
                  <option value="rate">Rate</option>
                  <option value="bill">Bill/Factura</option>
                </select>
              </div>

              {/* Conditionally show Firm selection only for rate or bill */}
              {(paymentFormData.paymentMethod === 'rate' || paymentFormData.paymentMethod === 'bill') && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Firm <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={paymentFormData.firm}
                    onChange={(e) => setPaymentFormData({
                      ...paymentFormData,
                      firm: e.target.value
                    })}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select firm</option>
                    <option value="old">Old</option>
                    <option value="new">New</option>
                    <option value="dubai">Dubai</option>
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPendingStageChange(null);
                    setPaymentFormData({ paymentMethod: '', firm: '' });
                    setModalError('');
                  }}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save & Close Deal'
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
