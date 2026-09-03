import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Trash2, ShieldCheck, CheckCircle2, Cloud, Lock, RefreshCw, Zap } from 'lucide-react';
import { CloudStorageProvider, CloudAccount } from '../types';
import { CloudSyncEngine } from '../lib/cloudSync';

interface CloudConnectModalProps {
  provider: CloudStorageProvider;
  existingAccount?: CloudAccount;
  onClose: () => void;
  onConnected: (account: CloudAccount) => void;
  onDisconnected: (provider: CloudStorageProvider) => void;
}

const PROVIDER_METADATA: Record<
  CloudStorageProvider,
  { name: string; brandColor: string; description: string; badge: string }
> = {
  instant_vault: {
    name: 'Vellum Cloud Vault',
    brandColor: '#6366f1',
    description: 'Instant zero-credential cloud backup with end-to-end client-side encryption.',
    badge: 'Zero Configuration',
  },
  google_drive: {
    name: 'Google Drive',
    brandColor: '#34a853',
    description: 'Sync encrypted snapshots directly to your Google Drive cloud space.',
    badge: '1-Click Cloud Bridge',
  },
  microsoft: {
    name: 'Microsoft OneDrive',
    brandColor: '#0078d4',
    description: 'Store encrypted backup snapshots safely in Microsoft OneDrive cloud.',
    badge: '1-Click Cloud Bridge',
  },
};

export const CloudConnectModal: React.FC<CloudConnectModalProps> = ({
  provider,
  existingAccount,
  onClose,
  onConnected,
  onDisconnected,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const meta = PROVIDER_METADATA[provider] || {
    name: provider,
    brandColor: '#6366f1',
    description: 'Encrypted cloud destination',
    badge: 'Zero Setup',
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 1-Click Instant Connect (Zero Credentials, No API Keys, No Session IDs)
  const handleInstantConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const account = await CloudSyncEngine.connectInstant(provider);
      onConnected(account);
    } catch (e: any) {
      console.error('Failed instant connect:', e);
      setError(e.message || 'Failed to connect. Please check network connectivity.');
    } finally {
      setLoading(false);
    }
  };

  // Optional OAuth redirect for users who have configured custom OAuth apps
  const handleOAuthConnect = () => {
    window.location.href = `/api/cloud/${provider}/connect`;
  };

  // Disconnect handler
  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await CloudSyncEngine.disconnectAccount(provider);
      onDisconnected(provider);
      onClose();
    } catch (e: any) {
      console.error('Failed to disconnect:', e);
      CloudSyncEngine.removeAccount(provider);
      onDisconnected(provider);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // Direct sync test to this provider
  const handleQuickSync = async () => {
    setIsSyncingNow(true);
    setSyncStatus('Initiating encrypted backup upload...');
    try {
      const success = await CloudSyncEngine.triggerSync({
        onProgress: (p) => setSyncStatus(p.message),
      });
      if (success) {
        setSyncStatus('✓ Backup snapshot verified and saved.');
      } else {
        setSyncStatus('Upload encountered an issue. See logs in Diagnostics.');
      }
    } catch (e: any) {
      setSyncStatus(`Sync failed: ${e.message}`);
    } finally {
      setIsSyncingNow(false);
      setTimeout(() => setSyncStatus(null), 4000);
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
      <div className="bg-white dark:bg-[#141418] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-zinc-200/70 dark:border-zinc-800/80">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs"
              style={{ color: meta.brandColor }}
            >
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 id="cloud-connect-modal-title" className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <span>{meta.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal">
                  {meta.badge}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                {existingAccount ? 'Connected & Active' : 'Zero-Key Cloud Backup'}
              </p>
            </div>
          </div>
          <button
            aria-label="Close dialog"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4">
          {/* Zero-friction Reassurance Banner */}
          <div className="p-3.5 bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/20 rounded-2xl space-y-1.5 text-xs text-emerald-900 dark:text-emerald-300">
            <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Zero-Credential Cloud Backups</span>
            </div>
            <p className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
              No API keys, client secrets, or session IDs required. All notes and recordings are encrypted locally on this device using AES-256-GCM before upload.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {existingAccount ? (
            /* Connected Account View */
            <div className="space-y-3">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Account Identity:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]">
                    {existingAccount.email || existingAccount.displayName}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Connected:</span>
                  <span className="text-zinc-600 dark:text-zinc-300 font-mono text-[11px]">
                    {new Date(existingAccount.connectedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Encryption:</span>
                  <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    AES-256-GCM
                  </span>
                </div>
              </div>

              {syncStatus && (
                <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                  <span className="truncate">{syncStatus}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  id="modal-quick-sync-btn"
                  onClick={handleQuickSync}
                  disabled={isSyncingNow || loading}
                  className="flex-1 min-h-[40px] px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                  <span>{isSyncingNow ? 'Backing Up...' : 'Backup Now'}</span>
                </button>

                <button
                  id="modal-disconnect-account-btn"
                  onClick={handleDisconnect}
                  disabled={loading || isSyncingNow}
                  className="min-h-[40px] px-3 py-2 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/60 rounded-xl font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            /* Unconnected State View */
            <div className="space-y-3">
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Connect {meta.name} in one click. Backups are stored as compressed, encrypted snapshot archives with integrity checksums.
              </p>

              <div className="space-y-2 pt-1">
                {/* 1-Click Instant Connect Button */}
                <button
                  id="modal-1click-connect-btn"
                  onClick={handleInstantConnect}
                  disabled={loading}
                  className="w-full min-h-[44px] px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Provisioning Secure Cloud Destination...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-400 dark:text-amber-500 fill-current" />
                      <span>1-Click Connect (Zero Credentials)</span>
                    </>
                  )}
                </button>

                {/* Optional OAuth link for users running with custom OAuth app credentials */}
                {provider !== 'instant_vault' && (
                  <button
                    id="modal-oauth-connect-btn"
                    onClick={handleOAuthConnect}
                    className="w-full text-center text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 py-1 transition-colors flex items-center justify-center gap-1"
                  >
                    <span>Or authorize via browser OAuth</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Footer Close */}
          <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
