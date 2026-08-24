import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { SyncProgressUpdate } from '../lib/cloudSync';

interface SyncProgressBarProps {
  isSyncing: boolean;
  progress: SyncProgressUpdate | null;
  onDismiss?: () => void;
}

export const SyncProgressBar: React.FC<SyncProgressBarProps> = ({
  isSyncing,
  progress,
  onDismiss,
}) => {
  if (!isSyncing && !progress) return null;

  const percent = progress?.percent ?? (isSyncing ? 45 : 100);
  const message = progress?.message ?? (isSyncing ? 'Synchronizing encrypted snapshots...' : 'Sync complete');
  const isComplete = percent === 100 && !isSyncing;

  return (
    <div
      id="global-sync-progress-banner"
      className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs transition-all animate-fade-in shadow-md z-30 select-none"
    >
      <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
        <div className="w-5 h-5 rounded-full bg-white/10 dark:bg-black/10 flex items-center justify-center shrink-0">
          {isComplete ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-300 dark:text-zinc-700" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs truncate">{message}</span>
            <span className="text-[11px] font-mono opacity-75 shrink-0">{percent}%</span>
          </div>
        </div>
      </div>

      {/* Progress Track Bar */}
      <div className="w-full sm:w-48 h-1.5 bg-white/20 dark:bg-black/20 rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            isComplete
              ? 'bg-emerald-400 dark:bg-emerald-600'
              : 'bg-indigo-400 dark:bg-indigo-600'
          }`}
          style={{ width: `${Math.max(5, Math.min(100, percent))}%` }}
        />
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="hidden sm:inline-flex p-1 text-zinc-400 hover:text-white dark:hover:text-black transition-colors"
          title="Dismiss progress notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
