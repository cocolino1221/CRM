import { useEffect } from 'react';
import { Bell, MessageCircle, Users, Calendar, CheckCircle, Loader2 } from 'lucide-react';
import { useNotificationsStore } from '@/stores/notifications-store';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getIcon(type: string) {
  switch (type) {
    case 'WHATSAPP': return <MessageCircle className="h-5 w-5 text-emerald-500" />;
    case 'LEAD': return <Users className="h-5 w-5 text-blue-500" />;
    case 'MEETING': return <Calendar className="h-5 w-5 text-purple-500" />;
    case 'TASK': return <CheckCircle className="h-5 w-5 text-amber-500" />;
    default: return <Bell className="h-5 w-5 text-gray-400" />;
  }
}

export default function NotificationsList() {
  const { notifications, isLoading, fetchNotifications, markAsRead, markAllAsRead } = useNotificationsStore();

  useEffect(() => { fetchNotifications(); }, []);

  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="safe-top bg-amber-500 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          {unread > 0 && (
            <button onClick={markAllAsRead} className="text-white/80 text-xs font-medium">
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Bell className="h-12 w-12 mb-3" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => { if (!n.isRead) markAsRead(n.id); }}
              className={`w-full flex items-start gap-3 px-4 py-3 border-b border-gray-50 text-left transition ${
                !n.isRead ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="mt-0.5">{getIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <p className={`text-sm ${!n.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5 ml-2" />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
