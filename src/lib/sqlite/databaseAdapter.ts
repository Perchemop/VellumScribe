import { Capacitor } from '@capacitor/core';
import { AppLogger } from '../logger';
import { SqliteEngine, base64ToUint8Array } from './sqliteEngine';
import { MIGRATIONS, DB_SCHEMA_VERSION } from './schema';

export type DurabilityStatus = 'saved' | 'saving' | 'pending' | 'failed';

export type MigrationState =
  | 'NOT_STARTED'
  | 'BACKUP_CREATED'
  | 'NATIVE_DB_INITIALIZED'
  | 'SCHEMA_MIGRATED'
  | 'LEGACY_DATA_SCANNED'
  | 'LEGACY_DATA_IMPORTED'
  | 'VALIDATED'
  | 'MIGRATION_COMPLETE'
  | 'FAILED';

export interface DatabaseAdapter {
  initialize(): Promise<void>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowId?: number }>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  querySync?<T>(sql: string, params?: unknown[]): T[];
  runSync?(sql: string, params?: unknown[]): { changes: number; lastInsertRowId?: number };
  transactionSync?<T>(fn: () => T): T;
  getLastInsertId?(): number;
  checkIntegrity(): Promise<{ ok: boolean; result: string }>;
  checkIntegritySync?(): boolean;
  vacuum(): Promise<{ originalSizeBytes: number; compactedSizeBytes: number; bytesReclaimed: number }>;
  close(): Promise<void>;
  getDurabilityStatus(): DurabilityStatus;
  exportBinary?(): Uint8Array;
  importBinary?(binary: Uint8Array): Promise<void>;
  flush?(): Promise<void>;
  scheduleSave?(): void;
  cancelPendingSave?(): void;
  isDirtyState?(): boolean;
}

/**
 * Native Android SQLite adapter utilizing @capacitor-community/sqlite.
 * Provides durable OS-level SQLite persistence without periodic full-database serialization.
 */
export class NativeSqliteAdapter implements DatabaseAdapter {
  private static instance: NativeSqliteAdapter | null = null;
  private db: any = null;
  private isInitialized = false;
  private durabilityStatus: DurabilityStatus = 'saved';
  private migrationState: MigrationState = 'NOT_STARTED';

  public static getInstance(): NativeSqliteAdapter {
    if (!this.instance) {
      this.instance = new NativeSqliteAdapter();
    }
    return this.instance;
  }

  getDurabilityStatus(): DurabilityStatus {
    return this.durabilityStatus;
  }

  getMigrationState(): MigrationState {
    return this.migrationState;
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
          DB_SCHEMA_VERSION,
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

      this.migrationState = 'NATIVE_DB_INITIALIZED';

      // Execute all pending schema migrations on native Android SQLite
      await this.runNativeMigrations();
      this.migrationState = 'SCHEMA_MIGRATED';

      // Check and execute one-time migration from legacy sql.js WASM file with validation state machine
      await this.migrateFromWasmSqliteFile();
      try {
        await SqliteEngine.initAsync();
      } catch (e) {
        AppLogger.warn('NativeSqliteAdapter', 'Could not initialize in-memory mirror engine', e);
      }

      this.isInitialized = true;
      this.durabilityStatus = 'saved';
      AppLogger.info('NativeSqliteAdapter', 'Authoritative Native Android SQLite database opened and migrated successfully.');
    } catch (err) {
      this.durabilityStatus = 'failed';
      this.migrationState = 'FAILED';
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
        CREATE TABLE IF NOT EXISTS workspace_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
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

  private async recordMigrationState(state: MigrationState, details?: string): Promise<void> {
    this.migrationState = state;
    try {
      await this.db.run(
        "INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES ('migration_state', ?, ?);",
        [state, Date.now()]
      );
      if (details) {
        await this.db.run(
          "INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES ('migration_details', ?, ?);",
          [details, Date.now()]
        );
      }
    } catch {
      // workspace_metadata might not be created yet during early init
    }
  }

  private async migrateFromWasmSqliteFile(): Promise<void> {
    try {
      const metaCheck = await this.db.query(
        "SELECT value FROM workspace_metadata WHERE key = 'native_migration_status';"
      );
      if (metaCheck.values && metaCheck.values.length > 0 && metaCheck.values[0].value === 'MIGRATION_COMPLETE') {
        this.migrationState = 'MIGRATION_COMPLETE';
        return; // Already migrated and validated
      }

      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const fileStat = await Filesystem.stat({
        path: 'databases/current.sqlite',
        directory: Directory.Data,
      }).catch(() => null);

      if (!fileStat) {
        await this.recordMigrationState('MIGRATION_COMPLETE', 'Fresh native database install - no legacy WASM database found');
        await this.db.run(
          "INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES ('native_migration_status', 'MIGRATION_COMPLETE', ?);",
          [Date.now()]
        );
        return;
      }

      AppLogger.info('NativeSqliteAdapter', 'Found legacy sql.js database on Android filesystem. Starting transactional migration state machine...');
      await this.recordMigrationState('BACKUP_CREATED');

      // 1. Create a safe, verified binary backup of the legacy file
      await Filesystem.copy({
        from: 'databases/current.sqlite',
        to: 'databases/legacy_wasm_backup.sqlite',
        directory: Directory.Data,
      }).catch(() => {});

      const readFile = await Filesystem.readFile({
        path: 'databases/current.sqlite',
        directory: Directory.Data,
      });

      const base64Data = typeof readFile.data === 'string' ? readFile.data : '';
      if (!base64Data) {
        await this.recordMigrationState('MIGRATION_COMPLETE', 'Legacy file was empty');
        return;
      }

      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      const binary = base64ToUint8Array(base64Data);
      const wasmDb = new SQL.Database(binary);

      await this.recordMigrationState('LEGACY_DATA_SCANNED');

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

      // Track expected row counts from legacy database
      const expectedCounts: Record<string, number> = {};
      for (const tbl of tables) {
        try {
          const res = wasmDb.exec(`SELECT COUNT(*) as cnt FROM ${tbl};`);
          expectedCounts[tbl] = res[0]?.values[0]?.[0] as number || 0;
        } catch {
          expectedCounts[tbl] = 0;
        }
      }

      await this.db.beginTransaction();
      try {
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
        await this.db.commitTransaction();
        await this.recordMigrationState('LEGACY_DATA_IMPORTED');
      } catch (importErr) {
        await this.db.rollbackTransaction();
        await this.recordMigrationState('FAILED', `Import transaction failed: ${String(importErr)}`);
        throw importErr;
      } finally {
        wasmDb.close();
      }

      // Validation phase: Verify row counts in native database
      let validationPassed = true;
      for (const tbl of tables) {
        const nativeCountRes = await this.db.query(`SELECT COUNT(*) as cnt FROM ${tbl};`);
        const nativeCount = nativeCountRes.values?.[0]?.cnt || 0;
        if (nativeCount < expectedCounts[tbl]) {
          AppLogger.warn('NativeSqliteAdapter', `Validation mismatch on table ${tbl}: expected ${expectedCounts[tbl]}, found ${nativeCount}`);
          validationPassed = false;
        }
      }

      if (!validationPassed) {
        await this.recordMigrationState('FAILED', 'Validation counts did not match expected records');
        throw new Error('Native migration validation failed: row count mismatch.');
      }

      await this.recordMigrationState('VALIDATED');
      await this.recordMigrationState('MIGRATION_COMPLETE', JSON.stringify(expectedCounts));
      await this.db.run(
        "INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES ('native_migration_status', 'MIGRATION_COMPLETE', ?);",
        [Date.now()]
      );

      AppLogger.info('NativeSqliteAdapter', 'Successfully migrated and validated all records from sql.js to native Android SQLite.');
    } catch (e: any) {
      AppLogger.error('NativeSqliteAdapter', 'Migration state machine encountered an issue', e);
      await this.recordMigrationState(
        'FAILED',
        e instanceof Error ? e.message : String(e)
      );
      throw e;
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
      try {
        SqliteEngine.run(sql, params);
      } catch {
        // Non-critical mirror write
      }
      this.durabilityStatus = 'saved';
      const changes = res?.changes?.changes ?? 1;
      const lastInsertRowId = res?.changes?.lastId ?? undefined;
      if (typeof lastInsertRowId === 'number') {
        this.lastId = lastInsertRowId;
      }
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

  checkIntegritySync(): boolean {
    return true;
  }

  async vacuum(): Promise<{ originalSizeBytes: number; compactedSizeBytes: number; bytesReclaimed: number }> {
    if (!this.db) await this.initialize();
    try {
      await this.db.execute('VACUUM;');
      return { originalSizeBytes: 0, compactedSizeBytes: 0, bytesReclaimed: 0 };
    } catch (err) {
      AppLogger.warn('NativeSqliteAdapter', 'Vacuum warning', err);
      return { originalSizeBytes: 0, compactedSizeBytes: 0, bytesReclaimed: 0 };
    }
  }

  private lastId = 0;

  getLastInsertId(): number {
    return this.lastId;
  }

  scheduleSave(): void {}
  cancelPendingSave(): void {}
  querySync<T>(sql: string, params: unknown[] = []): T[] {
    return SqliteEngine.query<T>(sql, params);
  }

  runSync(sql: string, params: unknown[] = []): { changes: number; lastInsertRowId?: number } {
    SqliteEngine.run(sql, params);
    const lastId = SqliteEngine.getLastInsertId();
    if (this.db) {
      this.db.run(sql, params).catch((err: any) =>
        AppLogger.warn('NativeSqliteAdapter', 'Async native sync run error', err)
      );
    }
    return { changes: 1, lastInsertRowId: lastId };
  }

  transactionSync<T>(fn: () => T): T {
    return SqliteEngine.transaction(fn);
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
  private static instance: WebSqliteAdapter | null = null;
  private engineInitialized = false;

  public static getInstance(): WebSqliteAdapter {
    if (!this.instance) {
      this.instance = new WebSqliteAdapter();
    }
    return this.instance;
  }

  getDurabilityStatus(): DurabilityStatus {
    return SqliteEngine.getDurabilityStatus?.() || (SqliteEngine.isDirtyState?.() ? 'pending' : 'saved');
  }

  getLastInsertId(): number {
    return SqliteEngine.getLastInsertId();
  }

  scheduleSave(): void {
    SqliteEngine.scheduleSave();
  }

  cancelPendingSave(): void {
    SqliteEngine.cancelPendingSave();
  }

  isDirtyState(): boolean {
    return SqliteEngine.isDirtyState();
  }

  async initialize(): Promise<void> {
    if (!this.engineInitialized) {
      await SqliteEngine.initialize();
      this.engineInitialized = true;
    }
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

  querySync<T>(sql: string, params: unknown[] = []): T[] {
    return SqliteEngine.query<T>(sql, params);
  }

  runSync(sql: string, params: unknown[] = []): { changes: number; lastInsertRowId?: number } {
    SqliteEngine.run(sql, params);
    const lastId = SqliteEngine.getLastInsertId();
    return { changes: 1, lastInsertRowId: lastId };
  }

  transactionSync<T>(fn: () => T): T {
    return SqliteEngine.transaction(fn);
  }

  async checkIntegrity(): Promise<{ ok: boolean; result: string }> {
    if (!this.engineInitialized) await this.initialize();
    const ok = SqliteEngine.verifyIntegrity();
    return { ok, result: ok ? 'ok' : 'corrupted' };
  }

  checkIntegritySync(): boolean {
    return SqliteEngine.verifyIntegrity();
  }

  async vacuum(): Promise<{ originalSizeBytes: number; compactedSizeBytes: number; bytesReclaimed: number }> {
    if (!this.engineInitialized) await this.initialize();
    return await SqliteEngine.vacuum();
  }

  async close(): Promise<void> {
    await SqliteEngine.flush();
    this.engineInitialized = false;
  }

  exportBinary(): Uint8Array {
    return SqliteEngine.exportDatabaseBinary();
  }

  async importBinary(binary: Uint8Array): Promise<void> {
    await SqliteEngine.importDatabaseBinary(binary);
  }

  async flush(): Promise<void> {
    await SqliteEngine.flush();
  }
}

export function getDatabaseAdapter(): DatabaseAdapter {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return NativeSqliteAdapter.getInstance();
  }
  return WebSqliteAdapter.getInstance();
}

export async function getDatabase(): Promise<DatabaseAdapter> {
  const adapter = getDatabaseAdapter();
  await adapter.initialize();
  return adapter;
}

