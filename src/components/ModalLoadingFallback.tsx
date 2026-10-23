import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ModalLoadingFallbackProps {
  label?: string;
}

export const ModalLoadingFallback: React.FC<ModalLoadingFallbackProps> = ({
  label = 'Loading module…',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-fade-in"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3 text-center max-w-xs w-full">
        <Loader2
          className="w-7 h-7 text-zinc-800 dark:text-zinc-200 animate-spin"
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      </div>
    </div>
  );
};
