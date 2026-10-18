import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useToastStore } from '@/stores/toast-store';

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top,0px)+8px)] left-3 right-3 z-[100] space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg animate-slide-down ${
            t.type === 'error' ? 'bg-red-600 text-white' :
            t.type === 'success' ? 'bg-emerald-600 text-white' :
            'bg-gray-800 text-white'
          }`}
        >
          {t.type === 'error' ? <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" /> :
           t.type === 'success' ? <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" /> :
           <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />}
          <p className="text-sm font-medium flex-1">{t.message}</p>
          <button onClick={() => dismiss(t.id)} className="flex-shrink-0 mt-0.5 opacity-80">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
