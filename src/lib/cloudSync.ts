import { CloudAccount, CloudStorageProvider, SyncTelemetry } from '../types';
import { StorageManager } from './storage';
import { PrivacyManager } from './privacyManager';
import { SyncRepository } from '../repositories/SyncRepository';
import { getDatabaseAdapter } from './sqlite/databaseAdapter';
import { AppLogger } from './logger';
import { asErrorLike } from './errorLike';

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

export interface QueuedSyncItem {
  id: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
  providers: CloudStorageProvider[];
  snapshotId?: string;
  checksum?: string;
  byteSize?: number;
  filename?: string;
  stagedStorageKey?: string;
}

export interface CloudSyncConfig {
  providers?: Record<
    string,
    {
      name?: string;
      isConfigured?: boolean;
      hasOAuthEnv?: boolean;
      isSSO?: boolean;
      description?: string;
    }
  >;
  accounts?: CloudAccount[];
  configured?: boolean;
  [key: string]: unknown;
}

export class CloudSyncEngine {
  private static telemetry: SyncTelemetry[] = [];
  private static isProcessingQueue = false;
  private static readonly QUEUE_STORAGE_KEY = 'vs_offline_sync_queue';
  private static readonly CHUNK_SIZE = 1024 * 1024; // 1MB chunk slices for network resilience

  // In-memory signed session token (isolated from localStorage to prevent XSS exfiltration)
  private static sessionToken: string | null = null;
  private static tokenInitPromise: Promise<string> | null = null;

  static {
    // Purge any legacy unauthenticated or plaintext tokens from browser storage
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('vs_cloud_token');
        localStorage.removeItem('vs_cloud_session_id');
      } catch {
        /* ignore */
      }
    }
  }

  public static getSyncQueue(): QueuedSyncItem[] {
    try {
      const db = getDatabaseAdapter();
      if (db.querySync) {
        const rows = db.querySync<{
          id: string;
          providers_json: string;
          reason: string | null;
          filename: string | null;
          staged_storage_key: string | null;
          checksum: string | null;
          attempts: number;
          status: string;
          last_error: string | null;
          queued_at: number;
        }>('SELECT * FROM cloud_sync_queue ORDER BY queued_at ASC');

        if (rows && rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            queuedAt: new Date(r.queued_at).toISOString(),
            attempts: r.attempts,
            lastError: r.last_error || r.reason || 'Queued for retry',
            providers: JSON.parse(r.providers_json || '[]'),
            snapshotId: r.id,
            checksum: r.checksum || undefined,
            filename: r.filename || undefined,
            stagedStorageKey: r.staged_storage_key || undefined,
          }));
        }
      }

      // Legacy fallback and initial migration from localStorage
      const raw = localStorage.getItem(this.QUEUE_STORAGE_KEY);
      if (raw) {
        const legacy: QueuedSyncItem[] = JSON.parse(raw);
        if (Array.isArray(legacy) && legacy.length > 0) {
          for (const item of legacy) {
            SyncRepository.enqueue({
              id: item.id,
              providers: item.providers || [],
              reason: item.lastError,
              filename: item.filename,
              stagedStorageKey: item.stagedStorageKey,
              checksum: item.checksum,
              lastError: item.lastError,
            }).catch(() => {});
          }
          localStorage.removeItem(this.QUEUE_STORAGE_KEY);
        }
        return legacy || [];
      }
      return [];
    } catch {
      return [];
    }
  }

  public static enqueueSync(
    providers?: CloudStorageProvider[],
    reason?: string,
    stagedBlob?: Blob,
    meta?: { filename?: string; checksum?: string }
  ): QueuedSyncItem {
    const activeProviders =
      providers && providers.length > 0 ? providers : this.getAccounts().map((a) => a.provider);

    const randBytes = new Uint8Array(4);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randBytes);
    }
    const randHex = Array.from(randBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const id = 'queue_' + Date.now().toString(36) + '_' + randHex;
    const stagedKey = stagedBlob ? `vs_staged_queue_${id}` : undefined;

    if (stagedBlob && stagedKey) {
      import('./MediaRepository').then(({ MediaRepository }) => {
        MediaRepository.putBinary(stagedKey, stagedBlob).catch((e) => {
          AppLogger.warn(
            'CloudSync',
            'Failed to stage offline sync archive in media repository:',
            e
          );
        });
      });
    }

    const item: QueuedSyncItem = {
      id,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: reason || 'Queued for retry',
      providers: activeProviders,
      snapshotId: id,
      checksum: meta?.checksum,
      byteSize: stagedBlob ? stagedBlob.size : undefined,
      filename: meta?.filename,
      stagedStorageKey: stagedKey,
    };

    try {
      SyncRepository.enqueueSync({
        id: item.id,
        providers: item.providers,
        reason: reason || undefined,
        filename: item.filename,
        stagedStorageKey: item.stagedStorageKey,
        checksum: item.checksum,
        lastError: item.lastError,
      });
    } catch {
      const queue = this.getSyncQueue();
      queue.push(item);
      localStorage.setItem(this.QUEUE_STORAGE_KEY, JSON.stringify(queue));
    }

    return item;
  }

  public static clearSyncQueue(): void {
    const queue = this.getSyncQueue();
    for (const item of queue) {
      if (item.stagedStorageKey) {
        import('./MediaRepository').then(({ MediaRepository }) => {
          MediaRepository.deleteBinary(item.stagedStorageKey!).catch(() => {});
        });
      }
    }
    SyncRepository.clearQueueSync();
    localStorage.removeItem(this.QUEUE_STORAGE_KEY);
  }

  public static removeFromSyncQueue(id: string): void {
    const queue = this.getSyncQueue();
    const item = queue.find((q) => q.id === id);
    if (item?.stagedStorageKey) {
      import('./MediaRepository').then(({ MediaRepository }) => {
        MediaRepository.deleteBinary(item.stagedStorageKey!).catch(() => {});
      });
    }
    SyncRepository.removeSync(id);
    const filtered = queue.filter((item) => item.id !== id);
    localStorage.setItem(this.QUEUE_STORAGE_KEY, JSON.stringify(filtered));
  }

  public static isQueueActive(): boolean {
    return this.isProcessingQueue;
  }

  /**
   * Automatically flushes offline sync items when network is active
   */
  public static async processSyncQueue(): Promise<{
    processed: number;
    success: number;
    failed: number;
  }> {
    if (this.isProcessingQueue) return { processed: 0, success: 0, failed: 0 };
    const queue = this.getSyncQueue();
    if (queue.length === 0) return { processed: 0, success: 0, failed: 0 };

    this.isProcessingQueue = true;
    let successCount = 0;
    let failedCount = 0;

    try {
      // Process items sequentially with exponential backoff after failures
      let consecutiveFailures = 0;
      for (const item of [...queue]) {
        if (consecutiveFailures > 0) {
          const delayMs = Math.min(30000, 1000 * Math.pow(2, consecutiveFailures - 1));
          await new Promise((r) => setTimeout(r, delayMs));
        }
        try {
          let stagedBlob: Blob | null = null;
          if (item.stagedStorageKey) {
            try {
              const { MediaRepository } = await import('./MediaRepository');
              stagedBlob = await MediaRepository.getBinary(item.stagedStorageKey);
            } catch {
              /* ignore */
            }
          }

          const success = await this.triggerSync({
            enqueueOnFailure: false,
            targetProviders: item.providers,
            pregeneratedBlob: stagedBlob || undefined,
            customFilename: item.filename,
          });

          if (success) {
            successCount++;
            consecutiveFailures = 0;
            this.removeFromSyncQueue(item.id);
          } else {
            failedCount++;
            consecutiveFailures++;
            item.attempts++;
            item.lastError = 'Sync failed during queue execution';
            SyncRepository.markFailed(item.id, item.lastError).catch(() => {});
          }
        } catch (_e) {
          const e = asErrorLike(_e);
          failedCount++;
          consecutiveFailures++;
          item.attempts++;
          const errorMsg = e?.message || 'Network exception';
          item.lastError = errorMsg;
          SyncRepository.markFailed(item.id, errorMsg).catch(() => {});
          if (consecutiveFailures >= 3) break;
          // was hard-stop; now limited retries with backoff
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }

    return { processed: successCount + failedCount, success: successCount, failed: failedCount };
  }

  /**
   * Ensures an authentic, signed session token is active.
   * Stores secret in Keystore on native platforms and in memory on web.
   */
  public static async ensureSessionToken(): Promise<string> {
    if (this.sessionToken) return this.sessionToken;
    if (this.tokenInitPromise) return this.tokenInitPromise;

    this.tokenInitPromise = (async () => {
      try {
        if (typeof window !== 'undefined') {
          try {
            const { AndroidKeystoreManager } = await import('./keystore');
            const storedSecret = await AndroidKeystoreManager.getSecret('cloud_session_token');
            if (storedSecret) {
              this.sessionToken = storedSecret;
              return storedSecret;
            }
          } catch {
            /* ignore */
          }
        }

        const res = await fetch('/api/cloud/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({}),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.token) {
            this.sessionToken = data.token;
            try {
              const { AndroidKeystoreManager } = await import('./keystore');
              await AndroidKeystoreManager.saveSecret(
                'cloud_session_token',
                data.token,
                'cloud_credential'
              );
            } catch {
              /* ignore */
            }
            return data.token;
          }
        }
      } catch (err) {
        AppLogger.warn('CloudSync', 'Failed to establish signed cloud session token:', err);
      } finally {
        this.tokenInitPromise = null;
      }
      return '';
    })();

    return this.tokenInitPromise;
  }

  private static getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = this.sessionToken || '';
    const headers: Record<string, string> = {
      ...extra,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-session-token'] = token;
    }
    return headers;
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

  private static readonly DEFAULT_CLOUD_CONFIG = {
    status: 'ok',
    providers: {
      google_drive: {
        name: 'Google (SSO & Drive)',
        isConfigured: false,
        hasOAuthEnv: false,
        isSSO: true,
        description: 'Single Sign-On authentication and encrypted cloud backups via Google.',
      },
      microsoft: {
        name: 'Microsoft (SSO & OneDrive)',
        isConfigured: false,
        hasOAuthEnv: false,
        isSSO: true,
        description: 'Single Sign-On authentication and encrypted cloud backups via Microsoft.',
      },
      nextcloud: {
        name: 'Nextcloud',
        isConfigured: true,
        hasOAuthEnv: false,
        isSSO: false,
        description:
          'Store encrypted backups on a self-hosted Nextcloud server via authenticated WebDAV.',
      },
      webdav: {
        name: 'Custom WebDAV',
        isConfigured: true,
        hasOAuthEnv: false,
        isSSO: false,
        description: 'Universal WebDAV cloud destination with authenticated endpoint.',
      },
    },
    accounts: [] as CloudAccount[],
  };

  static async fetchConfig(retries = 1): Promise<CloudSyncConfig> {
    if (PrivacyManager.isPrivateOfflineMode()) {
      return {
        ...this.DEFAULT_CLOUD_CONFIG,
        accounts: this.getAccounts(),
      };
    }

    try {
      PrivacyManager.assertNetworkAllowed('Cloud Storage Configuration');
      await this.ensureSessionToken();
      const res = await fetch('/api/cloud/config', {
        headers: this.getHeaders(),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.accounts)) {
          localStorage.setItem('vs_cloud_accounts', JSON.stringify(data.accounts));
        }
        return data;
      }
    } catch (_e) {
      const e = asErrorLike(_e);
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return this.fetchConfig(retries - 1);
      }
      AppLogger.warn(
        'CloudSync',
        'Cloud storage configuration offline or unavailable, using local accounts cache:',
        e?.message || e
      );
    }

    return {
      ...this.DEFAULT_CLOUD_CONFIG,
      accounts: this.getAccounts(),
    };
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
   * Saves or updates a genuine authenticated cloud account
   */
  static saveConnectedAccount(account: CloudAccount): CloudAccount {
    const current = this.getAccounts().filter((a) => a.provider !== account.provider);
    current.push(account);
    localStorage.setItem('vs_cloud_accounts', JSON.stringify(current));
    return account;
  }

  /**
   * Retrieves provider OAuth / SSO authorization URL with PKCE for secure authentication
   */
  static async getAuthUrl(
    provider: 'google_drive' | 'microsoft',
    options?: {
      codeChallenge?: string;
      codeChallengeMethod?: string;
      codeVerifier?: string;
      redirectUri?: string;
    }
  ): Promise<{ configured: boolean; url?: string; message?: string }> {
    await this.ensureSessionToken();
    const query = new URLSearchParams();
    if (options?.codeChallenge) {
      query.set('code_challenge', options.codeChallenge);
      query.set('code_challenge_method', options.codeChallengeMethod || 'S256');
    }
    if (options?.codeVerifier) {
      query.set('code_verifier', options.codeVerifier);
    }
    if (options?.redirectUri) {
      query.set('redirect_uri', options.redirectUri);
    }
    const queryString = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`/api/cloud/${provider}/auth-url${queryString}`, {
      headers: this.getHeaders(),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      return { configured: false, message: 'Could not fetch auth URL' };
    }
    return res.json();
  }

  /**
   * Connect to Nextcloud or generic WebDAV server with verified credentials
   */
  static async connectCredentials(
    provider: 'nextcloud' | 'webdav',
    credentials: { serverUrl: string; username: string; password: string; remotePath?: string }
  ): Promise<CloudAccount> {
    PrivacyManager.assertNetworkAllowed(`Cloud Storage (${provider})`);
    await this.ensureSessionToken();
    const res = await fetch(`/api/cloud/${provider}/connect-credentials`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
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
      await this.ensureSessionToken();
      await fetch(`/api/cloud/${provider}/disconnect`, {
        method: 'POST',
        headers: this.getHeaders(),
        credentials: 'same-origin',
      });
    } catch (e) {
      AppLogger.warn('CloudSync', `Failed to notify server of disconnect for ${provider}:`, e);
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
      await this.ensureSessionToken();
      const res = await fetch(`/api/cloud/${provider}/backups`, {
        headers: this.getHeaders(),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.backups) ? data.backups : [];
      }
      return [];
    } catch (e) {
      AppLogger.warn('CloudSync', `Failed to fetch remote backups for ${provider}:`, e);
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

    await this.ensureSessionToken();
    // 1. Init chunked session
    const initRes = await fetch(`/api/cloud/${provider}/chunk/init`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'same-origin',
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

      const chunkRes = await fetch(`/api/cloud/${provider}/chunk/upload`, {
        method: 'POST',
        headers: this.getHeaders({
          'Content-Type': 'application/octet-stream',
          'x-upload-id': uploadId,
          'x-chunk-index': String(chunkIndex),
          'x-total-chunks': String(totalChunks),
        }),
        credentials: 'same-origin',
        body: chunkBlob,
      });

      if (!chunkRes.ok) {
        const err = await chunkRes
          .json()
          .catch(() => ({ error: `Failed to upload chunk ${chunkIndex}` }));
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
      credentials: 'same-origin',
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
  static async triggerSync(options?: {
    onProgress?: (p: SyncProgressUpdate) => void;
    enqueueOnFailure?: boolean;
    targetProviders?: CloudStorageProvider[];
    pregeneratedBlob?: Blob;
    customFilename?: string;
  }): Promise<boolean> {
    PrivacyManager.assertNetworkAllowed('Cloud Backup Upload');
    const startTime = Date.now();
    const allAccounts = this.getAccounts();
    const accounts =
      options?.targetProviders && options.targetProviders.length > 0
        ? allAccounts.filter((a) => options.targetProviders!.includes(a.provider))
        : allAccounts;

    const shouldEnqueue = options?.enqueueOnFailure !== false;

    if (accounts.length === 0) {
      options?.onProgress?.({
        percent: 100,
        message: 'No cloud accounts connected',
        phase: 'error',
      });
      return false;
    }

    options?.onProgress?.({
      percent: 10,
      message: 'Generating and compressing backup snapshot...',
      phase: 'compressing',
    });

    try {
      await this.ensureSessionToken();
      const backupBlob =
        options?.pregeneratedBlob || (await StorageManager.exportCloudBackupArchive());
      const arrayBuffer = await backupBlob.arrayBuffer();
      const checksum = await this.computeChecksum(arrayBuffer);
      const filename =
        options?.customFilename ||
        `vellumscribe_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;

      options?.onProgress?.({
        percent: 25,
        message: 'Starting cloud backup upload...',
        phase: 'uploading',
      });

      let allSuccess = true;
      for (const acc of accounts) {
        try {
          if (backupBlob.size > 2 * 1024 * 1024) {
            // Large archive: use streaming chunked pipeline
            await this.uploadChunkedArchive(
              acc.provider,
              backupBlob,
              filename,
              checksum,
              options?.onProgress
            );
          } else {
            // Small/medium archive: direct octet-stream upload
            const res = await fetch(`/api/cloud/${acc.provider}/backup`, {
              method: 'POST',
              headers: this.getHeaders({ 'Content-Type': 'application/octet-stream' }),
              credentials: 'same-origin',
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
        } catch (_e) {
          const e = asErrorLike(_e);
          AppLogger.error('CloudSync', `Sync error for ${acc.provider}:`, e);
          this.telemetry.unshift({
            provider: acc.provider,
            lastSyncAt: new Date().toISOString(),
            lastSyncStatus: 'error',
            lastSyncError: e.message,
            lastTransferBytes: backupBlob.size,
            lastTransferDurationMs: Date.now() - startTime,
          });
          allSuccess = false;
          if (shouldEnqueue) {
            this.enqueueSync(
              [acc.provider],
              `Upload failed for ${acc.provider}: ${e.message}`,
              backupBlob,
              { filename, checksum }
            );
          }
          // Continue iteration so remaining providers are given a chance to sync
        }
      }

      if (allSuccess) {
        options?.onProgress?.({
          percent: 100,
          message: 'Backup complete and verified',
          phase: 'complete',
        });
        return true;
      }
      return false;
    } catch (_err) {
      const err = asErrorLike(_err);
      AppLogger.error('CloudSync', 'Fatal sync error:', err);
      options?.onProgress?.({
        percent: 100,
        message: `Backup generation failed: ${err.message}`,
        phase: 'error',
      });
      if (shouldEnqueue) {
        this.enqueueSync(
          accounts.map((a) => a.provider),
          `Backup creation failed: ${err.message}`
        );
      }
      return false;
    }
  }

  /**
   * Transactional Restore from a remote cloud backup archive
   */
  static async restoreFromCloudBackup(
    provider: CloudStorageProvider,
    backupId: string,
    options?: { mode?: 'exact' | 'merge' }
  ): Promise<{ success: boolean; message: string }> {
    PrivacyManager.assertNetworkAllowed('Cloud Backup Restore');
    await this.ensureSessionToken();

    try {
      const res = await fetch(`/api/cloud/${provider}/restore/${backupId}`, {
        headers: this.getHeaders(),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        throw new Error(`Failed to download backup archive from ${provider}`);
      }

      const blob = await res.blob();
      const importResult = await StorageManager.importCloudBackupArchive(blob, {
        mode: options?.mode || 'exact',
      });

      if (!importResult.success) {
        return {
          success: false,
          message: `Restore aborted: ${importResult.error || 'Validation error'}`,
        };
      }

      return {
        success: true,
        message:
          options?.mode === 'merge'
            ? 'Cloud backup successfully merged into local database.'
            : 'Cloud backup successfully restored into local database (exact restore).',
      };
    } catch (_e) {
      const e = asErrorLike(_e);
      return { success: false, message: `Restore failed: ${e.message || 'Corrupted archive'}` };
    }
  }
}

// Auto-flush offline queued syncs when network connectivity is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setTimeout(() => {
      CloudSyncEngine.processSyncQueue().catch((err) => {
        AppLogger.warn('CloudSync', 'Background sync queue processing failed:', err);
      });
    }, 1500);
  });
}
