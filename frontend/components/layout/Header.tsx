'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Bell,
  Plus,
  Sparkles,
  User,
  LogOut,
  Settings,
  ChevronDown,
  Sun,
  Moon,
  Command,
  Menu,
} from 'lucide-react';
import { authService } from '@/lib/auth';
import { useTheme } from '@/contexts/ThemeContext';
import Notifications from '@/components/notifications';

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { currentTheme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
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

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/contacts?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const toggleTheme = () => {
    setTheme(currentTheme.id === 'dark' ? 'default' : 'dark');
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  return (
    <header className="sticky top-0 z-10 glass-effect flex h-16 items-center justify-between px-4 lg:px-6 gap-4">
      {/* Mobile menu button */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden flex items-center justify-center h-10 w-10 rounded-xl bg-white/50 hover:bg-white shadow-sm transition-all shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5 text-gray-700" />
        </button>
      )}

      {/* Search */}
      <div className="flex flex-1 items-center gap-4 min-w-0">
        <form onSubmit={handleSearch} className="relative w-full max-w-md">
          <Search className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transition-colors ${isSearchFocused ? 'text-indigo-600' : 'text-gray-400'}`} />
          <input
            id="global-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search contacts, leads..."
            className="w-full rounded-xl border border-gray-200 bg-white/70 py-2.5 pl-11 pr-20 text-sm placeholder:text-gray-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100/50 transition-all"
          />
          {/* Keyboard shortcut hint */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 text-xs text-gray-400">
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono">
              <Command className="h-3 w-3 inline" />
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 font-mono">K</kbd>
          </div>
        </form>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 lg:gap-3 shrink-0">
        {/* New Lead Button - hidden on mobile */}
        <button
          onClick={() => router.push('/leads')}
          className="hidden sm:flex group relative overflow-hidden items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 lg:px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all duration-300 hover:scale-[1.02]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <Plus className="relative h-4 w-4" />
          <span className="relative hidden lg:inline">New Lead</span>
          <Sparkles className="relative h-3.5 w-3.5 opacity-70 hidden lg:inline" />
        </button>

        {/* Mobile New Lead Button */}
        <button
          onClick={() => router.push('/leads')}
          className="sm:hidden flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
          aria-label="New Lead"
        >
          <Plus className="h-5 w-5" />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/50 hover:bg-white shadow-sm transition-all hover:shadow-md"
          aria-label={currentTheme.id === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {currentTheme.id === 'dark' ? (
            <Sun className="h-5 w-5 text-amber-500" />
          ) : (
            <Moon className="h-5 w-5 text-indigo-500" />
          )}
        </button>

        <Notifications />

        {/* User Menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 rounded-xl bg-white/50 hover:bg-white pl-2 pr-2 lg:pr-3 py-1.5 transition-all hover:shadow-lg group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 text-xs font-bold text-white shadow-md">
              {getInitials(user?.firstName, user?.lastName)}
            </div>
            <div className="text-left min-w-0 hidden lg:block">
              <p className="text-sm font-semibold text-gray-900 truncate max-w-[100px]">
                {user?.firstName || 'User'}
              </p>
              <p className="text-xs text-gray-500 truncate max-w-[100px]">{user?.role || 'user'}</p>
            </div>
            <ChevronDown className={`hidden lg:block h-4 w-4 text-gray-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-gray-100 py-1 animate-fade-in">
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

              {/* Theme toggle in menu */}
              <button
                onClick={() => {
                  toggleTheme();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {currentTheme.id === 'dark' ? (
                  <>
                    <Sun className="h-4 w-4 text-amber-500" />
                    Light Mode
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 text-indigo-500" />
                    Dark Mode
                  </>
                )}
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
