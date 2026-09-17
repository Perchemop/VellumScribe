import { Capacitor } from '@capacitor/core';
import { AppLogger } from '../logger';

export interface DatabaseAdapter {
  initialize(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Native Android SQLite adapter utilizing @capacitor-community/sqlite.
 * Provides durable OS-level SQLite persistence without periodic full-database serialization.
 */
export class NativeSqliteAdapter implements DatabaseAdapter {
  private db: any = null;
  private isInitialized = false;

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
          9,
          false
        );
      }

      await this.db.open();
      // Ensure foreign key constraints are strictly enforced
      await this.db.execute('PRAGMA foreign_keys = ON;');
      this.isInitialized = true;
      AppLogger.info('NativeSqliteAdapter', 'Authoritative Native Android SQLite database opened successfully.');
    } catch (err) {
      AppLogger.error('NativeSqliteAdapter', 'Failed to initialize native SQLite connection', err);
      throw err;
    }
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (!this.db) await this.initialize();
    try {
      await this.db.run(sql, params);
    } catch (err: any) {
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

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.db) await this.initialize();
    await this.db.beginTransaction();
    try {
      const value = await fn();
      await this.db.commitTransaction();
      return value;
    } catch (e) {
      try {
        await this.db.rollbackTransaction();
      } catch (rollbackErr) {
        AppLogger.warn('NativeSqliteAdapter', 'Rollback failed', rollbackErr);
      }
      throw e;
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

  async initialize(): Promise<void> {
    const { SqliteEngine } = await import('./sqliteEngine');
    await SqliteEngine.initialize();
    this.engineInitialized = true;
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    const { SqliteEngine } = await import('./sqliteEngine');
    if (!this.engineInitialized) await this.initialize();
    SqliteEngine.run(sql, params);
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { SqliteEngine } = await import('./sqliteEngine');
    if (!this.engineInitialized) await this.initialize();
    return SqliteEngine.query<T>(sql, params);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const { SqliteEngine } = await import('./sqliteEngine');
    if (!this.engineInitialized) await this.initialize();
    return SqliteEngine.transaction(() => fn());
  }

  async close(): Promise<void> {
    const { SqliteEngine } = await import('./sqliteEngine');
    await SqliteEngine.flush();
    this.engineInitialized = false;
  }
}

let activeAdapter: DatabaseAdapter | null = null;

export function getDatabaseAdapter(): DatabaseAdapter {
  if (!activeAdapter) {
    if (Capacitor.isNativePlatform()) {
      activeAdapter = new NativeSqliteAdapter();
    } else {
      activeAdapter = new WebSqliteAdapter();
    }
  }
  return activeAdapter;
}
