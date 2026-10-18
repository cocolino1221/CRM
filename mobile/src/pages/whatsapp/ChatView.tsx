import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Loader2, Image, FileText, Mic, Video, Check, CheckCheck, AlertTriangle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWhatsAppStore } from '@/stores/whatsapp-store';
import { useToastStore } from '@/stores/toast-store';
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
  const { selectedConv, isSending, sendError, sendMessage, fetchInbox } = useWhatsAppStore();
  const showToast = useToastStore(s => s.show);
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

  useEffect(() => {
    if (sendError) showToast(sendError, 'error');
  }, [sendError]);

  if (!selectedConv) {
    navigate('/whatsapp');
    return null;
  }

  const session = getSessionStatus(selectedConv.lastInboundTime);

  const handleSend = async () => {
    if (!text.trim() || isSending) return;
    const msg = text.trim();
    setText('');
    await sendMessage(selectedConv.waId, msg, selectedConv.preferredSenderIntegrationId || undefined);
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
    <div className="h-full flex flex-col page-enter bg-[radial-gradient(circle_at_top,_#d9ecff_0%,_#eef4fb_38%,_#f2f6fb_100%)]">
      {/* Header */}
      <div className="safe-top px-2 pb-2 pt-1.5 bg-gradient-to-br from-[var(--brand-900)] via-[var(--brand-700)] to-[var(--accent-600)] flex items-center gap-2 shadow-[0_10px_30px_rgba(15,63,104,0.35)]">
        <button onClick={() => navigate('/whatsapp')} className="text-white p-1.5 rounded-xl bg-white/12 border border-white/20">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar name={selectedConv.contactName} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{selectedConv.contactName}</p>
          <p className="text-[11px] text-sky-100/90 truncate">{selectedConv.phone}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${
          session === 'open'
            ? 'bg-teal-400/20 border-teal-200/50 text-teal-100'
            : session === 'closing'
              ? 'bg-amber-400/20 border-amber-200/50 text-amber-100'
              : 'bg-rose-400/20 border-rose-200/50 text-rose-100'
        }`}>
          {session === 'open' ? 'Open 24h' : session === 'closing' ? 'Closing soon' : 'Expired'}
        </span>
      </div>

      {/* Session banner */}
      {session === 'closed' && (
        <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 text-amber-700 text-xs border-b border-amber-100">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          <span>24h session expired. Message may require a template to deliver.</span>
        </div>
      )}
      {session === 'closing' && (
        <div className="bg-amber-50 px-4 py-1.5 flex items-center gap-2 text-amber-600 text-xs border-b border-amber-100">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Session closing soon</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group, gi) => (
          <div key={gi}>
            <div className="flex justify-center my-3">
              <span className="bg-white/85 border border-slate-200 text-slate-500 text-[11px] font-semibold px-3 py-1 rounded-lg shadow-sm">
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
                    className={`max-w-[82%] px-3 py-2 rounded-2xl shadow-sm border ${
                      isOut
                        ? 'bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-100 rounded-br-md'
                        : 'bg-white border-slate-200 rounded-bl-md'
                    }`}
                  >
                    {parsed.type !== 'text' && (
                      <div className={`flex items-center gap-1.5 mb-1 ${isOut ? 'text-teal-700' : 'text-slate-500'}`}>
                        <MediaIcon type={parsed.type} />
                        <span className="text-xs font-medium capitalize">{parsed.type}</span>
                      </div>
                    )}
                    <p className="text-[14px] leading-relaxed text-slate-900 whitespace-pre-wrap break-words">
                      {parsed.text}
                    </p>
                    <div className={`flex items-center justify-end gap-1 mt-1 ${isOut ? 'text-teal-700/55' : 'text-slate-400'}`}>
                      <span className="text-[10px]">{time}</span>
                      {isOut && (
                        status === 'failed' ? <AlertTriangle className="h-3 w-3 text-red-500" /> :
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

      {/* Input - always visible */}
      <div className="px-3 py-2.5 border-t border-slate-200/80 bg-white/90 backdrop-blur safe-bottom">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={session === 'closed' ? 'Type a message (session expired)...' : 'Type a message...'}
            rows={1}
            className="flex-1 px-4 py-2.5 rounded-3xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none text-sm max-h-24 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            className="h-10 w-10 bg-gradient-to-br from-sky-700 to-teal-500 hover:brightness-105 active:brightness-95 text-white rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition shadow-[0_8px_20px_rgba(21,105,154,0.35)]"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
