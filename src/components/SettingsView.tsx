import React, { useState } from 'react';
import {
  Sparkles,
  Cloud,
  HardDrive,
  Shield,
  Layers,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Database,
  RefreshCw,
  Cpu,
  Check,
  ChevronRight,
  WifiOff,
  Clock,
  Zap,
  Smartphone,
  Download,
  ShieldCheck,
  FileCheck,
  ArrowDownToLine,
  Server,
  BarChart3,
} from 'lucide-react';
import { CloudAccount, CloudStorageProvider, SyncTelemetry, NoteRecord } from '../types';
import { Capacitor } from '@capacitor/core';
import { AiSettingsManager } from '../lib/aiSettings';
import {
  CloudSyncEngine,
  BackupFrequency,
  SyncProgressUpdate,
  RemoteBackupItem,
  QueuedSyncItem,
} from '../lib/cloudSync';
import { StorageManager } from '../lib/storage';
import { AndroidKeystoreManager } from '../lib/keystore';
import { PrivacyManager } from '../lib/privacyManager';
import { MetricsManager } from '../lib/metricsManager';
import { CURRENT_APP_VERSION } from '../lib/appUpdateManager';
import { AndroidPwaManager } from '../lib/androidPwaManager';
import { AppLogo } from './AppLogo';
import { CloudConnectModal } from './CloudConnectModal';
import { SyncProgressBar } from './SyncProgressBar';
import { StorageDashboard } from './StorageDashboard';
import { ImportSafetyPipeline, ImportPreviewResult } from '../lib/importSafety';
import { useModalBackHandler } from '../lib/modalBackStack';
import { OfflineAiPanel } from './settings/OfflineAiPanel';
import { CloudSettingsPanel } from './settings/CloudSettingsPanel';
import { SecurityPanel } from './settings/SecurityPanel';
import { StoragePanel } from './settings/StoragePanel';
import { AboutPanel } from './settings/AboutPanel';
import { DiagnosticsTools } from './settings/DiagnosticsTools';
import { CrashReportingPanel } from './settings/CrashReportingPanel';
import { ConflictResolverPanel } from './settings/ConflictResolverPanel';
import { AppLogger } from '../lib/logger';
import { asErrorLike } from '../lib/errorLike';

interface SettingsViewProps {
  initialSubtab?: 'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics' | 'offline-ai' | 'about';
  onOpenConflictModal?: () => void;
  onOpenUpdateModal?: () => void;
  onOpenOnboardingGuide?: () => void;
  onRefreshNotes: () => void;
  onBackToNotes?: () => void;
  activeEditingNoteTitle?: string;
}

interface ProviderCardMeta {
  name: string;
  category: string;
  description: string;
  brandColor: string;
  badgeBg: string;
}

const PROVIDERS: Record<CloudStorageProvider, ProviderCardMeta> = {
  google_drive: {
    name: 'Google Drive',
    category: 'Google',
    description: 'Sign in and back up notes.',
    brandColor: '#34a853',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  microsoft: {
    name: 'OneDrive',
    category: 'Microsoft',
    description: 'Sign in and back up notes.',
    brandColor: '#0078d4',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
  nextcloud: {
    name: 'Nextcloud',
    category: 'Nextcloud',
    description: 'Private or self-hosted backup.',
    brandColor: '#0082c9',
    badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  webdav: {
    name: 'WebDAV',
    category: 'WebDAV',
    description: 'Any WebDAV server.',
    brandColor: '#f59e0b',
    badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSubtab = 'cloud',
  onOpenConflictModal,
  onOpenUpdateModal,
  onOpenOnboardingGuide,
  onRefreshNotes,
  onBackToNotes,
  activeEditingNoteTitle,
}) => {
  const [settingsMode, setSettingsMode] = useState<'simple' | 'advanced'>(() => {
    try {
      const s = localStorage.getItem('vellumscribe_settings_mode_v1');
      return s === 'advanced' ? 'advanced' : 'simple';
    } catch {
      return 'simple';
    }
  });

  const [activeTab, setActiveTab] = useState<
    'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics' | 'about'
  >(initialSubtab === 'offline-ai' ? 'ai' : initialSubtab || 'cloud');

  const setMode = (mode: 'simple' | 'advanced') => {
    setSettingsMode(mode);
    try {
      localStorage.setItem('vellumscribe_settings_mode_v1', mode);
    } catch {
      /* ignore */
    }
    if (mode === 'simple' && !['cloud', 'ai', 'storage', 'security', 'about'].includes(activeTab)) {
      setActiveTab('cloud');
    }
  };

  const [canInstallPwa, setCanInstallPwa] = useState(() => AndroidPwaManager.canPromptInstall());
  const [pwaInstalledSuccess, setPwaInstalledSuccess] = useState(false);

  React.useEffect(() => {
    return AndroidPwaManager.subscribe((can) => {
      setCanInstallPwa(can);
    });
  }, []);

  // Cloud Backup State
  const [accounts, setAccounts] = useState<CloudAccount[]>(() => CloudSyncEngine.getAccounts());
  const [telemetryList, setTelemetryList] = useState<SyncTelemetry[]>(() =>
    CloudSyncEngine.getTelemetry()
  );
  const [notes, setNotes] = useState<NoteRecord[]>(() => StorageManager.getNotes());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [backupFrequency, setBackupFrequencyState] = useState<BackupFrequency>(() =>
    CloudSyncEngine.getBackupFrequency()
  );
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [metricsEnabled, setMetricsEnabled] = useState<boolean>(PrivacyManager.isMetricsEnabled());

  const handleMetricsToggle = (enabled: boolean) => {
    if (enabled) MetricsManager.enable();
    else MetricsManager.disable();
    setMetricsEnabled(PrivacyManager.isMetricsEnabled());
  };
  const [selectedProviderForConnect, setSelectedProviderForConnect] =
    useState<CloudStorageProvider | null>(null);
  const [remoteBackups, setRemoteBackups] = useState<Record<string, RemoteBackupItem[]>>({});
  const [loadingRemoteBackups, setLoadingRemoteBackups] = useState<Record<string, boolean>>({});
  const [isRestoringBackupId, setIsRestoringBackupId] = useState<string | null>(null);
  const [restoreConfirmTarget, setRestoreConfirmTarget] = useState<{
    provider: CloudStorageProvider;
    backupId: string;
    title?: string;
  } | null>(null);

  useModalBackHandler(
    !!restoreConfirmTarget,
    () => setRestoreConfirmTarget(null),
    'settings-restore-backup-modal'
  );
  const [quickConnectingProvider, setQuickConnectingProvider] =
    useState<CloudStorageProvider | null>(null);
  const [syncQueue, setSyncQueue] = useState<QueuedSyncItem[]>(() =>
    CloudSyncEngine.getSyncQueue()
  );

  // AI State
  const [googleKeyInput, setGoogleKeyInput] = useState<string>(() =>
    AiSettingsManager.getGoogleApiKey()
  );
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [isVerifyingGoogle, setIsVerifyingGoogle] = useState(false);
  const [googleVerifyResult, setGoogleVerifyResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [, setFileUploadFeedback] = useState<string | null>(null);

  // Storage stats & Keystore
  const [, setStats] = useState(() => StorageManager.getStorageStats());
  const [secrets] = useState(() => AndroidKeystoreManager.listSecrets());

  // Import pipeline state
  const [importPreviewData, setImportPreviewData] = useState<ImportPreviewResult | null>(null);
  const [importRawPayload, setImportRawPayload] = useState<string | null>(null);
  const [isExecutingImport, setIsExecutingImport] = useState<boolean>(false);

  useModalBackHandler(
    !!importPreviewData,
    () => {
      setImportPreviewData(null);
      setImportRawPayload(null);
    },
    'settings-import-preview-modal'
  );

  const isAirGapped = backupFrequency === 'off';
  const activeAccounts = accounts; // Everyone connected is active now

  // Manual Sync trigger
  const handleManualSync = async () => {
    if (isAirGapped) {
      setSyncFeedback('Offline — local only.');
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    setSyncProgress({ percent: 10, message: 'Backing up…', phase: 'init' });

    try {
      const success = await CloudSyncEngine.triggerSync({
        onProgress: (p) => setSyncProgress(p),
      });
      setTelemetryList(CloudSyncEngine.getTelemetry());
      setAccounts(CloudSyncEngine.getAccounts());
      setSyncQueue(CloudSyncEngine.getSyncQueue());
      setNotes(StorageManager.getNotes());
      setSyncFeedback(success ? 'Sync complete' : 'Sync failed — will retry.');
      onRefreshNotes();
    } catch {
      setSyncQueue(CloudSyncEngine.getSyncQueue());
      setSyncFeedback('Sync failed — will retry.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncProgress(null);
      }, 2500);
    }
  };

  const handleFlushQueue = async () => {
    setIsSyncing(true);
    setSyncFeedback('Retrying queue…');
    try {
      const res = await CloudSyncEngine.processSyncQueue();
      setSyncQueue(CloudSyncEngine.getSyncQueue());
      setTelemetryList(CloudSyncEngine.getTelemetry());
      setAccounts(CloudSyncEngine.getAccounts());
      setSyncFeedback(`Queue flushed: ${res.success} succeeded, ${res.failed} failed.`);
    } catch {
      setSyncFeedback('Queue processing failed. Please check network connectivity.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleClearQueue = () => {
    CloudSyncEngine.clearSyncQueue();
    setSyncQueue([]);
    setSyncFeedback('Queue cleared.');
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  // Frequency change
  const handleFrequencyChange = (val: BackupFrequency) => {
    setBackupFrequencyState(val);
    CloudSyncEngine.setBackupFrequency(val);
    if (val === 'off') {
      setSyncFeedback('Backups off.');
    } else {
      setSyncFeedback(`Backup frequency updated to: ${val}`);
    }
    setTimeout(() => setSyncFeedback(null), 3500);
  };

  const handleLoadRemoteBackups = async (provider: CloudStorageProvider) => {
    setLoadingRemoteBackups((prev) => ({ ...prev, [provider]: true }));
    try {
      const items = await CloudSyncEngine.fetchRemoteBackups(provider);
      setRemoteBackups((prev) => ({ ...prev, [provider]: items }));
    } catch (e) {
      AppLogger.warn('SettingsView', `Failed to fetch remote backups for ${provider}:`, e);
    } finally {
      setLoadingRemoteBackups((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const handleSSOConnect = async (provider: 'google_drive' | 'microsoft') => {
    setQuickConnectingProvider(provider);
    setSyncFeedback(null);
    try {
      // First check if OAuth URL is configured for popup SSO
      const authInfo = await CloudSyncEngine.getAuthUrl(provider);
      if (authInfo.configured && authInfo.url) {
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
          throw new Error(
            'SSO popup blocked by browser. Please allow popups or use the connect modal.'
          );
        }

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.provider === provider) {
            window.removeEventListener('message', handleMessage);
            setAccounts(CloudSyncEngine.getAccounts());
            setSyncFeedback(`✓ Successfully authenticated with ${PROVIDERS[provider].name}.`);
            handleLoadRemoteBackups(provider);
            setQuickConnectingProvider(null);
          } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
            window.removeEventListener('message', handleMessage);
            setSyncFeedback(
              `Authentication notice: ${event.data?.error || 'SSO was not completed.'}`
            );
            setQuickConnectingProvider(null);
          }
        };
        window.addEventListener('message', handleMessage);
      } else {
        setSyncFeedback(
          authInfo.message ||
            `OAuth credentials are not configured on the server for ${PROVIDERS[provider].name}. Please configure environment variables or use WebDAV.`
        );
        setQuickConnectingProvider(null);
      }
    } catch (_e) {
      const e = asErrorLike(_e);
      setSyncFeedback(`SSO connection notice: ${e.message || 'Unable to connect'}.`);
      setQuickConnectingProvider(null);
    } finally {
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const promptRestoreRemoteBackup = (
    provider: CloudStorageProvider,
    backupId: string,
    title?: string
  ) => {
    setRestoreConfirmTarget({ provider, backupId, title });
  };

  const handleExecuteRestore = async () => {
    if (!restoreConfirmTarget) return;
    const { provider, backupId } = restoreConfirmTarget;
    setRestoreConfirmTarget(null);

    setIsRestoringBackupId(backupId);
    setSyncFeedback('Restoring…');
    try {
      const res = await CloudSyncEngine.restoreFromCloudBackup(provider, backupId);
      if (res.success) {
        setSyncFeedback('Restored.');
        setNotes(StorageManager.getNotes());
        onRefreshNotes();
      } else {
        setSyncFeedback(
          `Could not restore backup: ${res.message || 'Snapshot verification failed'}. Your local notes remain safe.`
        );
      }
    } catch (_e) {
      const e = asErrorLike(_e);
      setSyncFeedback(
        `Restore failed: ${e.message || 'Error occurred while decrypting'}. Your existing local notes remain completely safe.`
      );
    } finally {
      setIsRestoringBackupId(null);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'cloud') {
      accounts.forEach((acc) => {
        handleLoadRemoteBackups(acc.provider);
      });
    }
  }, [activeTab, accounts]);

  // Toggle note cloud save
  const handleToggleNoteCloudSave = (noteId: number) => {
    const updated = StorageManager.toggleCloudSave(noteId);
    if (updated) {
      setNotes(StorageManager.getNotes());
      onRefreshNotes();
    }
  };

  // AI Key & Provider actions

  const handleSaveGoogleKey = () => {
    AiSettingsManager.setGoogleApiKey(googleKeyInput.trim());
    setGoogleVerifyResult(null);
    setFileUploadFeedback('Google AI Studio key saved locally.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleClearGoogleKey = () => {
    setGoogleKeyInput('');
    AiSettingsManager.setGoogleApiKey('');
    setGoogleVerifyResult(null);
    setFileUploadFeedback('Google AI Studio key removed.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleVerifyGoogle = async () => {
    const key = googleKeyInput.trim();
    if (!key) return;
    setIsVerifyingGoogle(true);
    setGoogleVerifyResult(null);
    try {
      AiSettingsManager.setGoogleApiKey(key);
      setGoogleVerifyResult({ success: true, message: 'Key saved.' });
    } catch (_e) {
      const e = asErrorLike(_e);
      setGoogleVerifyResult({ success: false, message: e?.message || 'Could not save key' });
    } finally {
      setIsVerifyingGoogle(false);
    }
  };

  return (
    <div
      id="dedicated-settings-view"
      className="h-full flex flex-col bg-[#fafaf9] dark:bg-[#0c0c0e] overflow-hidden"
    >
      {/* Return to Note Banner (if opened during active note editing) */}
      {onBackToNotes && (
        <div className="px-6 py-2.5 bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-200/60 dark:border-indigo-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span>
              Currently Editing: <strong>{activeEditingNoteTitle || 'Untitled Note'}</strong>
            </span>
          </div>
          <button
            id="back-to-active-note-btn"
            onClick={onBackToNotes}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-lg text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5"
          >
            <span>&larr; Return to Note</span>
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="px-6 py-5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#101014] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AppLogo size="md" showText={false} />
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 font-serif-editorial flex items-center gap-2">
              <span>Settings &amp; Preferences</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono font-normal">
                v{CURRENT_APP_VERSION}
              </span>
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Multi-cloud backup, Google Gemini AI API key, local database, and hardware keystore
              encryption.
            </p>
          </div>
        </div>

        {/* Global Quick Sync button in header */}
        <div className="flex items-center gap-2.5">
          <button
            id="settings-manual-sync-btn"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-2 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Cloud Backups'}</span>
          </button>
        </div>
      </div>

      {/* Simple / Advanced mode */}
      <div className="px-6 py-2 border-b border-zinc-200/70 dark:border-zinc-800/70 bg-white dark:bg-[#0c0c0e] flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400 mr-1">
          Mode
        </span>
        <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700 p-0.5">
          <button
            type="button"
            id="settings-mode-simple"
            aria-pressed={settingsMode === 'simple'}
            onClick={() => setMode('simple')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              settingsMode === 'simple'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            id="settings-mode-advanced"
            aria-pressed={settingsMode === 'advanced'}
            onClick={() => setMode('advanced')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              settingsMode === 'advanced'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Advanced
          </button>
        </div>
        <span className="text-[11px] text-zinc-600 dark:text-zinc-400 hidden sm:inline">
          {settingsMode === 'simple' ? 'Cloud, AI, storage, security' : 'Includes diagnostics'}
        </span>
      </div>

      {/* Secondary Subtab Navigation */}
      <div
        role="tablist"
        aria-label="Settings categories"
        className="px-6 border-b border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/60 dark:bg-[#0e0e12] flex items-center gap-1 overflow-x-auto custom-minimal-scrollbar text-xs"
      >
        <button
          id="subtab-cloud-sync-btn"
          role="tab"
          aria-selected={activeTab === 'cloud'}
          aria-controls="panel-cloud-sync"
          onClick={() => setActiveTab('cloud')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'cloud'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Cloud className="w-4 h-4" />
          <span>Cloud</span>
          {activeAccounts.length > 0 && (
            <span className="px-1.5 py-0.2 text-xs rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
              {activeAccounts.length}
            </span>
          )}
        </button>

        <button
          id="subtab-ai-key-btn"
          role="tab"
          aria-selected={activeTab === 'ai'}
          aria-controls="panel-ai-studio"
          onClick={() => setActiveTab('ai')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'ai'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI</span>
        </button>

        <button
          id="subtab-storage-btn"
          role="tab"
          aria-selected={activeTab === 'storage'}
          aria-controls="panel-storage"
          onClick={() => setActiveTab('storage')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'storage'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Storage</span>
        </button>

        <button
          id="subtab-security-btn"
          role="tab"
          aria-selected={activeTab === 'security'}
          aria-controls="panel-security"
          onClick={() => setActiveTab('security')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'security'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Security</span>
        </button>

        {settingsMode === 'advanced' && (
          <button
            id="subtab-diagnostics-btn"
            role="tab"
            aria-selected={activeTab === 'diagnostics'}
            aria-controls="panel-diagnostics"
            onClick={() => setActiveTab('diagnostics')}
            className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'diagnostics'
                ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Architecture &amp; Logs</span>
          </button>
        )}

        <button
          id="subtab-about-btn"
          role="tab"
          aria-selected={activeTab === 'about'}
          aria-controls="panel-about"
          onClick={() => setActiveTab('about')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'about'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>About &amp; Guide</span>
        </button>
      </div>

      {/* Main Tab Content Body */}
      <div className="flex-1 overflow-y-auto custom-minimal-scrollbar p-6 space-y-6">
        {/* TAB: ABOUT & GUIDE */}
        {activeTab === 'about' && (
          <div
            id="panel-about"
            role="tabpanel"
            aria-labelledby="subtab-about-btn"
            className="max-w-5xl mx-auto space-y-6"
          >
            <AboutPanel onOpenOnboardingGuide={onOpenOnboardingGuide} />
          </div>
        )}

        {/* TAB 1: CLOUD SYNC & PROVIDERS */}
        {activeTab === 'cloud' && (
          <div
            id="panel-cloud-sync"
            role="tabpanel"
            aria-labelledby="subtab-cloud-sync-btn"
            className="max-w-5xl mx-auto space-y-6"
          >
            {/* Sync Progress Alert */}
            {(isSyncing || syncProgress) && (
              <SyncProgressBar
                isSyncing={isSyncing}
                progress={syncProgress}
                onDismiss={() => setSyncProgress(null)}
              />
            )}

            {syncFeedback && (
              <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-2xl flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200">
                <span>{syncFeedback}</span>
                <button
                  onClick={() => setSyncFeedback(null)}
                  className="text-xs font-semibold underline hover:opacity-80"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Offline Sync Retry Queue Alert */}
            {syncQueue.length > 0 && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <span className="font-semibold">
                      {syncQueue.length} Offline Sync Request{syncQueue.length !== 1 ? 's' : ''}{' '}
                      Queued
                    </span>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                      Syncs interrupted by network drops will auto-retry when connection is
                      restored.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFlushQueue}
                    disabled={isSyncing}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium text-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Retry Queued</span>
                  </button>
                  <button
                    onClick={handleClearQueue}
                    className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 rounded-xl font-medium text-xs transition-colors"
                  >
                    Clear Queue
                  </button>
                </div>
              </div>
            )}

            {/* Sync Mode & Frequency Header Card */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Cloud Backup Engine
                    </h3>
                    {isAirGapped ? (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                        <WifiOff className="w-3 h-3" />
                        Offline Air-Gapped Mode
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        {activeAccounts.length} Connected Destination
                        {activeAccounts.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Delta snapshotting with conflict resolution, markdown export, and client-side
                    encryption.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="run-cloud-backup-now-btn"
                    onClick={handleManualSync}
                    disabled={isSyncing || isAirGapped || activeAccounts.length === 0}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Backing Up...' : 'Backup All Now'}</span>
                  </button>

                  <label className="text-xs text-zinc-500 font-medium">Interval:</label>
                  <select
                    id="cloud-backup-frequency-select"
                    value={backupFrequency}
                    onChange={(e) => handleFrequencyChange(e.target.value as BackupFrequency)}
                    className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="manual">Manual Only</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>

              {/* Version History & Conflicts launcher */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                  Automatic multi-version snapshots preserved on conflict detection
                </span>
                {onOpenConflictModal && (
                  <button
                    id="open-conflicts-modal-btn"
                    onClick={onOpenConflictModal}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-xl text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
                  >
                    Inspect Conflict Logs &amp; Versions
                  </button>
                )}
              </div>
            </div>

            {/* End-to-End Encrypted Cloud Architecture Reassurance Card */}
            <div className="p-4 bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/25 rounded-3xl space-y-1.5 text-xs text-emerald-900 dark:text-emerald-300">
              <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>End-to-End Encrypted Cloud Architecture</span>
              </div>
              <p className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
                Connect backup destinations securely. Notes and attachments are encrypted locally
                using AES-256-GCM before transport. Cloud destinations never receive plaintext note
                contents.
              </p>
            </div>

            {/* Cloud Storage Providers Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Cloud Destinations
                </h3>
                <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  Encrypted Remote Storage
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(PROVIDERS) as CloudStorageProvider[]).map((providerKey) => {
                  const meta = PROVIDERS[providerKey];
                  const account = accounts.find((a) => a.provider === providerKey);
                  const isConnected = !!account?.connectedAt;
                  const isConnecting = quickConnectingProvider === providerKey;

                  return (
                    <div
                      key={providerKey}
                      id={`provider-card-${providerKey}`}
                      className={`p-4 bg-white dark:bg-[#121216] border rounded-3xl shadow-2xs space-y-3 transition-all ${
                        isConnected
                          ? 'border-zinc-300 dark:border-zinc-700 ring-1 ring-zinc-300/40 dark:ring-zinc-700/40'
                          : 'border-zinc-200/80 dark:border-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs"
                            style={{ color: meta.brandColor }}
                          >
                            <Cloud className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                {meta.name}
                              </h4>
                              <span
                                className={`text-xs px-1.5 py-0.2 rounded-md border font-medium ${meta.badgeBg}`}
                              >
                                {meta.category}
                              </span>
                              {isConnected ? (
                                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-md">
                                  Connected
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 line-clamp-1">
                              {meta.description}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Connection status and path info */}
                      {isConnected ? (
                        <div className="p-2.5 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl space-y-1 text-xs">
                          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 font-semibold">
                            <span className="flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {account?.email || account?.displayName || 'Connected'}
                            </span>
                          </div>
                          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 truncate">
                            /vellumscribe_backup.json.gz (AES-256-GCM)
                          </p>
                        </div>
                      ) : null}

                      {/* Action buttons */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">
                          {isConnected && account?.connectedAt
                            ? `Connected: ${new Date(account.connectedAt).toLocaleDateString()}`
                            : 'Client-side encrypted'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {isConnected ? (
                            <>
                              <button
                                id={`connect-provider-btn-${providerKey}`}
                                onClick={() => setSelectedProviderForConnect(providerKey)}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                              >
                                <span>Manage</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </>
                          ) : providerKey === 'google_drive' || providerKey === 'microsoft' ? (
                            <>
                              <button
                                id={`sso-connect-btn-${providerKey}`}
                                onClick={() => handleSSOConnect(providerKey)}
                                disabled={isConnecting}
                                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                              >
                                {isConnecting ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>Authenticating...</span>
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-3 h-3 text-amber-400 fill-current" />
                                    <span>Sign in with SSO</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => setSelectedProviderForConnect(providerKey)}
                                className="p-1.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                                title="Connection Options & Settings"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                id={`configure-provider-btn-${providerKey}`}
                                onClick={() => setSelectedProviderForConnect(providerKey)}
                                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                              >
                                <Server className="w-3 h-3" />
                                <span>Configure Server</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Remote Cloud Backups & Instant Restore Panel */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Remote Cloud Backups &amp; Snapshots
                    </h3>
                    <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-full flex items-center gap-1">
                      <FileCheck className="w-3 h-3" />
                      SHA-256 Verified
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Verify cloud archives, inspect cryptographic checksums, or restore notes from a
                    cloud snapshot.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="refresh-all-backups-btn"
                    onClick={() => accounts.forEach((acc) => handleLoadRemoteBackups(acc.provider))}
                    className="px-2.5 py-1 text-xs border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-xl text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Refresh Archives</span>
                  </button>
                </div>
              </div>

              {accounts.length === 0 ? (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-1">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    No cloud destinations connected yet.
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Tap &quot;1-Click Connect&quot; on any destination above to enable automatic
                    encrypted backups with zero configuration.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((acc) => {
                    const providerBackups = remoteBackups[acc.provider] || [];
                    const isLoading = loadingRemoteBackups[acc.provider];
                    const meta = PROVIDERS[acc.provider];

                    return (
                      <div
                        key={acc.provider}
                        className="p-3.5 bg-zinc-50/60 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: meta?.brandColor || '#6366f1' }}
                            />
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                              {meta?.name || acc.provider}
                            </span>
                            <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                              ({providerBackups.length} snapshot
                              {providerBackups.length !== 1 ? 's' : ''})
                            </span>
                          </div>

                          <button
                            onClick={() => handleLoadRemoteBackups(acc.provider)}
                            disabled={isLoading}
                            className="p-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors"
                            title="Reload backups from this provider"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
                            />
                          </button>
                        </div>

                        {isLoading ? (
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 py-2">
                            Querying remote cloud storage...
                          </p>
                        ) : providerBackups.length === 0 ? (
                          <div className="py-2 text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                            <span>No backup snapshots found in this vault yet.</span>
                            <button
                              onClick={handleManualSync}
                              disabled={isSyncing}
                              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              Create first backup
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-minimal-scrollbar">
                            {providerBackups.map((b) => {
                              const isRestoring = isRestoringBackupId === b.id;
                              const sizeFormatted =
                                b.size < 1024
                                  ? `${b.size} B`
                                  : b.size < 1024 * 1024
                                    ? `${(b.size / 1024).toFixed(1)} KB`
                                    : `${(b.size / (1024 * 1024)).toFixed(2)} MB`;

                              return (
                                <div
                                  key={b.id}
                                  className="p-2.5 bg-white dark:bg-[#15151a] border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate text-xs">
                                        {b.filename}
                                      </p>
                                      <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 shrink-0">
                                        {sizeFormatted}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                                      <span>{new Date(b.createdAt).toLocaleString()}</span>
                                      {b.checksum && (
                                        <span
                                          className="font-mono text-zinc-500 truncate max-w-[140px]"
                                          title={`SHA-256: ${b.checksum}`}
                                        >
                                          hash: {b.checksum.slice(0, 10)}…
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <a
                                      href={`/api/cloud/${acc.provider}/restore/${encodeURIComponent(b.id)}`}
                                      download={b.filename}
                                      aria-label={`Download encrypted archive file ${b.filename}`}
                                      className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                                      title="Download encrypted archive file"
                                    >
                                      <ArrowDownToLine className="w-3.5 h-3.5" />
                                    </a>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        promptRestoreRemoteBackup(acc.provider, b.id, b.filename)
                                      }
                                      disabled={isRestoring}
                                      aria-label={`Restore backup snapshot ${b.filename || b.id}`}
                                      className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg font-semibold text-xs transition-colors flex items-center gap-1 disabled:opacity-40 min-h-[36px]"
                                    >
                                      {isRestoring ? (
                                        <>
                                          <RefreshCw className="w-3 h-3 animate-spin" />
                                          <span>Restoring...</span>
                                        </>
                                      ) : (
                                        <span>Restore</span>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Per-Document Cloud Backup Toggle Table */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                    Granular Document Cloud Backup Preferences
                  </h3>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Control which individual notes sync to the cloud versus remain strictly offline
                    on this device.
                  </p>
                </div>
                <span className="text-xs text-zinc-500 font-medium">
                  {notes.filter((n) => n.cloud_save_enabled !== false).length} of {notes.length}{' '}
                  notes cloud-enabled
                </span>
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-60 overflow-y-auto custom-minimal-scrollbar text-xs">
                {notes.length === 0 ? (
                  <p className="py-4 text-center text-zinc-600 dark:text-zinc-400 text-xs">
                    No notes found.
                  </p>
                ) : (
                  notes.map((note) => {
                    const isEnabled = note.cloud_save_enabled !== false;
                    return (
                      <div key={note.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {note.title || 'Untitled Document'}
                          </p>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                            Updated {new Date(note.updated_at || note.created_at).toLocaleString()}
                          </p>
                        </div>

                        <button
                          onClick={() => handleToggleNoteCloudSave(note.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                            isEnabled
                              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          <Cloud className="w-3 h-3" />
                          <span>{isEnabled ? 'Cloud Backup On' : 'Device Only (Air-Gapped)'}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Backup passphrase + cloud-only controls */}
            <CloudSettingsPanel />
          </div>
        )}

        {/* TAB 2: AI — offline Whisper first + optional Google key */}
        {activeTab === 'ai' && (
          <div
            id="panel-ai-studio"
            role="tabpanel"
            aria-labelledby="subtab-ai-key-btn"
            className="max-w-3xl mx-auto space-y-6"
          >
            <OfflineAiPanel />

            <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Cloud AI (optional)
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Google API key for summaries when network is allowed.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Google API key
                </label>
                <div className="flex gap-2">
                  <input
                    type={showGoogleKey ? 'text' : 'password'}
                    value={googleKeyInput}
                    onChange={(e) => setGoogleKeyInput(e.target.value)}
                    placeholder="AIza…"
                    className="flex-1 min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGoogleKey((v) => !v)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700"
                    aria-label={showGoogleKey ? 'Hide key' : 'Show key'}
                  >
                    {showGoogleKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveGoogleKey}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  >
                    Save key
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyGoogle}
                    disabled={isVerifyingGoogle || !googleKeyInput.trim()}
                    className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 disabled:opacity-40"
                  >
                    {isVerifyingGoogle ? 'Checking…' : 'Test'}
                  </button>
                  {googleKeyInput ? (
                    <button
                      type="button"
                      onClick={handleClearGoogleKey}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-rose-600"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {googleVerifyResult && (
                  <p
                    className={`text-xs ${googleVerifyResult.success ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    {googleVerifyResult.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STORAGE & BACKUPS */}
        {activeTab === 'storage' && (
          <div
            id="panel-storage"
            role="tabpanel"
            aria-labelledby="subtab-storage-btn"
            className="max-w-4xl mx-auto space-y-6"
          >
            <StorageDashboard onRefreshNotes={onRefreshNotes} />
            <StoragePanel onRefreshNotes={onRefreshNotes} />

            {/* Export options */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Additional Open Exports
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                  onClick={async () => {
                    const json = await StorageManager.exportPortableBackupAsync();
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `VellumScribe_Backup_${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="p-4 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left space-y-1 transition-colors bg-white dark:bg-[#121216]"
                >
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                    Export JSON Workspace
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Full structured backup of notes, sketches, and checklists
                  </p>
                </button>

                <label className="p-4 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left space-y-1 transition-colors bg-white dark:bg-[#121216] cursor-pointer">
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                    Restore from JSON File
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Validate format, preview contents, and safely restore
                  </p>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const raw = ev.target?.result as string;
                          if (raw) {
                            const preview = ImportSafetyPipeline.validateAndPreview(raw);
                            setImportRawPayload(raw);
                            setImportPreviewData(preview);
                          }
                        };
                        reader.readAsText(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>

                <button
                  onClick={() => {
                    const notes = StorageManager.getNotes();
                    const md =
                      notes.length > 0
                        ? notes
                            .map((n) => `# ${n.title || 'Untitled'}\n\n${n.body}`)
                            .join('\n\n---\n\n')
                        : '# VellumScribe Notes\n\nNo notes currently saved.';
                    const blob = new Blob([md], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `VellumScribe_Notes_${new Date().toISOString().split('T')[0]}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="p-4 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left space-y-1 transition-colors bg-white dark:bg-[#121216]"
                >
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                    Export Markdown Archive
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Clean Markdown text files readable in any standard text editor
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SECURITY & KEYSTORE */}
        {activeTab === 'security' && (
          <div
            id="panel-security"
            role="tabpanel"
            aria-labelledby="subtab-security-btn"
            className="max-w-4xl mx-auto space-y-6"
          >
            <SecurityPanel onRefreshNotes={onRefreshNotes} />
            <div className="p-6 bg-zinc-950 rounded-3xl text-white border border-zinc-850 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-wide">
                      {Capacitor.isNativePlatform()
                        ? 'Hardware Keystore Encryption'
                        : 'Local Secret Registry'}
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {Capacitor.isNativePlatform()
                        ? 'Android Keystore / Apple Secure Enclave hardware binding'
                        : 'Web build: local metadata registry (not hardware-backed)'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-full font-semibold">
                  {Capacitor.isNativePlatform()
                    ? 'Hardware Keystore (AES-256-GCM)'
                    : 'Volatile Session Memory'}
                </span>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Security Key Store Aliases ({secrets.length})
              </h4>
              <div className="space-y-2.5">
                {secrets.map((s) => (
                  <div
                    key={s.alias}
                    className="p-3.5 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl flex items-center justify-between bg-zinc-50/50 dark:bg-[#101014]"
                  >
                    <div className="flex items-center gap-3">
                      <Key className="w-4 h-4 text-zinc-500" />
                      <div>
                        <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                          {s.alias}
                        </p>
                        <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {s.masked_value}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {s.algorithm}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ARCHITECTURE & DIAGNOSTICS */}
        {activeTab === 'diagnostics' && (
          <div
            id="panel-diagnostics"
            role="tabpanel"
            aria-labelledby="subtab-diagnostics-btn"
            className="max-w-4xl mx-auto space-y-5"
          >
            <DiagnosticsTools />
            <CrashReportingPanel />
            <ConflictResolverPanel />
            {/* Android Mobile Platform & Performance Guidance Card */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Android Phone Platform &amp; Performance
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Primary mobile workstation configuration &amp; hardware status
                    </p>
                  </div>
                </div>
                {AndroidPwaManager.isStandalone() ? (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Standalone App</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-full">
                    Android Mobile Web / PWA
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl space-y-1">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>Sub-Millisecond Speed</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Zero network delay for edits, search, and checklists using on-device SQLite
                    &amp; client-side caching.
                  </p>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl space-y-1">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Single-Thumb Navigation</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Ergonomic bottom navigation, Material speed-dial FAB, and 48px+ touch targets
                    for one-handed use.
                  </p>
                </div>
              </div>

              {/* Install / Launcher Action */}
              {!AndroidPwaManager.isStandalone() && (
                <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-semibold text-indigo-950 dark:text-indigo-200">
                      Add to Android Home Screen
                    </p>
                    <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">
                      Install for full-screen edge-to-edge experience without browser address bar.
                    </p>
                  </div>

                  {canInstallPwa ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await AndroidPwaManager.promptInstall();
                        if (res.outcome === 'accepted') {
                          setPwaInstalledSuccess(true);
                        }
                      }}
                      disabled={pwaInstalledSuccess}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      {pwaInstalledSuccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Installed!</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Install to Launcher</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                      Browser Menu (⋮) &rarr; Add to Home screen
                    </span>
                  )}
                </div>
              )}

              {/* Review Guide & Actions */}
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {onOpenOnboardingGuide && (
                  <button
                    type="button"
                    onClick={onOpenOnboardingGuide}
                    className="px-3.5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Review Android Quick Start Guide</span>
                  </button>
                )}
                {onOpenUpdateModal && (
                  <button
                    type="button"
                    onClick={onOpenUpdateModal}
                    className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Check for App Updates</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Offline-First Architectural Engine
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                VellumScribe runs on an offline-first foundation. All edits write immediately to
                local browser storage. When cloud providers are connected, cloud sync exports notes
                flagged for cloud save into a verified backup snapshot.
              </p>
            </div>

            {/* Usage Metrics (opt-in, privacy-preserving) */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Usage Metrics (opt-in)
                    </h3>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Anonymous, local-only usage signals for release health. No note content, no
                      personal data, no device identifiers. Nothing leaves your device unless you
                      choose to export it.
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={metricsEnabled}
                    onChange={(e) => handleMetricsToggle(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:transition-all after:peer-checked:bg-blue-600"></div>
                  <span className="ml-3 text-xs font-medium text-zinc-600 dark:text-zinc-300 peer-checked:text-blue-600 dark:peer-checked:text-blue-400">
                    {metricsEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Metrics record only anonymous counters (notes created, audio transcribed, backups,
                errors) and the app version. Opt-in only; off by default.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`px-2 py-0.5 rounded border ${metricsEnabled ? 'bg-emerald-50/50 text-emerald-700 border-emerald-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}
                >
                  {metricsEnabled ? 'Opted in' : 'Opted out'}
                </span>
                <button
                  onClick={() => {
                    const snapshot = MetricsManager.getMetrics();
                    AppLogger.info('MetricsManager', 'Snapshot exported to console', snapshot);
                    setSyncFeedback(`Logged ${snapshot.totalEvents} local metric event(s).`);
                    setTimeout(() => setSyncFeedback(null), 3000);
                  }}
                  className="text-xs underline underline-offset-4 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  View in console
                </button>
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Recent Sync Telemetry Events ({telemetryList.length})
              </h3>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-80 overflow-y-auto custom-minimal-scrollbar text-xs">
                {telemetryList.length === 0 ? (
                  <p className="py-4 text-center text-zinc-600 dark:text-zinc-400 text-xs">
                    No telemetry recorded yet.
                  </p>
                ) : (
                  telemetryList.map((t, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${t.lastSyncStatus === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}
                        />
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                          {t.provider}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {t.lastSyncStatus === 'success'
                            ? `Synced (${Math.round((t.lastTransferBytes || 0) / 1024)} KB)`
                            : t.lastSyncError || 'Sync failed'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400 text-xs">
                        <span>{t.lastTransferDurationMs}ms</span>
                        <span>{new Date(t.lastSyncAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cloud Provider Connection Modal */}
      {selectedProviderForConnect && (
        <CloudConnectModal
          provider={selectedProviderForConnect}
          existingAccount={accounts.find((a) => a.provider === selectedProviderForConnect)}
          onClose={() => setSelectedProviderForConnect(null)}
          onConnected={(_updatedAccount) => {
            setAccounts(CloudSyncEngine.getAccounts());
            setSyncFeedback(
              `Successfully configured ${PROVIDERS[selectedProviderForConnect].name}!`
            );
            setSelectedProviderForConnect(null);
            setTimeout(() => setSyncFeedback(null), 3000);
          }}
          onDisconnected={(prov) => {
            setAccounts(CloudSyncEngine.getAccounts());
            setSyncFeedback(`Disconnected ${PROVIDERS[prov].name}.`);
            setSelectedProviderForConnect(null);
            setTimeout(() => setSyncFeedback(null), 3000);
          }}
        />
      )}

      {/* Safe Import Validation & Preview Modal */}
      {importPreviewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#16161a] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-2xl ${importPreviewData.valid ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}
                >
                  {importPreviewData.valid ? (
                    <ShieldCheck className="w-6 h-6" />
                  ) : (
                    <AlertCircle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Safe Workspace Restore
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Validate format, preview entities, and review safety snapshot
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-full ${
                  importPreviewData.valid
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800'
                }`}
              >
                {importPreviewData.valid ? `v${importPreviewData.version} Valid` : 'Invalid File'}
              </span>
            </div>

            {importPreviewData.error && (
              <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-2xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{importPreviewData.error}</span>
              </div>
            )}

            {importPreviewData.valid && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Detected Workspace Content:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {importPreviewData.counts.notes}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">Notes</p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {importPreviewData.counts.events}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                      Categories
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {importPreviewData.counts.recordings}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                      Voice Memos
                    </p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      {importPreviewData.counts.ocrScans}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                      OCR Scans
                    </p>
                  </div>
                </div>

                {importPreviewData.warnings.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Compatibility Warnings:
                    </p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                      {importPreviewData.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <p>
                    A safety snapshot of your current local workspace will be generated
                    automatically before importing. The import executes within an atomic SQLite
                    transaction and verifies database integrity before saving.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setImportPreviewData(null);
                  setImportRawPayload(null);
                }}
                disabled={isExecutingImport}
                className="px-4 py-2.5 min-h-[44px] border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>

              {importPreviewData.valid && (
                <button
                  type="button"
                  disabled={isExecutingImport}
                  onClick={async () => {
                    if (!importRawPayload) return;
                    setIsExecutingImport(true);
                    try {
                      const res = await ImportSafetyPipeline.executeImport(importRawPayload);
                      if (res.success) {
                        onRefreshNotes();
                        setNotes(StorageManager.getNotes());
                        setStats(StorageManager.getStorageStats());
                        setSyncFeedback(res.message);
                        setImportPreviewData(null);
                        setImportRawPayload(null);
                      } else {
                        setSyncFeedback(res.message);
                      }
                    } catch (_err) {
                      const err = asErrorLike(_err);
                      setSyncFeedback(err?.message || 'Restore failed.');
                    } finally {
                      setIsExecutingImport(false);
                      setTimeout(() => setSyncFeedback(null), 4000);
                    }
                  }}
                  className="px-4 py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
                >
                  {isExecutingImport ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying &amp; Restoring...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Restore Workspace</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cloud Backup Restore In-App Confirmation Modal */}
      {restoreConfirmTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="restore-modal-title"
                  className="text-base font-bold text-zinc-900 dark:text-zinc-100 font-serif-editorial"
                >
                  Restore Cloud Backup?
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  {restoreConfirmTarget.title || restoreConfirmTarget.backupId}
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Restoring will synchronize your local notes from this encrypted remote cloud snapshot.
              A safety rollback snapshot of your current local notes will be automatically preserved
              before restoring.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRestoreConfirmTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 min-h-[44px]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Confirm &amp; Restore</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
