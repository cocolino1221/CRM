import { LogOut, Shield, Bell, MessageCircle, Calendar, UserCog } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import Avatar from '@/components/Avatar';

export default function SettingsPage() {
  const { user, logout } = useAuthStore();

  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`.trim();

  return (
    <div className="h-full flex flex-col page-enter">
      {/* Header */}
      <div className="safe-top px-4 pt-3 pb-4 bg-gradient-to-br from-[#334155] via-[#475569] to-[#64748b] text-white shadow-[0_8px_30px_rgba(51,65,85,0.3)]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-200">Account</p>
        <h1 className="text-[24px] font-extrabold">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Profile card */}
        <div className="glass-panel rounded-3xl p-5 flex items-center gap-4">
          <Avatar name={name} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-slate-900 truncate">{name}</p>
            <p className="text-sm text-slate-500 truncate">{user.email}</p>
            <span className="inline-flex items-center gap-1 text-[11px] mt-1.5 px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full font-semibold">
              <Shield className="h-3 w-3" /> {user.role}
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <UserCog className="h-4 w-4 text-slate-500" />
              Account
            </span>
            <span className="text-xs text-slate-500">{user.email}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <MessageCircle className="h-4 w-4 text-teal-500" />
              WhatsApp inbox
            </span>
            <span className="text-xs text-emerald-600 font-semibold">Connected</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <Bell className="h-4 w-4 text-amber-500" />
              Push notifications
            </span>
            <span className="text-xs text-slate-500">Enabled</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <Calendar className="h-4 w-4 text-indigo-500" />
              Calendar sync
            </span>
            <span className="text-xs text-slate-500">Active</span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <span className="text-sm text-slate-700">Role</span>
            <span className="text-xs text-slate-500 capitalize">{user.role.toLowerCase().replace('_', ' ')}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-slate-700">App Version</span>
            <span className="text-xs text-slate-500">1.0.0</span>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full glass-panel rounded-2xl px-4 py-3.5 flex items-center justify-center gap-2 text-rose-600 font-semibold text-sm active:bg-rose-50 transition"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
