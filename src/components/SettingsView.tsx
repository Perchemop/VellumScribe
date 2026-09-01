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
} from 'lucide-react';
import { CloudAccount, CloudStorageProvider, SyncTelemetry, NoteRecord } from '../types';
import { Capacitor } from '@capacitor/core';
import { AiSettingsManager, AiIntegrationSettings } from '../lib/aiSettings';
import { CloudSyncEngine, BackupFrequency, SyncProgressUpdate } from '../lib/cloudSync';
import { StorageManager } from '../lib/storage';
import { AndroidKeystoreManager } from '../lib/keystore';
import { CURRENT_APP_VERSION } from '../lib/appUpdateManager';
import { AppLogo } from './AppLogo';
import { CloudConnectModal } from './CloudConnectModal';
import { SyncProgressBar } from './SyncProgressBar';

interface SettingsViewProps {
  initialSubtab?: 'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics';
  onOpenConflictModal?: () => void;
  onOpenUpdateModal?: () => void;
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
    category: 'Google Workspace',
    description: 'Sync notes and audio recordings to your personal or business Google Drive folder.',
    brandColor: '#34a853',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  microsoft: {
    name: 'Microsoft OneDrive',
    category: 'Microsoft 365',
    description: 'Store notes and attachments securely in personal or Microsoft 365 OneDrive cloud.',
    brandColor: '#0078d4',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSubtab = 'cloud',
  onOpenConflictModal,
  onOpenUpdateModal,
  onRefreshNotes,
  onBackToNotes,
  activeEditingNoteTitle,
}) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics'>(
    initialSubtab === 'ai'
      ? 'ai'
      : initialSubtab === 'storage'
      ? 'storage'
      : initialSubtab === 'security'
      ? 'security'
      : initialSubtab === 'diagnostics'
      ? 'diagnostics'
      : 'cloud'
  );

  // Cloud Backup State
  const [accounts, setAccounts] = useState<CloudAccount[]>(() => CloudSyncEngine.getAccounts());
  const [telemetryList, setTelemetryList] = useState<SyncTelemetry[]>(() => CloudSyncEngine.getTelemetry());
  const [notes, setNotes] = useState<NoteRecord[]>(() => StorageManager.getNotes());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [backupFrequency, setBackupFrequencyState] = useState<BackupFrequency>(() => CloudSyncEngine.getBackupFrequency());
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [selectedProviderForConnect, setSelectedProviderForConnect] = useState<CloudStorageProvider | null>(null);

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
      setNotes(StorageManager.getNotes());
      setSyncFeedback(success ? 'Sync complete' : 'Sync failed');
      onRefreshNotes();
    } catch {
      setSyncFeedback('Sync failed. Please check network connectivity.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncProgress(null);
      }, 2500);
    }
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

  const handleSaveGroqKey = () => {
    AiSettingsManager.setGroqApiKey(groqKeyInput.trim());
    setGroqVerifyResult(null);
    setFileUploadFeedback('Groq API key saved locally.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleSaveDeepgramKey = () => {
    AiSettingsManager.setDeepgramApiKey(deepgramKeyInput.trim());
    setDeepgramVerifyResult(null);
    setFileUploadFeedback('Deepgram API key saved locally.');
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
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
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
          <span>AI Intelligence &amp; Fallbacks</span>
          {googleKeyInput || groqKeyInput || aiSettings.primaryLlmProvider === 'ollama' || aiSettings.primaryLlmProvider === 'offline_rules' ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Engine Active" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-500" title="Configure Engine" />
          )}
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
      </div>

      {/* Main Tab Content Body */}
      <div className="flex-1 overflow-y-auto custom-minimal-scrollbar p-6 space-y-6">
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

            {/* Sync Mode & Frequency Header Card */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Cloud Backup Engine
                    </h3>
                    {isAirGapped ? (
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                        <WifiOff className="w-3 h-3" />
                        Offline Air-Gapped Mode
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
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
                  <label className="text-xs text-zinc-500 font-medium">Backup Interval:</label>
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

            {/* Cloud Storage Providers Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Cloud Destinations
                </h3>
                <span className="text-xs text-zinc-400">One-click connect</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(PROVIDERS) as CloudStorageProvider[]).map((providerKey) => {
                  const meta = PROVIDERS[providerKey];
                  const account = accounts.find((a) => a.provider === providerKey);
                  const isConnected = !!account?.connectedAt;

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
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-md border font-medium ${meta.badgeBg}`}>
                                {meta.category}
                              </span>
                              {isConnected ? (
                                <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-md">
                                  Connected
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">{meta.description}</p>
                          </div>
                        </div>
                      </div>

                      {/* Connection status and path info */}
                      {isConnected ? (
                        <div className="p-2.5 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl space-y-1 text-[11px]">
                          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300 font-semibold">
                            <span className="flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {account?.email || account?.displayName || 'Connected'}
                            </span>
                          </div>
                          <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            /vellumscribe_backup.json
                          </p>
                        </div>
                      ) : null}

                      {/* Action buttons */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-zinc-400">
                          {isConnected && account?.connectedAt
                            ? `Connected on: ${new Date(account.connectedAt).toLocaleDateString()}`
                            : 'Not connected'}
                        </span>

                        <button
                          id={`connect-provider-btn-${providerKey}`}
                          onClick={() => setSelectedProviderForConnect(providerKey)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                            isConnected
                              ? 'border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                              : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 shadow-2xs'
                          }`}
                        >
                          {isConnected ? (
                            <>
                              <span>Manage</span>
                              <ChevronRight className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3 h-3" />
                              <span>Connect</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-Document Cloud Backup Toggle Table */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Granular Document Cloud Backup Preferences
                  </h3>
                  <p className="text-[11px] text-zinc-400">
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
                          <p className="text-[10px] text-zinc-400 truncate">
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
            {/* Privacy notice */}
            <div className="p-4 rounded-3xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-start gap-3 text-emerald-900 dark:text-emerald-300">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-xs">Zero Server-Side Key Logging &amp; Offline Sovereignty</p>
                <p className="text-xs text-emerald-800 dark:text-emerald-400/90 leading-relaxed">
                  All BYOK keys (Google AI Studio, Groq, Deepgram) remain strictly on your local device in encrypted browser storage. Switch to <strong>Local Ollama</strong>, <strong>Local Whisper</strong>, or <strong>Offline Rule Engine</strong> for 100% air-gapped processing without accounts or internet.
                </p>
              </div>
            </div>

            {/* Provider Selection Grid */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Primary Intelligence Engines
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Primary LLM Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span>Primary LLM (Summary / Minutes / Notes)</span>
                  </label>
                  <select
                    value={aiSettings.primaryLlmProvider || 'google'}
                    onChange={(e) => handleUpdateAiSettings({ primaryLlmProvider: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="google">Google AI Studio (Gemini 3.7 / 3.6 / OCR)</option>
                    <option value="groq">Groq Cloud (Llama 3.3 70B Versatile - Ultra Fast)</option>
                    <option value="ollama">Local Ollama Daemon (Llama 3.2, Mistral, Qwen)</option>
                    <option value="offline_rules">100% Offline Rule Engine (Zero Account / No Network)</option>
                  </select>
                  <p className="text-[10px] text-zinc-400">
                    Powers executive summaries, meeting minutes synthesis, and automated checklists.
                  </p>
                </div>

                {/* Primary Transcription Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-indigo-500" />
                    <span>Primary Speech Transcription</span>
                  </label>
                  <select
                    value={aiSettings.primaryTranscriptionProvider || 'google'}
                    onChange={(e) => handleUpdateAiSettings({ primaryTranscriptionProvider: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="google">Google AI Studio (Gemini 3.5 Transcribe)</option>
                    <option value="groq_whisper">Groq Cloud (Whisper Large v3 Turbo - Real-Time)</option>
                    <option value="deepgram">Deepgram Speech Platform (Nova-3 High Accuracy)</option>
                    <option value="local_whisper">Local Whisper Server (Offline on Device)</option>
                    <option value="browser_speech">Browser Speech Recognition (Native Web API)</option>
                  </select>
                  <p className="text-[10px] text-zinc-400">
                    Converts meeting voice recordings into verbatim speaker-attributed transcripts.
                  </p>
                </div>
              </div>

              {/* Fallback toggle */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Automatic Local / Offline Fallback
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    If cloud quota is exceeded or device is offline, automatically switch to Local Ollama or built-in offline engine.
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

            {/* Provider 1: Google AI Studio Key */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-500" />
                  <span>Google AI Studio API Key (Gemini &amp; OCR)</span>
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
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
                  placeholder="AIzaSy..."
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

              <div className="flex items-center justify-end gap-2 pt-1">
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
                  Save Google Key
                </button>
              </div>
            </div>

            {/* Provider 2: Groq Cloud Key */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Key className="w-4 h-4 text-orange-500" />
                  <span>Groq API Key (Llama 3.3 70B &amp; Whisper Large v3)</span>
                </label>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Get Free Groq Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  id="settings-groq-key-input"
                  type={showGroqKey ? 'text' : 'password'}
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  placeholder="gsk_..."
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

              <div className="flex items-center justify-end gap-2 pt-1">
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
                  Save Groq Key
                </button>
              </div>
            </div>

            {/* Provider 3: Deepgram Key */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Key className="w-4 h-4 text-cyan-500" />
                  <span>Deepgram API Key (Nova-3 Speech Intelligence)</span>
                </label>
                <a
                  href="https://console.deepgram.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Get Deepgram Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  id="settings-deepgram-key-input"
                  type={showDeepgramKey ? 'text' : 'password'}
                  value={deepgramKeyInput}
                  onChange={(e) => setDeepgramKeyInput(e.target.value)}
                  placeholder="Paste Deepgram key..."
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

              <div className="flex items-center justify-end gap-2 pt-1">
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
                  Save Deepgram Key
                </button>
              </div>
            </div>

            {/* Provider 4: Local Ollama Daemon Settings */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-500" />
                <span>Local Ollama Daemon Configuration</span>
              </label>

              <input
                type="text"
                value={ollamaEndpointInput}
                onChange={(e) => setOllamaEndpointInput(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              {ollamaVerifyResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    ollamaVerifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {ollamaVerifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{ollamaVerifyResult.message}</span>
                </div>
              )}

              {ollamaModels.length > 0 && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl">
                  <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
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

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={handleProbeOllama}
                  disabled={isProbingOllama}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5"
                >
                  {isProbingOllama ? 'Probing Ollama...' : 'Probe & Test Ollama'}
                </button>
              </div>
            </div>

            {/* Provider 5: Local Whisper Daemon Settings */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-500" />
                <span>Local Whisper Speech Server</span>
              </label>

              <input
                type="text"
                value={localWhisperEndpointInput}
                onChange={(e) => setLocalWhisperEndpointInput(e.target.value)}
                placeholder="http://localhost:8080/v1/audio/transcriptions"
                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              {whisperVerifyResult && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs ${
                    whisperVerifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {whisperVerifyResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                  <span>{whisperVerifyResult.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={handleProbeLocalWhisper}
                  disabled={isProbingWhisper}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                >
                  {isProbingWhisper ? 'Testing Whisper...' : 'Probe Local Whisper'}
                </button>
              </div>
            </div>

            {/* Import from .env / JSON */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Bulk Key Import</span>
                <p className="text-[10px] text-zinc-400">Import keys from .env or JSON files directly.</p>
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
            {/* Storage breakdown card */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Local Browser Storage
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalNotes}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Total Notes</p>
                </div>

                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.activeNotes}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Active Notes</p>
                </div>

                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.archivedNotes}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Archived</p>
                </div>

                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalRecordings}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Audio Recordings</p>
                </div>
              </div>
            </div>

            {/* Export options */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Manual Archive &amp; Full Data Export
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
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">Export JSON Backup</p>
                  <p className="text-[11px] text-zinc-400">Full structured backup of notes, sketches, and checklists</p>
                </button>

                <label className="p-4 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-left space-y-1 transition-colors bg-white dark:bg-[#121216] cursor-pointer">
                  <p className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">Restore from Backup File</p>
                  <p className="text-[11px] text-zinc-400">Import a previously saved JSON backup file</p>
                  <input 
                    type="file" 
                    accept=".json" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                          const res = await StorageManager.importPortableBackupAsync(ev.target?.result as string);
                          if (res.success) {
                            onRefreshNotes();
                            setSyncFeedback(res.message);
                            setStats(StorageManager.getStorageStats());
                          } else {
                            setSyncFeedback(res.message);
                          }
                          setTimeout(() => setSyncFeedback(null), 3000);
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
                  <p className="text-[11px] text-zinc-400">Clean Markdown text files readable in any standard text editor</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SECURITY & KEYSTORE */}
        {activeTab === 'security' && (
          <div id="panel-security" role="tabpanel" aria-labelledby="subtab-security-btn" className="max-w-4xl mx-auto space-y-6">
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
                  {Capacitor.isNativePlatform() ? 'AES-256-GCM' : 'Local Storage'}
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
                        <p className="font-mono text-[10px] text-zinc-400">{s.masked_value}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
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
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Offline-First Architectural Engine
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                VellumScribe runs on an offline-first foundation. All edits write immediately to local browser storage. When cloud providers are connected, cloud sync exports notes flagged for cloud save into a verified backup snapshot.
              </p>
              {onOpenUpdateModal && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onOpenUpdateModal}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Check for App Updates</span>
                  </button>
                </div>
              )}
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
                      <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
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
    </div>
  );
};
