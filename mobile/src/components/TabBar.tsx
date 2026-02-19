import { MessageCircle, Users, Bell, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotificationsStore } from '@/stores/notifications-store';

const tabs = [
  { path: '/whatsapp', icon: MessageCircle, label: 'WhatsApp', color: 'text-emerald-600' },
  { path: '/leads', icon: Users, label: 'Leads', color: 'text-blue-600' },
  { path: '/notifications', icon: Bell, label: 'Alerts', color: 'text-amber-600' },
  { path: '/settings', icon: Settings, label: 'Settings', color: 'text-gray-600' },
];

export default function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = useNotificationsStore(s => s.unreadCount);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-bottom">
      <div className="flex items-center justify-around h-14">
        {tabs.map(tab => {
          const isActive = location.pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative ${
                isActive ? tab.color : 'text-gray-400'
              }`}
            >
              <div className="relative">
                <tab.icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 1.5} />
                {tab.path === '/notifications' && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] mt-0.5 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
