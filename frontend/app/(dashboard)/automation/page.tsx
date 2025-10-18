'use client';

import { useState } from 'react';
import { Plus, Bot, Zap, MessageSquare, Sparkles, Settings, Play, Pause, Trash2, Copy, ExternalLink, Search, Filter, Clock, TrendingUp, Users, Mail, Phone, Video, Calendar, CheckCircle, XCircle, Edit, Save, X, Code, Workflow, Brain, MessageCircle, ArrowRight, ChevronRight, Loader2, FileText, Eye, BarChart3, Link2, Palette } from 'lucide-react';
import Image from 'next/image';

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
  const [activeTab, setActiveTab] = useState<TabType>('chatbots');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'chatbot' | 'agent' | 'workflow'>('chatbot');

  const [chatbots] = useState<Chatbot[]>([]);

  const [aiAgents] = useState<AIAgent[]>([]);

  const [workflows] = useState<Workflow[]>([]);

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
              <p className="text-sm text-gray-600">Total Interactions</p>
              <p className="text-2xl font-bold text-gray-900">9.8k</p>
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
                      <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-semibold">
                        <Edit className="h-4 w-4" />
                        Edit
                      </button>
                      <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-all">
                        {workflow.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pages Tab */}
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

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-4xl mx-4 glass-effect rounded-2xl shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-sm z-10 rounded-t-2xl">
              <h2 className="text-2xl font-bold text-gray-900">Create New Automation</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Type Selection */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Choose Type</h3>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    onClick={() => setCreateType('chatbot')}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      createType === 'chatbot'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <MessageSquare className={`h-8 w-8 mx-auto mb-3 ${createType === 'chatbot' ? 'text-blue-600' : 'text-gray-400'}`} />
                    <p className="font-semibold text-gray-900">Chatbot</p>
                    <p className="text-xs text-gray-500 mt-1">Automated conversations</p>
                  </button>

                  <button
                    onClick={() => setCreateType('agent')}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      createType === 'agent'
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Brain className={`h-8 w-8 mx-auto mb-3 ${createType === 'agent' ? 'text-purple-600' : 'text-gray-400'}`} />
                    <p className="font-semibold text-gray-900">AI Agent</p>
                    <p className="text-xs text-gray-500 mt-1">Intelligent assistant</p>
                  </button>

                  <button
                    onClick={() => setCreateType('workflow')}
                    className={`p-6 rounded-xl border-2 transition-all ${
                      createType === 'workflow'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Workflow className={`h-8 w-8 mx-auto mb-3 ${createType === 'workflow' ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <p className="font-semibold text-gray-900">Workflow</p>
                    <p className="text-xs text-gray-500 mt-1">Multi-step automation</p>
                  </button>
                </div>
              </div>

              {/* Platform/Model Selection */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {createType === 'chatbot' && 'Select Platform'}
                  {createType === 'agent' && 'Select AI Model'}
                  {createType === 'workflow' && 'Select Platform'}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {createType === 'chatbot' && (
                    <>
                      {['WhatsApp', 'Facebook', 'Instagram', 'Website'].map((platform) => (
                        <button
                          key={platform}
                          className="p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                        >
                          <p className="font-semibold text-sm">{platform}</p>
                        </button>
                      ))}
                    </>
                  )}
                  {createType === 'agent' && (
                    <>
                      {['GPT-4', 'GPT-3.5', 'Claude', 'Custom'].map((model) => (
                        <button
                          key={model}
                          className="p-4 rounded-xl border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all"
                        >
                          <p className="font-semibold text-sm">{model}</p>
                        </button>
                      ))}
                    </>
                  )}
                  {createType === 'workflow' && (
                    <>
                      {['n8n', 'Zapier', 'Make', 'Custom'].map((platform) => (
                        <button
                          key={platform}
                          className="p-4 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all"
                        >
                          <p className="font-semibold text-sm">{platform}</p>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
