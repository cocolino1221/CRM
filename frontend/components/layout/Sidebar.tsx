'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  CheckSquare,
  BarChart3,
  Settings,
  MessageSquare,
  Zap,
  ChevronRight,
  Sparkles,
  Bot,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authService } from '@/lib/auth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
  { name: 'Calendar', href: '/calendar', icon: Calendar, color: 'from-cyan-500 to-teal-500' },
  { name: 'Contacts', href: '/contacts', icon: Users, color: 'from-purple-500 to-pink-500' },
  { name: 'Companies', href: '/companies', icon: Building2, color: 'from-orange-500 to-red-500' },
  { name: 'Leads', href: '/leads', icon: Briefcase, color: 'from-green-500 to-emerald-500' },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare, color: 'from-yellow-500 to-orange-500' },
  { name: 'Automation', href: '/automation', icon: Bot, color: 'from-violet-500 to-fuchsia-500' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, color: 'from-indigo-500 to-purple-500' },
  { name: 'Integrations', href: '/integrations', icon: Zap, color: 'from-pink-500 to-rose-500' },
  { name: 'Settings', href: '/settings', icon: Settings, color: 'from-slate-500 to-gray-500' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-full w-64 flex-col gradient-sidebar shadow-2xl">
      {/* Logo */}
      <div className="relative overflow-hidden px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20"></div>
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-blue-500/50">
            <MessageSquare className="h-6 w-6 text-white" />
          </div>
          <div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
              SlackCRM
            </span>
            <div className="flex items-center gap-1 text-xs text-blue-300">
              <Sparkles className="h-3 w-3" />
              <span>Premium</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              )}
            >
              {isActive && (
                <>
                  <div className={cn('absolute inset-0 rounded-xl bg-gradient-to-r opacity-100', item.color)}></div>
                  <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                </>
              )}
              <div className="relative flex items-center gap-3 flex-1">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg transition-all',
                  isActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="relative">{item.name}</span>
              </div>
              {isActive && (
                <ChevronRight className="relative h-4 w-4 opacity-70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="relative p-4 m-3 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10">
        <UserProfile />
      </div>
    </div>
  );
}

function UserProfile() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const currentUser = authService.getUser();
    setUser(currentUser);
  }, []);

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-sm font-bold shadow-lg">
          {getInitials(user.firstName, user.lastName)}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-slate-900"></div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-xs text-gray-400 truncate">{user.email}</p>
      </div>
    </div>
  );
}