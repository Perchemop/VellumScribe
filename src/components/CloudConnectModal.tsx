import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Trash2, ShieldCheck, Cloud, RefreshCw, Zap, Server, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CloudStorageProvider, CloudAccount } from '../types';
import { CloudSyncEngine } from '../lib/cloudSync';
import { useModalBackHandler } from '../lib/modalBackStack';

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
  google_drive: {
    name: 'Google (SSO & Drive)',
    brandColor: '#34a853',
    description: 'Single Sign-On authentication and encrypted snapshots directly to your Google Drive.',
    badge: 'SSO & OAuth',
  },
  microsoft: {
    name: 'Microsoft (SSO & OneDrive)',
    brandColor: '#0078d4',
    description: 'Single Sign-On authentication and encrypted backup snapshots in Microsoft OneDrive.',
    badge: 'SSO & OAuth',
  },
  nextcloud: {
    name: 'Nextcloud',
    brandColor: '#0082c9',
    description: 'Store backups on a private or self-hosted Nextcloud server via authenticated WebDAV.',
    badge: 'Self-Hosted WebDAV',
  },
  webdav: {
    name: 'Custom WebDAV',
    brandColor: '#f59e0b',
    description: 'Universal standard WebDAV storage with authenticated endpoint.',
    badge: 'Standard WebDAV',
  },
};

export const CloudConnectModal: React.FC<CloudConnectModalProps> = ({
  provider,
  existingAccount,
  onClose,
  onConnected,
  onDisconnected,
}) => {
  useModalBackHandler(true, onClose, 'cloud-connect-modal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // WebDAV / Nextcloud credential form state
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remotePath, setRemotePath] = useState('/VellumScribeBackups');

  // SSO state
  const [hasOAuthEnv, setHasOAuthEnv] = useState<boolean | null>(null);

  const meta = PROVIDER_METADATA[provider] || {
    name: provider,
    brandColor: '#6366f1',
    description: 'Encrypted cloud destination',
    badge: 'Cloud Sync',
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    // Check provider configuration & OAuth availability
    CloudSyncEngine.fetchConfig()
      .then((cfg) => {
        if (cfg?.providers?.[provider]?.hasOAuthEnv !== undefined) {
          setHasOAuthEnv(Boolean(cfg.providers[provider].hasOAuthEnv));
        } else {
          setHasOAuthEnv(false);
        }
      })
      .catch(() => setHasOAuthEnv(false));
  }, [provider]);

  // SSO Popup OAuth Authentication
  const handleSSOAuthentication = async () => {
    if (provider !== 'google_drive' && provider !== 'microsoft') return;
    setLoading(true);
    setError(null);
    try {
      const authInfo = await CloudSyncEngine.getAuthUrl(provider);
      if (!authInfo.configured || !authInfo.url) {
        throw new Error(
          authInfo.message ||
            `OAuth credentials are not configured on this server for ${meta.name}. Please set ${
              provider === 'google_drive'
                ? 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'
                : 'MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET'
            } in the server environment.`
        );
      }

      const width = 520;
      const height = 650;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

      const popup = window.open(
        authInfo.url,
        `sso_${provider}`,
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );

      if (!popup || popup.closed) {
        throw new Error('Popup window was blocked by the browser. Please allow popups to complete authentication.');
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === provider) {
          window.removeEventListener('message', handleMessage);
          const accounts = CloudSyncEngine.getAccounts();
          const account = accounts.find((a) => a.provider === provider);
          if (account) {
            onConnected(account);
          }
          setLoading(false);
        } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
          window.removeEventListener('message', handleMessage);
          setError(event.data?.error || 'Authentication was cancelled or failed.');
          setLoading(false);
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (e: any) {
      console.error('Failed OAuth authentication:', e);
      setError(e.message || 'Failed to authenticate. Please verify server configuration and network connectivity.');
      setLoading(false);
    }
  };

  // Credential Connection for Nextcloud / WebDAV
  const handleCredentialConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl.trim() || !username.trim() || !password.trim()) {
      setError('Please provide Server URL, Username, and Password / App Token.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const account = await CloudSyncEngine.connectCredentials(
        provider as 'nextcloud' | 'webdav',
        {
          serverUrl: serverUrl.trim(),
          username: username.trim(),
          password: password.trim(),
          remotePath: remotePath.trim() || undefined,
        }
      );
      onConnected(account);
    } catch (e: any) {
      console.error('Failed credential connect:', e);
      setError(e.message || 'Failed to authenticate with WebDAV server. Check URL and credentials.');
    } finally {
      setLoading(false);
    }
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

  const isWebDAVProvider = provider === 'nextcloud' || provider === 'webdav';

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
                <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal">
                  {meta.badge}
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                {existingAccount ? 'Connected & Active' : meta.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Authentication Notice</p>
                <p className="opacity-90">{error}</p>
              </div>
            </div>
          )}

          {existingAccount ? (
            /* Connected State View */
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Active Connection</span>
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    ID: {existingAccount.accountId.slice(0, 8)}
                  </span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-0.5">
                  <p><strong>Account:</strong> {existingAccount.displayName || existingAccount.email || 'Connected Profile'}</p>
                  {existingAccount.email && <p><strong>Email:</strong> {existingAccount.email}</p>}
                  {existingAccount.serverUrl && <p className="font-mono text-xs truncate"><strong>Host:</strong> {existingAccount.serverUrl}</p>}
                  <p className="text-zinc-400 text-[11px]">
                    Connected {new Date(existingAccount.connectedAt).toLocaleDateString()} at {new Date(existingAccount.connectedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {syncStatus && (
                <div className="p-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-500 ${isSyncingNow ? 'animate-spin' : ''}`} />
                  <span>{syncStatus}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleQuickSync}
                  disabled={isSyncingNow}
                  className="flex-1 min-h-[40px] px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                  <span>{isSyncingNow ? 'Uploading...' : 'Sync Snapshot Now'}</span>
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={loading}
                  className="min-h-[40px] px-3 py-2 border border-rose-300 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            /* Unconnected State View */
            <div className="space-y-4">
              {/* Google Drive & Microsoft Single Sign-On (SSO) Flow */}
              {(provider === 'google_drive' || provider === 'microsoft') && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Authenticate with <strong>{meta.name}</strong> to enable secure Single Sign-On (SSO) and automatic encrypted backup storage.
                    </p>
                  </div>

                  {hasOAuthEnv === false && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-700 dark:text-amber-400 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>OAuth Environment Credentials Required</span>
                      </p>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        {provider === 'google_drive'
                          ? 'Server environment variables GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured to establish an authentic Google Drive connection.'
                          : 'Server environment variables MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET must be configured to establish an authentic OneDrive connection.'}
                      </p>
                      <p className="text-[11px] leading-relaxed pt-1">
                        For self-hosted zero-configuration storage, you can connect via <strong>Nextcloud</strong> or <strong>WebDAV</strong>.
                      </p>
                    </div>
                  )}

                  {/* SSO Action Button */}
                  <button
                    id={`sso-authenticate-btn-${provider}`}
                    onClick={handleSSOAuthentication}
                    disabled={loading || hasOAuthEnv === false}
                    className="w-full min-h-[46px] px-4 py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold text-xs shadow-md flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Authenticating with {meta.name}...</span>
                      </>
                    ) : hasOAuthEnv === false ? (
                      <>
                        <KeyRound className="w-4 h-4 text-zinc-400" />
                        <span>OAuth Unconfigured on Server</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-400 fill-current" />
                        <span>Sign In with {meta.name}</span>
                      </>
                    )}
                  </button>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                    <p className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Zero-Knowledge End-to-End Encryption</span>
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      All snapshots are encrypted locally with AES-256-GCM before transport. Your credentials and files remain strictly private.
                    </p>
                  </div>
                </div>
              )}

              {/* WebDAV / Nextcloud Flow */}
              {isWebDAVProvider && (
                <form onSubmit={handleCredentialConnect} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5" />
                      <span>WebDAV Server URL</span>
                    </label>
                    <input
                      type="url"
                      required
                      placeholder={
                        provider === 'nextcloud'
                          ? 'https://cloud.example.com/remote.php/dav/files/username'
                          : 'https://dav.example.com'
                      }
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Username</label>
                      <input
                        type="text"
                        required
                        placeholder="Username / Email"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-zinc-400" />
                        <span>Password / Token</span>
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="App password / token"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">Remote Backup Folder</label>
                    <input
                      type="text"
                      placeholder="/VellumScribeBackups"
                      value={remotePath}
                      onChange={(e) => setRemotePath(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl font-mono text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying WebDAV Connection...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Verify & Connect Server</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Footer Close */}
          <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
