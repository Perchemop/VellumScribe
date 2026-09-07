import React, { useState, useEffect } from 'react';
import { Lock, Unlock, X, AlertCircle, ShieldAlert, KeyRound, EyeOff, ShieldCheck } from 'lucide-react';
import { NoteRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { NotePayloadData } from '../lib/cryptoUtils';
import { UnlockSessionManager } from '../lib/UnlockSessionManager';
import { useModalBackHandler } from '../lib/modalBackStack';

interface NoteSecurityModalProps {
  note: NoteRecord;
  mode?: 'gate' | 'manage' | 'set';
  currentPayload?: NotePayloadData;
  onUnlockSession?: (payload: NotePayloadData, pin: string) => void;
  onSuccess: (updatedNote: NoteRecord) => void;
  onClose: () => void;
}

export const NoteSecurityModal: React.FC<NoteSecurityModalProps> = ({
  note,
  mode: initialMode,
  currentPayload,
  onUnlockSession,
  onSuccess,
  onClose,
}) => {
  useModalBackHandler(true, onClose, 'note-security-modal');
  const isCurrentlyLocked = note.is_locked;
  const effectiveMode = initialMode || (isCurrentlyLocked ? 'gate' : 'set');

  const [mode, setMode] = useState<'gate' | 'manage' | 'set'>(effectiveMode);
  const [securityType, setSecurityType] = useState<'pin' | 'passphrase'>('pin');
  const [lockMode, setLockMode] = useState<'standard' | 'private'>('standard');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (securityType === 'pin' && pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }

    if (securityType === 'passphrase' && pin.length < 12) {
      setError('High-security passphrase must be at least 12 characters.');
      return;
    }

    if (mode === 'set' && pin !== confirmPin) {
      setError('Values do not match. Please re-enter.');
      return;
    }

    setIsProcessing(true);
    try {
      if (mode === 'gate') {
        // Session-only verification and decryption (non-destructive)
        const result = await StorageManager.verifyAndUnlockNote(note, pin);
        if (!result.success || !result.payload) {
          setError('Incorrect credential. Please try again.');
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
        // Explicit removal of lock
        const updated = await StorageManager.removeNotePinLock(note.id, pin);
        if (!updated) {
          setError('Incorrect credential. Could not remove protection.');
          setIsProcessing(false);
          return;
        }
        onSuccess(updated);
        onClose();
      } else {
        // mode === 'set' (apply new PIN/passphrase and encrypt payload)
        const updated = await StorageManager.setNotePinLock(
          note.id,
          pin,
          currentPayload,
          lockMode,
          securityType
        );
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'gate' ? (
              <Lock className="w-5 h-5 text-amber-500" />
            ) : mode === 'manage' ? (
              <ShieldAlert className="w-5 h-5 text-rose-500" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            )}
            <h3 id="security-modal-title" className="text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              {mode === 'gate'
                ? 'Unlock Protected Note'
                : mode === 'manage'
                ? 'Remove Note Protection'
                : 'Configure Note Encryption'}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close security modal"
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {mode === 'gate'
            ? 'Enter your security PIN or passphrase to view and edit this note in your active session.'
            : mode === 'manage'
            ? 'Enter your credentials to permanently decrypt note contents and remove protection.'
            : 'Encrypted at rest using AES-256-GCM with PBKDF2-HMAC-SHA256 key derivation.'}
        </p>

        {mode === 'set' && (
          <div className="space-y-3 pt-1">
            {/* Protection Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Security Scheme
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSecurityType('pin');
                    setPin('');
                    setConfirmPin('');
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-colors ${
                    securityType === 'pin'
                      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Quick PIN</span>
                  </div>
                  <span className="text-xs text-zinc-500">4–8 digits • Fast convenience</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSecurityType('passphrase');
                    setPin('');
                    setConfirmPin('');
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-colors ${
                    securityType === 'passphrase'
                      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Passphrase</span>
                  </div>
                  <span className="text-xs text-zinc-500">12+ chars • High entropy</span>
                </button>
              </div>
            </div>

            {/* Lock Scope Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Lock Scope
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLockMode('standard')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-colors ${
                    lockMode === 'standard'
                      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Standard Lock</span>
                  <span className="text-xs text-zinc-500">Encrypts body & attachments. Title remains readable.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLockMode('private')}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-colors ${
                    lockMode === 'private'
                      ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <EyeOff className="w-3 h-3 text-amber-500" />
                    <span>Private Lock</span>
                  </div>
                  <span className="text-xs text-zinc-500">Encrypts title, tags & body. Displays "🔒 Locked Note".</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-semibold text-zinc-500 block mb-1">
              {mode === 'set'
                ? securityType === 'pin'
                  ? 'Security PIN (4–8 numeric digits)'
                  : 'Strong Passphrase (12+ characters)'
                : 'Current PIN or Passphrase'}
            </label>
            <input
              type="password"
              maxLength={mode === 'set' && securityType === 'pin' ? 8 : 128}
              autoFocus
              placeholder={securityType === 'pin' ? '••••' : 'Enter strong passphrase'}
              value={pin}
              disabled={isProcessing}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center tracking-widest text-base font-mono p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
              required
            />
          </div>

          {mode === 'set' && (
            <div>
              <label className="text-xs font-semibold text-zinc-500 block mb-1">
                Confirm {securityType === 'pin' ? 'PIN' : 'Passphrase'}
              </label>
              <input
                type="password"
                maxLength={securityType === 'pin' ? 8 : 128}
                placeholder={securityType === 'pin' ? '••••' : 'Repeat passphrase'}
                value={confirmPin}
                disabled={isProcessing}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="w-full text-center tracking-widest text-base font-mono p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-3.5 py-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className={`px-5 py-2 text-xs font-semibold rounded-lg shadow-2xs transition-opacity min-h-[44px] ${
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
                : 'Encrypt Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
