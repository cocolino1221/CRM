'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Bell, Plus, Sparkles, User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { authService } from '@/lib/auth';

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Get user from storage
    const currentUser = authService.getUser();
    setUser(currentUser);
  }, []);

  useEffect(() => {
    // Close menu when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await authService.logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login');
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  return (
    <header className="sticky top-0 z-10 glass-effect flex h-16 items-center justify-between px-6">
      {/* Search */}
      <div className="flex flex-1 items-center gap-4">
        <div className="relative w-96">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-400" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full rounded-xl border border-indigo-200/50 bg-white/50 py-2.5 pl-11 pr-4 text-sm placeholder:text-gray-500 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button className="group relative overflow-hidden flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all duration-300 hover:scale-105">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <Plus className="relative h-4 w-4" />
          <span className="relative">New Contact</span>
          <Sparkles className="relative h-3.5 w-3.5 opacity-70" />
        </button>

        <button className="relative rounded-xl p-2.5 bg-white/50 hover:bg-white transition-all hover:shadow-lg group">
          <Bell className="h-5 w-5 text-gray-600 group-hover:text-indigo-600 transition-colors" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
        </button>

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 rounded-xl bg-white/50 hover:bg-white pl-2 pr-3 py-1.5 transition-all hover:shadow-lg group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-xs font-bold text-white shadow-md">
              {getInitials(user?.firstName, user?.lastName)}
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate max-w-[120px]">
                {user?.firstName || 'User'} {user?.lastName || ''}
              </p>
              <p className="text-xs text-gray-500 truncate max-w-[120px]">{user?.role || 'user'}</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-gray-200 py-1 animate-fade-in">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>

              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  router.push('/settings');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="h-4 w-4 text-gray-400" />
                Profile
              </button>

              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  router.push('/settings');
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Settings className="h-4 w-4 text-gray-400" />
                Settings
              </button>

              <div className="border-t border-gray-100 my-1"></div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}