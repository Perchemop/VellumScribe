import React from 'react';
import { Lock,  Shield, CloudOff, Cloud } from 'lucide-react';

interface SecurityControlsProps {
  isLocked: boolean;
  isUnlockedInSession: boolean;
  cloudSaveEnabled?: boolean;
  onToggleCloudSave?: (enabled: boolean) => void;
  onOpenSecurityModal: () => void;
  onLockSessionNow?: () => void;
}

export const SecurityControls: React.FC<SecurityControlsProps> = ({
  isLocked,
  isUnlockedInSession,
  cloudSaveEnabled = true,
  onToggleCloudSave,
  onOpenSecurityModal,
  onLockSessionNow,
}) => {
  return (
    <div className="p-3.5 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${isLocked ? 'bg-amber-500/10 text-amber-500' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'}`}>
          {isLocked ? <Lock className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
        </div>
        <div>
          <div className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>{isLocked ? 'AES-256-GCM Encrypted Note' : 'Standard Note'}</span>
            {isLocked && isUnlockedInSession && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Active Session
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {isLocked
              ? 'Body and media blobs encrypted on-device. Zero unencrypted traces in SQLite or cloud sync.'
              : 'Stored in relational SQLite with full-text search indexing enabled.'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        {isLocked && isUnlockedInSession && onLockSessionNow && (
          <button
            type="button"
            onClick={onLockSessionNow}
            className="px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition font-medium text-xs flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            Lock Now
          </button>
        )}

        {onToggleCloudSave && (
          <button
            type="button"
            onClick={() => onToggleCloudSave(!cloudSaveEnabled)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 ${
              cloudSaveEnabled
                ? 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
            }`}
            title={cloudSaveEnabled ? 'Cloud backup enabled' : 'Air-gapped (Local Only)'}
          >
            {cloudSaveEnabled ? <Cloud className="w-3.5 h-3.5 text-sky-500" /> : <CloudOff className="w-3.5 h-3.5 text-amber-500" />}
            <span>{cloudSaveEnabled ? 'Cloud Sync On' : 'Local Only'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSecurityModal}
          className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition text-xs flex items-center gap-1.5"
        >
          <Shield className="w-3.5 h-3.5" />
          <span>{isLocked ? 'Manage PIN' : 'Encrypt Note'}</span>
        </button>
      </div>
    </div>
  );
};
