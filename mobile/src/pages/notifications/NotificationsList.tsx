import { useEffect } from 'react';
import { Bell, MessageCircle, Users, Calendar, CheckCircle, Loader2, WifiOff, RefreshCw } from 'lucide-react';
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
    case 'WHATSAPP': return <MessageCircle className="h-5 w-5 text-teal-500" />;
    case 'LEAD': return <Users className="h-5 w-5 text-sky-600" />;
    case 'MEETING': return <Calendar className="h-5 w-5 text-indigo-500" />;
    case 'TASK': return <CheckCircle className="h-5 w-5 text-amber-500" />;
    default: return <Bell className="h-5 w-5 text-slate-400" />;
  }
}

export default function NotificationsList() {
  const {
    notifications, isLoading, fetchError, fetchNotifications, markAsRead, markAllAsRead,
  } = useNotificationsStore();

  useEffect(() => { fetchNotifications(); }, []);

  const unread = notifications.filter(n => !n.isRead).length;

  return (
    <div className="h-full flex flex-col page-enter">
      {/* Header */}
      <div className="safe-top px-4 pt-3 pb-4 bg-gradient-to-br from-[#3f5374] via-[#56718f] to-[#768aa0] text-white shadow-[0_8px_30px_rgba(63,83,116,0.28)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-200">Activity</p>
            <h1 className="text-[24px] font-extrabold">Notifications</h1>
          </div>
          {unread > 0 && (
            <button onClick={markAllAsRead} className="text-white/90 text-xs font-semibold rounded-full px-3 py-1.5 border border-white/30 bg-white/10">
              Mark all read
            </button>
          )}
        </div>
        <div className="mt-3 text-[11px]">
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {unread} unread
          </span>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && !isLoading && (
        <div className="mx-3 mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff className="h-5 w-5 text-rose-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-rose-700">Connection error</p>
            <p className="text-xs text-rose-500 mt-0.5 truncate">{fetchError}</p>
          </div>
          <button onClick={fetchNotifications} className="p-2 rounded-lg bg-rose-100 text-rose-600 active:bg-rose-200">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="h-14 w-14 rounded-2xl bg-white/90 border border-slate-200 flex items-center justify-center">
              <Bell className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm mt-3 font-medium">No notifications</p>
            <p className="text-xs text-slate-400 mt-1">You are all caught up.</p>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => { if (!n.isRead) markAsRead(n.id); }}
              className={`glass-panel w-full flex items-start gap-3 px-3.5 py-3.5 rounded-2xl mb-2.5 text-left transition ${
                !n.isRead ? 'ring-1 ring-sky-200/70' : ''
              }`}
            >
              <div className="mt-0.5">{getIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <p className={`text-sm ${!n.isRead ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="h-2 w-2 bg-sky-500 rounded-full flex-shrink-0 mt-1.5 ml-2" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
