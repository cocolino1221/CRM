'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/ui/StatCard';
import {
  Users, Building2, Briefcase, TrendingUp, ArrowRight, Loader2,
  CheckCircle2, Clock, AlertCircle, Sparkles, Target, Calendar,
  Activity, Bell, Star, Zap
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

interface DashboardData {
  contacts: { total: number };
  deals: { total: number; open: number; closed: number; totalValue: number };
  companies: { total: number };
  tasks: { total: number; open: number; completed: number };
}

interface RecentActivity {
  id: string;
  type: 'contact_created' | 'deal_won' | 'deal_lost' | 'task_completed';
  title: string;
  description: string;
  timestamp: string;
  icon: string;
}

interface AIInsight {
  id: string;
  type: 'hot_lead' | 'stale_deal' | 'task_overdue' | 'recommendation';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionLabel?: string;
  actionUrl?: string;
}

interface LeadScoreDistribution {
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeF: number;
  total: number;
  avgScore: number;
}

interface CurrentUser {
  id: string;
  firstName: string;
  lastName: string;
}

interface MyLead {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  leadScore: number;
  status: string;
}

interface MyTask {
  id: string;
  title: string;
  dueDate: string;
  priority: string;
  status: string;
  contact?: { firstName: string; lastName: string } | null;
}

interface MyDeal {
  id: string;
  title: string;
  value: number;
  stage: string;
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [aiInsights, setAIInsights] = useState<AIInsight[]>([]);
  const [leadDistribution, setLeadDistribution] = useState<LeadScoreDistribution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myLeads, setMyLeads] = useState<MyLead[]>([]);
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [myDeals, setMyDeals] = useState<MyDeal[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [dashboardRes, activitiesRes, insightsRes, distributionRes] = await Promise.allSettled([
          api.get<DashboardData>('/analytics/dashboard'),
          api.get<RecentActivity[]>('/activities?limit=5'),
          generateAIInsights(),
          api.get<LeadScoreDistribution>('/ai/lead-score/distribution'),
        ]);

        if (dashboardRes.status === 'fulfilled') {
          setDashboardData(dashboardRes.value.data);
        }

        if (activitiesRes.status === 'fulfilled') {
          setRecentActivities(activitiesRes.value.data);
        }

        if (insightsRes.status === 'fulfilled') {
          setAIInsights(insightsRes.value);
        }

        if (distributionRes.status === 'fulfilled') {
          setLeadDistribution(distributionRes.value.data);
        }

        try {
          const meRes = await api.get<CurrentUser>('/auth/me');
          const userId = meRes.data.id;

          const today = new Date();
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
          const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

          const [leadsRes, tasksRes, dealsRes] = await Promise.allSettled([
            api.get<any>(`/contacts?ownerId=${userId}&limit=8&sortBy=createdAt&sortOrder=DESC`),
            api.get<any>(`/tasks?assigneeId=${userId}&dueDateFrom=${encodeURIComponent(todayStart)}&dueDateTo=${encodeURIComponent(todayEnd)}&limit=10`),
            api.get<any>(`/deals?ownerId=${userId}&limit=12`),
          ]);

          if (leadsRes.status === 'fulfilled') {
            const raw = leadsRes.value.data;
            const arr: MyLead[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.contacts ?? []);
            setMyLeads(arr.slice(0, 8));
          }

          if (tasksRes.status === 'fulfilled') {
            const raw = tasksRes.value.data;
            const arr: MyTask[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.tasks ?? []);
            setMyTasks(arr.slice(0, 10));
          }

          if (dealsRes.status === 'fulfilled') {
            const raw = dealsRes.value.data;
            const arr: MyDeal[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.deals ?? []);
            setMyDeals(arr.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost').slice(0, 8));
          }
        } catch {
          // my-work data is non-critical; dashboard still renders without it
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();

    // Refresh data every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const generateAIInsights = async (): Promise<AIInsight[]> => {
    // Generate mock AI insights based on data patterns
    const insights: AIInsight[] = [
      {
        id: '1',
        type: 'hot_lead',
        title: 'Hot Leads Detected',
        description: 'You have 3 leads with scores above 80. Take action within 24 hours!',
        priority: 'high',
        actionLabel: 'View Hot Leads',
        actionUrl: '/contacts?filter=hot',
      },
      {
        id: '2',
        type: 'stale_deal',
        title: 'Stale Deals Alert',
        description: '5 deals haven\'t been updated in 7+ days. Re-engage to prevent loss.',
        priority: 'medium',
        actionLabel: 'View Deals',
        actionUrl: '/leads?filter=stale',
      },
      {
        id: '3',
        type: 'recommendation',
        title: 'Workflow Recommendation',
        description: 'Enable "Lead Nurture Sequence" workflow to automate follow-ups.',
        priority: 'low',
        actionLabel: 'Browse Templates',
        actionUrl: '/automation',
      },
    ];
    return insights;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 font-semibold">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Contacts',
      value: dashboardData.contacts.total.toLocaleString(),
      icon: Users,
      gradientFrom: 'from-blue-500',
      gradientTo: 'to-cyan-500',
      href: '/contacts',
    },
    {
      title: 'Active Deals',
      value: dashboardData.deals.open.toLocaleString(),
      icon: Briefcase,
      gradientFrom: 'from-emerald-500',
      gradientTo: 'to-teal-500',
      href: '/leads',
    },
    {
      title: 'Companies',
      value: dashboardData.companies.total.toLocaleString(),
      icon: Building2,
      gradientFrom: 'from-purple-500',
      gradientTo: 'to-pink-500',
      href: '/companies',
    },
    {
      title: 'Total Deal Value',
      value: formatCurrency(dashboardData.deals.totalValue),
      icon: TrendingUp,
      gradientFrom: 'from-orange-500',
      gradientTo: 'to-red-500',
      href: '/leads',
    },
  ];


  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="mt-2 text-gray-600">
          Welcome back! Here's what's happening with your CRM today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* My Work Today */}
      {(myLeads.length > 0 || myTasks.length > 0 || myDeals.length > 0) && (
        <div className="glass-effect rounded-2xl p-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-5">
            <Zap className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">My Work Today</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* My Leads */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">My Leads</span>
                <a href="/leads" className="text-xs text-indigo-600 hover:underline">View all</a>
              </div>
              {myLeads.length === 0 ? (
                <p className="text-sm text-gray-400">No leads assigned</p>
              ) : (
                <div className="space-y-2">
                  {myLeads.map(lead => (
                    <a
                      key={lead.id}
                      href="/leads"
                      className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {lead.firstName} {lead.lastName}
                        </p>
                        {lead.phone && (
                          <p className="text-xs text-gray-500 truncate">{lead.phone}</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 ml-2">
                        <span className={`inline-flex w-8 h-8 rounded-full text-xs font-bold items-center justify-center ${
                          lead.leadScore >= 80 ? 'bg-green-100 text-green-700' :
                          lead.leadScore >= 60 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {lead.leadScore}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Tasks Due Today */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">Tasks Due Today</span>
                <a href="/tasks" className="text-xs text-indigo-600 hover:underline">View all</a>
              </div>
              {myTasks.length === 0 ? (
                <p className="text-sm text-gray-400">No tasks due today</p>
              ) : (
                <div className="space-y-2">
                  {myTasks.map(task => (
                    <div key={task.id} className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
                      <CheckCircle2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                        task.status === 'completed' ? 'text-green-500' : 'text-gray-300'
                      }`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                        {task.contact && (
                          <p className="text-xs text-gray-500 truncate">
                            {task.contact.firstName} {task.contact.lastName}
                          </p>
                        )}
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        task.priority === 'high' ? 'bg-red-100 text-red-700' :
                        task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Open Deals */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">My Open Deals</span>
                <a href="/pipeline" className="text-xs text-indigo-600 hover:underline">View all</a>
              </div>
              {myDeals.length === 0 ? (
                <p className="text-sm text-gray-400">No open deals</p>
              ) : (
                <div className="space-y-2">
                  {myDeals.map(deal => (
                    <a
                      key={deal.id}
                      href="/pipeline"
                      className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                        <p className="text-xs text-gray-500 capitalize">{deal.stage.replace(/_/g, ' ')}</p>
                      </div>
                      <span className="flex-shrink-0 ml-2 text-sm font-bold text-indigo-600">
                        ${Number(deal.value).toLocaleString()}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* AI Insights Section */}
      {aiInsights.length > 0 && (
        <div className="glass-effect rounded-2xl p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">AI Insights</h2>
            </div>
            <span className="text-xs text-gray-500">Powered by AI</span>
          </div>
          <div className="space-y-3">
            {aiInsights.map((insight) => (
              <div
                key={insight.id}
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  insight.priority === 'high'
                    ? 'bg-red-50 border-red-200'
                    : insight.priority === 'medium'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-blue-50 border-blue-200'
                }`}
              >
                <div className="mt-0.5">
                  {insight.type === 'hot_lead' && <Star className="h-5 w-5 text-red-600" />}
                  {insight.type === 'stale_deal' && <AlertCircle className="h-5 w-5 text-yellow-600" />}
                  {insight.type === 'recommendation' && <Zap className="h-5 w-5 text-blue-600" />}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{insight.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{insight.description}</p>
                  {insight.actionLabel && (
                    <a
                      href={insight.actionUrl}
                      className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-2"
                    >
                      {insight.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <div className="glass-effect rounded-2xl p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            </div>
            <a
              href="/activities"
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View All
            </a>
          </div>
          {recentActivities.length > 0 ? (
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className="mt-1">
                    {activity.type === 'contact_created' && (
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Users className="h-4 w-4 text-blue-600" />
                      </div>
                    )}
                    {activity.type === 'deal_won' && (
                      <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                    )}
                    {activity.type === 'deal_lost' && (
                      <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      </div>
                    )}
                    {activity.type === 'task_completed' && (
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <CheckCircle2 className="h-4 w-4 text-purple-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                    <p className="text-sm text-gray-500 truncate">{activity.description}</p>
                    <p className="text-xs text-gray-400 mt-1">{activity.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No recent activities</p>
          )}
        </div>

        {/* Lead Score Distribution */}
        {leadDistribution && (
          <div className="glass-effect rounded-2xl p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-gray-900">Lead Score Distribution</h2>
              </div>
              <a
                href="/contacts"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Score All Leads
              </a>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Average Score</span>
                <span className="text-2xl font-bold text-indigo-600">
                  {(leadDistribution.avgScore ?? 0).toFixed(1)}
                </span>
              </div>
              <div className="space-y-2">
                {[
                  { grade: 'A (85-100)', count: leadDistribution.gradeA ?? 0, color: 'bg-green-500' },
                  { grade: 'B (70-84)', count: leadDistribution.gradeB ?? 0, color: 'bg-blue-500' },
                  { grade: 'C (50-69)', count: leadDistribution.gradeC ?? 0, color: 'bg-yellow-500' },
                  { grade: 'D (30-49)', count: leadDistribution.gradeD ?? 0, color: 'bg-orange-500' },
                  { grade: 'F (<30)', count: leadDistribution.gradeF ?? 0, color: 'bg-red-500' },
                ].map((item) => (
                  <div key={item.grade} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">Grade {item.grade}</span>
                      <span className="font-medium text-gray-900">{item.count}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} transition-all duration-500`}
                        style={{
                          width: `${leadDistribution.total > 0 ? (item.count / leadDistribution.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="glass-effect rounded-2xl p-6 animate-slide-up">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: 'Add Contact',
              href: '/contacts?action=new',
              icon: Users,
              gradient: 'from-blue-500 to-cyan-500',
            },
            {
              label: 'Create Deal',
              href: '/leads?action=new',
              icon: Briefcase,
              gradient: 'from-emerald-500 to-teal-500',
            },
            {
              label: 'Schedule Task',
              href: '/tasks?action=new',
              icon: Calendar,
              gradient: 'from-purple-500 to-pink-500',
            },
            {
              label: 'View Analytics',
              href: '/analytics',
              icon: TrendingUp,
              gradient: 'from-orange-500 to-red-500',
            },
          ].map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-white to-gray-50 border border-gray-200 hover:shadow-md transition-all duration-200 group"
            >
              <div
                className={`h-10 w-10 rounded-lg bg-gradient-to-br ${action.gradient} flex items-center justify-center`}
              >
                <action.icon className="h-5 w-5 text-white" />
              </div>
              <span className="font-medium text-gray-900 group-hover:text-indigo-600">
                {action.label}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}