import { Capacitor } from '@capacitor/core';
import { AppLogger } from '../logger';
import { SqliteEngine } from './sqliteEngine';

export type DurabilityStatus = 'saved' | 'saving' | 'pending' | 'failed';

export interface DatabaseAdapter {
  initialize(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowId?: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  checkIntegrity(): Promise<{ ok: boolean; result: string }>;
  vacuum(): Promise<void>;
  close(): Promise<void>;
  getDurabilityStatus(): DurabilityStatus;
}

/**
 * Native Android SQLite adapter utilizing @capacitor-community/sqlite.
 * Provides durable OS-level SQLite persistence without periodic full-database serialization.
 */
export class NativeSqliteAdapter implements DatabaseAdapter {
  private db: any = null;
  private isInitialized = false;
  private durabilityStatus: DurabilityStatus = 'saved';

  getDurabilityStatus(): DurabilityStatus {
    return this.durabilityStatus;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized && this.db) return;

    try {
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
      const sqlite = new SQLiteConnection(CapacitorSQLite);

      const isConsistency = await sqlite.checkConnectionsConsistency();
      const isConn = (await sqlite.isConnection('vellumscribe', false)).result;

      if (isConsistency.result && isConn) {
        this.db = await sqlite.retrieveConnection('vellumscribe', false);
      } else {
        this.db = await sqlite.createConnection(
          'vellumscribe',
          false,
          'no-encryption',
          10,
          false
        );
      }

      await this.db.open();
      // Ensure foreign key constraints and WAL mode are strictly enforced
      await this.db.execute('PRAGMA foreign_keys = ON;');
      try {
        await this.db.execute('PRAGMA journal_mode = WAL;');
      } catch {
        // Fallback for devices where WAL is not permissible
      }

      this.isInitialized = true;
      this.durabilityStatus = 'saved';
      AppLogger.info('NativeSqliteAdapter', 'Authoritative Native Android SQLite database opened successfully.');
    } catch (err) {
      this.durabilityStatus = 'failed';
      AppLogger.error('NativeSqliteAdapter', 'Failed to initialize native SQLite connection', err);
      throw err;
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.db) await this.initialize();
    this.durabilityStatus = 'saving';
    try {
      await this.db.run(sql, params);
      this.durabilityStatus = 'saved';
    } catch (err: any) {
      this.durabilityStatus = 'failed';
      AppLogger.error('NativeSqliteAdapter', `execute failed on: "${sql}"`, { params, error: err?.message });
      throw err;
    }
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.db) await this.initialize();
    try {
      const result = await this.db.query(sql, params);
      return (result.values ?? []) as T[];
    } catch (err: any) {
      AppLogger.error('NativeSqliteAdapter', `query failed on: "${sql}"`, { params, error: err?.message });
      throw err;
    }
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowId?: number }> {
    if (!this.db) await this.initialize();
    this.durabilityStatus = 'saving';
    try {
      const res = await this.db.run(sql, params);
      this.durabilityStatus = 'saved';
      const changes = res?.changes?.changes ?? 1;
      const lastInsertRowId = res?.changes?.lastId ?? undefined;
      return { changes, lastInsertRowId };
    } catch (err: any) {
      this.durabilityStatus = 'failed';
      AppLogger.error('NativeSqliteAdapter', `run failed on: "${sql}"`, { params, error: err?.message });
      throw err;
    }
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.db) await this.initialize();
    this.durabilityStatus = 'saving';
    await this.db.beginTransaction();
    try {
      const value = await fn();
      await this.db.commitTransaction();
      this.durabilityStatus = 'saved';
      return value;
    } catch (e) {
      this.durabilityStatus = 'failed';
      try {
        await this.db.rollbackTransaction();
      } catch (rollbackErr) {
        AppLogger.warn('NativeSqliteAdapter', 'Rollback failed', rollbackErr);
      }
      throw e;
    }
  }

  async checkIntegrity(): Promise<{ ok: boolean; result: string }> {
    if (!this.db) await this.initialize();
    try {
      const res = await this.query<{ integrity_check: string }>('PRAGMA integrity_check;');
      const status = res[0]?.integrity_check || 'unknown';
      return { ok: status === 'ok', result: status };
    } catch (err: any) {
      return { ok: false, result: err?.message || 'Error checking integrity' };
    }
  }

  async vacuum(): Promise<void> {
    if (!this.db) await this.initialize();
    try {
      await this.db.execute('VACUUM;');
    } catch (err) {
      AppLogger.warn('NativeSqliteAdapter', 'Vacuum warning', err);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      try {
        await this.db.close();
      } catch (e) {
        AppLogger.warn('NativeSqliteAdapter', 'Error closing connection', e);
      }
      this.db = null;
      this.isInitialized = false;
    }
  }
}

/**
 * Web and Test SQLite adapter utilizing sql.js WebAssembly.
 * Provides in-memory execution with IndexedDB / memory persistence for browser environments.
 */
export class WebSqliteAdapter implements DatabaseAdapter {
  private engineInitialized = false;

  getDurabilityStatus(): DurabilityStatus {
    return SqliteEngine.getDurabilityStatus?.() || (SqliteEngine.isDirtyState?.() ? 'pending' : 'saved');
  }

  async initialize(): Promise<void> {
    await SqliteEngine.initialize();
    this.engineInitialized = true;
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.engineInitialized) await this.initialize();
    SqliteEngine.run(sql, params);
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.engineInitialized) await this.initialize();
    return SqliteEngine.query<T>(sql, params);
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowId?: number }> {
    if (!this.engineInitialized) await this.initialize();
    SqliteEngine.run(sql, params);
    const lastId = SqliteEngine.getLastInsertId();
    return { changes: 1, lastInsertRowId: lastId };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.engineInitialized) await this.initialize();
    return SqliteEngine.transaction(() => fn());
  }

  async checkIntegrity(): Promise<{ ok: boolean; result: string }> {
    if (!this.engineInitialized) await this.initialize();
    const ok = SqliteEngine.verifyIntegrity();
    return { ok, result: ok ? 'ok' : 'corrupted' };
  }

  async vacuum(): Promise<void> {
    if (!this.engineInitialized) await this.initialize();
    await SqliteEngine.vacuum();
  }

  async close(): Promise<void> {
    await SqliteEngine.flush();
    this.engineInitialized = false;
  }
}

let activeAdapter: DatabaseAdapter | null = null;

export function getDatabaseAdapter(): DatabaseAdapter {
  if (!activeAdapter) {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      activeAdapter = new NativeSqliteAdapter();
    } else {
      activeAdapter = new WebSqliteAdapter();
    }
  }
  return activeAdapter;
}
