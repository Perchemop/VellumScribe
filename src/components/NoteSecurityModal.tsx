import React, { useState } from 'react';
import { Lock, Unlock, X, AlertCircle, ShieldAlert } from 'lucide-react';
import { NoteRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { NotePayloadData } from '../lib/cryptoUtils';

interface NoteSecurityModalProps {
  note: NoteRecord;
  mode?: 'gate' | 'manage' | 'set';
  currentPayload?: NotePayloadData;
  onUnlockSession?: (payload: NotePayloadData, pin: string) => void;
  onSuccess: (updatedNote: NoteRecord) => void;
  onClose: () => void;
}

import { UnlockSessionManager } from '../lib/UnlockSessionManager';

export const NoteSecurityModal: React.FC<NoteSecurityModalProps> = ({
  note,
  mode: initialMode,
  currentPayload,
  onUnlockSession,
  onSuccess,
  onClose,
}) => {
  const isCurrentlyLocked = note.is_locked;
  const effectiveMode = initialMode || (isCurrentlyLocked ? 'gate' : 'set');

  const [mode, setMode] = useState<'gate' | 'manage' | 'set'>(effectiveMode);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }

    if (mode === 'set' && pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setIsProcessing(true);
    try {
      if (mode === 'gate') {
        // Session-only verification and decryption (non-destructive)
        const result = await StorageManager.verifyAndUnlockNote(note, pin);
        if (!result.success || !result.payload) {
          setError('Incorrect PIN. Please try again.');
          setIsProcessing(false);
          return;
        }

        if (note.pin_salt) {
          await UnlockSessionManager.createSession(note.id, pin, note.pin_salt);
        }

        if (onUnlockSession) {
          onUnlockSession(result.payload, pin);
        }
        onSuccess(note);
        onClose();
      } else if (mode === 'manage') {
        // Explicit removal of PIN lock
        const updated = await StorageManager.removeNotePinLock(note.id, pin);
        if (!updated) {
          setError('Incorrect PIN. Could not remove protection.');
          setIsProcessing(false);
          return;
        }
        onSuccess(updated);
        onClose();
      } else {
        // mode === 'set' (apply new PIN and encrypt payload)
        const updated = await StorageManager.setNotePinLock(note.id, pin, currentPayload);
        if (updated) {
          onSuccess(updated);
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Security validation error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none">
      <div className="w-full max-w-sm bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'gate' ? (
              <Lock className="w-4 h-4 text-amber-500" />
            ) : mode === 'manage' ? (
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            ) : (
              <Lock className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            )}
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              {mode === 'gate'
                ? 'Unlock Confidential Note'
                : mode === 'manage'
                ? 'Remove Security PIN'
                : 'Protect Note with PIN'}
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
          {mode === 'gate'
            ? 'Enter your security PIN to view and edit this note in your active session.'
            : mode === 'manage'
            ? 'Enter your PIN to permanently remove lock protection and decrypt content.'
            : 'Set a security PIN. Note content is encrypted with AES-256-GCM.'}
        </p>

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
              {mode === 'set' ? 'Security PIN (4+ digits)' : 'Current PIN'}
            </label>
            <input
              type="password"
              maxLength={8}
              autoFocus
              placeholder="••••"
              value={pin}
              disabled={isProcessing}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center tracking-widest text-lg font-mono p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
              required
            />
          </div>

          {mode === 'set' && (
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
                Confirm PIN
              </label>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={confirmPin}
                disabled={isProcessing}
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
              disabled={isProcessing}
              className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-2xs transition-opacity ${
                mode === 'manage'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900'
              }`}
            >
              {isProcessing
                ? 'Verifying...'
                : mode === 'gate'
                ? 'Unlock'
                : mode === 'manage'
                ? 'Remove Protection'
                : 'Lock Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
