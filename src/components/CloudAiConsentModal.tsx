import React from 'react';
import { ShieldAlert, Cloud, Lock, CheckCircle } from 'lucide-react';
import { PrivacyManager } from '../lib/privacyManager';

interface CloudAiConsentModalProps {
  providerName: string;
  operationDescription: string;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSwitchOffline?: () => void;
}

export const CloudAiConsentModal: React.FC<CloudAiConsentModalProps> = ({
  providerName,
  operationDescription,
  isOpen,
  onConfirm,
  onCancel,
  onSwitchOffline,
}) => {
  if (!isOpen) return null;

  const handleAllow = () => {
    PrivacyManager.grantCloudAiConsent();
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#18181b] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Cloud AI Data Transmission
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Privacy Consent Verification
              </p>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 mb-4 space-y-1.5">
            <p className="font-medium flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>External Provider Notice: {providerName}</span>
            </p>
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
              You are about to run:{' '}
              <strong className="font-semibold">{operationDescription}</strong>. This will transmit
              note content to an external cloud API over TLS encryption.
            </p>
          </div>

          <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 mb-4">
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                VellumScribe stores all notes locally in SQLite by default. Cloud processing occurs
                only upon your explicit instruction.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                You can revoke this consent or toggle 100% Private Offline Mode at any time in
                Settings.
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            {onSwitchOffline && (
              <button
                type="button"
                onClick={onSwitchOffline}
                className="w-full sm:w-auto px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-xl transition-colors text-center"
              >
                Use Local Offline AI
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-3 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 text-xs font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAllow}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
            >
              Allow & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
