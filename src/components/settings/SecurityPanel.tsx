import React, { useState, useEffect } from 'react';
import { Lock, Clock, Trash2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { UnlockSessionManager } from '../../lib/UnlockSessionManager';
import { StorageManager } from '../../lib/storage';
import { AndroidKeystoreManager } from '../../lib/keystore';
import { asErrorLike } from '../../lib/errorLike';

interface SecurityPanelProps {
  onRefreshNotes?: () => void;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({ onRefreshNotes }) => {
  const [timeoutMins, setTimeoutMins] = useState(() => UnlockSessionManager.getSessionTimeoutMinutes());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWiping, setIsWiping] = useState(false);
  const [hardwareKeystoreReady, setHardwareKeystoreReady] = useState(false);

  useEffect(() => {
    AndroidKeystoreManager.isSupported()
      .then(setHardwareKeystoreReady)
      .catch(() => setHardwareKeystoreReady(false));
  }, []);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Note locks</div>
        <p className="text-xs text-zinc-500 mt-0.5">
          Optional PIN protection. {hardwareKeystoreReady ? 'Hardware keystore available.' : 'Device secure storage.'}
        </p>
      </div>

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Unlock timeout</div>
            <div className="text-xs text-zinc-500">How long notes stay unlocked</div>
          </div>
        </div>
        <select
          value={timeoutMins}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            setTimeoutMins(v);
            UnlockSessionManager.setSessionTimeoutMinutes(v);
            flash(v <= 0 ? 'Until app closes' : `${v} min`);
          }}
          className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs"
        >
          <option value={5}>5 min</option>
          <option value={15}>15 min</option>
          <option value={30}>30 min</option>
          <option value={60}>60 min</option>
          <option value={0}>Until close</option>
        </select>
      </div>

      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Lock className="w-4 h-4 text-zinc-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Lock all notes</div>
            <div className="text-xs text-zinc-500">Clear unlock sessions now</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            UnlockSessionManager.clearAllSessions();
            flash('Locked');
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700"
        >
          Lock all
        </button>
      </div>

      <div className="p-4 rounded-xl border border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 space-y-2">
        <div className="flex items-start gap-2.5">
          <Trash2 className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-rose-700 dark:text-rose-400">Erase all data</div>
            <p className="text-xs text-zinc-500 mt-0.5">Deletes every note and recording on this device. Cannot be undone.</p>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={isWiping}
            onClick={async () => {
              const confirmation = prompt('Type CONFIRM WIPE to erase everything on this device:');
              if (confirmation !== 'CONFIRM WIPE') return;
              setIsWiping(true);
              setErrorMessage(null);
              try {
                UnlockSessionManager.clearAllSessions();
                const allNotes = StorageManager.getNotes();
                for (const note of allNotes) {
                  StorageManager.deleteNote(note.id);
                }
                await StorageManager.cleanOrphanedMedia();
                await StorageManager.vacuumDatabase();
                onRefreshNotes?.();
                flash('All data erased');
              } catch (_err) {
                const err = asErrorLike(_err);
                setErrorMessage(err.message || 'Erase failed');
              } finally {
                setIsWiping(false);
              }
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 flex items-center gap-1.5"
          >
            {isWiping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {isWiping ? 'Erasing…' : 'Erase all'}
          </button>
        </div>
      </div>
    </div>
  );
};
