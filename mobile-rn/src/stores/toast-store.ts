import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type?: Toast['type']) => void;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type = 'error') => {
    const id = String(++counter);
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000);
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
