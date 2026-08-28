import React from 'react';
import { SyncProgressUpdate } from '../lib/cloudSync';
import { X, RefreshCw } from 'lucide-react';

interface SyncProgressBarProps {
  isSyncing: boolean;
  progress: SyncProgressUpdate | null;
  onDismiss: () => void;
}

export const SyncProgressBar: React.FC<SyncProgressBarProps> = ({ isSyncing, progress, onDismiss }) => {
  if (!isSyncing && !progress) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-2xl flex items-center px-4 py-2 gap-3 min-w-[280px]">
        <div className="flex items-center justify-center">
          {(isSyncing || progress?.phase === 'uploading' || progress?.phase === 'init') ? (
            <RefreshCw className="w-4 h-4 animate-spin text-white dark:text-zinc-900" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </div>
        
        <div className="flex-1">
          <p className="text-[11px] font-semibold truncate max-w-[200px]">
            {progress?.message || 'Syncing to cloud...'}
          </p>
          {progress?.percent !== undefined && (
            <div className="w-full bg-zinc-700 dark:bg-zinc-300 h-1 mt-1 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          )}
        </div>

        {!isSyncing && progress?.phase === 'complete' && (
          <button 
            onClick={onDismiss}
            className="p-1 hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-full transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
