import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { AppLogger } from '../logger';
import { MIGRATIONS } from './schema';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { asErrorLike } from '../errorLike';

const DB_INDEXED_DB_NAME = 'vellumscribe_sqlite_db';
const DB_STORE_NAME = 'sqlite_binary';
const DB_RECORD_KEY = 'current_db_v1';
const DB_BACKUP_KEY = 'previous_db_v1';
const DB_LEGACY_KEY = 'authoritative_db_v1';

const NATIVE_DB_PATH = 'databases/current.sqlite';
const NATIVE_BACKUP_PATH = 'databases/previous.sqlite';
const NATIVE_LEGACY_PATH = 'databases/vellumscribe.sqlite';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, chunk as unknown as number[]));
  }
  return btoa(chunks.join(''));
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export interface RecoveryState {
  hasError: boolean;
  isRecovered: boolean;
  message?: string;
  corruptedBackupPath?: string;
  unrecoverableError?: string;
}

// Global memory fallback for Node test environments where indexedDB is not polyfilled
const globalMemoryFallback = (globalThis as any).__VELLUMSCRIBE_SQLITE_STORE__ || {
  binary: null as Uint8Array | null,
  previousBinary: null as Uint8Array | null,
  corruptedSnapshots: [] as Array<{ timestamp: number; data: Uint8Array }>,
};
(globalThis as any).__VELLUMSCRIBE_SQLITE_STORE__ = globalMemoryFallback;

/**
 * IndexedDB storage for SQLite binary database snapshots with previous/current crash recovery
 */
class SqliteIndexedDbStorage {
  private db: IDBDatabase | null = null;

  private isIndexedDbAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private async getDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_INDEXED_DB_NAME, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
          db.createObjectStore(DB_STORE_NAME);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  public async preserveCorruptedBinary(data: Uint8Array, timestamp: number): Promise<string> {
    const key = `corrupt_db_${timestamp}`;
    if (!this.isIndexedDbAvailable()) {
      if (!globalMemoryFallback.corruptedSnapshots) globalMemoryFallback.corruptedSnapshots = [];
      globalMemoryFallback.corruptedSnapshots.push({ timestamp, data });
      return key;
    }
    try {
      const db = await this.getDb();
      return new Promise((resolve) => {
        const tx = db.transaction(DB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(DB_STORE_NAME);
        store.put(data, key);
        tx.oncomplete = () => resolve(key);
        tx.onerror = () => resolve(key);
      });
    } catch {
      return key;
    }
  }

  public async loadBinary(): Promise<Uint8Array | null> {
    if (!this.isIndexedDbAvailable()) {
      return globalMemoryFallback.binary;
    }
    try {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE_NAME, 'readonly');
        const store = tx.objectStore(DB_STORE_NAME);
        
        // Try current first
        const req = store.get(DB_RECORD_KEY);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result instanceof Uint8Array ? req.result : new Uint8Array(req.result));
          } else {
            // Fallback to legacy key
            const legacyReq = store.get(DB_LEGACY_KEY);
            legacyReq.onsuccess = () => {
              if (legacyReq.result) {
                resolve(legacyReq.result instanceof Uint8Array ? legacyReq.result : new Uint8Array(legacyReq.result));
              } else {
                resolve(null);
              }
            };
            legacyReq.onerror = () => resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      AppLogger.warn('SqliteEngine', 'Failed to load binary from IndexedDB', e);
      return globalMemoryFallback.binary;
    }
  }

  public async loadBackupBinary(): Promise<Uint8Array | null> {
    if (!this.isIndexedDbAvailable()) {
      return globalMemoryFallback.previousBinary;
    }
    try {
      const db = await this.getDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE_NAME, 'readonly');
        const store = tx.objectStore(DB_STORE_NAME);
        const req = store.get(DB_BACKUP_KEY);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result instanceof Uint8Array ? req.result : new Uint8Array(req.result));
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      AppLogger.warn('SqliteEngine', 'Failed to load previous backup from IndexedDB', e);
      return globalMemoryFallback.previousBinary;
    }
  }

  public async saveBinary(data: Uint8Array): Promise<void> {
    // Retain previous copy before overwriting current
    if (globalMemoryFallback.binary) {
      globalMemoryFallback.previousBinary = globalMemoryFallback.binary;
    }
    globalMemoryFallback.binary = data;

    if (!this.isIndexedDbAvailable()) {
      return;
    }
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DB_STORE_NAME);

      // Read current to back up to previous
      const readReq = store.get(DB_RECORD_KEY);
      readReq.onsuccess = () => {
        if (readReq.result) {
          store.put(readReq.result, DB_BACKUP_KEY);
        }
        store.put(data, DB_RECORD_KEY);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async clear(): Promise<void> {
    globalMemoryFallback.binary = null;
    globalMemoryFallback.previousBinary = null;
    if (!this.isIndexedDbAvailable()) {
      return;
    }
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DB_STORE_NAME);
      store.delete(DB_RECORD_KEY);
      store.delete(DB_BACKUP_KEY);
      store.delete(DB_LEGACY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

const idbStorage = new SqliteIndexedDbStorage();

export class SqliteEngine {
  private static SQL: SqlJsStatic | null = null;
  private static db: Database | null = null;
  private static isInitialized = false;
  private static initPromise: Promise<void> | null = null;
  private static saveTimeout: any = null;
  private static isDirty = false;
  private static durabilityStatus: 'saved' | 'saving' | 'pending' | 'failed' = 'saved';
  private static transactionDepth = 0;
  private static recoveryState: RecoveryState = {
    hasError: false,
    isRecovered: false,
  };

  public static isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  public static getRecoveryState(): RecoveryState {
    return { ...this.recoveryState };
  }

  public static getLastInsertId(): number {
    const res = this.query<{ id: number }>('SELECT last_insert_rowid() as id');
    return res.length > 0 ? Number(res[0].id) : 0;
  }

  private static async getSqlJsInstance(): Promise<SqlJsStatic> {
    if (this.SQL) return this.SQL;

    let wasmBinary: ArrayBuffer | Uint8Array | undefined;

    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const wasmPath = path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');
        wasmBinary = fs.readFileSync(wasmPath);
      } catch (err) {
        AppLogger.warn('SqliteEngine', 'Could not read wasm binary in Node environment', err);
      }
    } else if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const response = await fetch('/sql-wasm.wasm');
        if (response.ok) {
          wasmBinary = await response.arrayBuffer();
        }
      } catch (err) {
        AppLogger.warn('SqliteEngine', 'Direct fetch for /sql-wasm.wasm failed, falling back to default locator', err);
      }
    }

    this.SQL = await initSqlJs({
      locateFile: (file) => {
        if (file.endsWith('.wasm')) {
          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            return `${process.cwd()}/node_modules/sql.js/dist/${file}`;
          }
          return '/sql-wasm.wasm';
        }
        return file;
      },
      ...(wasmBinary ? { wasmBinary: wasmBinary as any } : {}),
      printErr: (msg: string) => {
        if (
          typeof msg === 'string' &&
          (msg.includes('wasm streaming compile failed') || msg.includes('falling back to ArrayBuffer instantiation'))
        ) {
          return;
        }
        AppLogger.error('SqliteEngine', msg);
      },
    });

    return this.SQL;
  }

  public static async initialize(): Promise<void> {
    if (this.isInitialized && this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      AppLogger.info('SqliteEngine', 'Initializing SQLite WebAssembly Engine...');

      try {
        if (!this.SQL) {
          this.SQL = await this.getSqlJsInstance();
        }

        // Try to load existing database binary from disk / IndexedDB
        let binaryData: Uint8Array | null = null;
        let loadedFromBackup = false;

        if (Capacitor.isNativePlatform()) {
          try {
            const check = await Filesystem.readFile({
              path: NATIVE_DB_PATH,
              directory: Directory.Data,
            });
            if (check.data && typeof check.data === 'string') {
              binaryData = base64ToUint8Array(check.data);
            }
          } catch {
            // Check legacy path if current doesn't exist
            try {
              const legacyCheck = await Filesystem.readFile({
                path: NATIVE_LEGACY_PATH,
                directory: Directory.Data,
              });
              if (legacyCheck.data && typeof legacyCheck.data === 'string') {
                binaryData = base64ToUint8Array(legacyCheck.data);
              }
            } catch {
              // Neither exists yet
            }
          }
        }

        if (!binaryData) {
          binaryData = await idbStorage.loadBinary();
        }

        if (binaryData && binaryData.length > 0) {
          try {
            const testDb = new this.SQL.Database(binaryData);
            const check = testDb.exec('PRAGMA integrity_check;');
            if (check.length > 0 && check[0].values[0][0] === 'ok') {
              this.db = testDb;
              this.db.run('PRAGMA foreign_keys = ON;');
              AppLogger.info('SqliteEngine', `Loaded valid SQLite database (${binaryData.length} bytes)`);
            } else {
              throw new Error('Integrity check failed on primary database');
            }
          } catch (loadErr) {
            AppLogger.warn('SqliteEngine', 'Primary SQLite database corrupted or unreadable. Preserving artifact and initiating recovery...', loadErr);
            
            // 1. Preserve corrupt copy as timestamped artifact
            const timestamp = Date.now();
            const corruptPath = `databases/corrupt_${timestamp}.sqlite`;
            try {
              await idbStorage.preserveCorruptedBinary(binaryData, timestamp);
              if (Capacitor.isNativePlatform()) {
                const base64Corrupt = uint8ArrayToBase64(binaryData);
                await Filesystem.writeFile({
                  path: corruptPath,
                  data: base64Corrupt,
                  directory: Directory.Data,
                  recursive: true,
                });
              }
            } catch (presErr) {
              AppLogger.error('SqliteEngine', 'Failed to preserve corrupt database snapshot', presErr);
            }

            // 2. Attempt recovery from native previous.sqlite
            let recoveredDb: Database | null = null;
            if (Capacitor.isNativePlatform()) {
              try {
                const prevCheck = await Filesystem.readFile({
                  path: NATIVE_BACKUP_PATH,
                  directory: Directory.Data,
                });
                if (prevCheck.data && typeof prevCheck.data === 'string') {
                  const prevBytes = base64ToUint8Array(prevCheck.data);
                  const testPrevDb = new this.SQL.Database(prevBytes);
                  const check = testPrevDb.exec('PRAGMA integrity_check;');
                  if (check.length > 0 && check[0].values[0][0] === 'ok') {
                    recoveredDb = testPrevDb;
                  }
                }
              } catch {
                // Native previous not found or unreadable
              }
            }

            // 3. If native previous didn't recover, check IndexedDB backup
            if (!recoveredDb) {
              const backupBinary = await idbStorage.loadBackupBinary();
              if (backupBinary && backupBinary.length > 0) {
                try {
                  const testIdbDb = new this.SQL.Database(backupBinary);
                  const check = testIdbDb.exec('PRAGMA integrity_check;');
                  if (check.length > 0 && check[0].values[0][0] === 'ok') {
                    recoveredDb = testIdbDb;
                  }
                } catch { /* ignore */ }
              }
            }

            if (recoveredDb) {
              this.db = recoveredDb;
              this.db.run('PRAGMA foreign_keys = ON;');
              loadedFromBackup = true;
              this.recoveryState = {
                hasError: false,
                isRecovered: true,
                message: 'We recovered your most recent safe copy. Your original database has been preserved.',
                corruptedBackupPath: corruptPath,
              };
              AppLogger.info('SqliteEngine', 'CRASH RECOVERY SUCCESSFUL: Restored from previous valid SQLite backup.');
            } else {
              // 4. Do NOT silently wipe user data!
              this.recoveryState = {
                hasError: true,
                isRecovered: false,
                unrecoverableError: 'Your data could not be recovered automatically. Your existing database and backups have been preserved. Do not uninstall VellumScribe.',
                corruptedBackupPath: corruptPath,
              };
              AppLogger.error('SqliteEngine', 'Recovery from backup failed; opening isolated scratch session to preserve disk artifacts');
              this.db = new this.SQL.Database();
              this.db.run('PRAGMA foreign_keys = ON;');
            }
          }
        } else {
          this.db = new this.SQL.Database();
          this.db.run('PRAGMA foreign_keys = ON;');
          AppLogger.info('SqliteEngine', 'Created new in-memory SQLite database');
        }

        // Apply versioned migrations
        await this.runMigrations();

        // If recovered from backup, flush immediately to ensure current is repaired
        if (loadedFromBackup) {
          await this.flush();
        }

        // Attach lifecycle handlers for web and native to force saves before app background or close
        this.setupLifecycleHooks();

        this.isInitialized = true;
        AppLogger.info('SqliteEngine', 'SQLite Engine successfully initialized and migrations applied');
      } catch (_err) {
        const err = asErrorLike(_err);
        AppLogger.error('SqliteEngine', 'Fatal SQLite initialization error', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  private static async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Ensure foreign keys enabled
    this.db.run('PRAGMA foreign_keys = ON;');

    // Pre-migration backup snapshot for rollback safety
    const preMigrationBinary = this.db.export();

    // Ensure schema_migrations table exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT NOT NULL
      );
    `);

    // Check applied migrations
    const res = this.db.exec('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set<number>();
    if (res.length > 0 && res[0].values) {
      res[0].values.forEach((row) => appliedVersions.add(row[0] as number));
    }

    for (const migration of MIGRATIONS) {
      if (!appliedVersions.has(migration.version)) {
        AppLogger.info('SqliteEngine', `Applying SQLite migration v${migration.version}: ${migration.description}`);
        
        // Run migration in a transaction
        this.db.run('BEGIN TRANSACTION;');
        try {
          this.db.run(migration.sql);
          this.db.run(
            'INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, ?, ?);',
            [migration.version, Date.now(), migration.description]
          );
          this.db.run(`PRAGMA user_version = ${migration.version};`);
          this.db.run('COMMIT;');
          AppLogger.info('SqliteEngine', `Successfully applied migration v${migration.version}`);
        } catch (e) {
          this.db.run('ROLLBACK;');
          AppLogger.error('SqliteEngine', `Failed migration v${migration.version}, restoring pre-migration state`, e);
          try {
            this.db.close();
            this.db = new this.SQL!.Database(preMigrationBinary);
            this.db.run('PRAGMA foreign_keys = ON;');
          } catch { /* ignore */ }
          throw e;
        }
      }
    }

    this.markDirty();
  }

  public static getDb(): Database {
    if (!this.db) {
      throw new Error('SqliteEngine is not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute SQL query returning structured rows
   */
  public static query<T = any>(sql: string, params: any[] = []): T[] {
    const db = this.getDb();
    try {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as unknown as T);
      }
      stmt.free();
      return rows;
    } catch (_e) {
      const e = asErrorLike(_e);
      AppLogger.error('SqliteEngine', `Query execution error: "${sql}"`, { params, error: e?.message });
      throw e;
    }
  }

  /**
   * Execute write/DML statements
   */
  public static run(sql: string, params: any[] = []): void {
    const db = this.getDb();
    try {
      db.run(sql, params);
      this.markDirty();
    } catch (_e) {
      const e = asErrorLike(_e);
      AppLogger.error('SqliteEngine', `Run execution error: "${sql}"`, { params, error: e?.message });
      throw e;
    }
  }

  /**
   * Execute write/DML statements (alias for run)
   */
  public static execute(sql: string, params: any[] = []): void {
    this.run(sql, params);
  }

  /**
   * Run multiple operations inside an atomic transaction (supports nesting via SAVEPOINTs)
   */
  public static transaction<T>(action: () => T): T {
    const db = this.getDb();
    const isRoot = this.transactionDepth === 0;
    const savepointName = `sp_${this.transactionDepth}`;

    if (isRoot) {
      db.run('BEGIN TRANSACTION;');
    } else {
      db.run(`SAVEPOINT ${savepointName};`);
    }
    this.transactionDepth++;

    try {
      const result = action();
      this.transactionDepth--;
      if (isRoot) {
        db.run('COMMIT;');
        this.markDirty();
      } else {
        db.run(`RELEASE SAVEPOINT ${savepointName};`);
      }
      return result;
    } catch (e) {
      this.transactionDepth--;
      if (isRoot) {
        try {
          db.run('ROLLBACK;');
        } catch {
          // ignore rollback error if already rolled back
        }
        AppLogger.error('SqliteEngine', 'Transaction rolled back due to error', e);
      } else {
        try {
          db.run(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        } catch {
          // ignore savepoint rollback error
        }
      }
      throw e;
    }
  }

  /**
   * Run async operations inside an atomic transaction (supports nesting via SAVEPOINTs)
   */
  public static async transactionAsync<T>(action: () => Promise<T>): Promise<T> {
    const db = this.getDb();
    const isRoot = this.transactionDepth === 0;
    const savepointName = `sp_${this.transactionDepth}`;

    if (isRoot) {
      db.run('BEGIN TRANSACTION;');
    } else {
      db.run(`SAVEPOINT ${savepointName};`);
    }
    this.transactionDepth++;

    try {
      const result = await action();
      this.transactionDepth--;
      if (isRoot) {
        db.run('COMMIT;');
        this.markDirty();
      } else {
        db.run(`RELEASE SAVEPOINT ${savepointName};`);
      }
      return result;
    } catch (e) {
      this.transactionDepth--;
      if (isRoot) {
        try {
          db.run('ROLLBACK;');
        } catch {
          // ignore rollback error
        }
        AppLogger.error('SqliteEngine', 'Async transaction rolled back due to error', e);
      } else {
        try {
          db.run(`ROLLBACK TO SAVEPOINT ${savepointName};`);
        } catch {
          // ignore savepoint rollback error
        }
      }
      throw e;
    }
  }

  private static lifecycleHooksAttached = false;

  private static setupLifecycleHooks(): void {
    if (this.lifecycleHooksAttached) return;
    this.lifecycleHooksAttached = true;

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && this.isDirty) {
          AppLogger.info('SqliteEngine', 'Document hidden; triggering immediate SQLite persistence flush');
          this.flush().catch((e) => AppLogger.error('SqliteEngine', 'Visibility flush failed', e));
        }
      });

      window.addEventListener('pagehide', () => {
        if (this.isDirty) {
          this.flush().catch(() => {});
        }
      });

      window.addEventListener('beforeunload', () => {
        if (this.isDirty) {
          this.flush().catch(() => {});
        }
      });
    }

    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app')
        .then(({ App }) => {
          App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive && this.isDirty) {
              AppLogger.info('SqliteEngine', 'Native app backgrounded; triggering immediate SQLite persistence flush');
              this.flush().catch((e) => AppLogger.error('SqliteEngine', 'Background flush failed', e));
            }
          });
        })
        .catch(() => {
          // App plugin may not be linked in test/web runner
        });
    }
  }

  private static readonly SAVE_DEBOUNCE_MS = 2000;

  /**
   * Schedules debounced persistence flush to disk / IndexedDB.
   * Increased to 2000ms to prevent heavy main-thread binary exports during active typing.
   */
  public static scheduleSave(): void {
    this.isDirty = true;
    this.durabilityStatus = 'pending';
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.flush().catch((err) => {
        AppLogger.error('SqliteEngine', 'Background flush error', err);
      });
    }, this.SAVE_DEBOUNCE_MS);
  }

  public static markDirty(): void {
    this.scheduleSave();
  }

  /**
   * Current durability status of the SQLite database
   */
  public static getDurabilityStatus(): 'saved' | 'saving' | 'pending' | 'failed' {
    return this.durabilityStatus;
  }

  /**
   * Cancel any pending debounced persistence save
   */
  public static cancelPendingSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }

  /**
   * Check if unpersisted modifications exist in the SQLite database
   */
  public static isDirtyState(): boolean {
    return this.isDirty;
  }

  public static getIsDirty(): boolean {
    return this.isDirty;
  }

  /**
   * Alias for immediate, blocking persistence flush to disk/IndexedDB.
   */
  public static async flushImmediate(): Promise<void> {
    return this.flush();
  }

  /**
   * Immediate blocking flush to persistent storage (IndexedDB + Native Filesystem)
   * Automatically maintains previous.sqlite before overwriting current.sqlite
   */
  public static async flush(): Promise<void> {
    if (!this.db || !this.isDirty) return;
    this.cancelPendingSave();
    this.durabilityStatus = 'saving';

    try {
      const binary = this.db.export();
      await idbStorage.saveBinary(binary);

      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        // Native platform stores data directly via filesystem / SQLite adapter;
        // save periodic backup checkpoint safely
        try {
          const currentFile = await Filesystem.readFile({
            path: NATIVE_DB_PATH,
            directory: Directory.Data,
          });
          if (currentFile.data) {
            await Filesystem.writeFile({
              path: NATIVE_BACKUP_PATH,
              data: currentFile.data,
              directory: Directory.Data,
              recursive: true,
            });
          }
        } catch {
          // No current file to back up yet
        }

        const base64 = uint8ArrayToBase64(binary);
        await Filesystem.writeFile({
          path: NATIVE_DB_PATH,
          data: base64,
          directory: Directory.Data,
          recursive: true,
        });
      }

      this.isDirty = false;
      this.durabilityStatus = 'saved';
      AppLogger.debug('SqliteEngine', 'Flushed SQLite binary to persistent storage successfully');
    } catch (e) {
      this.durabilityStatus = 'failed';
      AppLogger.error('SqliteEngine', 'Failed to flush SQLite binary to storage', e);
      throw e;
    }
  }

  public static async flushToStorage(): Promise<void> {
    return this.flush();
  }

  /**
   * Raw Database Binary Export for Backups
   */
  public static exportDatabaseBinary(): Uint8Array {
    const db = this.getDb();
    return db.export();
  }

  /**
   * Restore/Import from a raw SQLite binary Uint8Array
   */
  public static async importDatabaseBinary(binary: Uint8Array): Promise<void> {
    if (!this.SQL) {
      this.SQL = await this.getSqlJsInstance();
    }

    const newDb = new this.SQL.Database(binary);

    // Verify integrity of imported database
    const check = newDb.exec('PRAGMA integrity_check;');
    if (!check.length || check[0].values[0][0] !== 'ok') {
      throw new Error('Imported database failed SQLite integrity check.');
    }

    if (this.db) {
      this.db.close();
    }
    this.db = newDb;
    await this.runMigrations();
    await this.flushToStorage();
    AppLogger.info('SqliteEngine', 'Successfully imported new SQLite database binary.');
  }

  /**
   * Quick boolean integrity check
   */
  public static verifyIntegrity(): boolean {
    return this.checkIntegrity().status === 'ok';
  }

  /**
   * Run SQLite Integrity Check
   */
  public static checkIntegrity(): { status: 'ok' | 'corrupted'; details: string } {
    try {
      const db = this.getDb();
      const res = db.exec('PRAGMA integrity_check;');
      if (res.length > 0 && res[0].values.length > 0) {
        const val = String(res[0].values[0][0]);
        return {
          status: val === 'ok' ? 'ok' : 'corrupted',
          details: val,
        };
      }
      return { status: 'corrupted', details: 'No response from PRAGMA integrity_check' };
    } catch (_e) {
      const e = asErrorLike(_e);
      return { status: 'corrupted', details: e?.message || 'Check failed' };
    }
  }

  /**
   * Reclaims unused space and defragments B-trees via VACUUM & PRAGMA optimize
   */
  public static async vacuum(): Promise<{ originalSizeBytes: number; compactedSizeBytes: number; bytesReclaimed: number }> {
    const db = this.getDb();
    const originalBinary = db.export();
    const originalSizeBytes = originalBinary.length;

    db.run('VACUUM;');
    db.run('PRAGMA optimize;');
    this.markDirty();
    await this.flush();

    const compactedBinary = db.export();
    const compactedSizeBytes = compactedBinary.length;
    const bytesReclaimed = Math.max(0, originalSizeBytes - compactedSizeBytes);

    AppLogger.info(
      'SqliteEngine',
      `Executed SQLite VACUUM & compaction. Size: ${originalSizeBytes} -> ${compactedSizeBytes} bytes (${bytesReclaimed} bytes reclaimed).`
    );

    return { originalSizeBytes, compactedSizeBytes, bytesReclaimed };
  }

  /**
   * Reset database instance for testing environments
   */
  public static async resetForTesting(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    globalMemoryFallback.binary = null;
    globalMemoryFallback.previousBinary = null;
    this.isInitialized = false;
    this.initPromise = null;
    await this.initialize();
  }
}
