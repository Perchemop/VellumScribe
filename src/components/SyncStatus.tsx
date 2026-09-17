import React from 'react';
import { CheckCircle2, CloudOff, RefreshCw, AlertCircle, HardDrive } from 'lucide-react';

export interface SyncStatusProps {
  isOnline: boolean;
  pendingCount?: number;
  isSyncing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export const SyncStatus: React.FC<SyncStatusProps> = ({
  isOnline,
  pendingCount = 0,
  isSyncing = false,
  error = null,
  onRetry,
  className = '',
}) => {
  if (isSyncing) {
    return (
      <div
        title="Syncing modifications with configured cloud backup..."
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/50 ${className}`}
      >
        <RefreshCw className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
        <span>Syncing...</span>
      </div>
    );
  }

  if (error) {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={`Sync error: ${error}. Tap to retry.`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/50 hover:bg-amber-100 transition-colors ${className}`}
      >
        <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Sync failed · Retry</span>
      </button>
    );
  }

  if (!isOnline) {
    return (
      <div
        title="Offline mode: Notes and changes are stored locally in on-device SQLite"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-750 ${className}`}
      >
        <CloudOff className="w-3 h-3 text-zinc-500 shrink-0" />
        <span>Offline · Saved locally</span>
        {pendingCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 bg-zinc-200 dark:bg-zinc-700 rounded-full text-[10px] font-semibold">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={`${pendingCount} item(s) pending sync. Tap to synchronize now.`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40 hover:bg-amber-100 transition-colors ${className}`}
      >
        <HardDrive className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Waiting to sync ({pendingCount})</span>
      </button>
    );
  }

  return (
    <div
      title="All changes securely stored locally in SQLite"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-900/40 ${className}`}
    >
      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
      <span>Saved locally</span>
    </div>
  );
};
