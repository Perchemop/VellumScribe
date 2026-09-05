import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { AppLogger } from '../logger';
import { MIGRATIONS, CURRENT_SCHEMA_VERSION } from './schema';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const DB_INDEXED_DB_NAME = 'vellumscribe_sqlite_db';
const DB_STORE_NAME = 'sqlite_binary';
const DB_RECORD_KEY = 'current_db_v1';
const DB_BACKUP_KEY = 'previous_db_v1';
const DB_LEGACY_KEY = 'authoritative_db_v1';

const NATIVE_DB_PATH = 'databases/current.sqlite';
const NATIVE_BACKUP_PATH = 'databases/previous.sqlite';
const NATIVE_LEGACY_PATH = 'databases/vellumscribe.sqlite';

// Global memory fallback for Node test environments where indexedDB is not polyfilled
const globalMemoryFallback = (globalThis as any).__VELLUMSCRIBE_SQLITE_STORE__ || {
  binary: null as Uint8Array | null,
  previousBinary: null as Uint8Array | null,
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
  private static transactionDepth = 0;

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
            try {
              const path = require('path');
              return path.resolve(process.cwd(), 'node_modules/sql.js/dist', file);
            } catch {
              return `node_modules/sql.js/dist/${file}`;
            }
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
        console.error(msg);
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
              const binaryString = atob(check.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              binaryData = bytes;
            }
          } catch {
            // Check legacy path if current doesn't exist
            try {
              const legacyCheck = await Filesystem.readFile({
                path: NATIVE_LEGACY_PATH,
                directory: Directory.Data,
              });
              if (legacyCheck.data && typeof legacyCheck.data === 'string') {
                const binaryString = atob(legacyCheck.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                binaryData = bytes;
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
              AppLogger.info('SqliteEngine', `Loaded valid SQLite database (${binaryData.length} bytes)`);
            } else {
              throw new Error('Integrity check failed on primary database');
            }
          } catch (loadErr) {
            AppLogger.warn('SqliteEngine', 'Primary SQLite database corrupted or unreadable. Initiating recovery from previous snapshot...', loadErr);
            // Attempt recovery from previous.sqlite
            const backupBinary = await idbStorage.loadBackupBinary();
            if (backupBinary && backupBinary.length > 0) {
              try {
                const recoveredDb = new this.SQL.Database(backupBinary);
                const check = recoveredDb.exec('PRAGMA integrity_check;');
                if (check.length > 0 && check[0].values[0][0] === 'ok') {
                  this.db = recoveredDb;
                  loadedFromBackup = true;
                  AppLogger.info('SqliteEngine', `CRASH RECOVERY SUCCESSFUL: Restored from previous valid SQLite backup (${backupBinary.length} bytes)`);
                } else {
                  throw new Error('Backup database also corrupted');
                }
              } catch (backupErr) {
                AppLogger.error('SqliteEngine', 'Recovery from backup failed; creating fresh database', backupErr);
                this.db = new this.SQL.Database();
              }
            } else {
              AppLogger.error('SqliteEngine', 'No backup database found; creating fresh database');
              this.db = new this.SQL.Database();
            }
          }
        } else {
          this.db = new this.SQL.Database();
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
      } catch (err: any) {
        AppLogger.error('SqliteEngine', 'Fatal SQLite initialization error', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  private static async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

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
          this.db.run('COMMIT;');
          AppLogger.info('SqliteEngine', `Successfully applied migration v${migration.version}`);
        } catch (e) {
          this.db.run('ROLLBACK;');
          AppLogger.error('SqliteEngine', `Failed migration v${migration.version}`, e);
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
    } catch (e: any) {
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
    } catch (e: any) {
      AppLogger.error('SqliteEngine', `Run execution error: "${sql}"`, { params, error: e?.message });
      throw e;
    }
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

  /**
   * Schedules debounced persistence flush to disk / IndexedDB
   */
  public static scheduleSave(): void {
    this.isDirty = true;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.flush().catch((err) => {
        AppLogger.error('SqliteEngine', 'Background flush error', err);
      });
    }, 400); // 400ms debounce
  }

  public static markDirty(): void {
    this.scheduleSave();
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
   * Immediate blocking flush to persistent storage (IndexedDB + Native Filesystem)
   * Automatically maintains previous.sqlite before overwriting current.sqlite
   */
  public static async flush(): Promise<void> {
    if (!this.db || !this.isDirty) return;
    this.cancelPendingSave();

    try {
      const binary = this.db.export();
      await idbStorage.saveBinary(binary);

      if (Capacitor.isNativePlatform()) {
        // 1. Back up current.sqlite to previous.sqlite if current exists
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

        // 2. Persist new database binary to current.sqlite
        let binaryString = '';
        for (let i = 0; i < binary.length; i++) {
          binaryString += String.fromCharCode(binary[i]);
        }
        const base64 = btoa(binaryString);
        await Filesystem.writeFile({
          path: NATIVE_DB_PATH,
          data: base64,
          directory: Directory.Data,
          recursive: true,
        });
      }

      this.isDirty = false;
      AppLogger.debug('SqliteEngine', 'Flushed SQLite binary to persistent storage successfully');
    } catch (e) {
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
    } catch (e: any) {
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
