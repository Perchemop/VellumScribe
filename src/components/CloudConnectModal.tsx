import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Trash2 } from 'lucide-react';
import { CloudStorageProvider, CloudAccount } from '../types';
import { CloudSyncEngine } from '../lib/cloudSync';

interface CloudConnectModalProps {
  provider: CloudStorageProvider;
  existingAccount?: CloudAccount;
  onClose: () => void;
  onConnected: (account: CloudAccount) => void;
  onDisconnected: (provider: CloudStorageProvider) => void;
}

export const CloudConnectModal: React.FC<CloudConnectModalProps> = ({
  provider,
  existingAccount,
  onClose,
  onConnected: _onConnected,
  onDisconnected,
}) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const providerName = provider === 'google_drive' ? 'Google Drive' : 'Microsoft OneDrive';

  const handleConnect = () => {
    window.location.href = `/api/cloud/${provider}/connect`;
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await fetch(`/api/cloud/${provider}/disconnect`, { method: 'POST' });
      CloudSyncEngine.removeAccount(provider);
      onDisconnected(provider);
    } catch (e) {
      console.error(e);
      CloudSyncEngine.removeAccount(provider);
      onDisconnected(provider);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-connect-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none animate-fade-in"
    >
      <div className="bg-white dark:bg-[#18181b] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <h3 id="cloud-connect-modal-title" className="font-bold text-zinc-900 dark:text-zinc-100">
            {existingAccount ? `Manage ${providerName}` : `Connect ${providerName}`}
          </h3>
          <button
            aria-label="Close dialog"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {existingAccount
              ? `You are connected as ${existingAccount.email || existingAccount.displayName || 'Authorized User'}.`
              : `You will be securely redirected to ${providerName} to authorize VellumScribe to manage encrypted backup archives.`}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            {existingAccount ? (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="flex items-center justify-center min-h-[40px] gap-1.5 px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-xl font-semibold text-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="flex items-center justify-center min-h-[40px] gap-1.5 px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl font-semibold text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Connect
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
