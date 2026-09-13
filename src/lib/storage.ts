import {
  EventRecord,
  NoteRecord,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
} from '../types';
import {
  DEMO_SAMPLE_EVENTS,
  DEMO_SAMPLE_NOTES,
} from './sampleData';
import {
  hashPin,
  verifyPin,
  encryptNotePayload,
  NotePayloadData,
} from './cryptoUtils';
import { SqliteEngine } from './sqlite/sqliteEngine';
import {
  SqliteRepository,
  SqliteStats,
  SearchOptions,
  SearchResult,
  NotesPageOptions,
  NotesPageResult,
} from './sqlite/sqliteRepository';
import { MigrationManager } from './sqlite/migrationManager';
import { AppLogger } from './logger';
import { ImportSafetyPipeline } from './importSafety';
import { MediaRepository } from './MediaRepository';
import { CloudBackupCrypto } from './cloudBackupCrypto';

/**
 * StorageManager: Authoritative SQLite Storage Gateway
 * Delivers synchronous in-memory read caching for UI rendering paired with
 * atomic transactional persistence in the SQLite relational database.
 */
export class StorageManager {
  private static isInitialized = false;
  private static initPromise: Promise<void> | null = null;

  // In-memory cache layer for instant synchronous React rendering
  private static eventsCache: EventRecord[] | null = null;
  private static notesCache: NoteRecord[] | null = null;
  private static recordingsCache: RecordingRecord[] | null = null;
  private static transcriptsCache: TranscriptRecord[] | null = null;
  private static ocrScansCache: OcrScanRecord[] | null = null;

  public static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      AppLogger.info('StorageManager', 'Bootstrapping SQLite Database Gateway...');
      try {
        await SqliteEngine.initialize();
        
        // Run safe legacy migration with pre-backup verification
        const report = await MigrationManager.checkAndMigrateLegacyData();
        if (report) {
          AppLogger.info('StorageManager', 'Legacy data migrated to SQLite', report);
        }

        // Hydrate memory caches from SQLite
        this.refreshCaches();

        // Migrate any unmigrated base64 sketches into MediaRepository
        const notes = this.getNotes();
        let changed = false;
        for (const note of notes) {
          if (note.sketch_data && !note.sketch_media_key && !note.is_locked) {
            try {
              const mediaKey = `sketch_${note.id}_${Date.now()}.png`;
              const response = await fetch(note.sketch_data);
              const blob = await response.blob();
              
              const { MediaRepository } = await import('./MediaRepository');
              await MediaRepository.putBinary(mediaKey, blob);
              
              note.sketch_media_key = mediaKey;
              note.sketch_data = undefined;
              SqliteRepository.saveNote(note);
              changed = true;
            } catch (e) {
              AppLogger.warn('StorageManager', `Failed to migrate sketch for note ${note.id}`, e);
            }
          }
        }

        if (changed) {
          this.refreshCaches();
        }

        this.isInitialized = true;
        AppLogger.info('StorageManager', 'SQLite Storage Gateway fully initialized and synchronized.');

        // Schedule non-blocking automated background maintenance during idle
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            if ('requestIdleCallback' in window) {
              (window as any).requestIdleCallback(() => {
                StorageManager.autoMaintenanceIfNeeded().catch(() => {});
              }, { timeout: 15000 });
            } else {
              StorageManager.autoMaintenanceIfNeeded().catch(() => {});
            }
          }, 3000);
        }
      } catch (err: any) {
        AppLogger.error('StorageManager', 'Initialization failed', err);
        throw err;
      }
    })();

    return this.initPromise;
  }

  public static refreshCaches(): void {
    try {
      this.notesCache = SqliteRepository.getAllNotes();
      this.eventsCache = SqliteRepository.getAllEvents();
      this.recordingsCache = SqliteRepository.getAllRecordings();
      this.transcriptsCache = SqliteRepository.getAllTranscripts();
      this.ocrScansCache = SqliteRepository.getAllOcrScans();
    } catch (e) {
      AppLogger.warn('StorageManager', 'Could not refresh caches from SQLite', e);
      if (!this.notesCache) this.notesCache = [];
      if (!this.eventsCache) this.eventsCache = [];
      if (!this.recordingsCache) this.recordingsCache = [];
      if (!this.transcriptsCache) this.transcriptsCache = [];
      if (!this.ocrScansCache) this.ocrScansCache = [];
    }
  }

  // --- SAFE PREFERENCE KV STORAGE (UI themes, filters, etc.) ---
  public static getItem<T = string>(key: string, fallback: T | null = null): T | null {
    try {
      const val = localStorage.getItem(key);
      if (val === null) return fallback;
      try {
        return JSON.parse(val) as T;
      } catch {
        return val as unknown as T;
      }
    } catch (e) {
      return fallback;
    }
  }

  public static setItem<T>(key: string, value: T): boolean {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (e) {
      AppLogger.warn('StorageManager', `Failed to write preference key "${key}"`, e);
      return false;
    }
  }

  public static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  public static hasItem(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  // --- OPT-IN DEMO DATA LOADER ---
  public static loadDemoData(): void {
    SqliteEngine.transaction(() => {
      for (const evt of DEMO_SAMPLE_EVENTS) {
        SqliteRepository.saveEvent(evt);
      }
      for (const note of DEMO_SAMPLE_NOTES) {
        SqliteRepository.saveNote(note);
      }
    });
    this.refreshCaches();
    AppLogger.info('StorageManager', 'Loaded demo notes into SQLite database.');
  }

  // --- EVENTS / NOTEBOOKS ---
  public static getEvents(): EventRecord[] {
    if (this.eventsCache !== null) {
      return this.eventsCache;
    }
    try {
      this.eventsCache = SqliteRepository.getAllEvents();
    } catch {
      this.eventsCache = [];
    }
    return this.eventsCache;
  }

  public static saveEvents(events: EventRecord[]): boolean {
    try {
      SqliteEngine.transaction(() => {
        for (const evt of events) {
          SqliteRepository.saveEvent(evt);
        }
      });
      this.eventsCache = events;
      return true;
    } catch (e) {
      AppLogger.error('StorageManager', 'Failed to save events in SQLite', e);
      return false;
    }
  }

  public static addEvent(event: Omit<EventRecord, 'id'>): EventRecord {
    const events = this.getEvents();
    const newId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1;
    const newEvent: EventRecord = { ...event, id: newId };
    SqliteRepository.saveEvent(newEvent);
    if (this.eventsCache !== null) {
      this.eventsCache.push(newEvent);
    }
    return newEvent;
  }

  public static updateEvent(id: number, updates: Partial<EventRecord>): EventRecord | null {
    const events = this.getEvents();
    const existing = events.find((e) => e.id === id);
    if (!existing) return null;
    const updated: EventRecord = { ...existing, ...updates };
    SqliteRepository.saveEvent(updated);
    if (this.eventsCache !== null) {
      const idx = this.eventsCache.findIndex((e) => e.id === id);
      if (idx !== -1) {
        this.eventsCache[idx] = updated;
      }
    }
    return updated;
  }

  public static deleteEvent(id: number): boolean {
    const events = this.getEvents();
    const existing = events.find((e) => e.id === id);
    if (!existing) return false;

    // Move associated notes to "General" notebook instead of cascade deletion
    const notes = this.getNotes();
    const notesToMove = notes.filter((n) => n.event_id === id);
    if (notesToMove.length > 0) {
      let generalEvent = events.find((e) => e.title.toLowerCase() === 'general' && e.id !== id);
      if (!generalEvent) {
        generalEvent = this.addEvent({
          title: 'General',
          event_date: new Date().toISOString().slice(0, 10),
          category: 'personal',
          color: '#6b7280',
        });
      }
      for (const note of notesToMove) {
        this.updateNote(note.id, { event_id: generalEvent.id });
      }
    }

    SqliteRepository.deleteEvent(id);
    if (this.eventsCache !== null) {
      this.eventsCache = this.eventsCache.filter((e) => e.id !== id);
    }
    return true;
  }

  // --- NOTES CRUD ---
  public static getNotes(): NoteRecord[] {
    if (this.notesCache !== null) {
      return this.notesCache;
    }
    try {
      this.notesCache = SqliteRepository.getAllNotes();
    } catch {
      this.notesCache = [];
    }
    return this.notesCache;
  }

  public static getActiveNotes(): NoteRecord[] {
    return this.getNotes().filter((n) => !n.status || n.status === 'active');
  }

  public static getArchivedNotes(): NoteRecord[] {
    return this.getNotes().filter((n) => n.status === 'archived');
  }

  public static getTrashNotes(): NoteRecord[] {
    return this.getNotes().filter((n) => n.status === 'trash');
  }

  public static saveNotes(notes: NoteRecord[]): boolean {
    try {
      SqliteEngine.transaction(() => {
        for (const note of notes) {
          SqliteRepository.saveNote(note);
        }
      });
      this.notesCache = notes;
      return true;
    } catch (e) {
      AppLogger.error('StorageManager', 'Failed to batch save notes to SQLite', e);
      return false;
    }
  }

  public static getNotesForEvent(eventId: number): NoteRecord[] {
    return this.getActiveNotes().filter((n) => n.event_id === eventId);
  }

  public static getNoteById(id: number): NoteRecord | undefined {
    return this.getNotes().find((n) => n.id === id);
  }

  public static addNote(note: Omit<NoteRecord, 'id'>): NoteRecord {
    const notes = this.getNotes();
    const newId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 101;
    const newNote: NoteRecord = {
      ...note,
      id: newId,
      status: note.status || 'active',
      note_type: note.note_type || 'text',
      checklist_items: note.checklist_items || [],
      created_at: note.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };
    SqliteRepository.saveNote(newNote);
    if (this.notesCache !== null) {
      this.notesCache = [newNote, ...this.notesCache];
    }
    return newNote;
  }

  public static updateNote(id: number, updates: Partial<NoteRecord>): NoteRecord | null {
    const existing = this.getNoteById(id);
    if (!existing) return null;
    const updated: NoteRecord = {
      ...existing,
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    SqliteRepository.saveNote(updated);
    if (this.notesCache !== null) {
      const idx = this.notesCache.findIndex((n) => n.id === id);
      if (idx !== -1) {
        this.notesCache[idx] = updated;
      } else {
        this.notesCache.push(updated);
      }
    }
    return updated;
  }

  /**
   * Fast field-specific updater for editor typing.
   * Updates only title and/or body in-place without triggering full relational joins.
   */
  public static updateNoteText(id: number, title?: string, body?: string): NoteRecord | null {
    const updated = SqliteRepository.updateNoteText(id, title, body);
    if (updated && this.notesCache) {
      const idx = this.notesCache.findIndex((n) => n.id === id);
      if (idx !== -1) {
        this.notesCache[idx] = updated;
      }
    }
    return updated;
  }

  public static archiveNote(id: number): NoteRecord | null {
    return this.updateNote(id, {
      status: 'archived',
      archived_at: new Date().toISOString(),
    });
  }

  public static unarchiveNote(id: number): NoteRecord | null {
    return this.updateNote(id, {
      status: 'active',
      archived_at: undefined,
    });
  }

  public static trashNote(id: number): NoteRecord | null {
    return this.updateNote(id, {
      status: 'trash',
      trashed_at: new Date().toISOString(),
    });
  }

  public static restoreNote(id: number): NoteRecord | null {
    return this.updateNote(id, {
      status: 'active',
      trashed_at: undefined,
    });
  }

  public static deleteNote(id: number): boolean {
    try {
      SqliteRepository.deleteNote(id);
      if (this.notesCache !== null) {
        this.notesCache = this.notesCache.filter((n) => n.id !== id);
      }
      return true;
    } catch (e) {
      AppLogger.error('StorageManager', `Failed to delete note ${id}`, e);
      return false;
    }
  }

  public static duplicateNote(id: number): NoteRecord | null {
    const existing = this.getNoteById(id);
    if (!existing) return null;
    const duplicated = this.addNote({
      ...existing,
      title: existing.title ? `${existing.title} (Copy)` : 'Untitled Note (Copy)',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_pinned: false,
      status: 'active',
    });
    return duplicated;
  }

  public static togglePinNote(id: number): NoteRecord | null {
    const existing = this.getNoteById(id);
    if (!existing) return null;
    return this.updateNote(id, { is_pinned: !existing.is_pinned });
  }

  public static bulkArchiveNotes(ids: number[]): number {
    let count = 0;
    const now = new Date().toISOString();
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        const note = this.getNoteById(id);
        if (note) {
          SqliteRepository.saveNote({ ...note, status: 'archived', archived_at: now });
          if (this.notesCache !== null) {
            const idx = this.notesCache.findIndex((n) => n.id === id);
            if (idx !== -1) {
              this.notesCache[idx] = { ...this.notesCache[idx], status: 'archived', archived_at: now };
            }
          }
          count++;
        }
      }
    });
    return count;
  }

  public static bulkDeleteNotes(ids: number[]): number {
    let count = 0;
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        SqliteRepository.deleteNote(id);
        count++;
      }
    });
    if (this.notesCache !== null) {
      const idSet = new Set(ids);
      this.notesCache = this.notesCache.filter((n) => !idSet.has(n.id));
    }
    return count;
  }

  public static async cleanOrphanedMedia(): Promise<{ scannedKeys: number; cleanedCount: number }> {
    try {
      const allKeys = await MediaRepository.listAllKeys();
      if (allKeys.length === 0) return { scannedKeys: 0, cleanedCount: 0 };

      const notes = this.getNotes();
      const recordings = this.getRecordings();
      const scans = this.getOcrScans();

      const activeMediaKeys = new Set<string>();
      for (const n of notes) {
        if (n.sketch_media_key) activeMediaKeys.add(n.sketch_media_key);
      }
      for (const r of recordings) {
        if (r.media_key) activeMediaKeys.add(r.media_key);
      }
      for (const s of scans) {
        if (s.media_key) activeMediaKeys.add(s.media_key);
      }

      let cleanedCount = 0;
      for (const key of allKeys) {
        if (!activeMediaKeys.has(key)) {
          await MediaRepository.deleteBinary(key);
          cleanedCount++;
        }
      }
      AppLogger.info('StorageManager', `Cleaned ${cleanedCount} orphaned media assets out of ${allKeys.length} total keys.`);
      return { scannedKeys: allKeys.length, cleanedCount };
    } catch (err) {
      AppLogger.error('StorageManager', 'Failed to clean orphaned media', err);
      return { scannedKeys: 0, cleanedCount: 0 };
    }
  }

  // --- SQLITE FULL-TEXT SEARCH ---
  public static searchNotes(options: SearchOptions): NoteRecord[] {
    try {
      return SqliteRepository.searchNotes(options);
    } catch (e) {
      AppLogger.warn('StorageManager', 'SQLite search fallback', e);
      const query = options.query.toLowerCase();
      return this.getActiveNotes().filter(
        (n) =>
          (n.title && n.title.toLowerCase().includes(query)) ||
          (n.body && n.body.toLowerCase().includes(query))
      );
    }
  }

  public static searchNotesWithCount(options: SearchOptions): SearchResult {
    try {
      return SqliteRepository.searchNotesWithCount(options);
    } catch (e) {
      AppLogger.warn('StorageManager', 'SQLite searchWithCount fallback', e);
      const notes = this.searchNotes(options);
      return { notes, totalCount: notes.length };
    }
  }

  public static getNotesPage(options: NotesPageOptions = {}): NotesPageResult {
    try {
      return SqliteRepository.getNotesPage(options);
    } catch (e) {
      AppLogger.warn('StorageManager', 'SQLite getNotesPage fallback', e);
      const all = this.getActiveNotes();
      const page = options.page || 1;
      const pageSize = options.pageSize || 50;
      const totalPages = Math.ceil(all.length / pageSize) || 1;
      const offset = (page - 1) * pageSize;
      return {
        notes: all.slice(offset, offset + pageSize),
        totalCount: all.length,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      };
    }
  }

  // --- SECURITY, LOCKS & PAYLOAD ENCRYPTION ---
  public static async verifyAndUnlockNote(
    note: NoteRecord,
    enteredPin: string
  ): Promise<{ success: boolean; payload?: NotePayloadData; sessionKey?: CryptoKey }> {
    const isMatch = await verifyPin(
      enteredPin,
      note.pin_hash,
      note.pin_salt,
      note.lock_pin
    );

    if (!isMatch) {
      return { success: false };
    }

    // Modern V2 / V1 encrypted payload decryption
    if (note.encrypted_payload && note.pin_salt) {
      const { deriveEncryptionKey, decryptNotePayloadV2, decryptNotePayload, migrateLegacyV0NotePayload, encryptNotePayloadV2 } = await import('./cryptoUtils');
      const sessionKey = await deriveEncryptionKey(enteredPin, note.pin_salt);
      if (sessionKey) {
        let decrypted = await decryptNotePayloadV2(note.encrypted_payload, sessionKey);
        if (!decrypted) {
          decrypted = await decryptNotePayload(note.encrypted_payload, enteredPin, note.pin_salt);
        }
        if (!decrypted) {
          // Check for legacy v0 XOR payload and automatically migrate to AES-256-GCM v2
          try {
            const rawParsed = JSON.parse(note.encrypted_payload);
            if (rawParsed.v === 0) {
              decrypted = await migrateLegacyV0NotePayload(note.encrypted_payload, enteredPin, note.pin_salt);
              if (decrypted) {
                const reEncrypted = await encryptNotePayloadV2(decrypted, sessionKey);
                SqliteEngine.run('UPDATE notes SET encrypted_payload = ? WHERE id = ?', [reEncrypted, note.id]);
                note.encrypted_payload = reEncrypted;
                AppLogger.info('StorageManager', `Migrated note ${note.id} from legacy v0 XOR to AES-256-GCM v2.`);
              }
            }
          } catch {}
        }
        if (decrypted) {
          return { success: true, payload: decrypted, sessionKey };
        }
      }
    }

    return {
      success: true,
      payload: {
        body: note.body,
        checklist_items: note.checklist_items,
        sketch_data: note.sketch_data,
      },
    };
  }

  public static async lockNoteTransactionally(
    id: number,
    pin: string,
    currentPayload?: NotePayloadData,
    lockMode: 'standard' | 'private' = 'standard',
    securityType: 'pin' | 'passphrase' = 'pin'
  ): Promise<NoteRecord | null> {
    if (!pin || !pin.trim()) {
      throw new Error('Lock credential is required.');
    }

    const note = this.getNoteById(id);
    if (!note) return null;

    const { hashPin, deriveEncryptionKey, encryptNotePayloadV2, generateSalt } = await import('./cryptoUtils');
    const { SecureMediaRepository, MediaRepository } = await import('./MediaRepository');

    const salt = generateSalt();
    const { hash } = await hashPin(pin, salt);
    const key = await deriveEncryptionKey(pin, salt);
    if (!key) {
      throw new Error('Failed to derive encryption key from credentials.');
    }

    // Enumerate all associated attachments
    const mediaFiles = SqliteEngine.query<{ media_key: string }>('SELECT media_key FROM media_files WHERE note_id = ?', [id]);
    const recordings = this.getRecordings().filter((r) => r.note_id === id && r.media_key);
    const ocrScans = this.getOcrScans().filter((o) => o.note_id === id && o.media_key);
    const allMediaKeys = new Set<string>();
    mediaFiles.forEach((m) => m.media_key && allMediaKeys.add(m.media_key));
    recordings.forEach((r) => r.media_key && allMediaKeys.add(r.media_key));
    ocrScans.forEach((o) => o.media_key && allMediaKeys.add(o.media_key));
    if (note.sketch_media_key) allMediaKeys.add(note.sketch_media_key);

    const attachmentReferences = Array.from(allMediaKeys);

    // Staged fail-closed media encryption pipeline
    const stagedEncrypted = new Map<string, { blob: Blob; plainChecksum: string; cipherChecksum: string; size: number }>();
    const rollbackPlaintextBlobs = new Map<string, Blob>();

    const computeBlobSha256 = async (blob: Blob): Promise<string> => {
      try {
        const buf = await blob.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        return '';
      }
    };

    try {
      for (const mediaKey of attachmentReferences) {
        const rawBlob = await MediaRepository.getBinary(mediaKey);
        if (rawBlob) {
          rollbackPlaintextBlobs.set(mediaKey, rawBlob);

          let isAlreadyEncrypted = false;
          try {
            const headerText = await rawBlob.slice(0, 50).text();
            if (headerText.includes('vellum_enc_v1')) isAlreadyEncrypted = true;
          } catch {}

          if (!isAlreadyEncrypted) {
            const plainChecksum = await computeBlobSha256(rawBlob);
            const encryptedBlob = await SecureMediaRepository.encryptBlobWithKey(rawBlob, key);

            // Verify roundtrip decryption immediately
            const roundTrip = await SecureMediaRepository.decryptBlobWithKey(encryptedBlob, key);
            if (!roundTrip || roundTrip.size !== rawBlob.size) {
              throw new Error(`Integrity verification failed for encrypted attachment: ${mediaKey}`);
            }
            const cipherChecksum = await computeBlobSha256(encryptedBlob);
            stagedEncrypted.set(mediaKey, {
              blob: encryptedBlob,
              plainChecksum,
              cipherChecksum,
              size: encryptedBlob.size,
            });
          }
        }
      }

      const payload: NotePayloadData = {
        payload_version: 1,
        title: lockMode === 'private' ? (currentPayload?.title || note.title) : undefined,
        body: currentPayload?.body !== undefined ? currentPayload.body : note.body,
        checklist_items: currentPayload?.checklist_items !== undefined ? currentPayload.checklist_items : note.checklist_items,
        sketch_data: currentPayload?.sketch_data !== undefined ? currentPayload.sketch_data : note.sketch_data,
        sketch_media_key: note.sketch_media_key,
        attachment_references: attachmentReferences,
        tags: lockMode === 'private' ? (currentPayload?.tags || note.tags) : undefined,
        protected_metadata: {
          security_type: securityType,
          reminder_at: note.reminder_at,
          location_name: note.location_name,
          latitude: note.latitude,
          longitude: note.longitude,
        },
        lock_mode: lockMode,
      };

      const encryptedPayload = await encryptNotePayloadV2(payload, key);

      // Commit encrypted media blobs to disk
      for (const [mediaKey, item] of stagedEncrypted.entries()) {
        await MediaRepository.putBinary(mediaKey, item.blob);
        SqliteEngine.run(
          `UPDATE media_files 
           SET encryption_state = 'encrypted', encryption_version = 1, byte_size = ?, plaintext_checksum = ?, ciphertext_checksum = ? 
           WHERE media_key = ?`,
          [item.size, item.plainChecksum, item.cipherChecksum, mediaKey]
        );
      }

      // Atomically commit note locking to SQLite
      return this.updateNote(id, {
        is_locked: true,
        lock_mode: lockMode,
        security_type: securityType,
        pin_hash: hash,
        pin_salt: salt,
        encrypted_payload: encryptedPayload,
        title: lockMode === 'private' ? '🔒 Locked Note' : note.title,
        body: '',
        checklist_items: [],
        sketch_data: undefined,
        tags: lockMode === 'private' ? [] : note.tags,
      });
    } catch (err: any) {
      AppLogger.error('StorageManager', 'Note lock pipeline failed; executing fail-closed rollback.', err);
      // Rollback media blobs back to plaintext
      for (const [mediaKey, origBlob] of rollbackPlaintextBlobs.entries()) {
        try {
          await MediaRepository.putBinary(mediaKey, origBlob);
          SqliteEngine.run(
            `UPDATE media_files SET encryption_state = 'plaintext', encryption_version = 0, byte_size = ?, plaintext_checksum = NULL, ciphertext_checksum = NULL WHERE media_key = ?`,
            [origBlob.size, mediaKey]
          );
        } catch {}
      }
      throw new Error(`Note lock failed: ${err?.message || 'Encryption error'}. Note remains safely unlocked.`);
    }
  }

  public static async setNotePinLock(
    id: number,
    pin: string,
    currentPayload?: NotePayloadData,
    lockMode: 'standard' | 'private' = 'standard',
    securityType: 'pin' | 'passphrase' = 'pin'
  ): Promise<NoteRecord | null> {
    return this.lockNoteTransactionally(id, pin, currentPayload, lockMode, securityType);
  }

  public static async removeNotePinLock(id: number, enteredPin: string): Promise<NoteRecord | null> {
    const note = this.getNoteById(id);
    if (!note) return null;

    const verifyResult = await this.verifyAndUnlockNote(note, enteredPin);
    if (!verifyResult.success || !verifyResult.payload) {
      return null;
    }

    // Decrypt any encrypted media binaries back to plaintext if session key is available
    if (verifyResult.sessionKey) {
      const rollbackEncryptedBlobs = new Map<string, Blob>();
      try {
        const mediaFiles = SqliteEngine.query<{ media_key: string }>('SELECT media_key FROM media_files WHERE note_id = ?', [id]);
        const recordings = this.getRecordings().filter((r) => r.note_id === id && r.media_key);
        const ocrScans = this.getOcrScans().filter((o) => o.note_id === id && o.media_key);
        const allMediaKeys = new Set<string>();
        mediaFiles.forEach((m) => m.media_key && allMediaKeys.add(m.media_key));
        recordings.forEach((r) => r.media_key && allMediaKeys.add(r.media_key));
        ocrScans.forEach((o) => o.media_key && allMediaKeys.add(o.media_key));
        if (note.sketch_media_key) allMediaKeys.add(note.sketch_media_key);

        const { SecureMediaRepository, MediaRepository } = await import('./MediaRepository');
        const decryptedBinaries = new Map<string, Blob>();

        for (const mediaKey of allMediaKeys) {
          const encBlob = await MediaRepository.getBinary(mediaKey);
          if (encBlob) {
            rollbackEncryptedBlobs.set(mediaKey, encBlob);
            const decryptedBlob = await SecureMediaRepository.getEncryptedWithKey(mediaKey, verifyResult.sessionKey);
            if (!decryptedBlob) {
              throw new Error(`Failed to decrypt attachment binary: ${mediaKey}`);
            }
            decryptedBinaries.set(mediaKey, decryptedBlob);
          }
        }

        // Commit decrypted plaintext binaries
        for (const [mediaKey, decBlob] of decryptedBinaries.entries()) {
          await MediaRepository.putBinary(mediaKey, decBlob);
          SqliteEngine.run(
            `UPDATE media_files SET encryption_state = 'plaintext', encryption_version = 0, byte_size = ?, plaintext_checksum = NULL, ciphertext_checksum = NULL WHERE media_key = ?`,
            [decBlob.size, mediaKey]
          );
        }
      } catch (e: any) {
        AppLogger.error('StorageManager', 'Associated media decryption during note unlock failed; rolling back', e);
        const { MediaRepository } = await import('./MediaRepository');
        for (const [mediaKey, encBlob] of rollbackEncryptedBlobs.entries()) {
          try {
            await MediaRepository.putBinary(mediaKey, encBlob);
          } catch {}
        }
        throw new Error(`Failed to unlock note: Attachment decryption error (${e?.message || 'Decryption failed'}). Note remains locked.`);
      }
    }

    return this.updateNote(id, {
      is_locked: false,
      lock_mode: undefined,
      security_type: undefined,
      pin_hash: undefined,
      pin_salt: undefined,
      encrypted_payload: undefined,
      lock_pin: undefined,
      title: verifyResult.payload.title || (note.title === '🔒 Locked Note' ? 'Untitled Note' : note.title),
      body: verifyResult.payload.body,
      checklist_items: verifyResult.payload.checklist_items || [],
      sketch_data: verifyResult.payload.sketch_data || undefined,
      tags: verifyResult.payload.tags || note.tags,
    });
  }

  public static async saveUnlockedNote(
    id: number,
    updates: Partial<NoteRecord>,
    pinHeld?: string
  ): Promise<NoteRecord | null> {
    const note = this.getNoteById(id);
    if (!note) return null;

    if (note.is_locked) {
      const { UnlockSessionManager } = await import('./UnlockSessionManager');
      const sessionKey = UnlockSessionManager.getSessionKey(id);
      const { encryptNotePayloadV2, encryptNotePayload } = await import('./cryptoUtils');

      const isPrivate = note.lock_mode === 'private';
      let encryptedPayload: string | null = null;
      const payload: NotePayloadData = {
        title: isPrivate ? (updates.title !== undefined ? updates.title : note.title) : undefined,
        body: updates.body !== undefined ? updates.body : note.body,
        checklist_items: updates.checklist_items !== undefined ? updates.checklist_items : note.checklist_items,
        sketch_data: updates.sketch_data !== undefined ? updates.sketch_data : note.sketch_data,
        tags: isPrivate ? (updates.tags !== undefined ? updates.tags : note.tags) : undefined,
        lock_mode: note.lock_mode,
      };

      if (sessionKey) {
        encryptedPayload = await encryptNotePayloadV2(payload, sessionKey);
      } else if (pinHeld && note.pin_salt) {
        encryptedPayload = await encryptNotePayload(payload, pinHeld, note.pin_salt);
      } else {
        throw new Error('No active unlock session for locked note save.');
      }

      const sanitizedUpdates = { ...updates };
      delete sanitizedUpdates.body;
      delete sanitizedUpdates.checklist_items;
      delete sanitizedUpdates.sketch_data;
      if (isPrivate) {
        delete sanitizedUpdates.title;
        delete sanitizedUpdates.tags;
      }
      return this.updateNote(id, {
        ...sanitizedUpdates,
        encrypted_payload: encryptedPayload,
        title: isPrivate ? '🔒 Locked Note' : (updates.title !== undefined ? updates.title : note.title),
        body: '',
        checklist_items: [],
        sketch_data: undefined,
        tags: isPrivate ? [] : (updates.tags !== undefined ? updates.tags : note.tags),
      });
    }

    return this.updateNote(id, updates);
  }

  public static async unlockNoteWithPin(note: NoteRecord, enteredPin: string): Promise<boolean> {
    return verifyPin(enteredPin, note.pin_hash, note.pin_salt, note.lock_pin);
  }

  // --- BATCH NOTE OPERATIONS ---
  public static batchTrashNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const now = new Date().toISOString();
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        this.updateNote(id, { status: 'trash', trashed_at: now });
      }
    });
    return ids.length;
  }

  public static batchRestoreNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        this.updateNote(id, { status: 'active', trashed_at: undefined });
      }
    });
    return ids.length;
  }

  public static batchArchiveNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const now = new Date().toISOString();
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        this.updateNote(id, { status: 'archived', archived_at: now });
      }
    });
    return ids.length;
  }

  public static batchUnarchiveNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        this.updateNote(id, { status: 'active', archived_at: undefined });
      }
    });
    return ids.length;
  }

  public static batchDeleteNotesPermanently(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        SqliteRepository.deleteNote(id);
      }
    });
    if (this.notesCache !== null) {
      const idSet = new Set(ids);
      this.notesCache = this.notesCache.filter((n) => !idSet.has(n.id));
    }
    return ids.length;
  }

  public static batchPinNotes(ids: number[], isPinned: boolean): number {
    if (!ids || ids.length === 0) return 0;
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        this.updateNote(id, { is_pinned: isPinned });
      }
    });
    return ids.length;
  }

  public static batchMoveNotes(ids: number[], newEventId: number): number {
    if (!ids || ids.length === 0) return 0;
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        this.updateNote(id, { event_id: newEventId });
      }
    });
    return ids.length;
  }

  public static batchColorNotes(ids: number[], color: string): number {
    if (!ids || ids.length === 0) return 0;
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        this.updateNote(id, { color: color || undefined });
      }
    });
    return ids.length;
  }

  public static batchAddTagToNotes(ids: number[], tag: string): number {
    if (!ids || ids.length === 0 || !tag.trim()) return 0;
    const cleanTag = tag.trim().replace(/^#/, '');
    SqliteEngine.transaction(() => {
      for (const id of ids) {
        const note = this.getNoteById(id);
        if (note) {
          const tags = note.tags || [];
          if (!tags.includes(cleanTag)) {
            this.updateNote(id, { tags: [...tags, cleanTag] });
          }
        }
      }
    });
    return ids.length;
  }

  public static batchDuplicateNotes(ids: number[]): NoteRecord[] {
    if (!ids || ids.length === 0) return [];
    const allNotes = this.getNotes();
    const created: NoteRecord[] = [];
    for (const id of ids) {
      const target = allNotes.find((n) => n.id === id);
      if (target) {
        const { id: _, ...rest } = target;
        const copy = this.addNote({
          ...rest,
          title: `${target.title || 'Untitled'} (Copy)`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        created.push(copy);
      }
    }
    return created;
  }

  public static async batchLockNotes(ids: number[], pin: string): Promise<number> {
    if (!ids || ids.length === 0 || !pin) return 0;
    let count = 0;

    for (const id of ids) {
      const locked = await this.setNotePinLock(id, pin, undefined, 'standard', 'pin');
      if (locked) {
        count++;
      }
    }
    return count;
  }

  public static async batchUnlockNotes(
    ids: number[],
    pin: string
  ): Promise<{ unlockedCount: number; failedIds: number[] }> {
    if (!ids || ids.length === 0 || !pin) {
      return { unlockedCount: 0, failedIds: ids || [] };
    }

    let unlockedCount = 0;
    const failedIds: number[] = [];

    for (const id of ids) {
      const note = this.getNoteById(id);
      if (note) {
        if (!note.is_locked) continue;
        const verifyResult = await this.verifyAndUnlockNote(note, pin);
        if (verifyResult.success && verifyResult.payload) {
          this.updateNote(id, {
            is_locked: false,
            pin_hash: undefined,
            pin_salt: undefined,
            encrypted_payload: undefined,
            body: verifyResult.payload.body,
            checklist_items: verifyResult.payload.checklist_items || [],
            sketch_data: verifyResult.payload.sketch_data || undefined,
          });
          unlockedCount++;
        } else {
          failedIds.push(id);
        }
      }
    }

    return { unlockedCount, failedIds };
  }

  // --- RECORDINGS, TRANSCRIPTS, OCR ---
  public static getRecordings(): RecordingRecord[] {
    if (this.recordingsCache !== null) return this.recordingsCache;
    try {
      this.recordingsCache = SqliteRepository.getAllRecordings();
    } catch {
      this.recordingsCache = [];
    }
    return this.recordingsCache;
  }

  public static saveRecordings(recordings: RecordingRecord[]): boolean {
    SqliteEngine.transaction(() => {
      for (const rec of recordings) {
        SqliteRepository.saveRecording(rec);
      }
    });
    this.refreshCaches();
    return true;
  }

  public static getRecordingsForNote(noteId: number): RecordingRecord[] {
    return this.getRecordings().filter((r) => r.note_id === noteId);
  }

  public static addRecording(rec: Omit<RecordingRecord, 'id'>): RecordingRecord {
    const recordings = this.getRecordings();
    const newId = recordings.length > 0 ? Math.max(...recordings.map((r) => r.id)) + 1 : 201;
    const newRec: RecordingRecord = {
      ...rec,
      id: newId,
      created_at: rec.created_at || new Date().toISOString(),
    };
    SqliteRepository.saveRecording(newRec);
    this.refreshCaches();
    return newRec;
  }

  public static deleteRecording(id: number): boolean {
    SqliteEngine.run('DELETE FROM recordings WHERE id = ?', [id]);
    SqliteEngine.run('DELETE FROM transcripts WHERE recording_id = ?', [id]);
    this.refreshCaches();
    return true;
  }

  public static getTranscripts(): TranscriptRecord[] {
    if (this.transcriptsCache !== null) return this.transcriptsCache;
    try {
      this.transcriptsCache = SqliteRepository.getAllTranscripts();
    } catch {
      this.transcriptsCache = [];
    }
    return this.transcriptsCache;
  }

  public static saveTranscripts(transcripts: TranscriptRecord[]): boolean {
    SqliteEngine.transaction(() => {
      for (const tr of transcripts) {
        SqliteRepository.saveTranscript(tr);
      }
    });
    this.refreshCaches();
    return true;
  }

  public static getTranscriptForRecording(recordingId: number): TranscriptRecord | undefined {
    return this.getTranscripts().find((t) => t.recording_id === recordingId);
  }

  public static addTranscript(t: Omit<TranscriptRecord, 'id'>): TranscriptRecord {
    const transcripts = this.getTranscripts();
    const newId = transcripts.length > 0 ? Math.max(...transcripts.map((x) => x.id)) + 1 : 301;
    const newTranscript: TranscriptRecord = {
      ...t,
      id: newId,
      created_at: t.created_at || new Date().toISOString(),
    };
    SqliteRepository.saveTranscript(newTranscript);
    this.refreshCaches();
    return newTranscript;
  }

  public static getOcrScans(): OcrScanRecord[] {
    if (this.ocrScansCache !== null) return this.ocrScansCache;
    try {
      this.ocrScansCache = SqliteRepository.getAllOcrScans();
    } catch {
      this.ocrScansCache = [];
    }
    return this.ocrScansCache;
  }

  public static saveOcrScans(scans: OcrScanRecord[]): boolean {
    SqliteEngine.transaction(() => {
      for (const s of scans) {
        SqliteRepository.saveOcrScan(s);
      }
    });
    this.refreshCaches();
    return true;
  }

  public static getOcrScansForNote(noteId: number): OcrScanRecord[] {
    return this.getOcrScans().filter((s) => s.note_id === noteId);
  }

  public static addOcrScan(scan: Omit<OcrScanRecord, 'id'>): OcrScanRecord {
    const scans = this.getOcrScans();
    const newId = scans.length > 0 ? Math.max(...scans.map((s) => s.id)) + 1 : 401;
    const newScan: OcrScanRecord = {
      ...scan,
      id: newId,
      created_at: scan.created_at || new Date().toISOString(),
    };
    SqliteRepository.saveOcrScan(newScan);
    this.refreshCaches();
    return newScan;
  }

  public static deleteOcrScan(id: number): boolean {
    SqliteEngine.run('DELETE FROM ocr_scans WHERE id = ?', [id]);
    this.refreshCaches();
    return true;
  }

  // --- STATS & SQLITE HEALTH ---
  public static getStorageStats(): {
    totalNotes: number;
    activeNotes: number;
    archivedNotes: number;
    trashedNotes: number;
    totalRecordings: number;
    totalTranscripts: number;
    totalOcrScans: number;
    estimatedBytesUsed: number;
  } {
    const notes = this.getNotes();
    const stats = SqliteRepository.getDatabaseStats();

    return {
      totalNotes: notes.length,
      activeNotes: notes.filter((n) => !n.status || n.status === 'active').length,
      archivedNotes: notes.filter((n) => n.status === 'archived').length,
      trashedNotes: notes.filter((n) => n.status === 'trash').length,
      totalRecordings: stats.recordingsCount,
      totalTranscripts: stats.transcriptsCount,
      totalOcrScans: stats.ocrScansCount,
      estimatedBytesUsed: stats.databaseSizeBytes,
    };
  }

  public static getSqliteStats(): SqliteStats {
    return SqliteRepository.getDatabaseStats();
  }

  public static checkDatabaseIntegrity(): { status: 'ok' | 'corrupted'; details: string } {
    return SqliteEngine.checkIntegrity();
  }

  public static async vacuumDatabase(): Promise<{ originalSizeBytes: number; compactedSizeBytes: number; bytesReclaimed: number }> {
    return await SqliteEngine.vacuum();
  }

  private static isMaintenanceRunning = false;

  /**
   * Automated background storage and version history maintenance.
   * Runs non-blockingly during idle time at most once every 24 hours:
   * 1. Prunes historical note version snapshots (retains the latest 10 versions per note)
   * 2. Removes orphaned media records and binary files
   * 3. Performs SQLite VACUUM compaction when the database exceeds 512KB
   */
  public static async autoMaintenanceIfNeeded(): Promise<{ didRun: boolean; versionsPruned: number; orphansCleaned: number }> {
    if (this.isMaintenanceRunning) return { didRun: false, versionsPruned: 0, orphansCleaned: 0 };

    const LAST_MAINTENANCE_KEY = 'vellumscribe_last_auto_maintenance_at';
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const lastRun = Number(localStorage.getItem(LAST_MAINTENANCE_KEY) || 0);
    const now = Date.now();

    if (now - lastRun < ONE_DAY_MS) {
      return { didRun: false, versionsPruned: 0, orphansCleaned: 0 };
    }

    this.isMaintenanceRunning = true;
    try {
      AppLogger.info('StorageManager', 'Running scheduled automatic storage & version maintenance...');

      // 1. Auto-prune old versions (keep latest 10 versions per note)
      const versionsPruned = SqliteRepository.pruneAllVersions(10);

      // 2. Clean orphan media keys & files
      const orphanKeys = SqliteRepository.findOrphanMediaKeys();
      orphanKeys.forEach((k) => SqliteRepository.removeOrphanMediaRecord(k));
      const mediaRes = await this.cleanOrphanedMedia();

      // 3. Compact database if size exceeds 512KB
      const stats = this.getSqliteStats();
      if (stats.databaseSizeBytes > 512 * 1024) {
        await this.vacuumDatabase();
      }

      localStorage.setItem(LAST_MAINTENANCE_KEY, now.toString());
      AppLogger.info('StorageManager', `Automated maintenance complete. Pruned ${versionsPruned} versions, cleaned ${orphanKeys.length + mediaRes.cleanedCount} orphan entries.`);
      return { didRun: true, versionsPruned, orphansCleaned: orphanKeys.length + mediaRes.cleanedCount };
    } catch (err) {
      AppLogger.warn('StorageManager', 'Automated maintenance encountered non-fatal issue', err);
      return { didRun: false, versionsPruned: 0, orphansCleaned: 0 };
    } finally {
      this.isMaintenanceRunning = false;
    }
  }

  public static scheduleSave(): void {
    SqliteEngine.scheduleSave();
  }

  public static async flush(): Promise<void> {
    await SqliteEngine.flush();
  }

  public static isDirty(): boolean {
    return SqliteEngine.isDirtyState();
  }

  public static cancelPendingSave(): void {
    SqliteEngine.cancelPendingSave();
  }

  public static exportSqliteBinary(): Uint8Array {
    return SqliteEngine.exportDatabaseBinary();
  }

  public static async importSqliteBinary(binary: Uint8Array): Promise<void> {
    await SqliteEngine.importDatabaseBinary(binary);
    this.refreshCaches();
  }

  // --- OPEN FORMAT EXPORTS ---
  public static exportNotesAsMarkdown(ids: number[]): string {
    const allNotes = this.getNotes();
    const targetNotes = allNotes.filter((n) => ids.includes(n.id));
    if (targetNotes.length === 0) return '';

    return targetNotes
      .map((n) => {
        const title = n.title || 'Untitled Note';
        const date = new Date(n.created_at).toLocaleString();
        const tags = (n.tags || []).map((t) => `#${t}`).join(' ');
        let content = `# ${title}\n*Created: ${date}*  \n*Type: ${n.note_type || 'text'}*  \n`;
        if (tags) content += `*Tags: ${tags}*\n`;
        if (n.location_name) content += `*Location: ${n.location_name}*\n`;
        content += '\n';

        if (n.is_locked) {
          content += '*[Protected Note Content - Unlock in VellumScribe to view]*\n';
          return content;
        }

        if (n.note_type === 'checklist' && n.checklist_items) {
          content += n.checklist_items
            .map((item) => `- [${item.completed ? 'x' : ' '}] ${item.text}`)
            .join('\n');
          content += '\n\n';
        }

        content += n.body;
        return content;
      })
      .join('\n\n---\n\n');
  }

  public static exportNotesAsJson(ids: number[]): string {
    const allNotes = this.getNotes();
    const targetNotes = allNotes.filter((n) => ids.includes(n.id));
    const allRecordings = this.getRecordings().filter((r) => ids.includes(r.note_id));
    const allScans = this.getOcrScans().filter((s) => ids.includes(s.note_id));

    const exportBundle = {
      app: 'VellumScribe',
      format: 'open_workspace_json_v3',
      exported_at: new Date().toISOString(),
      notes_count: targetNotes.length,
      notes: targetNotes,
      recordings: allRecordings,
      ocr_scans: allScans,
    };

    return JSON.stringify(exportBundle, null, 2);
  }

  public static exportFullDump(): string {
    const bundle = {
      version: '3.0',
      database_type: 'sqlite',
      export_timestamp: new Date().toISOString(),
      schema: {
        events: this.getEvents(),
        notes: this.getNotes(),
        recordings: this.getRecordings(),
        transcripts: this.getTranscripts(),
        ocr_scans: this.getOcrScans(),
      },
    };
    return JSON.stringify(bundle, null, 2);
  }

  public static exportCloudBackup(): string {
    const allNotes = this.getNotes();
    const cloudNotes = allNotes.filter((n) => n.cloud_save_enabled !== false);
    const noteIds = new Set(cloudNotes.map((n) => n.id));
    const eventIds = new Set(cloudNotes.map((n) => n.event_id));

    const cloudEvents = this.getEvents().filter((e) => eventIds.has(e.id));
    const cloudRecordings = this.getRecordings().filter((r) => noteIds.has(r.note_id));
    const recordingIds = new Set(cloudRecordings.map((r) => r.id));
    const cloudTranscripts = this.getTranscripts().filter((t) => recordingIds.has(t.recording_id));
    const cloudOcrScans = this.getOcrScans().filter((o) => noteIds.has(o.note_id));

    const bundle = {
      version: '3.0',
      export_timestamp: new Date().toISOString(),
      schema: {
        events: cloudEvents,
        notes: cloudNotes,
        recordings: cloudRecordings,
        transcripts: cloudTranscripts,
        ocr_scans: cloudOcrScans,
      },
    };
    return JSON.stringify(bundle);
  }

  public static toggleCloudSave(noteId: number): boolean {
    const note = this.getNotes().find((n) => n.id === noteId);
    if (!note) return false;
    const current = note.cloud_save_enabled !== false;
    const updated = this.updateNote(noteId, { cloud_save_enabled: !current });
    return !!updated;
  }

  public static async exportPortableBackupAsync(): Promise<string> {
    return this.exportFullDump();
  }

  public static async importPortableBackupAsync(json: string): Promise<{ success: boolean; message: string; preview?: any }> {
    const res = await ImportSafetyPipeline.executeImport(json);
    return {
      success: res.success,
      message: res.message,
    };
  }

  public static emptyTrash(): void {
    const trashNotes = this.getNotes().filter((n) => n.status === 'trash');
    for (const note of trashNotes) {
      this.deleteNote(note.id);
    }
    this.refreshCaches();
  }

  public static exportFullBackup(): string {
    return this.exportFullDump();
  }

  public static async exportCloudBackupArchive(customPassphrase?: string): Promise<Blob> {
    const json = this.exportCloudBackup();
    return CloudBackupCrypto.encryptArchive(json, customPassphrase);
  }

  public static async importCloudBackupArchive(
    blobOrBuffer: Blob | ArrayBuffer | string,
    optionsOrPassphrase?: string | { mode?: 'exact' | 'merge'; customPassphrase?: string; allowLegacyUnencrypted?: boolean }
  ): Promise<{ success: boolean; restoredCount?: number; error?: string }> {
    try {
      const customPassphrase = typeof optionsOrPassphrase === 'string' ? optionsOrPassphrase : optionsOrPassphrase?.customPassphrase;
      const mode = typeof optionsOrPassphrase === 'object' ? optionsOrPassphrase?.mode || 'merge' : 'merge';
      const allowLegacy = typeof optionsOrPassphrase === 'object' ? Boolean(optionsOrPassphrase?.allowLegacyUnencrypted) : false;

      const decryptedJson = await CloudBackupCrypto.decryptArchive(blobOrBuffer, {
        userPassphrase: customPassphrase,
        allowLegacyUnencrypted: allowLegacy,
      });

      if (mode === 'exact') {
        return this.exactRestoreFromDump(decryptedJson);
      }
      return this.importFullDump(decryptedJson);
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to decrypt and restore cloud backup archive.' };
    }
  }

  /**
   * Exact atomic restore: replaces existing database records with backup archive.
   * Takes a pre-restore binary snapshot and rolls back automatically if verification fails.
   */
  public static exactRestoreFromDump(jsonString: string): { success: boolean; error?: string; restoredCount?: number } {
    const preRollbackBinary = SqliteEngine.exportDatabaseBinary();
    try {
      const bundle = JSON.parse(jsonString);
      const schema = bundle.schema || bundle;

      if (!schema.notes || !Array.isArray(schema.notes)) {
        return { success: false, error: 'Invalid backup file: Missing notes dataset.' };
      }

      SqliteEngine.transaction(() => {
        // Clear existing tables
        SqliteEngine.run('DELETE FROM events;');
        SqliteEngine.run('DELETE FROM checklists;');
        SqliteEngine.run('DELETE FROM note_versions;');
        SqliteEngine.run('DELETE FROM recordings;');
        SqliteEngine.run('DELETE FROM transcripts;');
        SqliteEngine.run('DELETE FROM ocr_scans;');
        SqliteEngine.run('DELETE FROM media_files;');
        SqliteEngine.run('DELETE FROM note_tags;');
        SqliteEngine.run('DELETE FROM notes_fts;');
        SqliteEngine.run('DELETE FROM notes;');

        if (schema.events && Array.isArray(schema.events)) {
          for (const evt of schema.events) {
            SqliteRepository.saveEvent(evt);
          }
        }
        for (const note of schema.notes) {
          SqliteRepository.saveNote(note);
        }
        if (schema.recordings && Array.isArray(schema.recordings)) {
          for (const rec of schema.recordings) {
            SqliteRepository.saveRecording(rec);
          }
        }
        if (schema.transcripts && Array.isArray(schema.transcripts)) {
          for (const tr of schema.transcripts) {
            SqliteRepository.saveTranscript(tr);
          }
        }
        if (schema.ocr_scans && Array.isArray(schema.ocr_scans)) {
          for (const scan of schema.ocr_scans) {
            SqliteRepository.saveOcrScan(scan);
          }
        }

        // Rebuild full-text search table
        SqliteEngine.run('INSERT INTO notes_fts(rowid, title, body, tags) SELECT id, title, body, tags FROM notes;');
      });

      // Verify PRAGMA integrity
      const check = SqliteEngine.query<{ integrity_check: string }>('PRAGMA integrity_check;');
      if (!check || check.length === 0 || check[0].integrity_check !== 'ok') {
        throw new Error('Database integrity check failed after exact restore.');
      }

      this.refreshCaches();
      AppLogger.info('StorageManager', `Exact restore completed successfully: ${schema.notes.length} notes restored.`);
      return { success: true, restoredCount: schema.notes.length };
    } catch (e: any) {
      AppLogger.error('StorageManager', 'Exact restore failed; executing database binary rollback', e);
      if (preRollbackBinary) {
        try {
          SqliteEngine.importDatabaseBinary(preRollbackBinary);
          this.refreshCaches();
        } catch (rbErr) {
          AppLogger.error('StorageManager', 'Critical: Pre-restore binary rollback failed', rbErr);
        }
      }
      return { success: false, error: e?.message || 'Exact restore failed.' };
    }
  }

  public static importLegacyUnencryptedBackup(jsonString: string, userConfirmed: boolean): { success: boolean; error?: string; restoredCount?: number } {
    if (!userConfirmed) {
      return {
        success: false,
        error: 'User confirmation required to import unencrypted legacy backup.',
      };
    }
    return this.importFullDump(jsonString);
  }

  public static importFullDump(jsonString: string): { success: boolean; error?: string; restoredCount?: number } {
    try {
      const bundle = JSON.parse(jsonString);
      const schema = bundle.schema || bundle;

      if (!schema.notes || !Array.isArray(schema.notes)) {
        return { success: false, error: 'Invalid backup file: Missing notes dataset.' };
      }

      SqliteEngine.transaction(() => {
        if (schema.events && Array.isArray(schema.events)) {
          for (const evt of schema.events) {
            SqliteRepository.saveEvent(evt);
          }
        }
        for (const note of schema.notes) {
          SqliteRepository.saveNote(note);
        }
        if (schema.recordings && Array.isArray(schema.recordings)) {
          for (const rec of schema.recordings) {
            SqliteRepository.saveRecording(rec);
          }
        }
        if (schema.transcripts && Array.isArray(schema.transcripts)) {
          for (const tr of schema.transcripts) {
            SqliteRepository.saveTranscript(tr);
          }
        }
        if (schema.ocr_scans && Array.isArray(schema.ocr_scans)) {
          for (const scan of schema.ocr_scans) {
            SqliteRepository.saveOcrScan(scan);
          }
        }
      });

      this.refreshCaches();
      AppLogger.info('StorageManager', `Successfully imported ${schema.notes.length} notes.`);
      return { success: true, restoredCount: schema.notes.length };
    } catch (e: any) {
      AppLogger.error('StorageManager', 'Failed to import backup JSON', e);
      return { success: false, error: e?.message || 'JSON parse failure.' };
    }
  }
}

export const SQLiteDatabase = StorageManager;
