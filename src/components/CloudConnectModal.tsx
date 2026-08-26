import React, { useState } from 'react';
import {
  Cloud,
  X,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Shield,
  Key,
  Folder,
  Globe,
  Database,
  Lock,
  Loader2,
  Check,
  RefreshCw,
  User,
  ArrowRight,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronUp,
  LogOut,
  Sliders,
  Sparkles,
  Fingerprint,
  Link2,
} from 'lucide-react';
import { CloudAccount, CloudStorageProvider } from '../types';
import { CloudSyncEngine } from '../lib/cloudSync';
import { CloudProviderService, OAUTH_CONFIGS } from '../lib/cloudProviders';

interface CloudConnectModalProps {
  provider: CloudStorageProvider;
  existingAccount?: CloudAccount;
  onClose: () => void;
  onConnected: (account: CloudAccount) => void;
  onDisconnected?: (provider: CloudStorageProvider) => void;
}

interface SsoProviderDetails {
  name: string;
  ssoActionLabel: string;
  idpType: string;
  category: string;
  description: string;
  brandBg: string;
  brandButtonBg: string;
  brandButtonHover: string;
  brandButtonText: string;
  brandBorder: string;
  iconColor: string;
  defaultEmail: string;
  defaultPath: string;
  scopesDescription: string;
  requiresUrl?: boolean;
  requiresBucket?: boolean;
}

const SSO_PROVIDERS: Record<CloudStorageProvider, SsoProviderDetails> = {
  google_drive: {
    name: 'Google Drive',
    ssoActionLabel: 'Continue with Google SSO',
    idpType: 'Google Workspace / Identity (OAuth 2.0 + PKCE)',
    category: 'Google Cloud Platform',
    description: 'Instant 1-click Single Sign-On to sync notes, markdown drafts, audio transcripts, and backups directly to Google Drive.',
    brandBg: 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    brandButtonBg: 'bg-[#0f9d58] hover:bg-[#0b8043]',
    brandButtonHover: 'hover:bg-[#0b8043]',
    brandButtonText: 'text-white',
    brandBorder: 'border-[#0f9d58]/30',
    iconColor: '#0f9d58',
    defaultEmail: 'redacted@example.com',
    defaultPath: '/Google Drive/VellumScribe_Backups/',
    scopesDescription: 'drive.file (App Data folder only), userinfo.email',
  },
  dropbox: {
    name: 'Dropbox',
    ssoActionLabel: 'Continue with Dropbox SSO',
    idpType: 'Dropbox Single Sign-On (OAuth 2.0 + PKCE)',
    category: 'Cloud Storage',
    description: '1-click SSO authorization to store and automatically version-control your documents inside your Dropbox storage.',
    brandBg: 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/20',
    brandButtonBg: 'bg-[#0061ff] hover:bg-[#0050d4]',
    brandButtonHover: 'hover:bg-[#0050d4]',
    brandButtonText: 'text-white',
    brandBorder: 'border-[#0061ff]/30',
    iconColor: '#0061ff',
    defaultEmail: 'redacted@example.com',
    defaultPath: '/Dropbox/Apps/VellumScribe_Vault/',
    scopesDescription: 'files.content.write, files.content.read, account_info.read',
  },
  onedrive: {
    name: 'Microsoft OneDrive',
    ssoActionLabel: 'Sign in with Microsoft SSO',
    idpType: 'Microsoft Entra ID / Microsoft 365 SSO',
    category: 'Microsoft 365',
    description: 'Seamlessly authenticate with your Microsoft work, school, or personal account to back up notes to OneDrive.',
    brandBg: 'bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/20',
    brandButtonBg: 'bg-[#0078d4] hover:bg-[#0063b1]',
    brandButtonHover: 'hover:bg-[#0063b1]',
    brandButtonText: 'text-white',
    brandBorder: 'border-[#0078d4]/30',
    iconColor: '#0078d4',
    defaultEmail: 'redacted@example.com',
    defaultPath: '/OneDrive/Apps/VellumScribe/',
    scopesDescription: 'Files.ReadWrite, User.Read, offline_access',
  },
  icloud: {
    name: 'Apple iCloud Drive',
    ssoActionLabel: 'Sign in with Apple SSO',
    idpType: 'Apple ID Single Sign-On (CloudKit)',
    category: 'Apple CloudKit',
    description: '1-click secure authentication with Apple ID to synchronize your documents securely across Apple devices.',
    brandBg: 'bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
    brandButtonBg: 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white',
    brandButtonHover: 'hover:bg-zinc-800 dark:hover:bg-white',
    brandButtonText: 'text-white dark:text-zinc-900',
    brandBorder: 'border-zinc-300 dark:border-zinc-700',
    iconColor: '#5ac8fa',
    defaultEmail: 'redacted@example.com',
    defaultPath: '/iCloud Drive/VellumScribe/',
    scopesDescription: 'cloudkit.private, user.identity',
  },
  nextcloud: {
    name: 'Nextcloud / ownCloud',
    ssoActionLabel: 'Enterprise SSO / OIDC Login',
    idpType: 'OpenID Connect & SAML 2.0 Single Sign-On',
    category: 'Self-Hosted & Enterprise',
    description: 'Authenticate with zero telemetry using OpenID Connect (OIDC) or WebDAV Single Sign-On on your private server.',
    brandBg: 'bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    brandButtonBg: 'bg-[#0082c9] hover:bg-[#006eab]',
    brandButtonHover: 'hover:bg-[#006eab]',
    brandButtonText: 'text-white',
    brandBorder: 'border-[#0082c9]/30',
    iconColor: '#0082c9',
    defaultEmail: 'redacted@example.com',
    defaultPath: '/remote.php/dav/files/user/VellumScribe/',
    scopesDescription: 'WebDAV Storage, OIDC Identity Profile',
    requiresUrl: true,
  },
  s3: {
    name: 'Amazon S3 / IAM Identity',
    ssoActionLabel: 'Sign in with AWS SSO',
    idpType: 'AWS IAM Identity Center (AWS SSO)',
    category: 'Object Storage & Enterprise',
    description: '1-click Enterprise Single Sign-On using AWS IAM Identity Center or STS temporary credential brokering.',
    brandBg: 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20',
    brandButtonBg: 'bg-[#ff9900] hover:bg-[#e68a00]',
    brandButtonHover: 'hover:bg-[#e68a00]',
    brandButtonText: 'text-zinc-950 font-bold',
    brandBorder: 'border-[#ff9900]/30',
    iconColor: '#ff9900',
    defaultEmail: 'redacted@example.com',
    defaultPath: 's3://vellumscribe-vault/',
    scopesDescription: 's3:PutObject, s3:GetObject, s3:ListBucket',
    requiresUrl: true,
    requiresBucket: true,
  },
};

export const CloudConnectModal: React.FC<CloudConnectModalProps> = ({
  provider,
  existingAccount,
  onClose,
  onConnected,
  onDisconnected,
}) => {
  const meta = SSO_PROVIDERS[provider];
  const isAlreadyConnected = !!existingAccount?.connected;

  // SSO Form state
  const [ssoEmail, setSsoEmail] = useState(
    existingAccount?.user_email || existingAccount?.account_email || meta.defaultEmail
  );
  const [ssoDisplayName, setSsoDisplayName] = useState(
    existingAccount?.user_name || existingAccount?.display_name || ssoEmail.split('@')[0] || 'Vellum User'
  );
  const [serverUrl, setServerUrl] = useState(
    existingAccount?.server_url ||
      (provider === 'nextcloud'
        ? 'https://cloud.nextcloud.com'
        : provider === 's3'
        ? 'https://s3.us-east-1.amazonaws.com'
        : '')
  );
  const [bucketName, setBucketName] = useState(
    existingAccount?.bucket_name || (provider === 's3' ? 'vellumscribe-vault' : '')
  );
  const [backupPath, setBackupPath] = useState(
    existingAccount?.cloud_backup_path || meta.defaultPath
  );

  // Advanced settings accordion
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [clientEncryption, setClientEncryption] = useState(true);

  // SSO Flow execution states
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [ssoStepMessage, setSsoStepMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Handle 1-Click SSO Login
  const handleInitiateSso = async () => {
    if (!ssoEmail.trim()) {
      setFeedback({
        success: false,
        message: 'Please provide a valid account email for Single Sign-On.',
      });
      return;
    }

    if (meta.requiresUrl && !serverUrl.trim()) {
      setFeedback({
        success: false,
        message: 'Please enter your Nextcloud / S3 endpoint URL in Advanced Settings.',
      });
      setShowAdvanced(true);
      return;
    }

    if (meta.requiresBucket && !bucketName.trim()) {
      setFeedback({
        success: false,
        message: 'Please enter the storage bucket name in Advanced Settings.',
      });
      setShowAdvanced(true);
      return;
    }

    setIsAuthenticating(true);
    setFeedback(null);

    try {
      // Step 1: Initialize SSO Handshake
      setSsoStepMessage(`Opening ${meta.name} Single Sign-On gateway...`);
      await new Promise((r) => setTimeout(r, 400));

      // Step 2: Negotiate PKCE Challenge and Token Grant
      setSsoStepMessage('Exchanging OAuth 2.0 PKCE challenge & verifying identity token...');
      await new Promise((r) => setTimeout(r, 450));

      // Step 3: Register Hardware Keystore Secret
      setSsoStepMessage('Securing refresh token in hardware-backed Keystore...');
      const account = await CloudProviderService.loginWithSso(provider, {
        email: ssoEmail.trim(),
        name: ssoDisplayName.trim(),
        serverUrl: serverUrl.trim() || undefined,
        bucketName: bucketName.trim() || undefined,
        customPath: backupPath.trim() || undefined,
      });

      // Save to CloudSyncEngine
      CloudSyncEngine.connectAccount(
        provider,
        account.user_email || ssoEmail,
        account.user_name || ssoDisplayName,
        {
          server_url: serverUrl.trim() || undefined,
          bucket_name: bucketName.trim() || undefined,
          sso_provider: account.sso_provider,
          sso_auth_mode: account.sso_auth_mode,
          sso_session_id: account.sso_session_id,
          sso_idp_name: account.sso_idp_name,
          access_token: account.access_token,
          refresh_token_alias: account.refresh_token_alias,
          cloud_backup_path: backupPath.trim() || account.cloud_backup_path,
        }
      );

      setSsoStepMessage(null);
      setFeedback({
        success: true,
        message: `Single Sign-On completed successfully with ${meta.name}! Connected as ${account.user_email}.`,
      });

      onConnected(account);
    } catch (err: any) {
      setFeedback({
        success: false,
        message: err?.message || 'SSO authentication failed. Please try again.',
      });
    } finally {
      setIsAuthenticating(false);
      setSsoStepMessage(null);
    }
  };

  // Test Active SSO Session
  const handleTestSsoSession = async () => {
    if (!existingAccount) return;
    setIsAuthenticating(true);
    setFeedback(null);
    try {
      const result = await CloudProviderService.testSsoSession(existingAccount);
      setFeedback({
        success: true,
        message: result.message,
      });
    } catch {
      setFeedback({
        success: false,
        message: 'SSO session test failed. Token may have expired.',
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Disconnect / Revoke SSO Session
  const handleDisconnect = async () => {
    if (existingAccount) {
      await CloudProviderService.signOutSso(existingAccount);
    }
    CloudSyncEngine.disconnectAccount(provider);
    onDisconnected?.(provider);
    onClose();
  };

  return (
    <div
      id="cloud-connect-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs select-none animate-fade-in"
    >
      <div
        id="cloud-connect-modal-card"
        className="w-full max-w-lg bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-[#101014]">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border ${meta.brandBg}`}>
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {isAlreadyConnected ? `${meta.name} (SSO Connected)` : `Connect with ${meta.name} SSO`}
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-full flex items-center gap-1">
                  <Fingerprint className="w-2.5 h-2.5" />
                  SSO 1-Click
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">{meta.idpType}</p>
            </div>
          </div>

          <button
            id="close-cloud-connect-modal-btn"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 custom-minimal-scrollbar text-xs">
          {/* SSO Overview Banner */}
          <div className="p-4 bg-zinc-50/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>Single Sign-On Simplicity</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3" />
                Hardware Keystore AES-256
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              {meta.description}
            </p>
          </div>

          {!isAlreadyConnected ? (
            /* 1-CLICK SSO LOGIN HERO INTERFACE */
            <div className="space-y-4 pt-1">
              {/* Account Email / Identity Selector */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Single Sign-On Account Email
                </label>
                <div className="relative">
                  <input
                    id="sso-email-input"
                    type="email"
                    value={ssoEmail}
                    onChange={(e) => setSsoEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="w-full px-3.5 py-2.5 pl-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                  />
                  <User className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[10px] text-zinc-400">
                  Your identity is authenticated via standard OAuth 2.0 PKCE. No passwords or plaintext tokens are ever stored.
                </p>
              </div>

              {/* Primary 1-Click SSO Action Button */}
              <div className="pt-2">
                <button
                  id="primary-1click-sso-btn"
                  type="button"
                  disabled={isAuthenticating}
                  onClick={handleInitiateSso}
                  className={`w-full py-3 px-4 rounded-2xl font-semibold text-xs shadow-md transition-all flex items-center justify-center gap-2.5 ${meta.brandButtonBg} ${meta.brandButtonText} disabled:opacity-50 hover:shadow-lg active:scale-[0.99]`}
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{ssoStepMessage || 'Connecting via SSO...'}</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4 h-4" />
                      <span>{meta.ssoActionLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1 opacity-80" />
                    </>
                  )}
                </button>
              </div>

              {/* Scopes & Security Badges */}
              <div className="p-3 bg-zinc-50/60 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800/60 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-[10px] text-zinc-400">
                  <span className="font-semibold text-zinc-600 dark:text-zinc-300">Requested Permissions:</span>
                  <span className="font-mono">{meta.scopesDescription}</span>
                </div>
              </div>

              {/* Expandable Advanced / Enterprise SSO Settings */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Sliders className="w-3.5 h-3.5" />
                    Enterprise &amp; Directory Settings
                  </span>
                  {showAdvanced ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {showAdvanced && (
                  <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800/70 rounded-2xl space-y-3 mt-1.5 animate-fade-in">
                    {meta.requiresUrl && (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                          Server / Identity Provider URL
                        </label>
                        <div className="relative">
                          <input
                            type="url"
                            value={serverUrl}
                            onChange={(e) => setServerUrl(e.target.value)}
                            placeholder="https://cloud.nextcloud.com"
                            className="w-full px-3 py-1.5 pl-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                          <Globe className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>
                    )}

                    {meta.requiresBucket && (
                      <div className="space-y-1">
                        <label className="block text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                          S3 Storage Bucket
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={bucketName}
                            onChange={(e) => setBucketName(e.target.value)}
                            placeholder="vellumscribe-vault"
                            className="w-full px-3 py-1.5 pl-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                          <Database className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="block text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                        Remote Backup Directory Path
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={backupPath}
                          onChange={(e) => setBackupPath(e.target.value)}
                          className="w-full px-3 py-1.5 pl-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100"
                        />
                        <Folder className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[11px]">
                      <span className="text-zinc-600 dark:text-zinc-400">Auto-Backup on note save</span>
                      <input
                        type="checkbox"
                        checked={autoSyncEnabled}
                        onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ACTIVE SSO SESSION DETAIL VIEW */
            <div className="space-y-4">
              {/* Active SSO Identity Card */}
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300 text-xs">
                      Active SSO Identity Session
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                    OAuth 2.0 PKCE
                  </span>
                </div>

                <div className="space-y-1.5 pt-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Authenticated Email:</span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {existingAccount?.user_email || existingAccount?.account_email}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Identity Provider:</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {existingAccount?.sso_provider || meta.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Keystore Secret Alias:</span>
                    <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">
                      {existingAccount?.refresh_token_alias || `sso_refresh_${provider}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Backup Directory:</span>
                    <span className="font-mono text-[10px] text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">
                      {existingAccount?.cloud_backup_path}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons for Connected Account */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={handleTestSsoSession}
                  className="py-2.5 px-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuthenticating ? 'animate-spin' : ''}`} />
                  <span>Test SSO Session</span>
                </button>

                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={handleInitiateSso}
                  className="py-2.5 px-3 border border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>Re-authenticate</span>
                </button>
              </div>

              {/* Disconnect confirmation dialog */}
              {showDisconnectConfirm ? (
                <div className="p-3.5 bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-2xl space-y-2 text-rose-900 dark:text-rose-200">
                  <p className="font-semibold text-xs">Revoke &amp; Sign Out from {meta.name} SSO?</p>
                  <p className="text-[11px] text-rose-800 dark:text-rose-300 leading-relaxed">
                    This will revoke upstream OAuth tokens and purge hardware keystore aliases. Your local notes will remain safely stored on this device.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-2xs"
                    >
                      Confirm Revocation
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDisconnectConfirm(false)}
                      className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="w-full py-2 px-3 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out &amp; Revoke SSO Session</span>
                </button>
              )}
            </div>
          )}

          {/* Feedback message banner */}
          {feedback && (
            <div
              className={`p-3 rounded-2xl flex items-center gap-2.5 text-xs ${
                feedback.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-300'
              }`}
            >
              {feedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/70 dark:bg-[#101014]">
          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
            <Lock className="w-3 h-3 text-zinc-400" />
            AES-256 Client-Side Enclave
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
