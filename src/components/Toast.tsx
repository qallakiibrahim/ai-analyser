import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'no-print fixed bottom-5 right-5 z-[120] max-w-md flex items-center gap-3 px-4 py-3 rounded-lg border bg-card text-foreground shadow-lg',
        toast.type === 'error'
          ? 'border-rose-500/40'
          : toast.type === 'success'
          ? 'border-emerald-500/40'
          : 'border-border'
      )}
    >
      {toast.type === 'error' ? (
        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
      )}
      <p className="text-sm font-medium leading-snug">{toast.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Stäng meddelande"
        className="p-1 text-muted-foreground hover:text-foreground rounded-md cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
