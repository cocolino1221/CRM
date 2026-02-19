import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2, Image, FileText, Mic, Video, Check, CheckCheck, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWhatsAppStore } from '@/stores/whatsapp-store';
import Avatar from '@/components/Avatar';
import type { WhatsAppActivity } from '@/types';

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function parseMessage(msg: WhatsAppActivity) {
  const desc = msg.description || '';
  const t = msg.metadata?.messageType || 'text';
  if (t === 'image' || desc.startsWith('[Image]')) return { type: 'image', text: desc.replace('[Image]', '').trim() };
  if (t === 'document' || desc.startsWith('[Document:')) {
    const m = desc.match(/\[Document:\s*([^\]]+)\]/);
    return { type: 'document', text: m?.[1] || 'Document' };
  }
  if (t === 'audio' || desc === '[Voice message]') return { type: 'audio', text: 'Voice message' };
  if (t === 'video' || desc.startsWith('[Video]')) return { type: 'video', text: desc.replace('[Video]', '').trim() || 'Video' };
  return { type: 'text', text: desc };
}

function getSessionStatus(lastInbound: string | null): 'open' | 'closing' | 'closed' {
  if (!lastInbound) return 'closed';
  const hrs = (Date.now() - new Date(lastInbound).getTime()) / 3600000;
  return hrs < 20 ? 'open' : hrs < 24 ? 'closing' : 'closed';
}

function MediaIcon({ type }: { type: string }) {
  if (type === 'image') return <Image className="h-3.5 w-3.5" />;
  if (type === 'document') return <FileText className="h-3.5 w-3.5" />;
  if (type === 'audio') return <Mic className="h-3.5 w-3.5" />;
  if (type === 'video') return <Video className="h-3.5 w-3.5" />;
  return null;
}

export default function ChatView() {
  const { selectedConv, isSending, sendMessage, fetchInbox } = useWhatsAppStore();
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const messagesEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv?.messages]);

  useEffect(() => {
    const iv = setInterval(fetchInbox, 5000);
    return () => clearInterval(iv);
  }, []);

  if (!selectedConv) {
    navigate('/whatsapp');
    return null;
  }

  const session = getSessionStatus(selectedConv.lastInboundTime);

  const handleSend = async () => {
    if (!text.trim() || isSending) return;
    const msg = text.trim();
    setText('');
    await sendMessage(selectedConv.waId, msg);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
  const groups: { label: string; msgs: WhatsAppActivity[] }[] = [];
  let currentLabel = '';
  for (const m of selectedConv.messages) {
    const label = getDateLabel(m.occurredAt);
    if (label !== currentLabel) {
      groups.push({ label, msgs: [] });
      currentLabel = label;
    }
    groups[groups.length - 1].msgs.push(m);
  }

  return (
    <div className="h-full flex flex-col bg-[#ECE5DD]">
      {/* Header */}
      <div className="safe-top bg-emerald-700 px-2 pt-1 pb-2 flex items-center gap-2">
        <button onClick={() => navigate('/whatsapp')} className="text-white p-1.5">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={selectedConv.contactName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{selectedConv.contactName}</p>
          <p className="text-[11px] text-emerald-200 truncate">{selectedConv.phone}</p>
        </div>
      </div>

      {/* Session banner */}
      {session === 'closed' && (
        <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 text-amber-700 text-xs border-b border-amber-100">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>24h session expired. Send a template to reopen the conversation.</span>
        </div>
      )}
      {session === 'closing' && (
        <div className="bg-amber-50 px-4 py-1.5 text-amber-600 text-xs text-center border-b border-amber-100">
          Session closing soon
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {groups.map((group, gi) => (
          <div key={gi}>
            <div className="flex justify-center my-3">
              <span className="bg-white/80 text-gray-500 text-[11px] font-medium px-3 py-1 rounded-lg shadow-sm">
                {group.label}
              </span>
            </div>
            {group.msgs.map(msg => {
              const isOut = msg.direction === 'outbound';
              const parsed = parseMessage(msg);
              const time = new Date(msg.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const status = msg.metadata?.messageStatus;

              return (
                <div key={msg.id} className={`flex mb-1.5 ${isOut ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-3 py-1.5 rounded-2xl shadow-sm ${
                      isOut
                        ? 'bg-[#DCF8C6] rounded-br-md'
                        : 'bg-white rounded-bl-md'
                    }`}
                  >
                    {parsed.type !== 'text' && (
                      <div className={`flex items-center gap-1.5 mb-1 ${isOut ? 'text-emerald-700' : 'text-gray-500'}`}>
                        <MediaIcon type={parsed.type} />
                        <span className="text-xs font-medium capitalize">{parsed.type}</span>
                      </div>
                    )}
                    <p className="text-[14px] leading-relaxed text-gray-900 whitespace-pre-wrap break-words">
                      {parsed.text}
                    </p>
                    <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOut ? 'text-emerald-600/60' : 'text-gray-400'}`}>
                      <span className="text-[10px]">{time}</span>
                      {isOut && (
                        status === 'read' ? <CheckCheck className="h-3 w-3 text-blue-500" /> :
                        status === 'delivered' ? <CheckCheck className="h-3 w-3" /> :
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="bg-white px-3 py-2 border-t border-gray-100 safe-bottom">
        {session === 'closed' ? (
          <div className="text-center py-2">
            <p className="text-xs text-gray-500 mb-2">Send a template message to restart the conversation</p>
            <button className="text-emerald-600 text-sm font-semibold">Open Templates</button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-3xl bg-gray-100 focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-emerald-300 resize-none text-sm max-h-24"
              style={{ minHeight: '40px' }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || isSending}
              className="h-10 w-10 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
