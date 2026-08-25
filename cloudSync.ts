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
import { CloudProviderService } from './cloudProviders';

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
  private static async sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
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
    extra?: { server_url?: string; bucket_name?: string }
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
      connected: false,
      user_email: email,
      user_name: name,
      account_email: email,
      display_name: name,
      auth_status: 'Configured — authentication required',
      oauth_token_type: 'Bearer',
      cloud_backup_path: defaultPaths[provider] || '/Backups/VellumScribe/',
      last_synced_at: undefined,
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

  // Conflicts
  public static getConflicts(): ConflictLog[] {
    const data = StorageManager.getItem<ConflictLog[]>(STORAGE_KEYS.CONFLICTS, null);
    return data || INITIAL_CONFLICT_LOGS;
  }

  public static addConflict(conflict: ConflictLog) {
    const list = this.getConflicts();
    list.unshift(conflict);
    StorageManager.setItem(STORAGE_KEYS.CONFLICTS, list);
  }

  public static updateConflict(id: string, updates: Partial<ConflictLog>) {
    const list = this.getConflicts();
    const idx = list.findIndex((c) => c.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      StorageManager.setItem(STORAGE_KEYS.CONFLICTS, list);
    }
  }

  public static resolveConflict(conflictId: string, winner: 'local' | 'cloud') {
    const list = this.getConflicts();
    const conflict = list.find((c) => c.id === conflictId);
    if (conflict) {
      const resolvedContent = winner === 'local' ? conflict.local_content : conflict.remote_content;
      this.updateConflict(conflictId, {
        status: 'resolved',
        resolved_by: 'user_manual',
        resolved_content: resolvedContent,
      });
      if (winner === 'cloud') {
        StorageManager.updateNote(conflict.document_id, { body: resolvedContent });
      }
    }
  }

  // Versions
  public static getVersionsForNote(noteId: number): DocumentVersion[] {
    const all = StorageManager.getItem<DocumentVersion[]>(STORAGE_KEYS.VERSIONS, INITIAL_DOCUMENT_VERSIONS) || INITIAL_DOCUMENT_VERSIONS;
    return all.filter((v) => v.note_id === noteId);
  }

  public static async saveVersionSnapshot(note: NoteRecord, author = 'Local User', summary = 'Auto-snapshot') {
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
        checksum: `sha256:${await this.sha256(JSON.stringify({ id: note.id, title: note.title || '', body: note.body || '', updated_at: note.updated_at || '' }))}`,
      };

      all.unshift(newVersion);
      StorageManager.setItem(STORAGE_KEYS.VERSIONS, all.slice(0, 200));
      return newVersion;
    } catch (e) {
      console.error('Failed to snapshot note version', e);
      return null;
    }
  }

  // Execute a real synchronization cycle against authenticated cloud providers.
  // Google Drive, Dropbox and OneDrive use OAuth2 + PKCE. Nextcloud is supported
  // through its WebDAV app-password flow. iCloud and generic S3 are deliberately
  // not marked as connected until a provider-specific adapter is configured.
  public static async triggerSync(options?: {
    forceSimulateConflict?: boolean;
    forceSimulateError?: boolean;
    provider?: 'google_drive' | 'dropbox' | 'dual_cloud';
    onProgress?: (progress: SyncProgressUpdate) => void;
  }): Promise<{ success: boolean; message: string; telemetry: SyncTelemetry }> {
    if (this.isSyncRunning) {
      const telemetry: SyncTelemetry = {
        sync_id: `sync_${Date.now()}`,
        timestamp: new Date().toISOString(),
        provider: options?.provider === 'dropbox' ? 'dropbox' : 'google_drive',
        status: 'failed', duration_ms: 0, bytes_transferred: 0,
        records_uploaded: 0, records_downloaded: 0, conflicts_encountered: 0,
        error_message: 'Synchronization is already running.'
      };
      return { success: false, message: telemetry.error_message!, telemetry };
    }

    this.isSyncRunning = true;
    const started = Date.now();
    const providerName = options?.provider === 'dropbox' ? 'dropbox' : 'google_drive';
    try {
      options?.onProgress?.({ percent: 10, message: 'Checking authenticated cloud accounts…', phase: 'init' });
      const accounts = this.getAccounts().filter(a => a.connected && ['google_drive','dropbox','onedrive','nextcloud'].includes(a.provider));
      if (!accounts.length) {
        const message = 'No authenticated cloud account is available. Connect Google Drive, Dropbox or OneDrive first.';
        const telemetry: SyncTelemetry = { sync_id:`sync_${Date.now()}`, timestamp:new Date().toISOString(), provider:providerName, status:'failed', duration_ms:Date.now()-started, bytes_transferred:0, records_uploaded:0, records_downloaded:0, conflicts_encountered:0, error_message:message };
        this.logTelemetry(telemetry);
        options?.onProgress?.({ percent:100, message, phase:'complete' });
        return { success:false, message, telemetry };
      }

      options?.onProgress?.({ percent: 30, message: 'Preparing cloud-enabled notes and attachments…', phase: 'hashing' });
      const { dumpJson, cloudNotes, cloudRecordings, cloudScans } = StorageManager.exportCloudBackupDump();
      const bytes = new TextEncoder().encode(dumpJson);
      const fileName = `vellumscribe_backup.json`;
      let totalTransferred = 0;
      let uploaded = 0;
      let downloaded = 0;
      const usedProviders: string[] = [];

      for (const account of accounts) {
        if (options?.provider && options.provider !== 'dual_cloud' && account.provider !== options.provider) continue;
        if (!['google_drive','dropbox','onedrive','nextcloud'].includes(account.provider)) continue;
        options?.onProgress?.({ percent: 50, message: `Uploading backup to ${account.provider.replace('_',' ')}…`, phase:'transferring' });
        const result = account.provider === 'nextcloud'
          ? await CloudProviderService.uploadNextcloudStored(fileName, bytes)
          : await CloudProviderService.uploadBackup(account.provider as any, fileName, bytes);
        totalTransferred += result.bytes;
        uploaded += cloudNotes.length + cloudRecordings.length + cloudScans.length;
        usedProviders.push(account.provider);

        // Read-after-write verification. A successful HTTP upload alone does not
        // count as a successful backup until the provider returns the stored file.
        options?.onProgress?.({ percent: 75, message: `Verifying ${account.provider.replace('_',' ')} backup…`, phase:'verifying' });
        const remote = account.provider === 'nextcloud'
          ? await CloudProviderService.downloadNextcloudStored(fileName)
          : await CloudProviderService.downloadBackup(account.provider as any, fileName);
        if (!remote || remote.byteLength !== bytes.byteLength) {
          throw new Error(`${account.provider} verification failed: uploaded backup could not be read back with the expected size.`);
        }

        const idx = this.getAccounts().findIndex(a => a.provider === account.provider);
        const next = this.getAccounts();
        if (idx >= 0) {
          next[idx] = { ...next[idx], last_synced_at: new Date().toISOString(), auth_status: 'Authenticated · Sync verified' };
          this.saveAccounts(next);
        }
      }

      const telemetry: SyncTelemetry = {
        sync_id:`sync_${Date.now()}`,
        timestamp:new Date().toISOString(),
        provider:usedProviders.length > 1 ? 'dual_cloud' : (usedProviders[0] as any || providerName),
        status:'success',
        duration_ms:Date.now()-started,
        bytes_transferred:totalTransferred,
        records_uploaded:uploaded,
        records_downloaded:downloaded,
        items_synced:cloudNotes.length,
        conflicts_encountered:0,
        backup_file_name:fileName,
      };
      this.logTelemetry(telemetry);
      options?.onProgress?.({ percent:100, message:`Cloud backup verified on ${usedProviders.length} provider(s).`, phase:'complete' });
      return { success:true, message:`Synced ${cloudNotes.length} note(s) and verified the remote backup.`, telemetry };
    } catch (error: any) {
      const message = error?.message || 'Cloud synchronization failed.';
      const telemetry: SyncTelemetry = { sync_id:`sync_${Date.now()}`, timestamp:new Date().toISOString(), provider:providerName, status:'failed', duration_ms:Date.now()-started, bytes_transferred:0, records_uploaded:0, records_downloaded:0, conflicts_encountered:0, error_message:message };
      this.logTelemetry(telemetry);
      options?.onProgress?.({ percent:100, message:`Sync failed: ${message}`, phase:'complete' });
      return { success:false, message, telemetry };
    } finally {
      this.isSyncRunning = false;
    }
  }

  public static async beginProviderAuthentication(provider: CloudStorageProvider): Promise<void> {
    if (!['google_drive','dropbox','onedrive'].includes(provider)) {
      throw new Error(`${provider} requires a provider-specific credential flow and is not available for OAuth authentication yet.`);
    }
    await CloudProviderService.beginOAuth(provider as any);
  }

  public static async completeProviderAuthentication(provider: CloudStorageProvider, profile: { email?: string; name?: string }): Promise<CloudAccount> {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.provider === provider);
    const current = idx >= 0 ? accounts[idx] : undefined;
    const updated: CloudAccount = {
      ...(current || { provider, cloud_backup_path: 'vellumscribe_backup.json' }),
      connected: true,
      user_email: profile.email,
      account_email: profile.email,
      user_name: profile.name,
      display_name: profile.name,
      auth_status: 'Authenticated · Ready to sync',
      oauth_token_type: 'Bearer',
      cloud_backup_path: 'vellumscribe_backup.json',
      last_synced_at: current?.last_synced_at,
    };
    if (idx >= 0) accounts[idx] = updated; else accounts.push(updated);
    this.saveAccounts(accounts);
    return updated;
  }

  public static async revokeProvider(provider: CloudStorageProvider): Promise<void> {
    if (['google_drive','dropbox','onedrive'].includes(provider)) await CloudProviderService.revoke(provider as any);
    this.disconnectAccount(provider);
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
