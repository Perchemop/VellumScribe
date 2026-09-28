import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Cloud,
  HardDrive,
  Shield,
  Layers,
  Key,
  ExternalLink,
  Upload,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Database,
  RefreshCw,
  Cpu,
  Trash2,
  Check,
  Folder,
  ChevronRight,
  WifiOff,
  Clock,
  Copy,
  Terminal,
  Zap,
  Mic,
  Smartphone,
  Download,
  ShieldCheck,
  FileCheck,
  ArrowDownToLine,
  Server,
  Lock,
} from 'lucide-react';
import { CloudAccount, CloudStorageProvider, SyncTelemetry, NoteRecord } from '../types';
import { Capacitor } from '@capacitor/core';
import { AiSettingsManager, AiIntegrationSettings } from '../lib/aiSettings';
import { CloudSyncEngine, BackupFrequency, SyncProgressUpdate, RemoteBackupItem, QueuedSyncItem } from '../lib/cloudSync';
import { StorageManager } from '../lib/storage';
import { AndroidKeystoreManager } from '../lib/keystore';
import { CURRENT_APP_VERSION } from '../lib/appUpdateManager';
import { AndroidPwaManager } from '../lib/androidPwaManager';
import { AppLogo } from './AppLogo';
import { CloudConnectModal } from './CloudConnectModal';
import { SyncProgressBar } from './SyncProgressBar';
import { StorageDashboard } from './StorageDashboard';
import { AppLogger, LogEntry } from '../lib/logger';
import { ImportSafetyPipeline, ImportPreviewResult } from '../lib/importSafety';
import { useModalBackHandler } from '../lib/modalBackStack';
import { OfflineAiPanel } from './settings/OfflineAiPanel';
import { SecurityPanel } from './settings/SecurityPanel';
import { StoragePanel } from './settings/StoragePanel';
import { AboutPanel } from './settings/AboutPanel';

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
    name: 'Google (SSO & Drive)',
    category: 'Google SSO',
    description: 'Single Sign-On authentication and encrypted backups directly to Google Drive.',
    brandColor: '#34a853',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  microsoft: {
    name: 'Microsoft (SSO & OneDrive)',
    category: 'Microsoft SSO',
    description: 'Single Sign-On authentication and encrypted backup snapshots in Microsoft OneDrive.',
    brandColor: '#0078d4',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
  nextcloud: {
    name: 'Nextcloud',
    category: 'Nextcloud',
    description: 'Store backups on private or self-hosted Nextcloud instances via WebDAV.',
    brandColor: '#0082c9',
    badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  webdav: {
    name: 'Custom WebDAV',
    category: 'WebDAV',
    description: 'Universal standard WebDAV endpoint with encrypted snapshot support.',
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
  const [activeTab, setActiveTab] = useState<'cloud' | 'ai' | 'offline-ai' | 'storage' | 'security' | 'diagnostics' | 'about'>(
    initialSubtab || 'cloud'
  );

  const [canInstallPwa, setCanInstallPwa] = useState(() => AndroidPwaManager.canPromptInstall());
  const [pwaInstalledSuccess, setPwaInstalledSuccess] = useState(false);

  React.useEffect(() => {
    return AndroidPwaManager.subscribe((can) => {
      setCanInstallPwa(can);
    });
  }, []);

  // Cloud Backup State
  const [accounts, setAccounts] = useState<CloudAccount[]>(() => CloudSyncEngine.getAccounts());
  const [telemetryList, setTelemetryList] = useState<SyncTelemetry[]>(() => CloudSyncEngine.getTelemetry());
  const [notes, setNotes] = useState<NoteRecord[]>(() => StorageManager.getNotes());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [backupFrequency, setBackupFrequencyState] = useState<BackupFrequency>(() => CloudSyncEngine.getBackupFrequency());
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [selectedProviderForConnect, setSelectedProviderForConnect] = useState<CloudStorageProvider | null>(null);
  const [remoteBackups, setRemoteBackups] = useState<Record<string, RemoteBackupItem[]>>({});
  const [loadingRemoteBackups, setLoadingRemoteBackups] = useState<Record<string, boolean>>({});
  const [isRestoringBackupId, setIsRestoringBackupId] = useState<string | null>(null);
  const [restoreConfirmTarget, setRestoreConfirmTarget] = useState<{ provider: CloudStorageProvider; backupId: string; title?: string } | null>(null);

  useModalBackHandler(!!restoreConfirmTarget, () => setRestoreConfirmTarget(null), 'settings-restore-backup-modal');
  const [quickConnectingProvider, setQuickConnectingProvider] = useState<CloudStorageProvider | null>(null);
  const [syncQueue, setSyncQueue] = useState<QueuedSyncItem[]>(() => CloudSyncEngine.getSyncQueue());
  const [serverProvidersConfig, setServerProvidersConfig] = useState<Record<string, { hasOAuthEnv?: boolean; isConfigured?: boolean }>>({});

  React.useEffect(() => {
    CloudSyncEngine.fetchConfig()
      .then((cfg) => {
        if (cfg?.providers) {
          setServerProvidersConfig(cfg.providers);
        }
      })
      .catch(() => {});
  }, []);

  // AI State
  const [aiSettings, setAiSettings] = useState<AiIntegrationSettings>(() => AiSettingsManager.getSettings());
  const [googleKeyInput, setGoogleKeyInput] = useState<string>(() => AiSettingsManager.getGoogleApiKey());
  const [groqKeyInput, setGroqKeyInput] = useState<string>(() => AiSettingsManager.getGroqApiKey());
  const [deepgramKeyInput, setDeepgramKeyInput] = useState<string>(() => AiSettingsManager.getDeepgramApiKey());
  const [ollamaEndpointInput, setOllamaEndpointInput] = useState<string>(() => aiSettings.ollamaEndpoint || 'http://localhost:11434');
  const [localWhisperEndpointInput, setLocalWhisperEndpointInput] = useState<string>(() => aiSettings.localWhisperEndpoint || 'http://localhost:8080/v1/audio/transcriptions');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showDeepgramKey, setShowDeepgramKey] = useState(false);
  const [isVerifyingGoogle, setIsVerifyingGoogle] = useState(false);
  const [isVerifyingGroq, setIsVerifyingGroq] = useState(false);
  const [isVerifyingDeepgram, setIsVerifyingDeepgram] = useState(false);
  const [isProbingOllama, setIsProbingOllama] = useState(false);
  const [isProbingWhisper, setIsProbingWhisper] = useState(false);
  const [googleVerifyResult, setGoogleVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [groqVerifyResult, setGroqVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deepgramVerifyResult, setDeepgramVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ollamaVerifyResult, setOllamaVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [whisperVerifyResult, setWhisperVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fileUploadFeedback, setFileUploadFeedback] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopyCmd = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  // Storage stats & Keystore
  const [stats, setStats] = useState(() => StorageManager.getStorageStats());
  const [secrets, setSecrets] = useState(() => AndroidKeystoreManager.listSecrets());

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAirGapped = backupFrequency === 'off';
  const activeAccounts = accounts; // Everyone connected is active now

  // Manual Sync trigger
  const handleManualSync = async () => {
    if (isAirGapped) {
      setSyncFeedback('Operating in 100% offline air-gapped mode. Local snapshot is preserved.');
      return;
    }
    setIsSyncing(true);
    setSyncFeedback(null);
    setSyncProgress({ percent: 10, message: 'Starting cloud backup...', phase: 'init' });

    try {
      const success = await CloudSyncEngine.triggerSync({
        onProgress: (p) => setSyncProgress(p),
      });
      setTelemetryList(CloudSyncEngine.getTelemetry());
      setAccounts(CloudSyncEngine.getAccounts());
      setSyncQueue(CloudSyncEngine.getSyncQueue());
      setNotes(StorageManager.getNotes());
      setSyncFeedback(success ? 'Sync complete' : 'Sync failed (queued for automatic retry)');
      onRefreshNotes();
    } catch {
      setSyncQueue(CloudSyncEngine.getSyncQueue());
      setSyncFeedback('Sync failed. Request queued for automatic retry when online.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncProgress(null);
      }, 2500);
    }
  };

  const handleFlushQueue = async () => {
    setIsSyncing(true);
    setSyncFeedback('Processing queued offline sync requests...');
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
    setSyncFeedback('Offline sync retry queue cleared.');
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  // Frequency change
  const handleFrequencyChange = (val: BackupFrequency) => {
    setBackupFrequencyState(val);
    CloudSyncEngine.setBackupFrequency(val);
    if (val === 'off') {
      setSyncFeedback('Backup frequency set to Off. Operating completely offline.');
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
      console.warn(`Failed to fetch remote backups for ${provider}:`, e);
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
          throw new Error('SSO popup blocked by browser. Please allow popups or use the connect modal.');
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
            setSyncFeedback(`Authentication notice: ${event.data?.error || 'SSO was not completed.'}`);
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
    } catch (e: any) {
      setSyncFeedback(`SSO connection notice: ${e.message || 'Unable to connect'}.`);
      setQuickConnectingProvider(null);
    } finally {
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const promptRestoreRemoteBackup = (provider: CloudStorageProvider, backupId: string, title?: string) => {
    setRestoreConfirmTarget({ provider, backupId, title });
  };

  const handleExecuteRestore = async () => {
    if (!restoreConfirmTarget) return;
    const { provider, backupId } = restoreConfirmTarget;
    setRestoreConfirmTarget(null);

    setIsRestoringBackupId(backupId);
    setSyncFeedback('Restoring and decrypting cloud backup snapshot...');
    try {
      const res = await CloudSyncEngine.restoreFromCloudBackup(provider, backupId);
      if (res.success) {
        setSyncFeedback('✓ Cloud snapshot restored and local database updated successfully.');
        setNotes(StorageManager.getNotes());
        onRefreshNotes();
      } else {
        setSyncFeedback(`Could not restore backup: ${res.message || 'Snapshot verification failed'}. Your local notes remain safe.`);
      }
    } catch (e: any) {
      setSyncFeedback(`Restore failed: ${e.message || 'Error occurred while decrypting'}. Your existing local notes remain completely safe.`);
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
  const handleUpdateAiSettings = (updates: Partial<AiIntegrationSettings>) => {
    const updated = AiSettingsManager.updateSettings(updates);
    setAiSettings(updated);
  };

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

  const handleSaveGroqKey = () => {
    AiSettingsManager.setGroqApiKey(groqKeyInput.trim());
    setGroqVerifyResult(null);
    setFileUploadFeedback('Groq API key saved locally.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleClearGroqKey = () => {
    setGroqKeyInput('');
    AiSettingsManager.setGroqApiKey('');
    setGroqVerifyResult(null);
    setFileUploadFeedback('Groq API key removed.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleSaveDeepgramKey = () => {
    AiSettingsManager.setDeepgramApiKey(deepgramKeyInput.trim());
    setDeepgramVerifyResult(null);
    setFileUploadFeedback('Deepgram API key saved locally.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleClearDeepgramKey = () => {
    setDeepgramKeyInput('');
    AiSettingsManager.setDeepgramApiKey('');
    setDeepgramVerifyResult(null);
    setFileUploadFeedback('Deepgram API key removed.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleTestGoogleKey = async () => {
    setIsVerifyingGoogle(true);
    setGoogleVerifyResult(null);
    try {
      const res = await AiSettingsManager.testApiKey(googleKeyInput.trim());
      setGoogleVerifyResult(res);
    } catch (err: any) {
      setGoogleVerifyResult({ success: false, message: err?.message || 'Verification failed.' });
    } finally {
      setIsVerifyingGoogle(false);
    }
  };

  const handleTestGroqKey = async () => {
    setIsVerifyingGroq(true);
    setGroqVerifyResult(null);
    try {
      const res = await AiSettingsManager.testGroqKey(groqKeyInput.trim());
      setGroqVerifyResult(res);
    } catch (err: any) {
      setGroqVerifyResult({ success: false, message: err?.message || 'Groq verification failed.' });
    } finally {
      setIsVerifyingGroq(false);
    }
  };

  const handleTestDeepgramKey = async () => {
    setIsVerifyingDeepgram(true);
    setDeepgramVerifyResult(null);
    try {
      const res = await AiSettingsManager.testDeepgramKey(deepgramKeyInput.trim());
      setDeepgramVerifyResult(res);
    } catch (err: any) {
      setDeepgramVerifyResult({ success: false, message: err?.message || 'Deepgram verification failed.' });
    } finally {
      setIsVerifyingDeepgram(false);
    }
  };

  const handleProbeOllama = async () => {
    setIsProbingOllama(true);
    setOllamaVerifyResult(null);
    try {
      const res = await AiSettingsManager.probeOllamaEndpoint(ollamaEndpointInput.trim());
      setOllamaVerifyResult({ success: res.success, message: res.message || (res.success ? 'Ollama daemon ready' : 'Not reachable') });
      if (res.models) setOllamaModels(res.models);
      if (res.success) {
        AiSettingsManager.setOllamaEndpoint(ollamaEndpointInput.trim());
        setAiSettings(AiSettingsManager.getSettings());
      }
    } catch (err: any) {
      setOllamaVerifyResult({ success: false, message: err?.message || 'Ollama connection failed.' });
    } finally {
      setIsProbingOllama(false);
    }
  };

  const handleProbeLocalWhisper = async () => {
    setIsProbingWhisper(true);
    setWhisperVerifyResult(null);
    try {
      const res = await AiSettingsManager.probeLocalWhisperEndpoint(localWhisperEndpointInput.trim());
      setWhisperVerifyResult({ success: res.success, message: res.message || (res.success ? 'Local Whisper server reachable' : 'Not reachable') });
      if (res.success) {
        AiSettingsManager.setLocalWhisperEndpoint(localWhisperEndpointInput.trim());
        setAiSettings(AiSettingsManager.getSettings());
      }
    } catch (err: any) {
      setWhisperVerifyResult({ success: false, message: err?.message || 'Local Whisper connection failed.' });
    } finally {
      setIsProbingWhisper(false);
    }
  };

  const handleKeyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const extracted = AiSettingsManager.extractApiKeyFromFile(content);
      if (extracted.key) {
        if (extracted.key.startsWith('gsk_')) {
          setGroqKeyInput(extracted.key);
          AiSettingsManager.setGroqApiKey(extracted.key);
          setFileUploadFeedback(`Successfully loaded Groq key from ${file.name}!`);
        } else {
          setGoogleKeyInput(extracted.key);
          AiSettingsManager.setGoogleApiKey(extracted.key);
          setFileUploadFeedback(`Successfully loaded Google AI key from ${file.name}!`);
        }
      } else {
        setFileUploadFeedback(extracted.error || 'Failed to find a valid API key in file.');
      }
    };
    reader.readAsText(file);
  };


  return (
    <div id="dedicated-settings-view" className="h-full flex flex-col bg-[#fafaf9] dark:bg-[#0c0c0e] overflow-hidden">
      {/* Return to Note Banner (if opened during active note editing) */}
      {onBackToNotes && (
        <div className="px-6 py-2.5 bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-200/60 dark:border-indigo-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span>Currently Editing: <strong>{activeEditingNoteTitle || 'Untitled Note'}</strong></span>
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
              Multi-cloud backup, Google Gemini AI API key, local database, and hardware keystore encryption.
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
          <span>Cloud Backup &amp; Providers</span>
          {activeAccounts.length > 0 && (
            <span className="px-1.5 py-0.2 text-xs rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
              {activeAccounts.length}
            </span>
          )}
        </button>

        <button
          id="subtab-offline-ai-btn"
          role="tab"
          aria-selected={activeTab === 'offline-ai'}
          aria-controls="panel-offline-ai"
          onClick={() => setActiveTab('offline-ai')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'offline-ai'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Offline Whisper AI</span>
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
          <span>Speech &amp; AI Intelligence</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Offline-First Active" />
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
          <span>Storage &amp; Backups</span>
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
          <span>Security &amp; Keystore</span>
        </button>

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
        {/* TAB: OFFLINE WHISPER AI */}
        {activeTab === 'offline-ai' && (
          <div id="panel-offline-ai" role="tabpanel" aria-labelledby="subtab-offline-ai-btn" className="max-w-5xl mx-auto space-y-6">
            <OfflineAiPanel />
          </div>
        )}

        {/* TAB: ABOUT & GUIDE */}
        {activeTab === 'about' && (
          <div id="panel-about" role="tabpanel" aria-labelledby="subtab-about-btn" className="max-w-5xl mx-auto space-y-6">
            <AboutPanel onOpenOnboardingGuide={onOpenOnboardingGuide} />
          </div>
        )}

        {/* TAB 1: CLOUD SYNC & PROVIDERS */}
        {activeTab === 'cloud' && (
          <div id="panel-cloud-sync" role="tabpanel" aria-labelledby="subtab-cloud-sync-btn" className="max-w-5xl mx-auto space-y-6">
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
                    <span className="font-semibold">{syncQueue.length} Offline Sync Request{syncQueue.length !== 1 ? 's' : ''} Queued</span>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                      Syncs interrupted by network drops will auto-retry when connection is restored.
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
                        {activeAccounts.length} Connected Destination{activeAccounts.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">
                    Delta snapshotting with conflict resolution, markdown export, and client-side encryption.
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
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
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
                Connect backup destinations securely. Notes and attachments are encrypted locally using AES-256-GCM before transport. Cloud destinations never receive plaintext note contents.
              </p>
            </div>

            {/* Cloud Storage Providers Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Cloud Destinations
                </h3>
                <span className="text-xs text-zinc-400 font-medium">Encrypted Remote Storage</span>
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
                          <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs" style={{ color: meta.brandColor }}>
                            <Cloud className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{meta.name}</h4>
                              <span className={`text-xs px-1.5 py-0.2 rounded-md border font-medium ${meta.badgeBg}`}>
                                {meta.category}
                              </span>
                              {isConnected ? (
                                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-md">
                                  Connected
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{meta.description}</p>
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
                        <span className="text-xs text-zinc-400">
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
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Remote Cloud Backups &amp; Snapshots
                    </h3>
                    <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-full flex items-center gap-1">
                      <FileCheck className="w-3 h-3" />
                      SHA-256 Verified
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">
                    Verify cloud archives, inspect cryptographic checksums, or restore notes from a cloud snapshot.
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
                  <p className="text-xs text-zinc-400">
                    Tap &quot;1-Click Connect&quot; on any destination above to enable automatic encrypted backups with zero configuration.
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
                            <span className="text-xs text-zinc-400 font-mono">
                              ({providerBackups.length} snapshot{providerBackups.length !== 1 ? 's' : ''})
                            </span>
                          </div>

                          <button
                            onClick={() => handleLoadRemoteBackups(acc.provider)}
                            disabled={isLoading}
                            className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors"
                            title="Reload backups from this provider"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                          </button>
                        </div>

                        {isLoading ? (
                          <p className="text-xs text-zinc-400 py-2">Querying remote cloud storage...</p>
                        ) : providerBackups.length === 0 ? (
                          <div className="py-2 text-xs text-zinc-400 flex items-center justify-between">
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
                                      <span className="text-xs font-mono text-zinc-400 shrink-0">
                                        {sizeFormatted}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-zinc-400">
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
                                      href={`/api/cloud/${acc.provider}/restore/${b.id}`}
                                      download={b.filename}
                                      aria-label={`Download encrypted archive file ${b.filename}`}
                                      className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                                      title="Download encrypted archive file"
                                    >
                                      <ArrowDownToLine className="w-3.5 h-3.5" />
                                    </a>

                                    <button
                                      type="button"
                                      onClick={() => promptRestoreRemoteBackup(acc.provider, b.id, b.filename)}
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
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Granular Document Cloud Backup Preferences
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Control which individual notes sync to the cloud versus remain strictly offline on this device.
                  </p>
                </div>
                <span className="text-xs text-zinc-500 font-medium">
                  {notes.filter((n) => n.cloud_save_enabled !== false).length} of {notes.length} notes cloud-enabled
                </span>
              </div>

              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-60 overflow-y-auto custom-minimal-scrollbar text-xs">
                {notes.length === 0 ? (
                  <p className="py-4 text-center text-zinc-400 text-xs">No notes found.</p>
                ) : (
                  notes.map((note) => {
                    const isEnabled = note.cloud_save_enabled !== false;
                    return (
                      <div key={note.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {note.title || 'Untitled Document'}
                          </p>
                          <p className="text-xs text-zinc-400 truncate">
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
          </div>
        )}

        {/* TAB 2: AI PROVIDERS, BYOK & LOCAL OFFLINE */}
        {activeTab === 'ai' && (
          <div id="panel-ai-studio" role="tabpanel" aria-labelledby="subtab-ai-key-btn" className="max-w-3xl mx-auto space-y-6">
            {/* Offline-First Primary Showcase */}
            <div className="p-5 rounded-3xl border border-emerald-300/80 dark:border-emerald-800/80 bg-emerald-50/60 dark:bg-emerald-950/30 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                      Default Built-In Offline Engines
                    </h3>
                    <p className="text-xs text-emerald-800/90 dark:text-emerald-300/80">
                      Zero accounts, zero external API keys, zero network lag.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Offline-First Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-white/80 dark:bg-[#121216]/80 border border-emerald-200/60 dark:border-emerald-900/40 rounded-2xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Native Speech Transcription</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Uses Web Speech and Web Audio APIs for instant, on-device audio transcription while recording.
                  </p>
                </div>

                <div className="p-3 bg-white/80 dark:bg-[#121216]/80 border border-emerald-200/60 dark:border-emerald-900/40 rounded-2xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Local Rule Intelligence</span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Synthesizes executive summaries, action item checklists, and key takeaways completely offline.
                  </p>
                </div>
              </div>
            </div>

            {/* Provider Selection Configuration */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Active Engine Preferences
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary Speech Transcription Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Mic className="w-4 h-4 text-emerald-500" />
                    <span>Primary Speech Transcription</span>
                  </label>
                  <select
                    value={aiSettings.primaryTranscriptionProvider || 'browser_speech'}
                    onChange={(e) => handleUpdateAiSettings({ primaryTranscriptionProvider: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="browser_speech">Native Device Recognition (Offline - Recommended)</option>
                    <option value="local_whisper">Local Whisper Server (Offline on Local Network)</option>
                    <option value="google">Google AI Studio Gemini (Cloud Opt-in)</option>
                    <option value="groq_whisper">Groq Cloud Whisper Large v3 (Cloud Opt-in)</option>
                    <option value="deepgram">Deepgram Speech Platform (Cloud Opt-in)</option>
                  </select>
                  <p className="text-xs text-zinc-400">
                    Determines how meeting voice recordings and live speech are transcribed.
                  </p>
                </div>

                {/* Primary LLM Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>Primary Intelligence / Summarizer</span>
                  </label>
                  <select
                    value={aiSettings.primaryLlmProvider || 'offline_rules'}
                    onChange={(e) => handleUpdateAiSettings({ primaryLlmProvider: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="offline_rules">Offline Rule Engine (100% On-Device - Recommended)</option>
                    <option value="ollama">Local Ollama Daemon (Local Network)</option>
                    <option value="google">Google AI Studio Gemini (Cloud Opt-in)</option>
                    <option value="groq">Groq Cloud Llama 3.3 70B (Cloud Opt-in)</option>
                  </select>
                  <p className="text-xs text-zinc-400">
                    Powers meeting minutes synthesis, key action extraction, and document summaries.
                  </p>
                </div>
              </div>

              {/* Automatic fallback toggle */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Automatic Offline Fallback
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    If an external cloud provider fails or device is disconnected, seamlessly fall back to the native offline engines.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateAiSettings({ autoFallbackToLocal: !aiSettings.autoFallbackToLocal })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    aiSettings.autoFallbackToLocal ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      aiSettings.autoFallbackToLocal ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Opt-in External Services Header */}
            <div className="space-y-1 pt-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  External APIs &amp; Remote Servers (Opt-In)
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-full">
                  Optional
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                External keys and remote endpoints are completely optional. Keys remain strictly on your device in local encrypted storage.
              </p>
            </div>

            {/* Provider 1: Google AI Studio Key */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Key className="w-4 h-4 text-indigo-500" />
                    <span>Google AI Studio API Key</span>
                    {googleKeyInput ? (
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold rounded-md">
                        Configured
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal rounded-md">
                        Not configured (Using Offline Engine)
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-zinc-400">Optional: For Gemini 2.5 / 1.5 cloud summaries and multimodal OCR.</p>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium shrink-0"
                >
                  <span>Get Free Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  id="settings-google-key-input"
                  type={showGoogleKey ? 'text' : 'password'}
                  value={googleKeyInput}
                  onChange={(e) => setGoogleKeyInput(e.target.value)}
                  placeholder="Paste Google AI Studio API key (AIzaSy...)"
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-24"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowGoogleKey(!showGoogleKey)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {showGoogleKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {googleVerifyResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    googleVerifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {googleVerifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{googleVerifyResult.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {googleKeyInput ? (
                  <button
                    type="button"
                    onClick={handleClearGoogleKey}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Key</span>
                  </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestGoogleKey}
                    disabled={!googleKeyInput.trim() || isVerifyingGoogle}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
                  >
                    {isVerifyingGoogle ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveGoogleKey}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </div>

            {/* Provider 2: Groq Cloud Key */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Key className="w-4 h-4 text-orange-500" />
                    <span>Groq Cloud API Key</span>
                    {groqKeyInput ? (
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold rounded-md">
                        Configured
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal rounded-md">
                        Not configured
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-zinc-400">Optional: For ultra-fast Llama 3.3 70B and Whisper Large v3 cloud processing.</p>
                </div>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 font-medium shrink-0"
                >
                  <span>Get Free Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  id="settings-groq-key-input"
                  type={showGroqKey ? 'text' : 'password'}
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  placeholder="Paste Groq key (gsk_...)"
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-24"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowGroqKey(!showGroqKey)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {showGroqKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {groqVerifyResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    groqVerifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {groqVerifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{groqVerifyResult.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {groqKeyInput ? (
                  <button
                    type="button"
                    onClick={handleClearGroqKey}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Key</span>
                  </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestGroqKey}
                    disabled={!groqKeyInput.trim() || isVerifyingGroq}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
                  >
                    {isVerifyingGroq ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveGroqKey}
                    className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </div>

            {/* Provider 3: Deepgram Key */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Key className="w-4 h-4 text-cyan-500" />
                    <span>Deepgram API Key</span>
                    {deepgramKeyInput ? (
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold rounded-md">
                        Configured
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal rounded-md">
                        Not configured
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-zinc-400">Optional: For Deepgram Nova-3 speech intelligence cloud API.</p>
                </div>
                <a
                  href="https://console.deepgram.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-medium shrink-0"
                >
                  <span>Get Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  id="settings-deepgram-key-input"
                  type={showDeepgramKey ? 'text' : 'password'}
                  value={deepgramKeyInput}
                  onChange={(e) => setDeepgramKeyInput(e.target.value)}
                  placeholder="Paste Deepgram API key..."
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-24"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowDeepgramKey(!showDeepgramKey)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {showDeepgramKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {deepgramVerifyResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    deepgramVerifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {deepgramVerifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{deepgramVerifyResult.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {deepgramKeyInput ? (
                  <button
                    type="button"
                    onClick={handleClearDeepgramKey}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Key</span>
                  </button>
                ) : <span />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestDeepgramKey}
                    disabled={!deepgramKeyInput.trim() || isVerifyingDeepgram}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
                  >
                    {isVerifyingDeepgram ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDeepgramKey}
                    className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  >
                    Save Key
                  </button>
                </div>
              </div>
            </div>

            {/* Provider 4: Local Ollama Daemon Settings */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-500" />
                  <span>Self-Hosted Ollama Daemon</span>
                  {ollamaEndpointInput ? (
                    <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold rounded-md">
                      Endpoint Set
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal rounded-md">
                      Optional LAN / PC
                    </span>
                  )}
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  On mobile devices, <code>localhost</code> refers to your phone. To connect to Ollama on your PC, enter your computer's local Wi-Fi IP address (e.g. <code>http://192.168.1.150:11434</code>).
                </p>
              </div>

              <input
                type="text"
                value={ollamaEndpointInput}
                onChange={(e) => setOllamaEndpointInput(e.target.value)}
                placeholder="http://192.168.1.X:11434 (PC IP) or http://localhost:11434"
                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              {ollamaVerifyResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    ollamaVerifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {ollamaVerifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />}
                  <span>{ollamaVerifyResult.message}</span>
                </div>
              )}

              {ollamaModels.length > 0 && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl">
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                    Detected Local Models:
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {ollamaModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleUpdateAiSettings({ ollamaModel: m })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                          aiSettings.ollamaModel === m
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {ollamaEndpointInput ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOllamaEndpointInput('');
                      AiSettingsManager.setOllamaEndpoint('');
                      setOllamaVerifyResult(null);
                    }}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Endpoint</span>
                  </button>
                ) : <span />}

                <button
                  type="button"
                  onClick={handleProbeOllama}
                  disabled={isProbingOllama || !ollamaEndpointInput.trim()}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
                >
                  {isProbingOllama ? 'Probing Ollama...' : 'Probe & Test Ollama'}
                </button>
              </div>
            </div>

            {/* Provider 5: Local Whisper Daemon Settings */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-500" />
                  <span>Self-Hosted Local Whisper Speech Server</span>
                  {localWhisperEndpointInput ? (
                    <span className="text-xs px-1.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold rounded-md">
                      Endpoint Set
                    </span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-normal rounded-md">
                      Optional LAN / PC
                    </span>
                  )}
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Optional: If running <code>whisper.cpp</code> or Faster-Whisper on your PC, enter its network URL (e.g. <code>http://192.168.1.150:8080/v1/audio/transcriptions</code>).
                </p>
              </div>

              <input
                type="text"
                value={localWhisperEndpointInput}
                onChange={(e) => setLocalWhisperEndpointInput(e.target.value)}
                placeholder="http://192.168.1.X:8080/v1/audio/transcriptions"
                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              {whisperVerifyResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    whisperVerifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                  }`}
                >
                  {whisperVerifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />}
                  <span>{whisperVerifyResult.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {localWhisperEndpointInput ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLocalWhisperEndpointInput('');
                      AiSettingsManager.setLocalWhisperEndpoint('');
                      setWhisperVerifyResult(null);
                    }}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Endpoint</span>
                  </button>
                ) : <span />}

                <button
                  type="button"
                  onClick={handleProbeLocalWhisper}
                  disabled={isProbingWhisper || !localWhisperEndpointInput.trim()}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                >
                  {isProbingWhisper ? 'Testing Whisper...' : 'Probe Local Whisper'}
                </button>
              </div>
            </div>

            {/* Import from .env / JSON */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Bulk Key Import</span>
                <p className="text-xs text-zinc-400">Import keys from .env or JSON files directly.</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import File</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".env,.json,.txt"
                onChange={handleKeyFileUpload}
                className="hidden"
              />
            </div>

            {fileUploadFeedback && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium text-center">{fileUploadFeedback}</p>
            )}
          </div>
        )}


        {/* TAB 3: STORAGE & BACKUPS */}
        {activeTab === 'storage' && (
          <div id="panel-storage" role="tabpanel" aria-labelledby="subtab-storage-btn" className="max-w-4xl mx-auto space-y-6">
            <StorageDashboard onRefreshNotes={onRefreshNotes} />
            <StoragePanel onRefreshNotes={onRefreshNotes} />

            {/* Export options */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
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
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">Export JSON Workspace</p>
                  <p className="text-xs text-zinc-400">Full structured backup of notes, sketches, and checklists</p>
                </button>

                <label className="p-4 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left space-y-1 transition-colors bg-white dark:bg-[#121216] cursor-pointer">
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">Restore from JSON File</p>
                  <p className="text-xs text-zinc-400">Validate format, preview contents, and safely restore</p>
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
                    const md = notes.length > 0 
                      ? notes.map((n) => `# ${n.title || 'Untitled'}\n\n${n.body}`).join('\n\n---\n\n')
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
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">Export Markdown Archive</p>
                  <p className="text-xs text-zinc-400">Clean Markdown text files readable in any standard text editor</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SECURITY & KEYSTORE */}
        {activeTab === 'security' && (
          <div id="panel-security" role="tabpanel" aria-labelledby="subtab-security-btn" className="max-w-4xl mx-auto space-y-6">
            <SecurityPanel onRefreshNotes={onRefreshNotes} />
            <div className="p-6 bg-zinc-950 rounded-3xl text-white border border-zinc-850 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-wide">
                      {Capacitor.isNativePlatform() ? 'Hardware Keystore Encryption' : 'Local Secret Registry'}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {Capacitor.isNativePlatform()
                        ? 'Android Keystore / Apple Secure Enclave hardware binding'
                        : 'Web build: local metadata registry (not hardware-backed)'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-full font-semibold">
                  {Capacitor.isNativePlatform() ? 'Hardware Keystore (AES-256-GCM)' : 'Volatile Session Memory'}
                </span>
              </div>
            </div>

            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
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
                        <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">{s.alias}</p>
                        <p className="font-mono text-xs text-zinc-400">{s.masked_value}</p>
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
          <div id="panel-diagnostics" role="tabpanel" aria-labelledby="subtab-diagnostics-btn" className="max-w-4xl mx-auto space-y-5">
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
                    <p className="text-xs text-zinc-400">
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
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Zero network delay for edits, search, and checklists using on-device SQLite &amp; client-side caching.
                  </p>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl space-y-1">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Single-Thumb Navigation</span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Ergonomic bottom navigation, Material speed-dial FAB, and 48px+ touch targets for one-handed use.
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Offline-First Architectural Engine
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                VellumScribe runs on an offline-first foundation. All edits write immediately to local browser storage. When cloud providers are connected, cloud sync exports notes flagged for cloud save into a verified backup snapshot.
              </p>
            </div>

            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Recent Sync Telemetry Events ({telemetryList.length})
              </h3>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 max-h-80 overflow-y-auto custom-minimal-scrollbar text-xs">
                {telemetryList.length === 0 ? (
                  <p className="py-4 text-center text-zinc-400 text-xs">No telemetry recorded yet.</p>
                ) : (
                  telemetryList.map((t, i) => (
                    <div key={i} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${t.lastSyncStatus === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 capitalize">{t.provider}</span>
                        <span className="text-zinc-400">
                          {t.lastSyncStatus === 'success' ? `Synced (${Math.round((t.lastTransferBytes || 0) / 1024)} KB)` : t.lastSyncError || 'Sync failed'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-zinc-400 text-xs">
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
            setSyncFeedback(`Successfully configured ${PROVIDERS[selectedProviderForConnect].name}!`);
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
                <div className={`p-2.5 rounded-2xl ${importPreviewData.valid ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                  {importPreviewData.valid ? <ShieldCheck className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
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
              <span className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-full ${
                importPreviewData.valid 
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
                  : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800'
              }`}>
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
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{importPreviewData.counts.notes}</p>
                    <p className="text-xs text-zinc-400 font-medium">Notes</p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{importPreviewData.counts.events}</p>
                    <p className="text-xs text-zinc-400 font-medium">Categories</p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{importPreviewData.counts.recordings}</p>
                    <p className="text-xs text-zinc-400 font-medium">Voice Memos</p>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl text-center">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{importPreviewData.counts.ocrScans}</p>
                    <p className="text-xs text-zinc-400 font-medium">OCR Scans</p>
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
                    A safety snapshot of your current local workspace will be generated automatically before importing. The import executes within an atomic SQLite transaction and verifies database integrity before saving.
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
                    } catch (err: any) {
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
                <h3 id="restore-modal-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100 font-serif-editorial">
                  Restore Cloud Backup?
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  {restoreConfirmTarget.title || restoreConfirmTarget.backupId}
                </p>
              </div>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Restoring will synchronize your local notes from this encrypted remote cloud snapshot. A safety rollback snapshot of your current local notes will be automatically preserved before restoring.
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
