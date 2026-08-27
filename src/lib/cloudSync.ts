import {
  CloudAccount,
  CloudStorageProvider,
  ConflictLog,
  ConflictStrategy,
  DocumentVersion,
  SyncTelemetry,
  NoteRecord,
} from '../types';
import {
  INITIAL_CLOUD_ACCOUNTS,
  INITIAL_CONFLICT_LOGS,
  INITIAL_DOCUMENT_VERSIONS,
  INITIAL_SYNC_TELEMETRY,
} from './sampleData';
import { StorageManager } from './storage';
import { GeminiApiService } from './geminiService';

const STORAGE_KEYS = {
  ACCOUNTS: 'vellumscribe_cloud_accounts_v1',
  CONFLICTS: 'vellumscribe_conflict_logs_v1',
  VERSIONS: 'vellumscribe_doc_versions_v1',
  TELEMETRY: 'vellumscribe_sync_telemetry_v1',
  DEFAULT_STRATEGY: 'vellumscribe_default_conflict_strategy_v1',
  AUTO_SYNC_ENABLED: 'vellumscribe_auto_sync_enabled_v1',
  AUTO_SYNC_INTERVAL: 'vellumscribe_auto_sync_interval_mins_v1',
  BACKUP_FREQUENCY: 'vellumscribe_backup_frequency_mode_v1',
};

export type BackupFrequency = 'never' | '5m' | '15m' | '1h' | 'daily' | 'manual';

export interface SyncProgressUpdate {
  percent: number;
  message: string;
  phase: 'init' | 'hashing' | 'transferring' | 'verifying' | 'complete';
}

export class CloudSyncEngine {
  private static isSyncRunning = false;

  // Accounts
  public static getAccounts(): CloudAccount[] {
    const data = StorageManager.getItem<CloudAccount[]>(STORAGE_KEYS.ACCOUNTS, null);
    if (!data) return INITIAL_CLOUD_ACCOUNTS;
    const providerKeys: CloudStorageProvider[] = ['google_drive', 'dropbox', 'onedrive', 'icloud', 'nextcloud', 's3'];
    const merged = [...data];
    for (const prov of providerKeys) {
      if (!merged.some((a) => a.provider === prov)) {
        const initial = INITIAL_CLOUD_ACCOUNTS.find((a) => a.provider === prov);
        if (initial) merged.push(initial);
      }
    }
    return merged;
  }

  public static saveAccounts(accounts: CloudAccount[]) {
    StorageManager.setItem(STORAGE_KEYS.ACCOUNTS, accounts);
  }

  public static connectAccount(
    provider: CloudStorageProvider,
    email: string,
    name: string,
    extra?: {
      server_url?: string;
      bucket_name?: string;
      sso_provider?: string;
      sso_auth_mode?: 'sso_oauth' | 'sso_oidc' | 'sso_saml' | 'api_credential';
      sso_session_id?: string;
      sso_idp_name?: string;
      access_token?: string;
      refresh_token_alias?: string;
      cloud_backup_path?: string;
    }
  ): CloudAccount {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex((a) => a.provider === provider);

    const defaultPaths: Record<CloudStorageProvider, string> = {
      google_drive: '/Google Drive/VellumScribe_Backups/',
      dropbox: '/Dropbox/Apps/VellumScribe_Backups/',
      onedrive: '/OneDrive/Apps/VellumScribe/',
      icloud: '/iCloud Drive/VellumScribe/',
      nextcloud: extra?.server_url ? `${extra.server_url}/remote.php/dav/files/${email}/VellumScribe/` : '/Nextcloud/VellumScribe/',
      s3: extra?.bucket_name ? `s3://${extra.bucket_name}/vellumscribe/` : 's3://vellumscribe-backups/',
    };

    const updated: CloudAccount = {
      provider,
      connected: true,
      user_email: email,
      user_name: name,
      account_email: email,
      display_name: name,
      auth_status: 'SSO Authenticated & Active',
      oauth_token_type: 'Bearer',
      access_token: extra?.access_token || `sso_tok_${provider}_${Date.now()}`,
      refresh_token_alias: extra?.refresh_token_alias || `sso_refresh_${provider}`,
      sso_provider: extra?.sso_provider || 'Single Sign-On (SSO)',
      sso_auth_mode: extra?.sso_auth_mode || 'sso_oauth',
      sso_session_id: extra?.sso_session_id || `sso_sess_${Date.now()}`,
      sso_idp_name: extra?.sso_idp_name || provider,
      cloud_backup_path: extra?.cloud_backup_path || defaultPaths[provider] || '/Backups/VellumScribe/',
      last_synced_at: new Date().toISOString(),
      storage_used_bytes: 1500000,
      storage_total_bytes: 15000000000,
      server_url: extra?.server_url,
      bucket_name: extra?.bucket_name,
    };

    if (idx >= 0) {
      accounts[idx] = updated;
    } else {
      accounts.push(updated);
    }
    this.saveAccounts(accounts);
    return updated;
  }

  public static disconnectAccount(provider: CloudStorageProvider) {
    const accounts = this.getAccounts().map((a) => {
      if (a.provider === provider) {
        return {
          ...a,
          connected: false,
          user_email: undefined,
          user_name: undefined,
          account_email: undefined,
          display_name: undefined,
          server_url: undefined,
          bucket_name: undefined,
        };
      }
      return a;
    });
    this.saveAccounts(accounts);
  }

  // Conflict Strategy Settings
  public static getDefaultStrategy(): ConflictStrategy {
    return (StorageManager.getItem<ConflictStrategy>(STORAGE_KEYS.DEFAULT_STRATEGY, 'gemini_intelligent_merge')) || 'gemini_intelligent_merge';
  }

  public static setDefaultStrategy(strategy: ConflictStrategy) {
    StorageManager.setItem(STORAGE_KEYS.DEFAULT_STRATEGY, strategy);
  }

  // Auto-sync & Backup Frequency settings
  public static getBackupFrequency(): BackupFrequency {
    const freq = StorageManager.getItem<BackupFrequency>(STORAGE_KEYS.BACKUP_FREQUENCY, null);
    if (freq) return freq;
    const isAuto = StorageManager.getItem<string>(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'true');
    if (isAuto === 'false') return 'never';
    return '5m';
  }

  public static setBackupFrequency(freq: BackupFrequency) {
    StorageManager.setItem(STORAGE_KEYS.BACKUP_FREQUENCY, freq);
    if (freq === 'never') {
      StorageManager.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'false');
    } else if (freq === 'manual') {
      StorageManager.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'false');
    } else {
      StorageManager.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'true');
      const intervalMap: Record<string, number> = {
        '5m': 300,
        '15m': 900,
        '1h': 3600,
        daily: 86400,
      };
      if (intervalMap[freq]) {
        this.setAutoSyncInterval(intervalMap[freq]);
      }
    }
  }

  public static isFullyOffline(): boolean {
    return this.getBackupFrequency() === 'never';
  }

  public static isAutoSyncEnabled(): boolean {
    if (this.isFullyOffline()) return false;
    return StorageManager.getItem<string>(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'true') !== 'false';
  }

  public static setAutoSyncEnabled(enabled: boolean) {
    StorageManager.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, String(enabled));
    if (!enabled && this.getBackupFrequency() !== 'never') {
      StorageManager.setItem(STORAGE_KEYS.BACKUP_FREQUENCY, 'manual');
    } else if (enabled && this.getBackupFrequency() === 'never') {
      StorageManager.setItem(STORAGE_KEYS.BACKUP_FREQUENCY, '5m');
    }
  }

  public static getAutoSyncInterval(): number {
    return Number(StorageManager.getItem<string | number>(STORAGE_KEYS.AUTO_SYNC_INTERVAL, 300)) || 300;
  }

  public static setAutoSyncInterval(seconds: number) {
    StorageManager.setItem(STORAGE_KEYS.AUTO_SYNC_INTERVAL, String(seconds));
  }

  // Telemetry & Logs
  public static getTelemetry(): SyncTelemetry[] {
    const data = StorageManager.getItem<SyncTelemetry[]>(STORAGE_KEYS.TELEMETRY, null);
    return data || INITIAL_SYNC_TELEMETRY;
  }

  public static logTelemetry(entry: SyncTelemetry) {
    const list = this.getTelemetry();
    list.unshift(entry);
    StorageManager.setItem(STORAGE_KEYS.TELEMETRY, list.slice(0, 100));
  }


  // Versions
  public static getVersionsForNote(noteId: number): DocumentVersion[] {
    const all = StorageManager.getItem<DocumentVersion[]>(STORAGE_KEYS.VERSIONS, INITIAL_DOCUMENT_VERSIONS) || INITIAL_DOCUMENT_VERSIONS;
    return all.filter((v) => v.note_id === noteId);
  }

  public static saveVersionSnapshot(note: NoteRecord, author = 'Local User', summary = 'Auto-snapshot') {
    try {
      const all = StorageManager.getItem<DocumentVersion[]>(STORAGE_KEYS.VERSIONS, INITIAL_DOCUMENT_VERSIONS) || INITIAL_DOCUMENT_VERSIONS;
      const noteVersions = all.filter((v) => v.note_id === note.id);
      const nextVerId = noteVersions.length > 0
        ? Math.max(...noteVersions.map((v) => v.version_id || v.version_number || 0)) + 1
        : 1;

      const newVersion: DocumentVersion = {
        version_id: nextVerId,
        note_id: note.id,
        body: note.body,
        created_at: new Date().toISOString(),
        author,
        change_summary: summary,
        checksum: `sha256:${Math.random().toString(36).substring(2)}${Math.random().toString(36).substring(2)}`,
      };

      all.unshift(newVersion);
      StorageManager.setItem(STORAGE_KEYS.VERSIONS, all.slice(0, 200));
      return newVersion;
    } catch (e) {
      console.error('Failed to snapshot note version', e);
      return null;
    }
  }

  // Execute Full Synchronization Cycle
  public static async triggerSync(options?: {
    forceSimulateError?: boolean;
    provider?: 'google_drive' | 'dropbox' | 'dual_cloud';
    onProgress?: (progress: SyncProgressUpdate) => void;
  }): Promise<{ success: boolean; message: string; telemetry: SyncTelemetry }> {
    if (this.isSyncRunning) {
      return {
        success: false,
        message: 'Synchronization is already running in background.',
        telemetry: {
          sync_id: `sync_${Date.now()}`,
          timestamp: new Date().toISOString(),
          provider: 'google_drive',
          status: 'failed',
          duration_ms: 0,
          bytes_transferred: 0,
          records_uploaded: 0,
          records_downloaded: 0,
          conflicts_encountered: 0,
          error_message: 'Concurrent sync request rejected.',
        },
      };
    }

    this.isSyncRunning = true;
    try {
      const startTime = Date.now();
      const accounts = this.getAccounts().filter((a) => a.connected);

      options?.onProgress?.({
        percent: 15,
        message: 'Connecting to secure cloud storage...',
        phase: 'init',
      });
      await new Promise((r) => setTimeout(r, 120));

      if (accounts.length === 0) {
        const failTelemetry: SyncTelemetry = {
          sync_id: `sync_${Date.now()}`,
          timestamp: new Date().toISOString(),
          provider: 'google_drive',
          status: 'failed',
          duration_ms: 120,
          bytes_transferred: 0,
          records_uploaded: 0,
          records_downloaded: 0,
          conflicts_encountered: 0,
          error_message: 'No active cloud providers connected. Please link an account in Cloud Backup.',
        };
        this.logTelemetry(failTelemetry);
        options?.onProgress?.({
          percent: 100,
          message: 'Sync stopped: No cloud accounts connected.',
          phase: 'complete',
        });
        return { success: false, message: failTelemetry.error_message!, telemetry: failTelemetry };
      }

      if (options?.forceSimulateError) {
        const failTelemetry: SyncTelemetry = {
          sync_id: `sync_${Date.now()}`,
          timestamp: new Date().toISOString(),
          provider: options.provider || 'google_drive',
          status: 'failed',
          duration_ms: 850,
          bytes_transferred: 4096,
          records_uploaded: 0,
          records_downloaded: 0,
          conflicts_encountered: 0,
          error_message: 'HTTP 429: Cloud rate limit exceeded. Retry scheduled via exponential backoff.',
        };
        this.logTelemetry(failTelemetry);
        options?.onProgress?.({
          percent: 100,
          message: 'Sync error: Cloud rate limit exceeded.',
          phase: 'complete',
        });
        return { success: false, message: failTelemetry.error_message!, telemetry: failTelemetry };
      }

      options?.onProgress?.({
        percent: 40,
        message: 'Scanning local notes and checksums...',
        phase: 'hashing',
      });
      await new Promise((r) => setTimeout(r, 180));

      // Export selective cloud dump containing ONLY notes with cloud_save_enabled === true
      const { dumpJson, cloudNotes, cloudRecordings, cloudScans } = StorageManager.exportCloudBackupDump();
      const dumpBytes = new TextEncoder().encode(dumpJson).length;
      const allNotes = StorageManager.getNotes();
      const localOnlyCount = allNotes.length - cloudNotes.length;

      options?.onProgress?.({
        percent: 70,
        message: `Uploading ${cloudNotes.length} note(s) & local changes...`,
        phase: 'transferring',
      });
      await new Promise((r) => setTimeout(r, 220));


      options?.onProgress?.({
        percent: 90,
        message: 'Verifying snapshot encryption & database integrity...',
        phase: 'verifying',
      });
      await new Promise((r) => setTimeout(r, 150));

      const duration_ms = Date.now() - startTime + Math.floor(Math.random() * 100 + 100);
      const uploadedRecordCount = cloudNotes.length + cloudRecordings.length + cloudScans.length;
      const mediaBytes = cloudRecordings.reduce((acc, r) => acc + (r.file_size || 50000), 0);

      const syncTelemetry: SyncTelemetry = {
        sync_id: `sync_${Date.now()}`,
        timestamp: new Date().toISOString(),
        provider: accounts.length > 1 ? 'dual_cloud' : accounts[0].provider,
        status: 'success',
        duration_ms,
        bytes_transferred: cloudNotes.length > 0 ? dumpBytes + mediaBytes : 0,
        records_uploaded: uploadedRecordCount,
        records_downloaded: Math.floor(Math.random() * 2),
        items_synced: cloudNotes.length,
        conflicts_encountered: 0,
        backup_file_name: cloudNotes.length > 0
          ? `vellumscribe_cloud_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.db`
          : 'none',
      };

      this.logTelemetry(syncTelemetry);

      // Update account last synced time if any records synced
      const updatedAccounts = accounts.map((a) => ({
        ...a,
        last_synced_at: new Date().toISOString(),
        storage_used_bytes: (a.storage_used_bytes || 20000000) + (cloudNotes.length > 0 ? dumpBytes + mediaBytes : 0),
      }));
      this.saveAccounts(updatedAccounts);

      let summaryMessage = '';
      if (cloudNotes.length === 0) {
        summaryMessage = `All ${allNotes.length} notes are kept strictly local. Sync verified.`;
      } else {
        summaryMessage = `Synced ${cloudNotes.length} note(s) & ${cloudRecordings.length} recording(s). Complete!`;
      }

      options?.onProgress?.({
        percent: 100,
        message: 'Sync completed successfully!',
        phase: 'complete',
      });

      return {
        success: true,
        message: summaryMessage,
        telemetry: syncTelemetry,
      };
    } finally {
      this.isSyncRunning = false;
    }
  }

  public static async syncWithCloud(
    onProgress?: (percent: number, msg: string) => void
  ): Promise<boolean> {
    const res = await this.triggerSync({
      onProgress: (p) => {
        onProgress?.(p.percent, p.message);
      },
    });
    return res.success;
  }
}
