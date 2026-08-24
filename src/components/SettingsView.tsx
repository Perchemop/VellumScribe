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
  Lock,
  Trash2,
  Check,
  Server,
  Folder,
  Globe,
  Radio,
  FileCode,
  Info,
  ChevronRight,
  ShieldAlert,
  WifiOff,
  Download,
  Clock,
} from 'lucide-react';
import { CloudAccount, CloudStorageProvider, SyncTelemetry, NoteRecord } from '../types';
import { AiSettingsManager, AiIntegrationSettings } from '../lib/aiSettings';
import { CloudSyncEngine, BackupFrequency, SyncProgressUpdate } from '../lib/cloudSync';
import { SQLiteDatabase } from '../lib/storage';
import { AndroidKeystoreManager } from '../lib/keystore';
import { CloudConnectModal } from './CloudConnectModal';
import { SyncProgressBar } from './SyncProgressBar';

interface SettingsViewProps {
  initialSubtab?: 'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics';
  onOpenConflictModal: () => void;
  onRefreshNotes: () => void;
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
  dropbox: {
    name: 'Dropbox',
    category: 'Cloud Storage',
    description: 'Automatic version-controlled document backups stored safely in Dropbox App folder.',
    brandColor: '#0061ff',
    badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  onedrive: {
    name: 'Microsoft OneDrive',
    category: 'Microsoft 365',
    description: 'Store notes and attachments securely in personal or Microsoft 365 OneDrive cloud.',
    brandColor: '#0078d4',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
  icloud: {
    name: 'Apple iCloud Drive',
    category: 'Apple CloudKit',
    description: 'Seamless cross-platform sync across Apple macOS, iOS, and WebDAV containers.',
    brandColor: '#5ac8fa',
    badgeBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  },
  nextcloud: {
    name: 'Nextcloud / ownCloud',
    category: 'Enterprise / Self-Hosted',
    description: '100% self-hosted, private cloud storage using secure WebDAV protocol.',
    brandColor: '#0082c9',
    badgeBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },
  s3: {
    name: 'Amazon S3 / MinIO / Backblaze',
    category: 'Custom Object Storage',
    description: 'High-speed object storage for AWS S3 buckets, MinIO clusters, or Wasabi/B2.',
    brandColor: '#ff9900',
    badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  initialSubtab = 'cloud',
  onOpenConflictModal,
  onRefreshNotes,
}) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics'>(initialSubtab);

  // Cloud Sync State
  const [accounts, setAccounts] = useState<CloudAccount[]>(() => CloudSyncEngine.getAccounts());
  const [telemetryList, setTelemetryList] = useState<SyncTelemetry[]>(() => CloudSyncEngine.getTelemetry());
  const [notes, setNotes] = useState<NoteRecord[]>(() => SQLiteDatabase.getNotes());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [backupFrequency, setBackupFrequencyState] = useState<BackupFrequency>(() => CloudSyncEngine.getBackupFrequency());
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [selectedProviderForConnect, setSelectedProviderForConnect] = useState<CloudStorageProvider | null>(null);

  // AI State
  const [aiSettings, setAiSettings] = useState<AiIntegrationSettings>(() => AiSettingsManager.getSettings());
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => AiSettingsManager.getApiKey());
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fileUploadFeedback, setFileUploadFeedback] = useState<string | null>(null);

  // Storage stats & Keystore
  const [stats, setStats] = useState(() => SQLiteDatabase.getStorageStats());
  const [secrets, setSecrets] = useState(() => AndroidKeystoreManager.listSecrets());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

  const isAirGapped = backupFrequency === 'never';
  const activeAccounts = accounts.filter((a) => a.connected);

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
      const result = await CloudSyncEngine.triggerSync({
        onProgress: (p) => setSyncProgress(p),
      });
      setTelemetryList(CloudSyncEngine.getTelemetry());
      setAccounts(CloudSyncEngine.getAccounts());
      setNotes(SQLiteDatabase.getNotes());
      setSyncFeedback(result.message);
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
    if (val === 'never') {
      setSyncFeedback('Backup frequency set to Never. System is operating in 100% offline air-gapped mode.');
    } else {
      setSyncFeedback(`Backup frequency updated to: ${val}`);
    }
    setTimeout(() => setSyncFeedback(null), 3500);
  };

  // Toggle note cloud save
  const handleToggleNoteCloudSave = (noteId: number) => {
    const updated = SQLiteDatabase.toggleCloudSave(noteId);
    if (updated) {
      setNotes(SQLiteDatabase.getNotes());
      onRefreshNotes();
    }
  };

  // AI Key actions
  const handleSaveApiKey = () => {
    AiSettingsManager.setApiKey(apiKeyInput);
    setVerifyResult(null);
    setFileUploadFeedback('API key saved locally.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleClearApiKey = () => {
    AiSettingsManager.clearApiKey();
    setApiKeyInput('');
    setVerifyResult(null);
    setFileUploadFeedback('API key cleared from local storage.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };

  const handleTestApiKey = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await AiSettingsManager.testApiKey(apiKeyInput.trim());
      setVerifyResult(res);
    } catch (err: any) {
      setVerifyResult({
        success: false,
        message: err?.message || 'Verification request failed.',
      });
    } finally {
      setIsVerifying(false);
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
        setApiKeyInput(extracted.key);
        AiSettingsManager.setApiKey(extracted.key);
        setFileUploadFeedback(`Successfully loaded API key from ${file.name}!`);
        setVerifyResult(null);
      } else {
        setFileUploadFeedback(extracted.error || 'Failed to find a valid API key in file.');
      }
    };
    reader.readAsText(file);
  };

  // Restore JSON Backup
  const handleRestoreJsonBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const success = SQLiteDatabase.importFullBackup(content);
        if (success) {
          setStats(SQLiteDatabase.getStorageStats());
          setNotes(SQLiteDatabase.getNotes());
          onRefreshNotes();
          alert('Backup restored successfully!');
        } else {
          alert('Invalid backup JSON format.');
        }
      } catch {
        alert('Failed to parse backup JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div id="dedicated-settings-view" className="h-full flex flex-col bg-[#fafaf9] dark:bg-[#0c0c0e] overflow-hidden">
      {/* Top Header */}
      <div className="px-6 py-5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#101014] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 font-serif-editorial">
            Settings &amp; Cloud Integration
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage multi-cloud storage accounts, Gemini AI intelligence, local database, and hardware security keys.
          </p>
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
            <span>{isSyncing ? 'Syncing...' : 'Sync Vault Now'}</span>
          </button>
        </div>
      </div>

      {/* Secondary Subtab Navigation */}
      <div className="px-6 border-b border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50/60 dark:bg-[#0e0e12] flex items-center gap-1 overflow-x-auto custom-minimal-scrollbar text-xs">
        <button
          id="subtab-cloud-sync-btn"
          onClick={() => setActiveTab('cloud')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'cloud'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Cloud className="w-4 h-4" />
          <span>Cloud Sync &amp; Providers</span>
          {activeAccounts.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold">
              {activeAccounts.length}
            </span>
          )}
        </button>

        <button
          id="subtab-ai-key-btn"
          onClick={() => setActiveTab('ai')}
          className={`py-3 px-3.5 font-medium border-b-2 transition-colors flex items-center gap-2 shrink-0 ${
            activeTab === 'ai'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>AI Studio &amp; Vision</span>
          {apiKeyInput ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Key Configured" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-500" title="No Key" />
          )}
        </button>

        <button
          id="subtab-storage-btn"
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
          <div className="max-w-5xl mx-auto space-y-6">
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
                      Cloud Synchronization Engine
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
                    <option value="5m">Every 5 minutes (Continuous)</option>
                    <option value="15m">Every 15 minutes</option>
                    <option value="1h">Every 1 hour</option>
                    <option value="daily">Daily</option>
                    <option value="manual">Manual Only</option>
                    <option value="never">Never (Fully Offline Air-Gapped)</option>
                  </select>
                </div>
              </div>

              {/* Version History & Conflicts launcher */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  Automatic multi-version snapshots preserved on conflict detection
                </span>
                <button
                  id="open-conflicts-modal-btn"
                  onClick={onOpenConflictModal}
                  className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-xl text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
                >
                  Inspect Conflict Logs &amp; Versions
                </button>
              </div>
            </div>

            {/* Cloud Storage Providers Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Cloud Destinations &amp; Vaults
                </h3>
                <span className="text-xs text-zinc-400">Click &ldquo;Connect&rdquo; to configure credentials and vault path</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(PROVIDERS) as CloudStorageProvider[]).map((providerKey) => {
                  const meta = PROVIDERS[providerKey];
                  const account = accounts.find((a) => a.provider === providerKey);
                  const isConnected = !!account?.connected;

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
                              {account?.user_email || account?.account_email || 'Authenticated'}
                            </span>
                            <span className="text-[10px] text-emerald-600/80">Active Vault</span>
                          </div>
                          <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                            {account?.cloud_backup_path}
                          </p>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl text-[11px] text-zinc-400 flex items-center gap-1.5">
                          <Folder className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="truncate">Default: {account?.cloud_backup_path || '/VellumScribe_Backups/'}</span>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-zinc-400">
                          {isConnected && account?.last_synced_at
                            ? `Last Synced: ${new Date(account.last_synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Not configured'}
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
                              <span>Manage / Settings</span>
                              <ChevronRight className="w-3 h-3" />
                            </>
                          ) : (
                            <>
                              <Cloud className="w-3 h-3" />
                              <span>Connect Provider</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Per-Document Cloud Sync Toggle Table */}
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Granular Document Cloud Sync Preferences
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
                            Updated {new Date(note.updated_at || note.created_at).toLocaleString()} • {note.note_type || 'text'}
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
                          <span>{isEnabled ? 'Cloud Sync On' : 'Device Only (Air-Gapped)'}</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AI STUDIO & GEMINI */}
        {activeTab === 'ai' && (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Privacy notice */}
            <div className="p-4 rounded-3xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 flex items-start gap-3 text-emerald-900 dark:text-emerald-300">
              <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-xs">Zero Server-Side Key Logging</p>
                <p className="text-xs text-emerald-800 dark:text-emerald-400/90 leading-relaxed">
                  Your Gemini API key is stored <strong>exclusively in local browser storage</strong> on this device. Key transmission is routed directly via encrypted headers for note summaries, OCR vision extraction, and smart categorization.
                </p>
              </div>
            </div>

            {/* API Key Configuration Card */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-500" />
                  <span>Google AI Studio API Key</span>
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Get Gemini API Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="relative">
                <input
                  id="settings-view-api-key-input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-24"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  {apiKeyInput && (
                    <button
                      type="button"
                      onClick={handleClearApiKey}
                      title="Clear Key"
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Verify status */}
              {verifyResult && (
                <div
                  className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-xs ${
                    verifyResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                  }`}
                >
                  {verifyResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span>{verifyResult.message}</span>
                </div>
              )}

              {fileUploadFeedback && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{fileUploadFeedback}</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-xl text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import from .env or JSON file</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".env,.json,.txt"
                  onChange={handleKeyFileUpload}
                  className="hidden"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestApiKey}
                    disabled={!apiKeyInput.trim() || isVerifying}
                    className="px-3.5 py-2 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40"
                  >
                    {isVerifying ? 'Verifying...' : 'Test Connection'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  >
                    Save API Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STORAGE & BACKUPS */}
        {activeTab === 'storage' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Storage breakdown card */}
            <div className="p-6 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl shadow-2xs space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Local SQLite Database Storage
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalNotes}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Total Notes</p>
                </div>

                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.cloudSavedNotes}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Cloud Synced</p>
                </div>

                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.localOnlyNotes}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Local Only</p>
                </div>

                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{stats.totalRecordings}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Audio Recordings</p>
                </div>
              </div>
            </div>

            {/* Export & Import Data */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-3">
                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Download className="w-4 h-4 text-indigo-500" />
                  <span>Export Vault Data</span>
                </h4>
                <p className="text-xs text-zinc-400">
                  Download a complete backup archive containing notes, categories, tags, voice transcripts, and sketches.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      const json = SQLiteDatabase.exportFullBackup();
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `VellumScribe_Backup_${new Date().toISOString().split('T')[0]}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="w-full px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-2xl text-xs font-semibold shadow-2xs text-center"
                  >
                    Export Full JSON Backup (.json)
                  </button>

                  <button
                    onClick={() => {
                      const allNotes = SQLiteDatabase.getNotes();
                      const md = allNotes.length > 0 
                        ? allNotes.map((n) => `# ${n.title || 'Untitled'}\n\n${n.body}`).join('\n\n---\n\n')
                        : '# VellumScribe Notes\n\nNo notes currently saved.';
                      const blob = new Blob([md], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `VellumScribe_Notes_${new Date().toISOString().split('T')[0]}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-2xl text-xs font-semibold text-center"
                  >
                    Export Clean Markdown Archive (.md)
                  </button>
                </div>
              </div>

              <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-3">
                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-500" />
                  <span>Restore from Backup</span>
                </h4>
                <p className="text-xs text-zinc-400">
                  Import a previously exported JSON backup to restore your events, notes, and preferences.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => restoreFileInputRef.current?.click()}
                    className="w-full px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 rounded-2xl text-xs font-semibold text-center flex items-center justify-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Select Backup JSON File</span>
                  </button>
                  <input
                    ref={restoreFileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleRestoreJsonBackup}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SECURITY & KEYSTORE */}
        {activeTab === 'security' && (
          <div className="max-w-2xl mx-auto space-y-5">
            <div className="p-5 bg-zinc-950 rounded-3xl text-white border border-zinc-850 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold tracking-wider text-zinc-200 uppercase">
                    Hardware Keystore Encryption
                  </span>
                </div>
                <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-0.5 rounded-full font-mono">
                  AES-256-GCM
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Cryptographic master keys and locked note PINs are handled using hardware keystore sandboxing. Remote syncing encrypts note payloads client-side before dispatch.
              </p>
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
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Offline-First Architectural Engine
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                VellumScribe runs on an offline-first foundation. All edits write immediately to the local SQLite database. When cloud providers are connected, a background sync worker computes cryptographic hashes and streams delta changes.
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
                        <span className={`w-2 h-2 rounded-full ${t.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 capitalize">{t.provider}</span>
                        <span className="text-zinc-400">
                          {t.status === 'success' ? `${t.records_uploaded ?? t.items_synced ?? 0} synced (${Math.round((t.bytes_transferred || 0) / 1024)} KB)` : t.error_message || 'Sync failed'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                        <span>{t.duration_ms}ms</span>
                        <span>{new Date(t.timestamp).toLocaleTimeString()}</span>
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
          onConnected={(updatedAccount) => {
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
