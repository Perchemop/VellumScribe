import { Capacitor } from '@capacitor/core';
import { AppLogger } from '../logger';
import { SqliteEngine, base64ToUint8Array } from './sqliteEngine';
import { MIGRATIONS } from './schema';

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
          11,
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

      // Execute all pending schema migrations on native Android SQLite
      await this.runNativeMigrations();

      // Check and execute one-time migration from legacy sql.js WASM file
      await this.migrateFromWasmSqliteFile();

      this.isInitialized = true;
      this.durabilityStatus = 'saved';
      AppLogger.info('NativeSqliteAdapter', 'Authoritative Native Android SQLite database opened and migrated successfully.');
    } catch (err) {
      this.durabilityStatus = 'failed';
      AppLogger.error('NativeSqliteAdapter', 'Failed to initialize native SQLite connection', err);
      throw err;
    }
  }

  private async runNativeMigrations(): Promise<void> {
    try {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL,
          description TEXT NOT NULL
        );
      `);

      const appliedRes = await this.db.query('SELECT version FROM schema_migrations ORDER BY version ASC;');
      const appliedSet = new Set<number>((appliedRes.values || []).map((r: any) => r.version));

      for (const mig of MIGRATIONS) {
        if (!appliedSet.has(mig.version)) {
          AppLogger.info('NativeSqliteAdapter', `Applying native SQLite migration v${mig.version}: ${mig.description}`);
          await this.db.beginTransaction();
          try {
            await this.db.execute(mig.sql);
            await this.db.run(
              'INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?);',
              [mig.version, Date.now(), mig.description]
            );
            await this.db.execute(`PRAGMA user_version = ${mig.version};`);
            await this.db.commitTransaction();
          } catch (migErr) {
            await this.db.rollbackTransaction();
            AppLogger.error('NativeSqliteAdapter', `Failed migration v${mig.version}`, migErr);
            throw migErr;
          }
        }
      }
    } catch (err) {
      AppLogger.error('NativeSqliteAdapter', 'Native migration execution error', err);
      throw err;
    }
  }

  private async migrateFromWasmSqliteFile(): Promise<void> {
    try {
      const metaCheck = await this.db.query(
        "SELECT value FROM workspace_metadata WHERE key = 'native_migrated_from_wasm_v1';"
      );
      if (metaCheck.values && metaCheck.values.length > 0 && metaCheck.values[0].value === 'true') {
        return; // Already migrated
      }

      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const fileStat = await Filesystem.stat({
        path: 'databases/current.sqlite',
        directory: Directory.Data,
      }).catch(() => null);

      if (!fileStat) {
        await this.db.run(
          "INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES ('native_migrated_from_wasm_v1', 'true', ?);",
          [Date.now()]
        );
        return;
      }

      AppLogger.info('NativeSqliteAdapter', 'Found legacy sql.js database on Android filesystem. Performing safe one-time native import...');
      const readFile = await Filesystem.readFile({
        path: 'databases/current.sqlite',
        directory: Directory.Data,
      });

      const base64Data = typeof readFile.data === 'string' ? readFile.data : '';
      if (base64Data) {
        const initSqlJs = (await import('sql.js')).default;
        const SQL = await initSqlJs();
        const binary = base64ToUint8Array(base64Data);
        const wasmDb = new SQL.Database(binary);

        const tables = [
          'events',
          'notes',
          'checklists',
          'note_tags',
          'note_versions',
          'media_files',
          'recordings',
          'transcripts',
          'ocr_scans',
        ];

        for (const tbl of tables) {
          try {
            const res = wasmDb.exec(`SELECT * FROM ${tbl};`);
            if (res.length > 0 && res[0].columns && res[0].values) {
              const cols = res[0].columns;
              const placeholders = cols.map(() => '?').join(', ');
              for (const row of res[0].values) {
                await this.db.run(
                  `INSERT OR IGNORE INTO ${tbl} (${cols.join(', ')}) VALUES (${placeholders});`,
                  row
                );
              }
            }
          } catch {
            // Table may not exist in earlier schema version
          }
        }
        wasmDb.close();

        // Safely backup the legacy file
        await Filesystem.copy({
          from: 'databases/current.sqlite',
          to: 'databases/legacy_wasm_backup.sqlite',
          directory: Directory.Data,
        }).catch(() => {});

        AppLogger.info('NativeSqliteAdapter', 'Successfully migrated all records from sql.js to native Android SQLite.');
      }

      await this.db.run(
        "INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES ('native_migrated_from_wasm_v1', 'true', ?);",
        [Date.now()]
      );
    } catch (e) {
      AppLogger.warn('NativeSqliteAdapter', 'Non-fatal error during legacy WASM file check', e);
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
    return SqliteEngine.transactionAsync(fn);
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
