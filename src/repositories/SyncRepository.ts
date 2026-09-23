import { getDatabaseAdapter, DatabaseAdapter } from '../lib/sqlite/databaseAdapter';
import { AppLogger } from '../lib/logger';
import { CloudStorageProvider } from '../types';

export interface QueuedSyncRecord {
  id: string;
  providers: CloudStorageProvider[];
  reason?: string;
  filename?: string;
  stagedStorageKey?: string;
  checksum?: string;
  attempts: number;
  status: string;
  lastError?: string;
  queuedAt: number;
  updatedAt: number;
}

export interface ItemChangeRecord {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  version: number;
  changedAt: number;
  payloadHash: string;
  syncState: 'pending' | 'syncing' | 'synced' | 'failed';
}

export class SyncRepository {
  private static async getDb(): Promise<DatabaseAdapter> {
    const db = getDatabaseAdapter();
    await db.initialize();
    return db;
  }

  public static async getQueue(): Promise<QueuedSyncRecord[]> {
    try {
      const db = await this.getDb();
      const rows = await db.query<{
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
        updated_at: number;
      }>('SELECT * FROM cloud_sync_queue ORDER BY queued_at ASC');

      return (rows || []).map((r) => ({
        id: r.id,
        providers: JSON.parse(r.providers_json || '[]'),
        reason: r.reason || undefined,
        filename: r.filename || undefined,
        stagedStorageKey: r.staged_storage_key || undefined,
        checksum: r.checksum || undefined,
        attempts: r.attempts || 0,
        status: r.status || 'pending',
        lastError: r.last_error || undefined,
        queuedAt: r.queued_at,
        updatedAt: r.updated_at,
      }));
    } catch (e) {
      AppLogger.warn('SyncRepository', 'Failed to read sync queue', e);
      return [];
    }
  }

  public static async enqueue(item: {
    id: string;
    providers: CloudStorageProvider[];
    reason?: string;
    filename?: string;
    stagedStorageKey?: string;
    checksum?: string;
    lastError?: string;
  }): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();
    await db.run(
      `INSERT OR REPLACE INTO cloud_sync_queue 
       (id, providers_json, reason, filename, staged_storage_key, checksum, attempts, status, last_error, queued_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        JSON.stringify(item.providers),
        item.reason || null,
        item.filename || null,
        item.stagedStorageKey || null,
        item.checksum || null,
        0,
        'pending',
        item.lastError || null,
        now,
        now,
      ]
    );
  }

  public static async markFailed(id: string, error: string): Promise<void> {
    const db = await this.getDb();
    await db.run(
      'UPDATE cloud_sync_queue SET attempts = attempts + 1, last_error = ?, status = ?, updated_at = ? WHERE id = ?',
      [error, 'failed', Date.now(), id]
    );
  }

  public static async remove(id: string): Promise<void> {
    const db = await this.getDb();
    await db.run('DELETE FROM cloud_sync_queue WHERE id = ?', [id]);
  }

  public static async clearQueue(): Promise<void> {
    const db = await this.getDb();
    await db.run('DELETE FROM cloud_sync_queue');
  }

  public static async recordItemChange(change: Omit<ItemChangeRecord, 'changedAt' | 'syncState'> & { syncState?: ItemChangeRecord['syncState'] }): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();
    await db.run(
      `INSERT OR REPLACE INTO item_changes 
       (id, entity_type, entity_id, operation, version, changed_at, payload_hash, sync_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        change.id,
        change.entityType,
        change.entityId,
        change.operation,
        change.version,
        now,
        change.payloadHash,
        change.syncState || 'pending',
      ]
    );
  }

  public static async getPendingChanges(limit = 100): Promise<ItemChangeRecord[]> {
    const db = await this.getDb();
    const rows = await db.query<{
      id: string;
      entity_type: string;
      entity_id: string;
      operation: 'create' | 'update' | 'delete';
      version: number;
      changed_at: number;
      payload_hash: string;
      sync_state: 'pending' | 'syncing' | 'synced' | 'failed';
    }>('SELECT * FROM item_changes WHERE sync_state = ? ORDER BY changed_at ASC LIMIT ?', ['pending', limit]);

    return (rows || []).map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      operation: r.operation,
      version: r.version,
      changedAt: r.changed_at,
      payloadHash: r.payload_hash,
      syncState: r.sync_state,
    }));
  }
}
