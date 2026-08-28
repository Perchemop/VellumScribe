import React, { useState } from 'react';
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
  onConnected,
  onDisconnected,
}) => {
  const [loading, setLoading] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none animate-fade-in">
      <div className="bg-white dark:bg-[#18181b] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50">
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
            {existingAccount ? 'Manage Connection' : 'Connect Account'}
          </h3>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {existingAccount 
              ? `You are connected as ${existingAccount.email || existingAccount.displayName}.` 
              : 'You will be redirected to the provider to authorize VellumScribe to manage its backup file.'}
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
              Cancel
            </button>
            {existingAccount ? (
              <button 
                onClick={handleDisconnect} 
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-xl font-semibold text-sm transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Disconnect
              </button>
            ) : (
              <button 
                onClick={handleConnect} 
                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl font-semibold text-sm transition-colors"
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
