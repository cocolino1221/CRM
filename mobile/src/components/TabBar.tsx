import { MessageCircle, Users, Calendar, Bell, Settings, FileText } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotificationsStore } from '@/stores/notifications-store';

const tabs = [
  { path: '/whatsapp', icon: MessageCircle, label: 'Inbox', color: 'text-teal-600', activeBg: 'bg-teal-50' },
  { path: '/documents', icon: FileText, label: 'Docs', color: 'text-indigo-700', activeBg: 'bg-indigo-50' },
  { path: '/leads', icon: Users, label: 'Leads', color: 'text-sky-700', activeBg: 'bg-sky-50' },
  { path: '/calendar', icon: Calendar, label: 'Calendar', color: 'text-indigo-600', activeBg: 'bg-indigo-50' },
  { path: '/notifications', icon: Bell, label: 'Alerts', color: 'text-amber-600', activeBg: 'bg-amber-50' },
  { path: '/settings', icon: Settings, label: 'Profile', color: 'text-slate-700', activeBg: 'bg-slate-100' },
];

export default function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = useNotificationsStore(s => s.unreadCount);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 pointer-events-none">
      <div className="mx-auto w-full max-w-xl px-3 pb-[calc(var(--sab)+10px)]">
        <div className="pointer-events-auto rounded-[26px] border border-slate-200/80 bg-white/92 shadow-[0_16px_42px_rgba(20,55,90,0.2)] backdrop-blur-xl">
          <div className="grid grid-cols-6 gap-1 p-2">
        {tabs.map(tab => {
          const isActive = location.pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`relative flex h-[58px] flex-col items-center justify-center rounded-2xl transition-all ${
                isActive
                  ? `${tab.activeBg} ${tab.color} shadow-sm`
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              {isActive && <span className="absolute top-1 h-1.5 w-7 rounded-full bg-current/30" />}
              <div className="relative mt-1">
                <tab.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {tab.path === '/notifications' && unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 border border-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-1 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
          </div>
        </div>
      </div>
    </nav>
  );
}
