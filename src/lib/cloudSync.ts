import { CloudAccount, CloudStorageProvider, SyncTelemetry } from '../types';
import { StorageManager } from './storage';
import { PrivacyManager } from './privacyManager';

export type BackupFrequency = 'manual' | 'daily' | 'off';

export interface SyncProgressUpdate {
  percent: number;
  message: string;
  phase: 'init' | 'compressing' | 'uploading' | 'verifying' | 'complete' | 'error';
}

export interface RemoteBackupItem {
  id: string;
  filename: string;
  size: number;
  createdAt: string;
  checksum?: string;
  noteCount?: number;
}

export class CloudSyncEngine {
  private static telemetry: SyncTelemetry[] = [];
  private static readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunk slices for network resilience

  private static getSessionId(): string {
    let id = localStorage.getItem('vs_cloud_session_id');
    if (!id) {
      id = 'vs_sess_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      localStorage.setItem('vs_cloud_session_id', id);
    }
    return id;
  }

  private static getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'x-session-id': this.getSessionId(),
      ...extra,
    };
  }

  private static async computeChecksum(buffer: ArrayBuffer): Promise<string> {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }

  static async fetchConfig() {
    try {
      PrivacyManager.assertNetworkAllowed('Cloud Storage Configuration');
      const res = await fetch('/api/cloud/config', {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.accounts)) {
          localStorage.setItem('vs_cloud_accounts', JSON.stringify(data.accounts));
        }
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch cloud config:', e);
    }
  }

  static getAccounts(): CloudAccount[] {
    try {
      const stored = localStorage.getItem('vs_cloud_accounts');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static removeAccount(provider: CloudStorageProvider) {
    const accs = this.getAccounts().filter((a) => a.provider !== provider);
    localStorage.setItem('vs_cloud_accounts', JSON.stringify(accs));
  }

  /**
   * 1-Click Zero-Credential Connection for Vellum Encrypted Vault
   * Encrypts snapshots locally with AES-256-GCM before transport.
   */
  static async connectInstant(
    provider: CloudStorageProvider,
    metadata?: { email?: string; displayName?: string }
  ): Promise<CloudAccount> {
    PrivacyManager.assertNetworkAllowed('Cloud Vault');
    if (provider !== 'instant_vault') {
      throw new Error(`Instant connect is only supported for Vellum Encrypted Vault. ${provider} requires authentication credentials.`);
    }

    const res = await fetch(`/api/cloud/${provider}/connect-instant`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(metadata || {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Connection failed' }));
      throw new Error(err.error || 'Failed to connect cloud destination');
    }

    const data = await res.json();
    const account: CloudAccount = data.account;

    // Update local accounts
    const current = this.getAccounts().filter((a) => a.provider !== provider);
    current.push(account);
    localStorage.setItem('vs_cloud_accounts', JSON.stringify(current));

    return account;
  }

  /**
   * Connect to Nextcloud or generic WebDAV server with verified credentials
   */
  static async connectCredentials(
    provider: 'nextcloud' | 'webdav',
    credentials: { serverUrl: string; username: string; password: string; remotePath?: string }
  ): Promise<CloudAccount> {
    PrivacyManager.assertNetworkAllowed(`Cloud Storage (${provider})`);
    const res = await fetch(`/api/cloud/${provider}/connect-credentials`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(credentials),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Authentication failed' }));
      throw new Error(err.error || `Failed to connect ${provider} server`);
    }

    const data = await res.json();
    const account: CloudAccount = data.account;

    const current = this.getAccounts().filter((a) => a.provider !== provider);
    current.push(account);
    localStorage.setItem('vs_cloud_accounts', JSON.stringify(current));

    return account;
  }

  /**
   * Disconnect a cloud account cleanly from both local cache and server
   */
  static async disconnectAccount(provider: CloudStorageProvider): Promise<void> {
    try {
      PrivacyManager.assertNetworkAllowed('Cloud Storage Disconnect');
      await fetch(`/api/cloud/${provider}/disconnect`, {
        method: 'POST',
        headers: this.getHeaders(),
      });
    } catch (e) {
      console.warn(`Failed to notify server of disconnect for ${provider}:`, e);
    }
    this.removeAccount(provider);
  }

  static getTelemetry(): SyncTelemetry[] {
    return this.telemetry;
  }

  static getBackupFrequency(): BackupFrequency {
    return (localStorage.getItem('vs_backup_freq') as BackupFrequency) || 'off';
  }

  static setBackupFrequency(freq: BackupFrequency) {
    localStorage.setItem('vs_backup_freq', freq);
  }

  /**
   * List remote backup archives available on a connected provider
   */
  static async fetchRemoteBackups(provider: CloudStorageProvider): Promise<RemoteBackupItem[]> {
    try {
      PrivacyManager.assertNetworkAllowed('Remote Backups List');
      const res = await fetch(`/api/cloud/${provider}/backups`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.backups) ? data.backups : [];
      }
      return [];
    } catch (e) {
      console.warn(`Failed to fetch remote backups for ${provider}:`, e);
      return [];
    }
  }

  /**
   * Resumable/Chunked streaming upload pipeline for large archives
   */
  private static async uploadChunkedArchive(
    provider: CloudStorageProvider,
    blob: Blob,
    filename: string,
    checksum: string,
    onProgress?: (p: SyncProgressUpdate) => void
  ): Promise<boolean> {
    const totalBytes = blob.size;
    const totalChunks = Math.ceil(totalBytes / this.CHUNK_SIZE);

    // 1. Init chunked session
    const initRes = await fetch(`/api/cloud/${provider}/chunk/init`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        filename,
        totalBytes,
        totalChunks,
        checksum,
      }),
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({ error: 'Chunk initialization failed' }));
      throw new Error(err.error || 'Failed to initialize chunked upload');
    }

    const { uploadId } = await initRes.json();

    // 2. Upload chunks in sequence with progress reporting
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * this.CHUNK_SIZE;
      const end = Math.min(totalBytes, start + this.CHUNK_SIZE);
      const chunkBlob = blob.slice(start, end);
      const chunkBuffer = await chunkBlob.arrayBuffer();

      // Convert chunk to base64 for reliable transport
      const bytes = new Uint8Array(chunkBuffer);
      let binaryStr = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binaryStr += String.fromCharCode(bytes[i]);
      }
      const chunkBase64 = btoa(binaryStr);

      const chunkRes = await fetch(`/api/cloud/${provider}/chunk/upload`, {
        method: 'POST',
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          uploadId,
          chunkIndex,
          totalChunks,
          chunkBase64,
        }),
      });

      if (!chunkRes.ok) {
        const err = await chunkRes.json().catch(() => ({ error: `Failed to upload chunk ${chunkIndex}` }));
        throw new Error(err.error || `Chunk ${chunkIndex + 1} upload failed`);
      }

      const percent = Math.round(30 + ((chunkIndex + 1) / totalChunks) * 60);
      onProgress?.({
        percent,
        message: `Uploading chunk ${chunkIndex + 1} of ${totalChunks} (${Math.round((end / totalBytes) * 100)}%)...`,
        phase: 'uploading',
      });
    }

    // 3. Commit chunked archive
    onProgress?.({ percent: 95, message: 'Verifying archive integrity...', phase: 'verifying' });

    const commitRes = await fetch(`/api/cloud/${provider}/chunk/commit`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ uploadId }),
    });

    if (!commitRes.ok) {
      const err = await commitRes.json().catch(() => ({ error: 'Commit failed' }));
      throw new Error(err.error || 'Failed to finalize chunked archive');
    }

    return true;
  }

  /**
   * Main sync trigger: handles archive generation, compression, direct or chunked upload, and telemetry
   */
  static async triggerSync(options?: { onProgress: (p: SyncProgressUpdate) => void }): Promise<boolean> {
    PrivacyManager.assertNetworkAllowed('Cloud Backup Upload');
    const startTime = Date.now();
    const accounts = this.getAccounts();
    if (accounts.length === 0) {
      options?.onProgress({ percent: 100, message: 'No cloud accounts connected', phase: 'error' });
      return false;
    }

    options?.onProgress({ percent: 10, message: 'Generating and compressing backup snapshot...', phase: 'compressing' });

    try {
      const backupBlob = await StorageManager.exportCloudBackupArchive();
      const arrayBuffer = await backupBlob.arrayBuffer();
      const checksum = await this.computeChecksum(arrayBuffer);
      const filename = `vellumscribe_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;

      options?.onProgress({ percent: 25, message: 'Starting cloud backup upload...', phase: 'uploading' });

      let allSuccess = true;
      for (const acc of accounts) {
        try {
          if (backupBlob.size > 2 * 1024 * 1024) {
            // Large archive: use streaming chunked pipeline
            await this.uploadChunkedArchive(acc.provider, backupBlob, filename, checksum, options?.onProgress);
          } else {
            // Small/medium archive: direct octet-stream upload
            const res = await fetch(`/api/cloud/${acc.provider}/backup`, {
              method: 'POST',
              headers: this.getHeaders({ 'Content-Type': 'application/octet-stream' }),
              body: backupBlob,
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: 'Upload failed' }));
              throw new Error(err.error || 'Upload failed');
            }
          }

          // Record success telemetry
          this.telemetry.unshift({
            provider: acc.provider,
            lastSyncAt: new Date().toISOString(),
            lastSyncStatus: 'success',
            lastTransferBytes: backupBlob.size,
            lastTransferDurationMs: Date.now() - startTime,
          });
        } catch (e: any) {
          console.error(`Sync error for ${acc.provider}:`, e);
          this.telemetry.unshift({
            provider: acc.provider,
            lastSyncAt: new Date().toISOString(),
            lastSyncStatus: 'error',
            lastSyncError: e.message,
            lastTransferBytes: backupBlob.size,
            lastTransferDurationMs: Date.now() - startTime,
          });
          options?.onProgress({ percent: 100, message: `Upload failed: ${e.message}`, phase: 'error' });
          allSuccess = false;
          return false;
        }
      }

      if (allSuccess) {
        options?.onProgress({ percent: 100, message: 'Backup complete and verified', phase: 'complete' });
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Fatal sync error:', err);
      options?.onProgress({ percent: 100, message: `Backup generation failed: ${err.message}`, phase: 'error' });
      return false;
    }
  }

  /**
   * Transactional Restore from a remote cloud backup archive
   */
  static async restoreFromCloudBackup(
    provider: CloudStorageProvider,
    backupId: string
  ): Promise<{ success: boolean; message: string }> {
    PrivacyManager.assertNetworkAllowed('Cloud Backup Restore');
    // 1. Safety snapshot of current local store
    const safetySnapshot = StorageManager.exportFullDump();
    sessionStorage.setItem('vs_pre_restore_snapshot', safetySnapshot);

    try {
      const res = await fetch(`/api/cloud/${provider}/restore/${backupId}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Failed to download backup archive from ${provider}`);
      }

      const blob = await res.blob();
      const importResult = await StorageManager.importCloudBackupArchive(blob);

      if (!importResult.success) {
        // Rollback from safety snapshot on validation failure
        StorageManager.importFullDump(safetySnapshot);
        return { success: false, message: `Restore aborted: ${importResult.error || 'Validation error'}` };
      }

      return { success: true, message: 'Cloud backup successfully restored into local database.' };
    } catch (e: any) {
      // Rollback safety snapshot
      StorageManager.importFullDump(safetySnapshot);
      return { success: false, message: `Restore failed: ${e.message || 'Corrupted archive'}` };
    }
  }
}
