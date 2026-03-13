import { useEffect } from 'react';
import { FileText, Loader2, WifiOff, RefreshCw, ExternalLink } from 'lucide-react';
import { useDocumentsStore } from '@/stores/documents-store';
import type { Document } from '@/types';

function formatDate(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function statusChip(status?: string): string {
  const key = String(status || '').toLowerCase();
  if (['signed', 'completed'].includes(key)) return 'bg-emerald-100 text-emerald-700';
  if (['sent', 'viewed', 'pending'].includes(key)) return 'bg-blue-100 text-blue-700';
  if (['declined', 'voided', 'expired'].includes(key)) return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function paymentChip(status?: string): string {
  const key = String(status || '').toLowerCase();
  if (key === 'paid') return 'bg-emerald-100 text-emerald-700';
  if (key === 'failed') return 'bg-rose-100 text-rose-700';
  if (key === 'pending') return 'bg-amber-100 text-amber-700';
  if (key === 'awaiting_signature') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

export default function DocumentsList() {
  const { documents, isLoading, fetchError, fetchDocuments } = useDocumentsStore();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const renderCard = (doc: Document) => {
    const recipient = doc.recipients?.[0]?.email || '-';
    const paymentStatus = doc.metadata?.payment?.status;
    const signUrl = String(doc.signingUrl || '').trim();
    const paymentUrl = String(doc.metadata?.payment?.paymentLink || '').trim();

    return (
      <div key={doc.id} className="glass-panel px-3.5 py-3.5 rounded-2xl mb-2.5">
        <p className="text-sm font-semibold text-slate-900 truncate">{doc.name}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{recipient}</p>

        <div className="flex items-center gap-2 mt-2.5">
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${statusChip(doc.status)}`}>
            {doc.status}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${paymentChip(paymentStatus)}`}>
            {paymentStatus || 'n/a'}
          </span>
          <span className="ml-auto text-[11px] text-slate-400">{formatDate(doc.createdAt)}</span>
        </div>

        {doc.metadata?.payment?.failureReason && (
          <p className="text-xs text-rose-600 mt-2 line-clamp-2">{doc.metadata.payment.failureReason}</p>
        )}

        {(signUrl || paymentUrl) && (
          <div className="flex items-center gap-2 mt-3">
            {signUrl && (
              <a
                href={signUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Sign Link
              </a>
            )}
            {paymentUrl && (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Payment Link
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col page-enter">
      <div className="safe-top px-4 pt-3 pb-4 bg-gradient-to-br from-[#3f5374] via-[#56718f] to-[#768aa0] text-white shadow-[0_8px_30px_rgba(63,83,116,0.28)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-200">Contracts</p>
            <h1 className="text-[24px] font-extrabold">Documents</h1>
          </div>
          <span className="rounded-full bg-white/16 border border-white/20 px-2.5 py-1 text-[11px] font-semibold">
            {documents.length} total
          </span>
        </div>
      </div>

      {fetchError && !isLoading && (
        <div className="mx-3 mt-3 flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100">
          <WifiOff className="h-5 w-5 text-rose-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-rose-700">Connection error</p>
            <p className="text-xs text-rose-500 mt-0.5 truncate">{fetchError}</p>
          </div>
          <button onClick={fetchDocuments} className="p-2 rounded-lg bg-rose-100 text-rose-600 active:bg-rose-200">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="h-14 w-14 rounded-2xl bg-white/90 border border-slate-200 flex items-center justify-center">
              <FileText className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm mt-3 font-medium">No documents</p>
            <p className="text-xs text-slate-400 mt-1">Documentele vor aparea aici.</p>
          </div>
        ) : (
          documents.map(renderCard)
        )}
      </div>
    </div>
  );
}
