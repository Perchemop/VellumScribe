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
import { CloudProviderService, BACKUP_FILE_NAME } from './cloudProviders';
import { toHex } from './cryptoUtils';

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

  /**
   * Record a connected cloud account. Every value here is expected to come
   * from a real, verified source (e.g. CloudProviderService.verifyCredential)
   * - this method does not invent a token, session id, or storage quota when
   * one isn't supplied; those fields are simply left unset instead.
   */
  public static connectAccount(
    provider: CloudStorageProvider,
    email: string,
    name: string,
    extra: {
      server_url?: string;
      bucket_name?: string;
      access_token?: string;
      cloud_backup_path?: string;
      auth_status?: string;
      storage_used_bytes?: number;
      storage_total_bytes?: number;
    }
  ): CloudAccount {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex((a) => a.provider === provider);

    const defaultPaths: Record<CloudStorageProvider, string> = {
      google_drive: 'VellumScribe',
      dropbox: 'Apps/VellumScribe',
      onedrive: 'VellumScribe',
      icloud: 'VellumScribe',
      nextcloud: 'VellumScribe',
      s3: extra.bucket_name ? `${extra.bucket_name}/vellumscribe` : 'vellumscribe',
    };

    const updated: CloudAccount = {
      provider,
      connected: true,
      user_email: email,
      user_name: name,
      account_email: email,
      display_name: name,
      auth_status: extra.auth_status || (extra.access_token ? 'Verified' : 'Unverified'),
      oauth_token_type: provider === 'nextcloud' ? 'AppPassword' : 'Bearer',
      access_token: extra.access_token,
      cloud_backup_path: extra.cloud_backup_path || defaultPaths[provider],
      last_synced_at: undefined,
      storage_used_bytes: extra.storage_used_bytes,
      storage_total_bytes: extra.storage_total_bytes,
      server_url: extra.server_url,
      bucket_name: extra.bucket_name,
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
          access_token: undefined,
          auth_status: undefined,
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

  /**
   * Save a local version snapshot with a real SHA-256 checksum of the body
   * content (previous versions of this function used Math.random() to
   * generate a string that merely looked like a checksum).
   */
  public static async saveVersionSnapshot(
    note: NoteRecord,
    author = 'Local User',
    summary = 'Auto-snapshot'
  ): Promise<DocumentVersion | null> {
    try {
      const all = StorageManager.getItem<DocumentVersion[]>(STORAGE_KEYS.VERSIONS, INITIAL_DOCUMENT_VERSIONS) || INITIAL_DOCUMENT_VERSIONS;
      const noteVersions = all.filter((v) => v.note_id === note.id);
      const nextVerId = noteVersions.length > 0
        ? Math.max(...noteVersions.map((v) => v.version_id || v.version_number || 0)) + 1
        : 1;

      let checksum: string | undefined;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(note.body || ''));
          checksum = `sha256:${toHex(digest)}`;
        } catch (e) {
          console.warn('Could not compute a real checksum for this version snapshot', e);
        }
      }

      const newVersion: DocumentVersion = {
        version_id: nextVerId,
        note_id: note.id,
        body: note.body,
        created_at: new Date().toISOString(),
        author,
        change_summary: summary,
        checksum,
      };

      all.unshift(newVersion);
      StorageManager.setItem(STORAGE_KEYS.VERSIONS, all.slice(0, 200));
      return newVersion;
    } catch (e) {
      console.error('Failed to snapshot note version', e);
      return null;
    }
  }

  /**
   * Run one backup cycle: export the notes flagged for cloud save and
   * attempt a real upload to every connected, configured provider. The
   * returned success/message reflect what actually happened - if a
   * provider's upload fails or isn't implemented, that is reported as a
   * failure for that provider rather than folded into a generic "success".
   */
  public static async triggerSync(options?: {
    onProgress?: (progress: SyncProgressUpdate) => void;
  }): Promise<{ success: boolean; message: string; telemetry: SyncTelemetry }> {
    if (this.isSyncRunning) {
      const busyTelemetry: SyncTelemetry = {
        sync_id: `sync_${Date.now()}`,
        timestamp: new Date().toISOString(),
        provider: 'google_drive',
        status: 'failed',
        duration_ms: 0,
        bytes_transferred: 0,
        records_uploaded: 0,
        records_downloaded: 0,
        conflicts_encountered: 0,
        error_message: 'A sync is already running.',
      };
      return { success: false, message: 'A sync is already running.', telemetry: busyTelemetry };
    }

    this.isSyncRunning = true;
    const startTime = Date.now();
    try {
      const accounts = this.getAccounts().filter((a) => a.connected);

      options?.onProgress?.({ percent: 10, message: 'Checking connected cloud accounts...', phase: 'init' });

      if (accounts.length === 0) {
        const failTelemetry: SyncTelemetry = {
          sync_id: `sync_${Date.now()}`,
          timestamp: new Date().toISOString(),
          provider: 'google_drive',
          status: 'failed',
          duration_ms: Date.now() - startTime,
          bytes_transferred: 0,
          records_uploaded: 0,
          records_downloaded: 0,
          conflicts_encountered: 0,
          error_message: 'No cloud accounts connected. Notes remain local-only.',
        };
        this.logTelemetry(failTelemetry);
        options?.onProgress?.({ percent: 100, message: 'Sync stopped: no cloud accounts connected.', phase: 'complete' });
        return { success: false, message: failTelemetry.error_message!, telemetry: failTelemetry };
      }

      options?.onProgress?.({ percent: 30, message: 'Preparing local backup snapshot...', phase: 'hashing' });

      // Export selective cloud dump containing ONLY notes with cloud_save_enabled === true
      const { dumpJson, cloudNotes, cloudRecordings, cloudScans } = StorageManager.exportCloudBackupDump();
      const dumpBytes = new TextEncoder().encode(dumpJson).length;
      const allNotes = StorageManager.getNotes();
      const localOnlyCount = allNotes.length - cloudNotes.length;

      if (cloudNotes.length === 0) {
        const telemetry: SyncTelemetry = {
          sync_id: `sync_${Date.now()}`,
          timestamp: new Date().toISOString(),
          provider: accounts.length > 1 ? 'multi_cloud' : accounts[0].provider,
          status: 'success',
          duration_ms: Date.now() - startTime,
          bytes_transferred: 0,
          records_uploaded: 0,
          records_downloaded: 0,
          conflicts_encountered: 0,
          backup_file_name: 'none',
        };
        this.logTelemetry(telemetry);
        options?.onProgress?.({ percent: 100, message: 'Nothing to sync - all notes are kept local-only.', phase: 'complete' });
        return {
          success: true,
          message: `All ${allNotes.length} note(s) are kept strictly local. Nothing was uploaded.`,
          telemetry,
        };
      }

      options?.onProgress?.({
        percent: 60,
        message: `Uploading ${cloudNotes.length} note(s) to ${accounts.length} provider(s)...`,
        phase: 'transferring',
      });

      // Attempt a real upload to every connected account.
      const uploadResults = await Promise.all(
        accounts.map(async (account) => ({
          account,
          result: await CloudProviderService.uploadBackup(account, BACKUP_FILE_NAME, dumpJson),
        }))
      );

      const succeeded = uploadResults.filter((r) => r.result.success);
      const failed = uploadResults.filter((r) => !r.result.success);

      options?.onProgress?.({ percent: 90, message: 'Recording sync results...', phase: 'verifying' });

      const mediaBytes = cloudRecordings.reduce((acc, r) => acc + (r.file_size || 0), 0);
      const uploadedRecordCount = cloudNotes.length + cloudRecordings.length + cloudScans.length;
      const overallSuccess = succeeded.length > 0;

      const syncTelemetry: SyncTelemetry = {
        sync_id: `sync_${Date.now()}`,
        timestamp: new Date().toISOString(),
        provider: accounts.length > 1 ? 'multi_cloud' : accounts[0].provider,
        status: overallSuccess ? 'success' : 'failed',
        duration_ms: Date.now() - startTime,
        bytes_transferred: succeeded.length > 0 ? dumpBytes + mediaBytes : 0,
        records_uploaded: overallSuccess ? uploadedRecordCount : 0,
        records_downloaded: 0,
        items_synced: overallSuccess ? cloudNotes.length : 0,
        conflicts_encountered: 0,
        backup_file_name: succeeded.length > 0 ? BACKUP_FILE_NAME : 'none',
        error_message: failed.length > 0 ? failed.map((f) => `${f.account.provider}: ${f.result.error}`).join(' | ') : undefined,
      };
      this.logTelemetry(syncTelemetry);

      // Only advance last_synced_at / storage usage for accounts that actually succeeded.
      const updatedAccounts = this.getAccounts().map((a) => {
        const outcome = uploadResults.find((r) => r.account.provider === a.provider);
        if (!outcome || !outcome.result.success) return a;
        return {
          ...a,
          last_synced_at: new Date().toISOString(),
          storage_used_bytes: (a.storage_used_bytes || 0) + dumpBytes + mediaBytes,
        };
      });
      this.saveAccounts(updatedAccounts);

      let summaryMessage: string;
      if (succeeded.length === accounts.length) {
        summaryMessage = `Synced ${cloudNotes.length} note(s) & ${cloudRecordings.length} recording(s) to ${succeeded
          .map((s) => s.account.provider)
          .join(', ')}. ${localOnlyCount} note(s) kept local-only.`;
      } else if (succeeded.length > 0) {
        summaryMessage = `Synced to ${succeeded.map((s) => s.account.provider).join(', ')}. Failed for ${failed
          .map((f) => `${f.account.provider} (${f.result.error})`)
          .join(', ')}.`;
      } else {
        summaryMessage = `Sync failed for all connected accounts: ${failed
          .map((f) => `${f.account.provider} - ${f.result.error}`)
          .join('; ')}`;
      }

      options?.onProgress?.({
        percent: 100,
        message: overallSuccess ? 'Sync finished.' : 'Sync failed.',
        phase: 'complete',
      });

      return { success: overallSuccess, message: summaryMessage, telemetry: syncTelemetry };
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
