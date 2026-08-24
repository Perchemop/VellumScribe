import React, { useState } from 'react';
import { Lock, Unlock, X, KeyRound, AlertCircle, Check } from 'lucide-react';
import { NoteRecord } from '../types';
import { SQLiteDatabase } from '../lib/storage';

interface NoteSecurityModalProps {
  note: NoteRecord;
  onSuccess: (updatedNote: NoteRecord) => void;
  onClose: () => void;
}

export const NoteSecurityModal: React.FC<NoteSecurityModalProps> = ({
  note,
  onSuccess,
  onClose,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isCurrentlyLocked = note.is_locked;

  const handleSetLock = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }

    if (!isCurrentlyLocked && pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    if (isCurrentlyLocked) {
      // Unlocking check
      if (note.lock_pin && note.lock_pin !== pin) {
        setError('Incorrect PIN. Please try again.');
        return;
      }
      const updated = SQLiteDatabase.updateNote(note.id, {
        is_locked: false,
        lock_pin: undefined,
      });
      if (updated) {
        onSuccess(updated);
        onClose();
      }
    } else {
      // Locking
      const updated = SQLiteDatabase.updateNote(note.id, {
        is_locked: true,
        lock_pin: pin,
      });
      if (updated) {
        onSuccess(updated);
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-sm bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCurrentlyLocked ? (
              <Unlock className="w-4 h-4 text-amber-500" />
            ) : (
              <Lock className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            )}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              {isCurrentlyLocked ? 'Unlock Confidential Note' : 'Protect Note with PIN'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-400">
          {isCurrentlyLocked
            ? 'Enter the 4-digit PIN to remove password protection from this note.'
            : 'Set a security PIN. The note content will be hidden from casual viewing.'}
        </p>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSetLock} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
              {isCurrentlyLocked ? 'Current PIN' : 'Security PIN (4+ digits)'}
            </label>
            <input
              type="password"
              maxLength={8}
              autoFocus
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center tracking-widest text-lg font-mono p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
              required
            />
          </div>

          {!isCurrentlyLocked && (
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
                Confirm PIN
              </label>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full text-center tracking-widest text-lg font-mono p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-2xs transition-opacity"
            >
              {isCurrentlyLocked ? 'Remove Lock' : 'Lock Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
