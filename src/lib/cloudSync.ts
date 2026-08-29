import { CloudAccount, CloudStorageProvider, SyncTelemetry } from '../types';
import { StorageManager } from './storage';

export type BackupFrequency = 'manual' | 'daily' | 'off';

export interface SyncProgressUpdate {
  percent: number;
  message: string;
  phase: 'init' | 'uploading' | 'complete' | 'error';
}

export class CloudSyncEngine {
  private static telemetry: SyncTelemetry[] = [];

  static async fetchConfig() {
    try {
      const res = await fetch('/api/cloud/config');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('vs_cloud_accounts', JSON.stringify(data.accounts || []));
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
    const accs = this.getAccounts().filter(a => a.provider !== provider);
    localStorage.setItem('vs_cloud_accounts', JSON.stringify(accs));
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

  static async triggerSync(options?: { onProgress: (p: SyncProgressUpdate) => void }): Promise<boolean> {
    const accounts = this.getAccounts();
    if (accounts.length === 0) {
      options?.onProgress({ percent: 100, message: 'No accounts connected', phase: 'error' });
      return false;
    }

    options?.onProgress({ percent: 10, message: 'Generating backup snapshot...', phase: 'init' });
    const backupData = StorageManager.exportCloudBackup();

    if (backupData.length > 3.5 * 1024 * 1024) {
       options?.onProgress({ percent: 100, message: 'Backup too large (limit ~3.5MB)', phase: 'error' });
       return false;
    }

    options?.onProgress({ percent: 30, message: 'Uploading to cloud...', phase: 'uploading' });

    for (const acc of accounts) {
      try {
        const res = await fetch(`/api/cloud/${acc.provider}/backup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backup: backupData })
        });
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.error || 'Upload failed');
        }
      } catch (e: any) {
        options?.onProgress({ percent: 100, message: `Upload failed: ${e.message}`, phase: 'error' });
        return false;
      }
    }

    options?.onProgress({ percent: 100, message: 'Backup complete', phase: 'complete' });
    return true;
  }
}
