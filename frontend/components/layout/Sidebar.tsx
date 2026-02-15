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
  MessageCircle,
  Zap,
  ChevronRight,
  Sparkles,
  Bot,
  Calendar,
  Shield,
  FileText,
  Menu,
  X,
  ChevronLeft,
  KanbanSquare,
  FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authService } from '@/lib/auth';

const allNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
  { name: 'Calendar', href: '/calendar', icon: Calendar, color: 'from-cyan-500 to-teal-500' },
  { name: 'Contacts', href: '/contacts', icon: Users, color: 'from-purple-500 to-pink-500' },
  { name: 'Companies', href: '/companies', icon: Building2, color: 'from-orange-500 to-red-500', adminOnly: true },
  { name: 'Leads', href: '/leads', icon: Briefcase, color: 'from-green-500 to-emerald-500' },
  { name: 'Pipeline', href: '/pipeline', icon: KanbanSquare, color: 'from-sky-500 to-blue-500' },
  { name: 'Forms', href: '/forms', icon: FileText, color: 'from-emerald-500 to-green-500' },
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, color: 'from-green-500 to-emerald-500' },
  { name: 'Team', href: '/users', icon: Shield, color: 'from-teal-500 to-cyan-500' },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare, color: 'from-yellow-500 to-orange-500' },
  { name: 'Automation', href: '/automation', icon: Bot, color: 'from-violet-500 to-fuchsia-500' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, color: 'from-indigo-500 to-purple-500' },
  { name: 'Documents', href: '/documents', icon: FolderOpen, color: 'from-amber-500 to-orange-500' },
  { name: 'Integrations', href: '/integrations', icon: Zap, color: 'from-pink-500 to-rose-500' },
  { name: 'Settings', href: '/settings', icon: Settings, color: 'from-slate-500 to-gray-500' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isOpen = true, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    const user = authService.getUser();
    setUserRole(user?.role || '');
  }, []);

  // Filter navigation based on user role
  const navigation = allNavigation.filter(item => {
    if (item.adminOnly) {
      return userRole === 'admin';
    }
    return true;
  });

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "flex h-full flex-col gradient-sidebar shadow-2xl transition-all duration-300 ease-in-out z-50",
        // Desktop: static positioning
        "lg:relative lg:translate-x-0",
        // Mobile: fixed positioning with slide animation
        "fixed lg:static",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        // Width based on collapsed state
        isCollapsed ? "w-20" : "w-64"
      )}>
        {/* Logo */}
        <div className="relative overflow-hidden px-4 py-5">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20"></div>
          <div className={cn(
            "relative flex items-center gap-3",
            isCollapsed && "justify-center"
          )}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-blue-500/50 shrink-0">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <span className="text-xl font-bold bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
                  SlackCRM
                </span>
                <div className="flex items-center gap-1 text-xs text-blue-300">
                  <Sparkles className="h-3 w-3" />
                  <span>Premium</span>
                </div>
              </div>
            )}

            {/* Mobile close button */}
            {onClose && (
              <button
                onClick={onClose}
                className="lg:hidden absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-white/10 text-white"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Collapse toggle - desktop only */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex absolute -right-3 top-20 h-6 w-6 items-center justify-center rounded-full bg-white shadow-md border border-gray-200 hover:bg-gray-50 transition-colors z-10"
          >
            <ChevronLeft className={cn(
              "h-4 w-4 text-gray-600 transition-transform",
              isCollapsed && "rotate-180"
            )} />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto scrollbar-hide">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                title={isCollapsed ? item.name : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'text-white shadow-lg'
                    : 'text-gray-400 hover:text-white hover:bg-white/5',
                  isCollapsed && "justify-center px-2"
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
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                    isActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  {!isCollapsed && (
                    <span className="relative truncate">{item.name}</span>
                  )}
                </div>
                {isActive && !isCollapsed && (
                  <ChevronRight className="relative h-4 w-4 opacity-70 shrink-0" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        {!isCollapsed && (
          <div className="relative p-4 m-3 rounded-xl bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10">
            <UserProfile />
          </div>
        )}

        {isCollapsed && (
          <div className="p-3">
            <UserProfileCollapsed />
          </div>
        )}
      </div>
    </>
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
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-sm font-bold shadow-lg text-white">
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

function UserProfileCollapsed() {
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
    <div className="flex justify-center">
      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-sm font-bold shadow-lg text-white">
          {getInitials(user.firstName, user.lastName)}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-slate-900"></div>
      </div>
    </div>
  );
}

// Export a mobile menu button component
export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden flex items-center justify-center h-10 w-10 rounded-xl bg-white/50 hover:bg-white shadow-sm transition-all"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5 text-gray-700" />
    </button>
  );
}
