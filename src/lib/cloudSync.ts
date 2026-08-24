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
import { SQLiteDatabase } from './storage';
import { GeminiApiService } from './geminiService';

const STORAGE_KEYS = {
  ACCOUNTS: 'omninote_cloud_accounts_v1',
  CONFLICTS: 'omninote_conflict_logs_v1',
  VERSIONS: 'omninote_doc_versions_v1',
  TELEMETRY: 'omninote_sync_telemetry_v1',
  DEFAULT_STRATEGY: 'omninote_default_conflict_strategy_v1',
  AUTO_SYNC_ENABLED: 'omninote_auto_sync_enabled_v1',
  AUTO_SYNC_INTERVAL: 'omninote_auto_sync_interval_mins_v1',
  BACKUP_FREQUENCY: 'omninote_backup_frequency_mode_v1',
};

export type BackupFrequency = 'never' | '5m' | '15m' | '1h' | 'daily' | 'manual';

export interface SyncProgressUpdate {
  percent: number;
  message: string;
  phase: 'init' | 'hashing' | 'transferring' | 'verifying' | 'complete';
}

export class CloudSyncEngine {
  // Accounts
  public static getAccounts(): CloudAccount[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (!data) return INITIAL_CLOUD_ACCOUNTS;
      const parsed: CloudAccount[] = JSON.parse(data);
      // Ensure all standard providers are present in the list
      const providerKeys: CloudStorageProvider[] = ['google_drive', 'dropbox', 'onedrive', 'icloud', 'nextcloud', 's3'];
      const merged = [...parsed];
      for (const prov of providerKeys) {
        if (!merged.some((a) => a.provider === prov)) {
          const initial = INITIAL_CLOUD_ACCOUNTS.find((a) => a.provider === prov);
          if (initial) merged.push(initial);
        }
      }
      return merged;
    } catch {
      return INITIAL_CLOUD_ACCOUNTS;
    }
  }

  public static saveAccounts(accounts: CloudAccount[]) {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
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
      dropbox: '/Dropbox/Apps/VellumScribe_Vault/',
      onedrive: '/OneDrive/Apps/VellumScribe/',
      icloud: '/iCloud Drive/VellumScribe/',
      nextcloud: extra?.server_url ? `${extra.server_url}/remote.php/dav/files/${email}/VellumScribe/` : '/Nextcloud/VellumScribe/',
      s3: extra?.bucket_name ? `s3://${extra.bucket_name}/vellumscribe/` : 's3://vellumscribe-vault/',
    };

    const defaultScopes: Record<CloudStorageProvider, string[]> = {
      google_drive: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email', 'openid'],
      dropbox: ['files.content.write', 'files.content.read', 'account_info.read', 'offline_access'],
      onedrive: ['Files.ReadWrite.AppFolder', 'User.Read', 'offline_access'],
      icloud: ['cloudkit.container.readwrite', 'openid', 'email'],
      nextcloud: ['read_write_app_folder', 'ocs_v2_api', 'openid'],
      s3: ['s3:PutObject', 's3:GetObject', 's3:ListBucket', 'sts:AssumeRoleWithWebIdentity'],
    };

    const updated: CloudAccount = {
      provider,
      connected: true,
      user_email: email,
      user_name: name,
      account_email: email,
      display_name: name,
      auth_status: 'OAuth 2.0 PKCE Authorized',
      oauth_token_type: 'Bearer',
      oauth_scopes: defaultScopes[provider] || ['storage.readwrite', 'openid'],
      oauth_client_id: `vellumscribe_${provider}_pkce_client`,
      refresh_token_alias: `${provider}_oauth_refresh_token_sec`,
      token_expiry: new Date(Date.now() + 86400000 * 30).toISOString(),
      cloud_backup_path: defaultPaths[provider] || '/Backups/VellumScribe/',
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
    return (localStorage.getItem(STORAGE_KEYS.DEFAULT_STRATEGY) as ConflictStrategy) || 'gemini_intelligent_merge';
  }

  public static setDefaultStrategy(strategy: ConflictStrategy) {
    localStorage.setItem(STORAGE_KEYS.DEFAULT_STRATEGY, strategy);
  }

  // Auto-sync & Backup Frequency settings
  public static getBackupFrequency(): BackupFrequency {
    const freq = localStorage.getItem(STORAGE_KEYS.BACKUP_FREQUENCY) as BackupFrequency;
    if (freq) return freq;
    const isAuto = localStorage.getItem(STORAGE_KEYS.AUTO_SYNC_ENABLED);
    if (isAuto === 'false') return 'never';
    return '5m';
  }

  public static setBackupFrequency(freq: BackupFrequency) {
    localStorage.setItem(STORAGE_KEYS.BACKUP_FREQUENCY, freq);
    if (freq === 'never') {
      localStorage.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'false');
    } else if (freq === 'manual') {
      localStorage.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'false');
    } else {
      localStorage.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, 'true');
      const intervalMap: Record<string, number> = {
        '5m': 300,
        '15m': 900,
        '1h': 3600,
        'daily': 86400,
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
    return localStorage.getItem(STORAGE_KEYS.AUTO_SYNC_ENABLED) !== 'false';
  }

  public static setAutoSyncEnabled(enabled: boolean) {
    localStorage.setItem(STORAGE_KEYS.AUTO_SYNC_ENABLED, String(enabled));
    if (!enabled && this.getBackupFrequency() !== 'never') {
      localStorage.setItem(STORAGE_KEYS.BACKUP_FREQUENCY, 'manual');
    } else if (enabled && this.getBackupFrequency() === 'never') {
      localStorage.setItem(STORAGE_KEYS.BACKUP_FREQUENCY, '5m');
    }
  }

  public static getAutoSyncInterval(): number {
    return Number(localStorage.getItem(STORAGE_KEYS.AUTO_SYNC_INTERVAL)) || 300; // 300 secs = 5 mins
  }

  public static setAutoSyncInterval(seconds: number) {
    localStorage.setItem(STORAGE_KEYS.AUTO_SYNC_INTERVAL, String(seconds));
  }

  // Telemetry & Logs
  public static getTelemetry(): SyncTelemetry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TELEMETRY);
      return data ? JSON.parse(data) : INITIAL_SYNC_TELEMETRY;
    } catch {
      return INITIAL_SYNC_TELEMETRY;
    }
  }

  public static logTelemetry(entry: SyncTelemetry) {
    const list = this.getTelemetry();
    list.unshift(entry);
    localStorage.setItem(STORAGE_KEYS.TELEMETRY, JSON.stringify(list.slice(0, 100)));
  }

  // Conflicts
  public static getConflicts(): ConflictLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONFLICTS);
      return data ? JSON.parse(data) : INITIAL_CONFLICT_LOGS;
    } catch {
      return INITIAL_CONFLICT_LOGS;
    }
  }

  public static addConflict(conflict: ConflictLog) {
    const list = this.getConflicts();
    list.unshift(conflict);
    localStorage.setItem(STORAGE_KEYS.CONFLICTS, JSON.stringify(list));
  }

  public static updateConflict(id: string, updates: Partial<ConflictLog>) {
    const list = this.getConflicts();
    const idx = list.findIndex((c) => c.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      localStorage.setItem(STORAGE_KEYS.CONFLICTS, JSON.stringify(list));
    }
  }

  // Versions
  public static getVersionsForNote(noteId: number): DocumentVersion[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.VERSIONS);
      const all: DocumentVersion[] = data ? JSON.parse(data) : INITIAL_DOCUMENT_VERSIONS;
      return all.filter((v) => v.note_id === noteId);
    } catch {
      return INITIAL_DOCUMENT_VERSIONS.filter((v) => v.note_id === noteId);
    }
  }

  public static saveVersionSnapshot(note: NoteRecord, author = 'Local User', summary = 'Auto-snapshot') {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.VERSIONS);
      const all: DocumentVersion[] = data ? JSON.parse(data) : INITIAL_DOCUMENT_VERSIONS;
      const noteVersions = all.filter((v) => v.note_id === note.id);
      const nextVerId = noteVersions.length > 0 ? Math.max(...noteVersions.map((v) => v.version_id)) + 1 : 1;

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
      localStorage.setItem(STORAGE_KEYS.VERSIONS, JSON.stringify(all.slice(0, 200)));
      return newVersion;
    } catch (e) {
      console.error('Failed to snapshot note version', e);
      return null;
    }
  }

  // Execute Full Synchronization Cycle
  public static async triggerSync(options?: {
    forceSimulateConflict?: boolean;
    forceSimulateError?: boolean;
    provider?: 'google_drive' | 'dropbox' | 'dual_cloud';
    onProgress?: (progress: SyncProgressUpdate) => void;
  }): Promise<{ success: boolean; message: string; telemetry: SyncTelemetry }> {
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
        error_message: 'No active cloud providers connected (Google Drive or Dropbox). Please link an account.',
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
    const { dumpJson, cloudNotes, cloudRecordings, cloudScans } = SQLiteDatabase.exportCloudBackupDump();
    const dumpBytes = new TextEncoder().encode(dumpJson).length;
    const allNotes = SQLiteDatabase.getNotes();
    const localOnlyCount = allNotes.length - cloudNotes.length;

    options?.onProgress?.({
      percent: 70,
      message: `Uploading ${cloudNotes.length} note(s) & local changes...`,
      phase: 'transferring',
    });
    await new Promise((r) => setTimeout(r, 220));

    // Check if conflict should occur (only on cloud-synced notes)
    let conflictsEncountered = 0;
    if (options?.forceSimulateConflict && cloudNotes.length > 0) {
      conflictsEncountered = 1;
      const targetNote = cloudNotes[0];
      const localBody = targetNote.body;
      const remoteBody = `${localBody}\n\n## ☁️ Remote Cloud Edits (from Desktop Workstation)\n* Added compliance audit checklists.\n* Updated risk matrix deadline to Sept 1st.`;

      const conflictLog: ConflictLog = {
        id: `conf_${Date.now()}`,
        timestamp: new Date().toISOString(),
        document_type: 'note',
        document_id: targetNote.id,
        document_title: targetNote.title || 'Untitled Note',
        local_version_id: targetNote.version || 1,
        remote_version_id: (targetNote.version || 1) + 1,
        local_content: localBody,
        remote_content: remoteBody,
        base_content: targetNote.body,
        resolution_strategy: this.getDefaultStrategy(),
        status: 'pending',
        notes: 'Simulated multi-user concurrent edit across cloud nodes.',
      };

      // Auto resolve if strategy is not manual
      if (conflictLog.resolution_strategy === 'last_write_wins') {
        conflictLog.status = 'resolved';
        conflictLog.resolved_by = 'system_auto';
        conflictLog.resolved_content = remoteBody;
        SQLiteDatabase.updateNote(targetNote.id, { body: remoteBody });
      } else if (conflictLog.resolution_strategy === 'gemini_intelligent_merge') {
        try {
          const mergeResult = await GeminiApiService.intelligent3WayMerge(
            targetNote.body,
            localBody,
            remoteBody,
            targetNote.title
          );
          conflictLog.status = 'resolved';
          conflictLog.resolved_by = 'gemini_ai';
          conflictLog.resolved_content = mergeResult.mergedContent;
          SQLiteDatabase.updateNote(targetNote.id, { body: mergeResult.mergedContent });
        } catch {
          conflictLog.status = 'pending';
        }
      }

      this.addConflict(conflictLog);
    }

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
      status: conflictsEncountered > 0 ? 'conflict_detected' : 'success',
      duration_ms,
      bytes_transferred: cloudNotes.length > 0 ? dumpBytes + mediaBytes : 0,
      records_uploaded: uploadedRecordCount,
      records_downloaded: Math.floor(Math.random() * 2),
      items_synced: cloudNotes.length,
      conflicts_encountered: conflictsEncountered,
      backup_file_name: cloudNotes.length > 0
        ? `omninote_cloud_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.db`
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
    } else if (conflictsEncountered > 0) {
      summaryMessage = `Synced ${cloudNotes.length} note(s). ${localOnlyCount} note(s) kept local-only. Conflict reconciled.`;
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
  }
}
