'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, Users, Target, PhoneCall, XCircle, DollarSign, BarChart3 } from 'lucide-react';
import api from '@/lib/api';

interface AnalyticsOverview {
  total: number;
  byStatus: {
    lead: number;
    prospect: number;
    qualified: number;
    customer: number;
  };
  bySource: Record<string, number>;
  averageLeadScore: number;
  highTicketLeads: number;
  lowTicketLeads: number;
  followUpNeeded: number;
  lostLeads: number;
  conversionRate: number;
  recentlyAdded: number;
}

interface TagAnalytics {
  tag: string;
  count: number;
  percentage: number;
  averageLeadScore: number;
}

interface ConversionFunnel {
  stage: string;
  count: number;
  percentage: number;
  conversionRate: number;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [tagAnalytics, setTagAnalytics] = useState<TagAnalytics[]>([]);
  const [conversionFunnel, setConversionFunnel] = useState<ConversionFunnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      const [overviewRes, tagsRes, funnelRes] = await Promise.all([
        api.get<AnalyticsOverview>('/contacts/analytics/overview'),
        api.get<TagAnalytics[]>('/contacts/analytics/by-tags'),
        api.get<ConversionFunnel[]>('/contacts/analytics/conversion-funnel'),
      ]);

      setOverview(overviewRes.data);
      setTagAnalytics(tagsRes.data);
      setConversionFunnel(funnelRes.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-600 font-semibold">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Leads',
      value: overview.total.toLocaleString(),
      icon: Users,
      color: 'from-blue-500 to-cyan-500',
      textColor: 'text-blue-600',
    },
    {
      title: 'High-Ticket Leads',
      value: overview.highTicketLeads.toLocaleString(),
      icon: DollarSign,
      color: 'from-green-500 to-emerald-500',
      textColor: 'text-green-600',
    },
    {
      title: 'Low-Ticket Leads',
      value: overview.lowTicketLeads.toLocaleString(),
      icon: Target,
      color: 'from-purple-500 to-pink-500',
      textColor: 'text-purple-600',
    },
    {
      title: 'Follow-Up Needed',
      value: overview.followUpNeeded.toLocaleString(),
      icon: PhoneCall,
      color: 'from-orange-500 to-red-500',
      textColor: 'text-orange-600',
    },
    {
      title: 'Lost Leads',
      value: overview.lostLeads.toLocaleString(),
      icon: XCircle,
      color: 'from-red-500 to-pink-500',
      textColor: 'text-red-600',
    },
    {
      title: 'Conversion Rate',
      value: `${overview.conversionRate}%`,
      icon: TrendingUp,
      color: 'from-indigo-500 to-blue-500',
      textColor: 'text-indigo-600',
    },
    {
      title: 'Avg Lead Score',
      value: `${overview.averageLeadScore}/100`,
      icon: BarChart3,
      color: 'from-yellow-500 to-orange-500',
      textColor: 'text-yellow-600',
    },
    {
      title: 'Recently Added',
      value: overview.recentlyAdded.toLocaleString(),
      icon: Users,
      color: 'from-teal-500 to-cyan-500',
      textColor: 'text-teal-600',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
          Analytics Dashboard
        </h1>
        <p className="mt-2 text-gray-600">
          Track your lead performance, conversions, and pipeline health
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`rounded-xl bg-gradient-to-br ${stat.color} p-3`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Lead Status Distribution</h2>
          <div className="space-y-4">
            {Object.entries(overview.byStatus).map(([status, count]) => {
              const percentage = overview.total > 0 ? ((count / overview.total) * 100).toFixed(1) : 0;
              const statusColors: Record<string, string> = {
                lead: 'bg-gray-500',
                prospect: 'bg-blue-500',
                qualified: 'bg-green-500',
                customer: 'bg-purple-500',
              };

              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 capitalize">{status}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`${statusColors[status]} h-3 rounded-full transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Lead Sources</h2>
          <div className="space-y-4">
            {Object.entries(overview.bySource).map(([source, count]) => {
              const percentage = overview.total > 0 ? ((count / overview.total) * 100).toFixed(1) : 0;

              return (
                <div key={source}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 capitalize">{source}</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-indigo-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tag Analytics */}
      {tagAnalytics.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Tag Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Tag</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Count</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Percentage</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {tagAnalytics.map((tag) => (
                  <tr key={tag.tag} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-700">
                        {tag.tag}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-900">{tag.count}</td>
                    <td className="py-3 px-4 text-right text-sm text-gray-900">{tag.percentage.toFixed(1)}%</td>
                    <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900">
                      {tag.averageLeadScore.toFixed(0)}/100
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conversion Funnel */}
      {conversionFunnel.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Conversion Funnel</h2>
          <div className="space-y-4">
            {conversionFunnel.map((stage, index) => (
              <div key={stage.stage}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                      {index + 1}
                    </div>
                    <span className="text-sm font-medium text-gray-700 capitalize">{stage.stage}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-gray-900">{stage.count} leads</span>
                    {index > 0 && (
                      <span className="text-sm text-green-600 font-semibold">
                        {stage.conversionRate.toFixed(1)}% conversion
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${stage.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
