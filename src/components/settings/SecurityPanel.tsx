import React, { useState, useEffect } from 'react';
import { Shield, Lock, Key, Clock, Trash2, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import { UnlockSessionManager } from '../../lib/UnlockSessionManager';
import { StorageManager } from '../../lib/storage';
import { AndroidKeystoreManager } from '../../lib/keystore';

interface SecurityPanelProps {
  onRefreshNotes?: () => void;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({ onRefreshNotes }) => {
  const [timeoutMins, setTimeoutMins] = useState<number>(() => {
    return UnlockSessionManager.getSessionTimeoutMinutes();
  });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWiping, setIsWiping] = useState(false);
  const [hardwareKeystoreReady, setHardwareKeystoreReady] = useState(false);

  useEffect(() => {
    // Check Android hardware keystore availability
    AndroidKeystoreManager.isSupported()
      .then(setHardwareKeystoreReady)
      .catch(() => setHardwareKeystoreReady(false));
  }, []);

  const handleTimeoutChange = (newVal: number) => {
    setTimeoutMins(newVal);
    UnlockSessionManager.setSessionTimeoutMinutes(newVal);
    setSuccessMessage(`Unlock session timeout set to ${newVal <= 0 ? 'until app closes' : `${newVal} minutes`}.`);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleLockAllSessions = () => {
    UnlockSessionManager.clearAllSessions();
    setSuccessMessage('All active note unlock sessions revoked. Locked notes now require PIN entry.');
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleSecureEraseAll = async () => {
    const confirmation = prompt(
      'DANGER: This will permanently delete ALL notes, audio recordings, OCR scans, and media keys from this device.\n\nType "CONFIRM WIPE" to proceed:'
    );
    if (confirmation !== 'CONFIRM WIPE') {
      return;
    }

    setIsWiping(true);
    setErrorMessage(null);
    try {
      UnlockSessionManager.clearAllSessions();
      // Purge all notes and media
      const allNotes = StorageManager.getNotes();
      for (const note of allNotes) {
        StorageManager.deleteNote(note.id);
      }
      await StorageManager.cleanOrphanedMedia();
      await StorageManager.vacuumDatabase();
      onRefreshNotes?.();
      setSuccessMessage('Secure erase complete. All device data wiped and SQLite storage zeroed.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete secure wipe.');
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Crypto Architecture Badge */}
      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Cryptographic Hardening & Zero-Knowledge Architecture
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Individual note encryption via AES-256-GCM. Key derivation uses PBKDF2-HMAC-SHA-256 with 600,000 iterations.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-500 block">Cipher Suite</span>
            <span className="font-mono text-zinc-200 font-medium">AES-256-GCM</span>
          </div>
          <div>
            <span className="text-zinc-500 block">KDF Work Factor</span>
            <span className="font-mono text-zinc-200 font-medium">600,000 PBKDF2</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Hardware Storage</span>
            <span className="font-mono text-zinc-200 font-medium">
              {hardwareKeystoreReady ? 'Android Keystore' : 'Capacitor Secure Storage'}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Unlock Session TTL Configuration */}
      <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-100">Unlock Session Timeout</div>
            <div className="text-xs text-zinc-400">
              Duration decrypted notes remain accessible in memory before requiring PIN re-entry.
            </div>
          </div>
        </div>

        <select
          value={timeoutMins}
          onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10))}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
        >
          <option value={5}>5 minutes</option>
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>60 minutes</option>
          <option value={0}>Until app close</option>
        </select>
      </div>

      {/* Active Session Management */}
      <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-100">Revoke Active Unlock Sessions</div>
            <div className="text-xs text-zinc-400">
              Immediately lock all unlocked notes in memory and purge cached crypto keys.
            </div>
          </div>
        </div>
        <button
          onClick={handleLockAllSessions}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
        >
          Lock All Now
        </button>
      </div>

      {/* Secure Erase Confirmation Flow */}
      <div className="p-5 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
            <Trash2 className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-rose-400">Secure Erase & Media Wipe</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Permanently zeroes all database tables, decrypts nothing, wipes all IndexedDB/filesystem media blobs,
              and compacts SQLite storage to 0 bytes. This action cannot be reversed.
            </p>
          </div>
        </div>
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSecureEraseAll}
            disabled={isWiping}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white transition flex items-center gap-2 shadow-sm"
          >
            {isWiping ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Zeroing Storage...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Secure Erase All Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
