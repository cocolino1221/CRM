import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
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
  const { conversations, isLoading, fetchInbox, selectConversation } = useWhatsAppStore();
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

  const handleTap = (conv: typeof conversations[0]) => {
    selectConversation(conv);
    navigate(`/whatsapp/chat/${conv.waId}`);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="safe-top bg-emerald-600 px-4 pt-2 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">WhatsApp</h1>
          <button onClick={() => setShowSearch(!showSearch)} className="text-white/80 p-1">
            {showSearch ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
        </div>
        {showSearch && (
          <div className="mt-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations..."
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-emerald-700/50 text-white placeholder-white/60 focus:outline-none focus:bg-emerald-700/70 text-sm"
            />
          </div>
        )}
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="h-12 w-12 bg-gray-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Search className="h-12 w-12 mb-3" />
            <p className="text-sm">{search ? 'No conversations found' : 'No conversations yet'}</p>
          </div>
        ) : (
          filtered.map(conv => (
            <button
              key={conv.waId}
              onClick={() => handleTap(conv)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition border-b border-gray-50 text-left"
            >
              <div className="relative">
                <Avatar name={conv.contactName} />
                {sessionOpen(conv) && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-emerald-500 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {conv.contactName}
                  </span>
                  <span className={`text-[11px] flex-shrink-0 ml-2 ${conv.unreadCount > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                    {timeAgo(conv.lastMessageTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
                    {conv.lastMessage}
                  </p>
                  {conv.unreadCount > 0 && (
                    <span className="ml-2 bg-emerald-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
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
