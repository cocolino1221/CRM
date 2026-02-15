'use client';

import { useState, useEffect } from 'react';
import { Plus, Bot, Zap, MessageSquare, Sparkles, Settings, Play, Pause, Trash2, Copy, ExternalLink, Search, Filter, Clock, TrendingUp, Users, Mail, Phone, Video, Calendar, CheckCircle, XCircle, Edit, Save, X, Code, Workflow, Brain, MessageCircle, ArrowRight, ChevronRight, Loader2, FileText, Eye, BarChart3, Link2, Palette } from 'lucide-react';
import Image from 'next/image';
import api from '@/lib/api';

interface Chatbot {
  id: string;
  name: string;
  type: 'whatsapp' | 'facebook' | 'instagram' | 'website' | 'slack';
  status: 'active' | 'paused' | 'draft';
  platform: string;
  conversations: number;
  responses: number;
  avgResponseTime: string;
  createdAt: string;
  triggers: string[];
}

interface AIAgent {
  id: string;
  name: string;
  type: 'sales' | 'support' | 'lead-qualifier' | 'appointment-setter' | 'custom';
  model: 'gpt-4' | 'gpt-3.5' | 'claude' | 'custom';
  status: 'active' | 'training' | 'paused';
  interactions: number;
  successRate: number;
  tasks: string[];
  createdAt: string;
}

interface Workflow {
  id: string;
  name: string;
  platform: 'n8n' | 'zapier' | 'make' | 'custom';
  status: 'active' | 'paused' | 'error';
  trigger: string;
  actions: number;
  executions: number;
  lastRun?: string;
  createdAt: string;
}

interface Page {
  id: string;
  name: string;
  type: 'landing' | 'form' | 'survey' | 'booking';
  status: 'published' | 'draft' | 'paused';
  url: string;
  views: number;
  conversions: number;
  conversionRate: number;
  automations: string[];
  createdAt: string;
  thumbnail?: string;
}

type TabType = 'chatbots' | 'ai-agents' | 'workflows' | 'pages' | 'templates';

export default function AutomationPage() {
  const [activeTab, setActiveTab] = useState<TabType>('workflows');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'chatbot' | 'agent' | 'workflow'>('workflow');
  const [loading, setLoading] = useState(false);

  // Workflow form state
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [triggerType, setTriggerType] = useState('contact.created');
  const [actions, setActions] = useState<any[]>([{ id: '1', type: 'send_email', config: {} }]);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);

  const [chatbots] = useState<Chatbot[]>([]);
  const [aiAgents] = useState<AIAgent[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  // Load workflows on mount
  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const response = await api.get('/workflows');
      // Map backend workflows to frontend format
      const mappedWorkflows = response.data.map((w: any) => ({
        id: w.id,
        name: w.name,
        platform: 'custom',
        status: w.status,
        trigger: w.triggerType,
        actions: w.actions?.length || 0,
        executions: w.executionCount || 0,
        lastRun: w.updatedAt,
        createdAt: w.createdAt,
      }));
      setWorkflows(mappedWorkflows);
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  };

  const handleCreateWorkflow = async () => {
    if (!workflowName.trim()) {
      alert('Please enter a workflow name');
      return;
    }

    setLoading(true);
    try {
      if (editingWorkflowId) {
        // Update existing workflow
        await api.patch(`/workflows/${editingWorkflowId}`, {
          name: workflowName,
          description: workflowDescription,
          triggerType,
          actions: actions.map(action => ({
            id: action.id,
            type: action.type,
            config: action.config || {},
          })),
        });
        alert('Workflow updated successfully!');
      } else {
        // Create new workflow
        await api.post('/workflows', {
          name: workflowName,
          description: workflowDescription,
          triggerType,
          status: 'draft',
          actions: actions.map(action => ({
            id: action.id,
            type: action.type,
            config: action.config || {},
          })),
        });
        alert('Workflow created successfully!');
      }

      // Reset form
      setWorkflowName('');
      setWorkflowDescription('');
      setTriggerType('contact.created');
      setActions([{ id: '1', type: 'send_email', config: {} }]);
      setEditingWorkflowId(null);
      setShowCreateModal(false);

      // Reload workflows
      await loadWorkflows();
    } catch (error: any) {
      console.error('Failed to save workflow:', error);
      alert(error.response?.data?.message || 'Failed to save workflow');
    } finally {
      setLoading(false);
    }
  };

  const handleEditWorkflow = async (workflowId: string) => {
    try {
      // Fetch workflow details from backend
      const response = await api.get(`/workflows/${workflowId}`);
      const workflow = response.data;

      // Populate form with workflow data
      setWorkflowName(workflow.name);
      setWorkflowDescription(workflow.description || '');
      setTriggerType(workflow.triggerType);
      setActions(workflow.actions || [{ id: '1', type: 'send_email', config: {} }]);
      setEditingWorkflowId(workflowId);
      setShowCreateModal(true);
    } catch (error) {
      console.error('Failed to load workflow for editing:', error);
      alert('Failed to load workflow details');
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      await api.delete(`/workflows/${workflowId}`);
      await loadWorkflows();
      alert('Workflow deleted successfully!');
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      alert('Failed to delete workflow');
    }
  };

  const handleToggleWorkflowStatus = async (workflowId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';

    try {
      await api.patch(`/workflows/${workflowId}`, {
        status: newStatus,
      });
      await loadWorkflows();
    } catch (error) {
      console.error('Failed to toggle workflow status:', error);
      alert('Failed to update workflow status');
    }
  };

  const addAction = () => {
    const newId = (actions.length + 1).toString();
    setActions([...actions, { id: newId, type: 'send_email', config: {} }]);
  };

  const removeAction = (id: string) => {
    setActions(actions.filter(a => a.id !== id));
  };

  const updateActionType = (id: string, type: string) => {
    setActions(actions.map(a => a.id === id ? { ...a, type } : a));
  };

  const [pages] = useState<Page[]>([]);

  const templates = [
    {
      id: '1',
      name: 'Lead Qualification Bot',
      category: 'Chatbot',
      description: 'Automatically qualify leads through conversation',
      icon: MessageSquare,
      color: 'from-blue-500 to-indigo-600',
      uses: 1234,
    },
    {
      id: '2',
      name: 'AI Sales Agent',
      category: 'AI Agent',
      description: 'AI-powered sales assistant for lead conversion',
      icon: Brain,
      color: 'from-purple-500 to-pink-600',
      uses: 892,
    },
    {
      id: '3',
      name: 'Lead to CRM Workflow',
      category: 'Workflow',
      description: 'Automatically add leads from forms to CRM',
      icon: Workflow,
      color: 'from-emerald-500 to-teal-600',
      uses: 2103,
    },
    {
      id: '4',
      name: 'Appointment Scheduler',
      category: 'AI Agent',
      description: 'Schedule meetings automatically via chat',
      icon: Calendar,
      color: 'from-orange-500 to-red-600',
      uses: 756,
    },
    {
      id: '5',
      name: 'WhatsApp Auto-Responder',
      category: 'Chatbot',
      description: 'Instant responses to common WhatsApp messages',
      icon: MessageCircle,
      color: 'from-green-500 to-emerald-600',
      uses: 1567,
    },
    {
      id: '6',
      name: 'Email Follow-up Automation',
      category: 'Workflow',
      description: 'Automated email sequences for leads',
      icon: Mail,
      color: 'from-cyan-500 to-blue-600',
      uses: 934,
    },
  ];

  const tabs = [
    { id: 'chatbots' as TabType, name: 'Chatbots', icon: MessageSquare, count: chatbots.length },
    { id: 'ai-agents' as TabType, name: 'AI Agents', icon: Brain, count: aiAgents.length },
    { id: 'workflows' as TabType, name: 'Workflows', icon: Workflow, count: workflows.length },
    { id: 'pages' as TabType, name: 'Pages', icon: FileText, count: pages.length },
    { id: 'templates' as TabType, name: 'Templates', icon: Sparkles, count: templates.length },
  ];

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-700 border-green-200',
      published: 'bg-green-100 text-green-700 border-green-200',
      paused: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      draft: 'bg-gray-100 text-gray-700 border-gray-200',
      error: 'bg-red-100 text-red-700 border-red-200',
      training: 'bg-blue-100 text-blue-700 border-blue-200',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const getPageTypeInfo = (type: string) => {
    const types = {
      landing: { icon: Palette, label: 'Landing Page', color: 'text-blue-600' },
      form: { icon: FileText, label: 'Form', color: 'text-purple-600' },
      survey: { icon: BarChart3, label: 'Survey', color: 'text-emerald-600' },
      booking: { icon: Calendar, label: 'Booking', color: 'text-orange-600' },
    };
    return types[type as keyof typeof types] || types.landing;
  };

  const getPlatformIcon = (type: string) => {
    const icons: Record<string, string> = {
      whatsapp: 'https://cdn.cdnlogo.com/logos/w/20/whatsapp-icon.svg',
      facebook: 'https://cdn.worldvectorlogo.com/logos/facebook-3.svg',
      instagram: 'https://cdn.worldvectorlogo.com/logos/instagram-2016.svg',
      website: 'https://cdn.worldvectorlogo.com/logos/google-chrome.svg',
      slack: 'https://cdn.cdnlogo.com/logos/s/47/slack.svg',
      n8n: 'https://cdn.worldvectorlogo.com/logos/n8n.svg',
      zapier: 'https://cdn.cdnlogo.com/logos/z/4/zapier-icon.svg',
      make: 'https://cdn.worldvectorlogo.com/logos/make-4.svg',
    };
    return icons[type] || '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
            Automation
          </h1>
          <p className="mt-2 text-gray-600">
            Build chatbots, AI agents, and automated workflows
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
        >
          <Plus className="h-4 w-4" />
          Create New
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-effect rounded-xl p-5 border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Active Chatbots</p>
              <p className="text-2xl font-bold text-gray-900">{chatbots.filter(c => c.status === 'active').length}</p>
            </div>
          </div>
        </div>

        <div className="glass-effect rounded-xl p-5 border border-purple-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600">
              <Brain className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">AI Agents</p>
              <p className="text-2xl font-bold text-gray-900">{aiAgents.filter(a => a.status === 'active').length}</p>
            </div>
          </div>
        </div>

        <div className="glass-effect rounded-xl p-5 border border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <Workflow className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Workflows</p>
              <p className="text-2xl font-bold text-gray-900">{workflows.filter(w => w.status === 'active').length}</p>
            </div>
          </div>
        </div>

        <div className="glass-effect rounded-xl p-5 border border-orange-100">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-red-600">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Executions</p>
              <p className="text-2xl font-bold text-gray-900">{workflows.reduce((sum, w) => sum + (w.executions || 0), 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
                <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-400" />
        <input
          type="text"
          placeholder={`Search ${activeTab}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-indigo-200/50 bg-white/50 py-3 pl-11 pr-4 text-sm placeholder:text-gray-500 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
        />
      </div>

      {/* Content */}
      <div>
        {/* Chatbots Tab */}
        {activeTab === 'chatbots' && chatbots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 mb-5">
              <MessageSquare className="h-12 w-12 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Chatbots Coming Soon</h3>
            <p className="text-gray-500 max-w-md mb-6">
              Build intelligent chatbots for WhatsApp, Facebook, Instagram, and more. Connect them to your CRM to automatically qualify leads and answer questions 24/7.
            </p>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> In development
            </span>
          </div>
        )}
        {activeTab === 'chatbots' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {chatbots.map((bot) => (
              <div
                key={bot.id}
                className="glass-effect rounded-xl p-6 border border-gray-200 hover:border-indigo-300 hover:shadow-xl transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                      {bot.type && (
                        <Image
                          src={getPlatformIcon(bot.type)}
                          alt={bot.platform}
                          width={24}
                          height={24}
                          className="object-contain"
                        />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{bot.name}</h3>
                      <p className="text-xs text-gray-500">{bot.platform}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(bot.status)}`}>
                    {bot.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{bot.conversations}</p>
                    <p className="text-xs text-gray-600">Conversations</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{bot.responses}</p>
                    <p className="text-xs text-gray-600">Responses</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{bot.avgResponseTime}</p>
                    <p className="text-xs text-gray-600">Avg Time</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Triggers:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bot.triggers.map((trigger, idx) => (
                      <span key={idx} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">
                        {trigger}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                  <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-semibold">
                    <Edit className="h-4 w-4" />
                    Edit
                  </button>
                  <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all">
                    {bot.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Agents Tab */}
        {activeTab === 'ai-agents' && aiAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-100 mb-5">
              <Brain className="h-12 w-12 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">AI Agents Coming Soon</h3>
            <p className="text-gray-500 max-w-md mb-6">
              Deploy AI-powered sales and support agents that learn from your data, qualify leads automatically, and book appointments — all without human intervention.
            </p>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 text-purple-700 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> In development
            </span>
          </div>
        )}
        {activeTab === 'ai-agents' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {aiAgents.map((agent) => (
              <div
                key={agent.id}
                className="glass-effect rounded-xl p-6 border border-gray-200 hover:border-purple-300 hover:shadow-xl transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600">
                      <Brain className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                      <p className="text-xs text-gray-500 capitalize">{agent.type.replace('-', ' ')}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(agent.status)}`}>
                    {agent.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{agent.interactions}</p>
                    <p className="text-xs text-gray-600">Interactions</p>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <p className="text-2xl font-bold text-green-600">{agent.successRate}%</p>
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    </div>
                    <p className="text-xs text-gray-600">Success Rate</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Capabilities:</p>
                  <div className="space-y-1.5">
                    {agent.tasks.map((task, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        <span>{task}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                  <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-semibold">
                    <Settings className="h-4 w-4" />
                    Configure
                  </button>
                  <button className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-sm">
                    <Code className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Workflows Tab */}
        {activeTab === 'workflows' && (
          <div className="space-y-6">
            {/* Workflow Builder Card */}
            <div className="glass-effect rounded-xl p-6 border border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-teal-50/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Workflow Builder</h3>
                  <p className="text-sm text-gray-600 mt-1">Drag and drop actions to create your workflow</p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-semibold">
                  <Save className="h-4 w-4" />
                  Save Workflow
                </button>
              </div>

              {/* Workflow Canvas */}
              <div className="bg-white rounded-xl border-2 border-dashed border-emerald-300 p-6 min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                  {/* Trigger */}
                  <div className="w-full max-w-md">
                    <div className="glass-effect rounded-xl p-4 border-2 border-emerald-500 bg-gradient-to-r from-emerald-50 to-teal-50">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500">
                          <Zap className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-emerald-600 uppercase">Trigger</p>
                          <select className="w-full mt-1 px-2 py-1.5 text-sm border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                            <option>Form submission</option>
                            <option>New contact</option>
                            <option>Email received</option>
                            <option>WhatsApp message</option>
                            <option>Stripe checkout completed</option>
                            <option>Stripe payment succeeded</option>
                            <option>Stripe payment failed</option>
                            <option>Stripe subscription created</option>
                            <option>Scheduled time</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Arrow Down */}
                  <div className="flex flex-col items-center">
                    <div className="h-8 w-0.5 bg-gradient-to-b from-emerald-400 to-blue-400"></div>
                    <ChevronRight className="h-5 w-5 text-blue-500 rotate-90" />
                  </div>

                  {/* Actions */}
                  <div className="w-full max-w-md space-y-4">
                    {/* Action 1 */}
                    <div className="glass-effect rounded-xl p-4 border border-blue-300 bg-blue-50/50 group hover:shadow-lg transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500">
                          <Mail className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-blue-600 uppercase">Action 1</p>
                          <select className="w-full mt-1 px-2 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option>Send email</option>
                            <option>Create contact</option>
                            <option>Add to CRM</option>
                            <option>Send SMS</option>
                            <option>Create Stripe invoice</option>
                            <option>Create SmartBill invoice</option>
                            <option>Create Oblio invoice</option>
                            <option>Create FGO invoice</option>
                            <option>Trigger webhook</option>
                          </select>
                        </div>
                        <button className="p-1.5 rounded-lg hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100">
                          <X className="h-4 w-4 text-red-500" />
                        </button>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center">
                      <div className="h-4 w-0.5 bg-gradient-to-b from-blue-400 to-purple-400"></div>
                      <ChevronRight className="h-5 w-5 text-purple-500 rotate-90" />
                    </div>

                    {/* Action 2 */}
                    <div className="glass-effect rounded-xl p-4 border border-purple-300 bg-purple-50/50 group hover:shadow-lg transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-500">
                          <Users className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-purple-600 uppercase">Action 2</p>
                          <select className="w-full mt-1 px-2 py-1.5 text-sm border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500">
                            <option>Add to CRM</option>
                            <option>Send email</option>
                            <option>Create contact</option>
                            <option>Send SMS</option>
                            <option>Create Stripe invoice</option>
                            <option>Create SmartBill invoice</option>
                            <option>Create Oblio invoice</option>
                            <option>Create FGO invoice</option>
                            <option>Trigger webhook</option>
                          </select>
                        </div>
                        <button className="p-1.5 rounded-lg hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100">
                          <X className="h-4 w-4 text-red-500" />
                        </button>
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center">
                      <div className="h-4 w-0.5 bg-gradient-to-b from-purple-400 to-pink-400"></div>
                      <ChevronRight className="h-5 w-5 text-pink-500 rotate-90" />
                    </div>

                    {/* Action 3 */}
                    <div className="glass-effect rounded-xl p-4 border border-pink-300 bg-pink-50/50 group hover:shadow-lg transition-all">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-pink-500">
                          <Phone className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-pink-600 uppercase">Action 3</p>
                          <select className="w-full mt-1 px-2 py-1.5 text-sm border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500">
                            <option>Send SMS notification</option>
                            <option>Send email</option>
                            <option>Create contact</option>
                            <option>Add to CRM</option>
                            <option>Create Stripe invoice</option>
                            <option>Create SmartBill invoice</option>
                            <option>Create Oblio invoice</option>
                            <option>Create FGO invoice</option>
                            <option>Trigger webhook</option>
                          </select>
                        </div>
                        <button className="p-1.5 rounded-lg hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100">
                          <X className="h-4 w-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Add Action Button */}
                  <button className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-emerald-400 hover:bg-emerald-50 transition-all text-sm font-semibold text-gray-600 hover:text-emerald-600">
                    <Plus className="h-4 w-4" />
                    Add Action
                  </button>
                </div>
              </div>

              {/* Available Actions */}
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Available Actions</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: Mail, label: 'Email', color: 'bg-blue-100 text-blue-700 border-blue-200' },
                    { icon: Phone, label: 'SMS', color: 'bg-green-100 text-green-700 border-green-200' },
                    { icon: Users, label: 'CRM', color: 'bg-purple-100 text-purple-700 border-purple-200' },
                    { icon: Calendar, label: 'Schedule', color: 'bg-orange-100 text-orange-700 border-orange-200' },
                    { icon: Zap, label: 'Webhook', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
                    { icon: Code, label: 'Custom', color: 'bg-gray-100 text-gray-700 border-gray-200' },
                  ].map((action, idx) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={idx}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-all hover:shadow-md ${action.color}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Existing Workflows */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Workflows</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {workflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="glass-effect rounded-xl p-6 border border-gray-200 hover:border-emerald-300 hover:shadow-xl transition-all group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
                          <Image
                            src={getPlatformIcon(workflow.platform)}
                            alt={workflow.platform}
                            width={24}
                            height={24}
                            className="object-contain"
                          />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                          <p className="text-xs text-gray-500 capitalize">{workflow.platform}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(workflow.status)}`}>
                        {workflow.status}
                      </span>
                    </div>

                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-semibold text-gray-900">Trigger:</span>
                      </div>
                      <p className="text-sm text-gray-700">{workflow.trigger}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <p className="text-lg font-bold text-gray-900">{workflow.actions}</p>
                        <p className="text-xs text-gray-600">Actions</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">{workflow.executions}</p>
                        <p className="text-xs text-gray-600">Executions</p>
                      </div>
                    </div>

                    {workflow.lastRun && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                        <Clock className="h-3.5 w-3.5" />
                        Last run: {workflow.lastRun}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => handleEditWorkflow(workflow.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-semibold"
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleWorkflowStatus(workflow.id, workflow.status)}
                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                        title={workflow.status === 'active' ? 'Pause workflow' : 'Activate workflow'}
                      >
                        {workflow.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                        className="p-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-all"
                        title="Delete workflow"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pages Tab */}
        {activeTab === 'pages' && pages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 mb-5">
              <FileText className="h-12 w-12 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Landing Pages Coming Soon</h3>
            <p className="text-gray-500 max-w-md mb-6">
              Create high-converting landing pages, forms, surveys, and booking pages — all connected to your CRM so every lead is captured automatically.
            </p>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> In development
            </span>
          </div>
        )}
        {activeTab === 'pages' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {pages.map((page) => {
              const typeInfo = getPageTypeInfo(page.type);
              const TypeIcon = typeInfo.icon;

              return (
                <div
                  key={page.id}
                  className="glass-effect rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-xl transition-all group overflow-hidden"
                >
                  {/* Thumbnail */}
                  <div className="h-40 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 relative overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <TypeIcon className={`h-16 w-16 ${typeInfo.color} opacity-20`} />
                    </div>
                    <div className="absolute top-3 right-3 flex gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm ${getStatusBadge(page.status)}`}>
                        {page.status}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-sm text-xs font-semibold ${typeInfo.color}`}>
                        <TypeIcon className="h-3.5 w-3.5" />
                        {typeInfo.label}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    {/* Page Info */}
                    <div className="mb-4">
                      <h3 className="font-semibold text-gray-900 mb-1">{page.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Link2 className="h-3 w-3" />
                        <span className="truncate">{page.url}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Eye className="h-3.5 w-3.5 text-gray-600" />
                        </div>
                        <p className="text-lg font-bold text-gray-900">{page.views.toLocaleString()}</p>
                        <p className="text-xs text-gray-600">Views</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                        </div>
                        <p className="text-lg font-bold text-gray-900">{page.conversions}</p>
                        <p className="text-xs text-gray-600">Converts</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <p className="text-lg font-bold text-blue-600">{page.conversionRate}%</p>
                        <p className="text-xs text-gray-600">Rate</p>
                      </div>
                    </div>

                    {/* Automations */}
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-indigo-600" />
                        Automation Flows:
                      </p>
                      <div className="space-y-1.5">
                        {page.automations.map((automation, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                            <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            <span>{automation}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                      <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-semibold">
                        <Edit className="h-4 w-4" />
                        Edit Page
                      </button>
                      <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all" title="View page">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all" title="Copy link">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <div
                  key={template.id}
                  className="glass-effect rounded-xl p-6 border border-gray-200 hover:border-indigo-300 hover:shadow-xl transition-all group cursor-pointer"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${template.color}`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                      <p className="text-xs text-gray-500 mb-2">{template.category}</p>
                      <p className="text-sm text-gray-600">{template.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Users className="h-3.5 w-3.5" />
                      <span>{template.uses.toLocaleString()} uses</span>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-semibold">
                      Use Template
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Workflow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-3xl glass-effect rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-sm z-10 rounded-t-2xl">
              <h2 className="text-2xl font-bold text-gray-900">
                {editingWorkflowId ? 'Edit Workflow' : 'Create New Workflow'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingWorkflowId(null);
                  setWorkflowName('');
                  setWorkflowDescription('');
                  setTriggerType('contact.created');
                  setActions([{ id: '1', type: 'send_email', config: {} }]);
                }}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Workflow Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Workflow Name *
                </label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="e.g., New Lead Welcome Sequence"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Describe what this workflow does..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                />
              </div>

              {/* Trigger */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Trigger *
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                >
                  <option value="contact.created">New Contact Created</option>
                  <option value="contact.updated">Contact Updated</option>
                  <option value="deal.created">New Deal Created</option>
                  <option value="deal.updated">Deal Updated</option>
                  <option value="deal.won">Deal Won</option>
                  <option value="deal.lost">Deal Lost</option>
                  <option value="task.created">Task Created</option>
                  <option value="task.completed">Task Completed</option>
                  <option value="form.submitted">Form Submitted</option>
                  <option value="email.received">Email Received</option>
                  <option value="webhook">Webhook</option>
                  <option value="schedule">Scheduled (Cron)</option>
                </select>
              </div>

              {/* Actions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Actions
                </label>
                <div className="space-y-3">
                  {actions.map((action, index) => (
                    <div key={action.id} className="flex items-center gap-3">
                      <div className="flex-1 flex items-center gap-3 p-4 border border-gray-300 rounded-xl bg-gray-50">
                        <span className="text-sm font-semibold text-gray-600">#{index + 1}</span>
                        <select
                          value={action.type}
                          onChange={(e) => updateActionType(action.id, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          <option value="send_email">Send Email</option>
                          <option value="send_sms">Send SMS</option>
                          <option value="create_task">Create Task</option>
                          <option value="create_deal">Create Deal</option>
                          <option value="update_contact">Update Contact</option>
                          <option value="add_tag">Add Tag</option>
                          <option value="send_webhook">Send Webhook</option>
                          <option value="wait">Wait/Delay</option>
                          <option value="ai_agent">AI Agent</option>
                          <option value="create_invoice">Create Invoice</option>
                        </select>
                      </div>
                      {actions.length > 1 && (
                        <button
                          onClick={() => removeAction(action.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={addAction}
                  className="mt-3 flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all text-sm font-semibold text-gray-600 hover:text-emerald-600 w-full justify-center"
                >
                  <Plus className="h-4 w-4" />
                  Add Action
                </button>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWorkflow}
                  disabled={loading || !workflowName.trim()}
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {editingWorkflowId ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      {editingWorkflowId ? 'Update Workflow' : 'Create Workflow'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
