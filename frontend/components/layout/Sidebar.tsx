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
  ScrollText,
  Mail,
  CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authService, User } from '@/lib/auth';
import { hasChannelAccess } from '@/lib/channel-access';
import {
  DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY,
  fetchWorkspaceChannelAvailability,
} from '@/lib/workspace-channel-availability';

type NavigationItem = {
  name: string;
  href: string;
  icon: typeof MessageSquare;
  color: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  matchPaths?: string[];
};

const allNavigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
  { name: 'Calendar', href: '/calendar', icon: Calendar, color: 'from-cyan-500 to-teal-500' },
  { name: 'Forms', href: '/forms', icon: FileText, color: 'from-emerald-500 to-green-500' },
  { name: 'Team', href: '/users', icon: Shield, color: 'from-teal-500 to-cyan-500' },
  { name: 'Tasks', href: '/tasks', icon: CheckSquare, color: 'from-yellow-500 to-orange-500' },
  { name: 'Automation', href: '/automation', icon: Bot, color: 'from-violet-500 to-fuchsia-500' },
  { name: 'Documents', href: '/documents', icon: FolderOpen, color: 'from-amber-500 to-orange-500' },
  { name: 'Payments', href: '/payments', icon: CreditCard, color: 'from-emerald-500 to-teal-500' },
  { name: 'Campaigns', href: '/email-campaigns', icon: Mail, color: 'from-sky-500 to-indigo-500' },
  { name: 'Integrations', href: '/integrations', icon: Zap, color: 'from-pink-500 to-rose-500' },
  { name: 'Settings', href: '/settings', icon: Settings, color: 'from-slate-500 to-gray-500' },
  { name: 'Admin', href: '/admin', icon: Shield, color: 'from-red-500 to-rose-600', superAdminOnly: true },
] ;

const messageNavigation: NavigationItem[] = [
  { name: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, color: 'from-green-500 to-emerald-500' },
  {
    name: 'Social',
    href: '/messages',
    matchPaths: ['/messages', '/meta-inbox'],
    icon: MessageSquare,
    color: 'from-sky-500 to-indigo-500',
  },
] ;

const leadNavigation: NavigationItem[] = [
  { name: 'Contacts', href: '/contacts', icon: Users, color: 'from-purple-500 to-pink-500' },
  { name: 'Leads', href: '/leads', icon: Briefcase, color: 'from-green-500 to-emerald-500' },
  { name: 'Pipeline', href: '/pipeline', icon: KanbanSquare, color: 'from-sky-500 to-blue-500' },
  { name: 'Companies', href: '/companies', icon: Building2, color: 'from-orange-500 to-red-500', adminOnly: true },
] ;

const insightNavigation: NavigationItem[] = [
  { name: 'Analytics', href: '/analytics', icon: BarChart3, color: 'from-indigo-500 to-purple-500' },
  { name: 'Logs', href: '/logs', icon: ScrollText, color: 'from-rose-500 to-pink-500', adminOnly: true },
] ;

const documentsNavigation: NavigationItem[] = [
  { name: 'Documents', href: '/documents', icon: FolderOpen, color: 'from-amber-500 to-orange-500' },
  { name: 'Payments', href: '/payments', icon: CreditCard, color: 'from-emerald-500 to-teal-500' },
] ;

const campaignsNavigation: NavigationItem[] = [
  { name: 'Campaigns', href: '/email-campaigns', icon: Mail, color: 'from-sky-500 to-indigo-500' },
  { name: 'Automation', href: '/automation', icon: Bot, color: 'from-violet-500 to-fuchsia-500' },
  { name: 'Forms', href: '/forms', icon: FileText, color: 'from-emerald-500 to-green-500' },
] ;

const teamNavigation: NavigationItem[] = [
  { name: 'Team', href: '/users', icon: Shield, color: 'from-teal-500 to-cyan-500' },
  { name: 'Settings', href: '/settings', icon: Settings, color: 'from-slate-500 to-gray-500' },
  { name: 'Integrations', href: '/integrations', icon: Zap, color: 'from-pink-500 to-rose-500' },
  { name: 'Admin', href: '/admin', icon: Shield, color: 'from-red-500 to-rose-600', superAdminOnly: true },
] ;

const groupedNavigationHrefs = new Set([
  '/contacts',
  '/leads',
  '/pipeline',
  '/companies',
  '/analytics',
  '/logs',
  '/documents',
  '/payments',
  '/email-campaigns',
  '/automation',
  '/forms',
  '/users',
  '/settings',
  '/integrations',
  '/admin',
]);

function canViewNavigationItem(item: NavigationItem, role: string) {
  if (item.superAdminOnly) {
    return role === 'super_admin';
  }

  if (item.adminOnly) {
    return role === 'admin' || role === 'super_admin';
  }

  return true;
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ isOpen = true, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [channelAvailability, setChannelAvailability] = useState(DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY);
  const [isMessagesOpen, setIsMessagesOpen] = useState(
    pathname.startsWith('/messages') || pathname.startsWith('/meta-inbox') || pathname.startsWith('/whatsapp'),
  );
  const [isLeadsOpen, setIsLeadsOpen] = useState(
    pathname.startsWith('/contacts') || pathname.startsWith('/leads') || pathname.startsWith('/pipeline') || pathname.startsWith('/companies'),
  );
  const [isInsightsOpen, setIsInsightsOpen] = useState(
    pathname.startsWith('/analytics') || pathname.startsWith('/logs'),
  );
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(
    pathname.startsWith('/documents') || pathname.startsWith('/payments'),
  );
  const [isCampaignsOpen, setIsCampaignsOpen] = useState(
    pathname.startsWith('/email-campaigns') || pathname.startsWith('/automation') || pathname.startsWith('/forms'),
  );
  const [isTeamOpen, setIsTeamOpen] = useState(
    pathname.startsWith('/users') || pathname.startsWith('/settings') || pathname.startsWith('/integrations') || pathname.startsWith('/admin'),
  );

  useEffect(() => {
    void authService
      .getCurrentUser()
      .catch(() => authService.getUser())
      .then((user) => {
        setUserRole(user?.role || '');
        setCurrentUser(user);
      });
  }, []);

  useEffect(() => {
    let mounted = true;

    void fetchWorkspaceChannelAvailability()
      .then((availability) => {
        if (mounted) {
          setChannelAvailability(availability);
        }
      })
      .catch(() => {
        if (mounted) {
          setChannelAvailability(DEFAULT_WORKSPACE_CHANNEL_AVAILABILITY);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (pathname.startsWith('/messages') || pathname.startsWith('/meta-inbox') || pathname.startsWith('/whatsapp')) {
      setIsMessagesOpen(true);
    }
    if (pathname.startsWith('/contacts') || pathname.startsWith('/leads') || pathname.startsWith('/pipeline') || pathname.startsWith('/companies')) {
      setIsLeadsOpen(true);
    }
    if (pathname.startsWith('/analytics') || pathname.startsWith('/logs')) {
      setIsInsightsOpen(true);
    }
    if (pathname.startsWith('/documents') || pathname.startsWith('/payments')) {
      setIsDocumentsOpen(true);
    }
    if (pathname.startsWith('/email-campaigns') || pathname.startsWith('/automation') || pathname.startsWith('/forms')) {
      setIsCampaignsOpen(true);
    }
    if (pathname.startsWith('/users') || pathname.startsWith('/settings') || pathname.startsWith('/integrations') || pathname.startsWith('/admin')) {
      setIsTeamOpen(true);
    }
  }, [pathname]);

  const canOpenWhatsApp = hasChannelAccess(currentUser, 'whatsapp');
  const canOpenSocialMessages = hasChannelAccess(currentUser, 'messenger') || hasChannelAccess(currentUser, 'instagram');
  const showMessagesGroup = canOpenWhatsApp || canOpenSocialMessages;
  const messageItems = messageNavigation.filter((item) => {
    if (item.href === '/whatsapp') {
      return canOpenWhatsApp;
    }

    return canOpenSocialMessages;
  });
  const messagesGroupIsActive = pathname.startsWith('/messages') || pathname.startsWith('/meta-inbox') || pathname.startsWith('/whatsapp');
  const collapsedMessagesHref = canOpenSocialMessages ? '/messages' : '/whatsapp';
  const hasLiveMessageChannels =
    channelAvailability.whatsapp || channelAvailability.messenger || channelAvailability.instagram;
  const leadItems = leadNavigation.filter((item) => canViewNavigationItem(item, userRole));
  const showLeadsGroup = leadItems.length > 0;
  const leadsGroupIsActive = leadItems.some(
    (item) => pathname === item.href || Boolean(item.matchPaths?.includes(pathname)),
  );
  const collapsedLeadsHref = leadItems[0]?.href || '/leads';
  const insightItems = insightNavigation.filter((item) => canViewNavigationItem(item, userRole));
  const showInsightsGroup = insightItems.length > 0;
  const insightsGroupIsActive = insightItems.some(
    (item) => pathname === item.href || Boolean(item.matchPaths?.includes(pathname)),
  );
  const collapsedInsightsHref = insightItems[0]?.href || '/analytics';
  const documentItems = documentsNavigation.filter((item) => canViewNavigationItem(item, userRole));
  const showDocumentsGroup = documentItems.length > 0;
  const documentsGroupIsActive = documentItems.some(
    (item) => pathname === item.href || Boolean(item.matchPaths?.includes(pathname)),
  );
  const collapsedDocumentsHref = documentItems[0]?.href || '/documents';
  const campaignItems = campaignsNavigation.filter((item) => canViewNavigationItem(item, userRole));
  const showCampaignsGroup = campaignItems.length > 0;
  const campaignsGroupIsActive = campaignItems.some(
    (item) => pathname === item.href || Boolean(item.matchPaths?.includes(pathname)),
  );
  const collapsedCampaignsHref = campaignItems[0]?.href || '/email-campaigns';
  const teamItems = teamNavigation.filter((item) => canViewNavigationItem(item, userRole));
  const showTeamGroup = teamItems.length > 0;
  const teamGroupIsActive = teamItems.some(
    (item) => pathname === item.href || Boolean(item.matchPaths?.includes(pathname)),
  );
  const collapsedTeamHref = teamItems[0]?.href || '/users';

  // Filter navigation based on user role
  const navigation = allNavigation.filter((item) => canViewNavigationItem(item, userRole) && !groupedNavigationHrefs.has(item.href));
  const topNavigation = navigation.filter((item) => item.href === '/dashboard' || item.href === '/calendar');
  const bottomNavigation = navigation.filter((item) => item.href !== '/dashboard' && item.href !== '/calendar');

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
                  easyTeamCRM
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
          {topNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || Boolean(item.matchPaths?.includes(pathname));

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

          {showMessagesGroup && (
            <>
              {isCollapsed ? (
                <Link
                  href={collapsedMessagesHref}
                  onClick={onClose}
                  title="Messages"
                  className={cn(
                    'group relative flex items-center justify-center rounded-xl px-2 py-3 text-sm font-medium transition-all duration-200',
                    messagesGroupIsActive
                      ? 'text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {messagesGroupIsActive && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 opacity-100"></div>
                      <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                    </>
                  )}
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
                    <MessageSquare className="h-4 w-4" />
                    {hasLiveMessageChannels && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
                    )}
                  </div>
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setIsMessagesOpen((value) => !value)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                      messagesGroupIsActive
                        ? 'text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {messagesGroupIsActive && (
                      <>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 opacity-100"></div>
                        <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                      </>
                    )}
                    <div className="relative flex items-center gap-3 flex-1">
                      <div className={cn(
                        'relative flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                        messagesGroupIsActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                      )}>
                        <MessageSquare className="h-4 w-4" />
                        {hasLiveMessageChannels && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-900" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate">Messages</div>
                        <div className="truncate text-[11px] text-blue-200/80">Social + WhatsApp</div>
                      </div>
                    </div>
                    <ChevronRight className={cn('relative h-4 w-4 shrink-0 transition-transform', isMessagesOpen && 'rotate-90')} />
                  </button>

                  {isMessagesOpen && (
                    <div className="space-y-1 pl-4">
                      {messageItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || Boolean((item as any).matchPaths?.includes(pathname));
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                              isActive
                                ? 'bg-white/12 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white',
                            )}
                          >
                            <div className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-lg transition-all shrink-0',
                              isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10',
                            )}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {showLeadsGroup && (
            <>
              {isCollapsed ? (
                <Link
                  href={collapsedLeadsHref}
                  onClick={onClose}
                  title="Leads"
                  className={cn(
                    'group relative flex items-center justify-center rounded-xl px-2 py-3 text-sm font-medium transition-all duration-200',
                    leadsGroupIsActive
                      ? 'text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {leadsGroupIsActive && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 opacity-100"></div>
                      <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                    </>
                  )}
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
                    <Briefcase className="h-4 w-4" />
                  </div>
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setIsLeadsOpen((value) => !value)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                      leadsGroupIsActive
                        ? 'text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {leadsGroupIsActive && (
                      <>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 opacity-100"></div>
                        <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                      </>
                    )}
                    <div className="relative flex items-center gap-3 flex-1">
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                        leadsGroupIsActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                      )}>
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate">Leads</div>
                        <div className="truncate text-[11px] text-emerald-200/80">Contacts, pipeline, companies</div>
                      </div>
                    </div>
                    <ChevronRight className={cn('relative h-4 w-4 shrink-0 transition-transform', isLeadsOpen && 'rotate-90')} />
                  </button>

                  {isLeadsOpen && (
                    <div className="space-y-1 pl-4">
                      {leadItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || Boolean(item.matchPaths?.includes(pathname));
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                              isActive
                                ? 'bg-white/12 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white',
                            )}
                          >
                            <div className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-lg transition-all shrink-0',
                              isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10',
                            )}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {showInsightsGroup && (
            <>
              {isCollapsed ? (
                <Link
                  href={collapsedInsightsHref}
                  onClick={onClose}
                  title="Analytics"
                  className={cn(
                    'group relative flex items-center justify-center rounded-xl px-2 py-3 text-sm font-medium transition-all duration-200',
                    insightsGroupIsActive
                      ? 'text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {insightsGroupIsActive && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 opacity-100"></div>
                      <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                    </>
                  )}
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setIsInsightsOpen((value) => !value)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                      insightsGroupIsActive
                        ? 'text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {insightsGroupIsActive && (
                      <>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 opacity-100"></div>
                        <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                      </>
                    )}
                    <div className="relative flex items-center gap-3 flex-1">
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                        insightsGroupIsActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                      )}>
                        <BarChart3 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate">Analytics</div>
                        <div className="truncate text-[11px] text-indigo-200/80">Reports + logs</div>
                      </div>
                    </div>
                    <ChevronRight className={cn('relative h-4 w-4 shrink-0 transition-transform', isInsightsOpen && 'rotate-90')} />
                  </button>

                  {isInsightsOpen && (
                    <div className="space-y-1 pl-4">
                      {insightItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || Boolean(item.matchPaths?.includes(pathname));
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                              isActive
                                ? 'bg-white/12 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white',
                            )}
                          >
                            <div className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-lg transition-all shrink-0',
                              isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10',
                            )}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {showDocumentsGroup && (
            <>
              {isCollapsed ? (
                <Link
                  href={collapsedDocumentsHref}
                  onClick={onClose}
                  title="Documents"
                  className={cn(
                    'group relative flex items-center justify-center rounded-xl px-2 py-3 text-sm font-medium transition-all duration-200',
                    documentsGroupIsActive
                      ? 'text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {documentsGroupIsActive && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 opacity-100"></div>
                      <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                    </>
                  )}
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
                    <FolderOpen className="h-4 w-4" />
                  </div>
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setIsDocumentsOpen((value) => !value)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                      documentsGroupIsActive
                        ? 'text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {documentsGroupIsActive && (
                      <>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 opacity-100"></div>
                        <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                      </>
                    )}
                    <div className="relative flex items-center gap-3 flex-1">
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                        documentsGroupIsActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                      )}>
                        <FolderOpen className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate">Documents</div>
                        <div className="truncate text-[11px] text-amber-200/80">Documents + payments</div>
                      </div>
                    </div>
                    <ChevronRight className={cn('relative h-4 w-4 shrink-0 transition-transform', isDocumentsOpen && 'rotate-90')} />
                  </button>

                  {isDocumentsOpen && (
                    <div className="space-y-1 pl-4">
                      {documentItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || Boolean(item.matchPaths?.includes(pathname));
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                              isActive
                                ? 'bg-white/12 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white',
                            )}
                          >
                            <div className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-lg transition-all shrink-0',
                              isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10',
                            )}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {showCampaignsGroup && (
            <>
              {isCollapsed ? (
                <Link
                  href={collapsedCampaignsHref}
                  onClick={onClose}
                  title="Campaigns"
                  className={cn(
                    'group relative flex items-center justify-center rounded-xl px-2 py-3 text-sm font-medium transition-all duration-200',
                    campaignsGroupIsActive
                      ? 'text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {campaignsGroupIsActive && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 opacity-100"></div>
                      <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                    </>
                  )}
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
                    <Mail className="h-4 w-4" />
                  </div>
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setIsCampaignsOpen((value) => !value)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                      campaignsGroupIsActive
                        ? 'text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {campaignsGroupIsActive && (
                      <>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 opacity-100"></div>
                        <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                      </>
                    )}
                    <div className="relative flex items-center gap-3 flex-1">
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                        campaignsGroupIsActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                      )}>
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate">Campaigns</div>
                        <div className="truncate text-[11px] text-sky-200/80">Campaigns, automations, forms</div>
                      </div>
                    </div>
                    <ChevronRight className={cn('relative h-4 w-4 shrink-0 transition-transform', isCampaignsOpen && 'rotate-90')} />
                  </button>

                  {isCampaignsOpen && (
                    <div className="space-y-1 pl-4">
                      {campaignItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || Boolean(item.matchPaths?.includes(pathname));
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                              isActive
                                ? 'bg-white/12 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white',
                            )}
                          >
                            <div className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-lg transition-all shrink-0',
                              isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10',
                            )}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {showTeamGroup && (
            <>
              {isCollapsed ? (
                <Link
                  href={collapsedTeamHref}
                  onClick={onClose}
                  title="Team"
                  className={cn(
                    'group relative flex items-center justify-center rounded-xl px-2 py-3 text-sm font-medium transition-all duration-200',
                    teamGroupIsActive
                      ? 'text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {teamGroupIsActive && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 opacity-100"></div>
                      <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                    </>
                  )}
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 group-hover:bg-white/10">
                    <Shield className="h-4 w-4" />
                  </div>
                </Link>
              ) : (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setIsTeamOpen((value) => !value)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200',
                      teamGroupIsActive
                        ? 'text-white shadow-lg'
                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                    )}
                  >
                    {teamGroupIsActive && (
                      <>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 opacity-100"></div>
                        <div className="absolute inset-0 rounded-xl bg-white/10 backdrop-blur-sm"></div>
                      </>
                    )}
                    <div className="relative flex items-center gap-3 flex-1">
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg transition-all shrink-0',
                        teamGroupIsActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'
                      )}>
                        <Shield className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="truncate">Team</div>
                        <div className="truncate text-[11px] text-cyan-200/80">Users, settings, admin, integrations</div>
                      </div>
                    </div>
                    <ChevronRight className={cn('relative h-4 w-4 shrink-0 transition-transform', isTeamOpen && 'rotate-90')} />
                  </button>

                  {isTeamOpen && (
                    <div className="space-y-1 pl-4">
                      {teamItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || Boolean(item.matchPaths?.includes(pathname));
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={onClose}
                            className={cn(
                              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                              isActive
                                ? 'bg-white/12 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white',
                            )}
                          >
                            <div className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-lg transition-all shrink-0',
                              isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10',
                            )}>
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {bottomNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || Boolean(item.matchPaths?.includes(pathname));

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
