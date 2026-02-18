'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { MessageSquare, Users, LayoutDashboard, MoreHorizontal } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import QuickActionsWrapper from '@/components/layout/quick-actions-wrapper';
import { initPushNotifications } from '@/lib/push-notifications';

const mobileNavItems = [
  { href: '/whatsapp', icon: MessageSquare, label: 'WhatsApp' },
  { href: '/contacts', icon: Users, label: 'Contacts' },
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change (resize to large screen)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Close mobile more menu on route change
  useEffect(() => {
    setShowMobileMore(false);
  }, [pathname]);

  // Initialize push notifications on mobile
  useEffect(() => {
    initPushNotifications();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Sidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
        <QuickActionsWrapper />
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <div className="mx-auto max-w-7xl p-4 lg:p-6">{children}</div>
        </main>

        {/* Mobile Bottom Navigation - visible on small screens only */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-around h-14">
            {mobileNavItems.map(item => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link key={item.href} href={item.href}
                  className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                    isActive ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  <item.icon className="h-5 w-5" />
                  <span className="text-[10px] mt-0.5 font-medium">{item.label}</span>
                </Link>
              );
            })}
            <button onClick={() => { setIsMobileMenuOpen(true); }}
              className="flex flex-col items-center justify-center flex-1 h-full text-gray-500 hover:text-gray-700 transition-colors">
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] mt-0.5 font-medium">More</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
