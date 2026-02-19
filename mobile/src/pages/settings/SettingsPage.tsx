import { LogOut, User, Shield, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import Avatar from '@/components/Avatar';

export default function SettingsPage() {
  const { user, logout } = useAuthStore();

  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`.trim();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="safe-top bg-gray-800 px-4 pt-2 pb-3">
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Profile card */}
        <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <Avatar name={name} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-gray-900">{name}</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
            <span className="inline-flex items-center gap-1 text-[11px] mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
              <Shield className="h-3 w-3" /> {user.role}
            </span>
          </div>
        </div>

        {/* Info section */}
        <div className="bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
            <span className="text-sm text-gray-700">Account</span>
            <span className="text-sm text-gray-400">{user.email}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
            <span className="text-sm text-gray-700">Role</span>
            <span className="text-sm text-gray-400 capitalize">{user.role.toLowerCase().replace('_', ' ')}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-gray-700">App Version</span>
            <span className="text-sm text-gray-400">1.0.0</span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="w-full bg-white rounded-xl px-4 py-3.5 flex items-center justify-center gap-2 text-red-600 font-medium text-sm shadow-sm active:bg-red-50 transition"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
