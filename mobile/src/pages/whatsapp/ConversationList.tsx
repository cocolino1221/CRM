import { useEffect, useRef, useState } from 'react';
import { Search, X, WifiOff, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWhatsAppStore } from '@/stores/whatsapp-store';
import Avatar from '@/components/Avatar';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sessionOpen(conv: { lastInboundTime: string | null }): boolean {
  if (!conv.lastInboundTime) return false;
  return (Date.now() - new Date(conv.lastInboundTime).getTime()) < 24 * 60 * 60 * 1000;
}

export default function ConversationList() {
  const { conversations, isLoading, fetchError, fetchInbox, selectConversation } = useWhatsAppStore();
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();
  const intervalRef = useRef<number>();

  useEffect(() => {
    fetchInbox();
    intervalRef.current = window.setInterval(fetchInbox, 5000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchInbox(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const filtered = search
    ? conversations.filter(c =>
        c.contactName.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search))
    : conversations;
  const unreadTotal = conversations.reduce((acc, conv) => acc + (conv.unreadCount || 0), 0);
  const activeSessions = conversations.filter(sessionOpen).length;

  const handleTap = (conv: typeof conversations[0]) => {
    selectConversation(conv);
    navigate(`/whatsapp/chat/${conv.waId}`);
  };

  return (
    <div className="h-full flex flex-col page-enter">
      {/* Header */}
      <div className="safe-top px-4 pt-3 pb-4 bg-gradient-to-br from-[var(--brand-900)] via-[var(--brand-700)] to-[var(--accent-600)] text-white shadow-[0_8px_32px_rgba(15,63,104,0.28)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-sky-100/90">Inbox</p>
            <h1 className="text-[24px] font-extrabold mt-0.5">WhatsApp</h1>
          </div>
          <button onClick={() => setShowSearch(!showSearch)} className="text-white/90 p-2 rounded-xl bg-white/15 border border-white/20">
            {showSearch ? <X className="h-[18px] w-[18px]" /> : <Search className="h-[18px] w-[18px]" />}
          </button>
        </div>
        <div className="mt-3 flex gap-2 text-[11px]">
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {conversations.length} chats
          </span>
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {unreadTotal} unread
          </span>
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 font-semibold">
            {activeSessions} active windows
          </span>
        </div>
        {showSearch && (
          <div className="mt-3 animate-slide-down">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/16 border border-white/25 text-white placeholder-white/65 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm"
            />
          </div>
        )}
      </div>

      {/* Error banner */}
      {fetchError && !isLoading && conversations.length === 0 && (
        <div className="mx-3 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100">
          <WifiOff className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-700">Connection error</p>
            <p className="text-xs text-red-500 mt-0.5 truncate">{fetchError}</p>
          </div>
          <button onClick={fetchInbox} className="p-2 rounded-lg bg-red-100 text-red-600 active:bg-red-200">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="space-y-3 px-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass-panel rounded-2xl p-3 flex items-center gap-3 animate-pulse">
                <div className="h-12 w-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="h-14 w-14 rounded-2xl bg-white/90 border border-slate-200 flex items-center justify-center">
              <Search className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm mt-3 font-medium">{search ? 'No conversations found' : 'No conversations yet'}</p>
            <p className="text-xs text-slate-400 mt-1">Incoming chats will appear here.</p>
          </div>
        ) : (
          filtered.map(conv => (
            <button
              key={conv.waId}
              onClick={() => handleTap(conv)}
              className="glass-panel w-full flex items-center gap-3 px-3.5 py-3.5 rounded-2xl mb-2.5 hover:translate-y-[-1px] active:translate-y-0 transition text-left"
            >
              <div className="relative">
                <Avatar name={conv.contactName} />
                {sessionOpen(conv) && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-teal-500 border-2 border-white animate-pulse-dot" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
                    {conv.contactName}
                  </span>
                  <span className={`text-[11px] flex-shrink-0 ml-2 ${conv.unreadCount > 0 ? 'text-teal-600 font-semibold' : 'text-slate-400'}`}>
                    {timeAgo(conv.lastMessageTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-slate-700' : 'text-slate-500'}`}>
                    {conv.lastMessage}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className="ml-2 bg-teal-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
