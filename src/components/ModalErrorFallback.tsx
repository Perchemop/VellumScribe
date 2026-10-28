import React from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';

export interface ModalErrorFallbackProps {
  title?: string;
  message?: string;
  onClose?: () => void;
  onRetry?: () => void;
}

export const ModalErrorFallback: React.FC<ModalErrorFallbackProps> = ({
  title = 'Component Unavailable',
  message = 'This module encountered an issue while loading or interacting with device hardware.',
  onClose,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-fade-in"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl max-w-sm w-full space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200/50 dark:border-amber-900/40">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Dismiss error"
              className="p-1 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{message}</p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3.5 py-2 text-xs font-medium rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-750 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 shadow-sm transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
