'use client';

import { useEffect, useState } from 'react';
import StatCard from '@/components/ui/StatCard';
import { Users, Building2, Briefcase, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

interface DashboardData {
  contacts: { total: number };
  deals: { total: number; open: number; closed: number; totalValue: number };
  companies: { total: number };
  tasks: { total: number; open: number; completed: number };
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await api.get<DashboardData>('/analytics/dashboard');
        setDashboardData(response.data);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

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
    },
    {
      title: 'Active Deals',
      value: dashboardData.deals.open.toLocaleString(),
      icon: Briefcase,
      gradientFrom: 'from-emerald-500',
      gradientTo: 'to-teal-500',
    },
    {
      title: 'Companies',
      value: dashboardData.companies.total.toLocaleString(),
      icon: Building2,
      gradientFrom: 'from-purple-500',
      gradientTo: 'to-pink-500',
    },
    {
      title: 'Total Deal Value',
      value: formatCurrency(dashboardData.deals.totalValue),
      icon: TrendingUp,
      gradientFrom: 'from-orange-500',
      gradientTo: 'to-red-500',
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

      {/* Welcome Message */}
      <div className="glass-effect rounded-2xl p-8 animate-slide-up text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Your CRM Dashboard</h2>
        <p className="text-gray-600">
          Your contacts, deals, and activities will appear here as you add them to your CRM.
        </p>
      </div>

    </div>
  );
}