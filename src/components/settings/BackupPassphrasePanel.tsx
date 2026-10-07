import React, { useState } from 'react';
import { KeyRound, ShieldCheck, AlertTriangle } from 'lucide-react';
import { CloudBackupCrypto } from '../../lib/cloudBackupCrypto';

/**
 * Optional multi-device backup passphrase (P-02).
 * Phrase is session-scoped; only a length hint is stored in localStorage.
 */
export const BackupPassphrasePanel: React.FC = () => {
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const configured = CloudBackupCrypto.hasUserBackupPassphraseConfigured();

  const save = () => {
    setMsg(null);
    if (phrase.trim().length < 12) {
      setMsg('Use at least 12 characters for a recoverable passphrase.');
      return;
    }
    if (phrase !== confirm) {
      setMsg('Passphrase and confirmation do not match.');
      return;
    }
    CloudBackupCrypto.setUserBackupPassphrase(phrase);
    setMsg('Passphrase set for this browser session. New backups will use it until you close the tab.');
    setPhrase('');
    setConfirm('');
  };

  const clear = () => {
    CloudBackupCrypto.setUserBackupPassphrase(null);
    setMsg('Passphrase cleared. Device vault key will be used for new backups.');
  };

  return (
    <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold">Backup passphrase (multi-device)</h3>
        {configured && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Configured
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Optional. Encrypt cloud backups with a passphrase you can re-enter on another device.
        Without this, backups use a device-bound vault key and may not restore elsewhere.
        The passphrase stays in this tab session only — it is never uploaded.
      </p>
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Passphrase (min 12 chars)"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="Confirm passphrase"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
        >
          Set passphrase
        </button>
        <button
          type="button"
          onClick={clear}
          className="px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs"
        >
          Clear
        </button>
      </div>
      {msg && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {msg}
        </p>
      )}
    </div>
  );
};
