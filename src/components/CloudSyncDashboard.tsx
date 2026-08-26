import React, { useState } from 'react';
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  HardDrive,
  ChevronRight,
  History,
  Shield,
  Smartphone,
  Check,
  ShieldAlert,
  WifiOff,
  Server,
  Globe,
  Database,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { CloudAccount, CloudStorageProvider, SyncTelemetry, NoteRecord } from '../types';
import { CloudSyncEngine, BackupFrequency, SyncProgressUpdate } from '../lib/cloudSync';
import { SQLiteDatabase } from '../lib/storage';
import { SyncProgressBar } from './SyncProgressBar';

import { CloudConnectModal } from './CloudConnectModal';

interface CloudSyncDashboardProps {
  onOpenConflictModal: () => void;
  onSyncCompleted: () => void;
}

interface ProviderMeta {
  name: string;
  category: 'Popular Cloud' | 'Enterprise / Privacy' | 'Custom / Self-Hosted';
  description: string;
  iconColor: string;
  defaultPath: string;
  requiresUrl?: boolean;
  requiresBucket?: boolean;
}

const PROVIDER_METADATA: Record<CloudStorageProvider, ProviderMeta> = {
  google_drive: {
    name: 'Google Drive',
    category: 'Popular Cloud',
    description: 'Sync notes and media attachments directly to your Google Drive workspace.',
    iconColor: '#34a853',
    defaultPath: '/Google Drive/VellumScribe_Backups/',
  },
  dropbox: {
    name: 'Dropbox',
    category: 'Popular Cloud',
    description: 'Automatic version-controlled document backups inside Dropbox Apps folder.',
    iconColor: '#0061ff',
    defaultPath: '/Dropbox/Apps/VellumScribe_Vault/',
  },
  onedrive: {
    name: 'Microsoft OneDrive',
    category: 'Popular Cloud',
    description: 'Store notes securely in personal or Microsoft 365 OneDrive cloud.',
    iconColor: '#0078d4',
    defaultPath: '/OneDrive/Apps/VellumScribe/',
  },
  icloud: {
    name: 'Apple iCloud Drive',
    category: 'Popular Cloud',
    description: 'Sync seamlessly across Apple and mobile devices using iCloud CloudKit / WebDAV.',
    iconColor: '#5ac8fa',
    defaultPath: '/iCloud Drive/VellumScribe/',
  },
  nextcloud: {
    name: 'Nextcloud / ownCloud (WebDAV)',
    category: 'Enterprise / Privacy',
    description: 'Self-hosted, private cloud storage using standard WebDAV authentication.',
    iconColor: '#0082c9',
    defaultPath: '/remote.php/dav/files/user/VellumScribe/',
    requiresUrl: true,
  },
  s3: {
    name: 'Amazon S3 / MinIO / Backblaze',
    category: 'Custom / Self-Hosted',
    description: 'Object storage for custom buckets, enterprise MinIO clusters, or Wasabi/B2.',
    iconColor: '#ff9900',
    defaultPath: 's3://vellumscribe-vault/',
    requiresBucket: true,
    requiresUrl: true,
  },
};

export const CloudSyncDashboard: React.FC<CloudSyncDashboardProps> = ({
  onOpenConflictModal,
  onSyncCompleted,
}) => {
  const [accounts, setAccounts] = useState<CloudAccount[]>(() => CloudSyncEngine.getAccounts());
  const [telemetryList, setTelemetryList] = useState<SyncTelemetry[]>(() => CloudSyncEngine.getTelemetry());
  const [notes, setNotes] = useState<NoteRecord[]>(() => SQLiteDatabase.getNotes());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate | null>(null);
  const [backupFrequency, setBackupFrequencyState] = useState<BackupFrequency>(() => CloudSyncEngine.getBackupFrequency());
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Connection dialog state for advanced providers (Nextcloud, S3, custom)
  const [connectingProvider, setConnectingProvider] = useState<CloudStorageProvider | null>(null);
  const [connectEmail, setConnectEmail] = useState('');
  const [connectServerUrl, setConnectServerUrl] = useState('');
  const [connectBucketName, setConnectBucketName] = useState('');

  const stats = SQLiteDatabase.getStorageStats();
  const isOfflineMode = backupFrequency === 'never';

  const handleManualSync = async () => {
    if (isOfflineMode) {
      setSyncFeedback('Operating in 100% offline air-gapped mode. Local snapshot is preserved on this device.');
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
      onSyncCompleted();
    } catch {
      setSyncFeedback('Sync failed. Please check your network connection.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        setSyncProgress(null);
      }, 2500);
    }
  };

  const handleOpenConnectDialog = (provider: CloudStorageProvider) => {
    setConnectingProvider(provider);
  };

  const handleConfirmCustomConnect = () => {
    if (!connectingProvider) return;
    const email = connectEmail.trim() || 'user@domain.com';
    CloudSyncEngine.connectAccount(
      connectingProvider,
      email,
      'Custom Storage Account',
      {
        server_url: connectServerUrl.trim() || undefined,
        bucket_name: connectBucketName.trim() || undefined,
      }
    );
    setAccounts(CloudSyncEngine.getAccounts());
    setConnectingProvider(null);
    setSyncFeedback(`Successfully connected to ${PROVIDER_METADATA[connectingProvider].name}!`);
    setTimeout(() => setSyncFeedback(null), 3000);
  };

  const handleToggleNoteCloudSave = (noteId: number) => {
    const updated = SQLiteDatabase.toggleCloudSave(noteId);
    if (updated) {
      setNotes(SQLiteDatabase.getNotes());
      onSyncCompleted();
    }
  };

  const handleFrequencyChange = (val: BackupFrequency) => {
    setBackupFrequencyState(val);
    CloudSyncEngine.setBackupFrequency(val);
    if (val === 'never') {
      setSyncFeedback('Backup frequency set to Never. System is operating in 100% offline air-gapped mode.');
    } else {
      setSyncFeedback(`Backup frequency updated to: ${val}`);
    }
  };

  const activeAccounts = accounts.filter((a) => a.connected);

  return (
    <div id="cloud-sync-dashboard-container" className="max-w-2xl mx-auto space-y-8 pb-16 select-none animate-fade-in">
      {/* Header & Status */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 font-serif-editorial">
              Cloud Storage &amp; Backup Services
            </h2>
            <p className="text-xs text-zinc-400">
              Zero-knowledge local persistence with integrations for all major cloud providers
            </p>
          </div>

          <button
            id="manual-backup-now-btn"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs transition-opacity disabled:opacity-50 min-h-[38px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Cloud Now'}</span>
          </button>
        </div>

        {/* Live Sync Progress Bar */}
        {(isSyncing || syncProgress) && (
          <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <SyncProgressBar
              isSyncing={isSyncing}
              progress={syncProgress}
              onDismiss={() => setSyncProgress(null)}
            />
          </div>
        )}

        {/* Feedback Message */}
        {syncFeedback && (
          <div className="p-3 bg-zinc-100 dark:bg-zinc-850 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
          <span>
            {activeAccounts.length > 0
              ? `${activeAccounts.length} cloud service(s) connected`
              : 'Local-only mode active (No external accounts connected)'}
          </span>

          <button
            onClick={onOpenConflictModal}
            className="flex items-center gap-1 text-zinc-600 dark:text-zinc-300 hover:underline underline-offset-4"
          >
            <History className="w-3 h-3" />
            <span>Version History</span>
          </button>
        </div>
      </div>

      {/* Storage Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-zinc-50/70 dark:bg-[#141418] border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-medium">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Local Device Storage</span>
          </div>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {stats.totalNotes} <span className="text-xs font-normal text-zinc-400">notes total</span>
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {stats.localOnlyNotes} local notes &amp; {stats.localOnlyRecordings} audio recordings stored on device.
          </p>
        </div>

        <div className="p-4 bg-zinc-50/70 dark:bg-[#141418] border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl space-y-1.5">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-medium">
            <Cloud className="w-3.5 h-3.5" />
            <span>Cloud Opt-In Status</span>
          </div>
          <p className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {stats.cloudSavedNotes} <span className="text-xs font-normal text-zinc-400">cloud enabled</span>
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Only documents explicitly flagged for cloud sync will upload.
          </p>
        </div>
      </div>

      {/* Connected & Available Cloud Services */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Cloud Providers &amp; Integrations
          </h3>
          <span className="text-[11px] text-zinc-500">All standard protocols supported</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {(Object.keys(PROVIDER_METADATA) as CloudStorageProvider[]).map((providerKey) => {
            const meta = PROVIDER_METADATA[providerKey];
            const acc = accounts.find((a) => a.provider === providerKey);
            const isConnected = !!acc?.connected;

            return (
              <div
                key={providerKey}
                className="p-3.5 border border-zinc-200/70 dark:border-zinc-800/70 rounded-2xl flex items-center justify-between gap-4 bg-white dark:bg-[#121216] transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Cloud className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {meta.name}
                      </h4>
                      <span className="text-[9px] font-medium uppercase px-1.5 py-0.2 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                        {meta.category}
                      </span>
                      {isConnected ? (
                        <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          SSO Active
                        </span>
                      ) : (
                        <span className="text-[9px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded-md">
                          1-Click SSO
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                      {isConnected ? (acc.account_email || acc.user_email || 'SSO Connected') : meta.description}
                    </p>
                  </div>
                </div>

                <button
                  id={`connect-${providerKey}-btn`}
                  onClick={() => handleOpenConnectDialog(providerKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                    isConnected
                      ? 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white'
                  }`}
                >
                  {isConnected ? 'Manage SSO' : 'SSO Login'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto Backup & Frequency Preferences */}
      <div className="p-4 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl space-y-3 bg-zinc-50/50 dark:bg-[#101014] text-xs">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>Automatic Backup Schedule</span>
              {isOfflineMode && (
                <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-medium">
                  Air-Gapped Offline
                </span>
              )}
            </p>
            <p className="text-[11px] text-zinc-400">
              {isOfflineMode
                ? 'Automatic sync is turned off. All records remain exclusively on this device.'
                : 'Select how often cloud snapshots are synchronized automatically in the background.'}
            </p>
          </div>

          <select
            id="backup-frequency-select"
            value={backupFrequency}
            onChange={(e) => handleFrequencyChange(e.target.value as BackupFrequency)}
            className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 font-medium"
          >
            <option value="never">Never (Fully Offline / Air-Gapped)</option>
            <option value="5m">Every 5 minutes</option>
            <option value="15m">Every 15 minutes</option>
            <option value="1h">Every 1 hour</option>
            <option value="daily">Daily</option>
            <option value="manual">Manual only</option>
          </select>
        </div>
      </div>

      {/* Cloud Provider Connection Modal */}
      {connectingProvider && (
        <CloudConnectModal
          provider={connectingProvider}
          existingAccount={accounts.find((a) => a.provider === connectingProvider)}
          onClose={() => setConnectingProvider(null)}
          onConnected={(acc) => {
            setAccounts(CloudSyncEngine.getAccounts());
            setSyncFeedback(`Successfully connected to ${PROVIDER_METADATA[connectingProvider].name}!`);
            setConnectingProvider(null);
            setTimeout(() => setSyncFeedback(null), 3000);
          }}
          onDisconnected={(prov) => {
            setAccounts(CloudSyncEngine.getAccounts());
            setSyncFeedback(`Disconnected ${PROVIDER_METADATA[prov].name}.`);
            setConnectingProvider(null);
            setTimeout(() => setSyncFeedback(null), 3000);
          }}
        />
      )}
    </div>
  );
};
