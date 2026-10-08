import {
  EventRecord,
  NoteRecord,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
  SyncConflictRecord,
  NoteRevisionRecord,
} from '../types';
import { DEMO_SAMPLE_EVENTS, DEMO_SAMPLE_NOTES } from './sampleData';
import { getDatabaseAdapter } from './sqlite/databaseAdapter';
import { SqliteRepository } from './sqlite/sqliteRepository';
import { MigrationManager } from './sqlite/migrationManager';
import {
  NoteRepository,
  NotesPageOptions,
  NotesPageResult,
} from '../repositories/NoteRepository';
import { AppLogger } from './logger';

/**
 * StorageManager — SQLite gateway with in-memory caches for UI.
 */
export class StorageManager {
  private static get db() {
    return getDatabaseAdapter();
  }

  private static isInitialized = false;
  private static initPromise: Promise<void> | null = null;

  private static eventsCache: EventRecord[] | null = null;
  private static notesCache: NoteRecord[] | null = null;
  private static notesCacheFullyHydrated = false;
  private static recordingsCache: RecordingRecord[] | null = null;
  private static transcriptsCache: TranscriptRecord[] | null = null;
  private static ocrScansCache: OcrScanRecord[] | null = null;

  public static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      AppLogger.info('StorageManager', 'Bootstrapping SQLite Database Gateway...');
      try {
        await this.db.initialize();
        try {
          const report = await MigrationManager.checkAndMigrateLegacyData();
          if (report) {
            AppLogger.info('StorageManager', 'Legacy data migrated', report);
          }
        } catch (e) {
          AppLogger.warn('StorageManager', 'Legacy migration skipped', e);
        }
        this.refreshCaches();
        this.isInitialized = true;
        AppLogger.info('StorageManager', 'Storage gateway ready');
      } catch (err: any) {
        AppLogger.error('StorageManager', 'Initialization failed', err);
        this.initPromise = null;
        this.isInitialized = false;
        throw err;
      }
    })();

    return this.initPromise;
  }

  public static refreshCaches(): void {
    try {
      this.eventsCache = SqliteRepository.getAllEvents();
      const page = SqliteRepository.getNotesPage({ pageSize: 50, status: 'active' });
      this.notesCache = page.notes;
      this.notesCacheFullyHydrated = false;
      this.recordingsCache = null;
      this.transcriptsCache = null;
      this.ocrScansCache = null;
    } catch (e) {
      AppLogger.warn('StorageManager', 'Could not refresh caches', e);
      this.eventsCache = this.eventsCache ?? [];
      this.notesCache = this.notesCache ?? [];
      this.notesCacheFullyHydrated = false;
    }
  }

  // --- Preferences ---
  public static getItem<T = string>(key: string, fallback: T | null = null): T | null {
    try {
      const val = localStorage.getItem(key);
      if (val === null) return fallback;
      try {
        return JSON.parse(val) as T;
      } catch {
        return val as unknown as T;
      }
    } catch {
      return fallback;
    }
  }

  public static setItem<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  public static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  public static hasItem(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  public static loadDemoData(): void {
    try {
      for (const evt of DEMO_SAMPLE_EVENTS) SqliteRepository.saveEvent(evt);
      for (const note of DEMO_SAMPLE_NOTES) SqliteRepository.saveNote(note);
      this.refreshCaches();
    } catch (e) {
      AppLogger.warn('StorageManager', 'loadDemoData failed', e);
    }
  }

  // --- Events ---
  public static getEvents(): EventRecord[] {
    if (this.eventsCache !== null) return this.eventsCache;
    try {
      this.eventsCache = SqliteRepository.getAllEvents();
    } catch {
      this.eventsCache = [];
    }
    return this.eventsCache;
  }

  public static addEvent(event: Omit<EventRecord, 'id'>): EventRecord {
    const created = SqliteRepository.saveEvent({ ...event, id: 0 });
    if (this.eventsCache) this.eventsCache.push(created);
    else this.eventsCache = [created];
    return created;
  }

  public static updateEvent(id: number, updates: Partial<EventRecord>): EventRecord | null {
    const existing = this.getEvents().find((e) => e.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    SqliteRepository.saveEvent(updated);
    if (this.eventsCache) {
      const i = this.eventsCache.findIndex((e) => e.id === id);
      if (i >= 0) this.eventsCache[i] = updated;
    }
    return updated;
  }

  public static deleteEvent(id: number): boolean {
    try {
      SqliteRepository.deleteEvent(id);
      if (this.eventsCache) this.eventsCache = this.eventsCache.filter((e) => e.id !== id);
      return true;
    } catch {
      return false;
    }
  }

  // --- Notes ---

  /**
   * Async paginated notes (used by EventNotesList).
   * Accepts NoteRepository options shape: limit, eventId, searchQuery, etc.
   */
  public static async getNotesPage(options: NotesPageOptions = {}): Promise<NotesPageResult> {
    try {
      return await NoteRepository.list(options);
    } catch (e) {
      AppLogger.error('StorageManager', 'getNotesPage failed', e);
      // Fallback to in-memory filter so UI can still render
      let notes = this.getNotes();
      if (options.status) {
        notes = notes.filter((n) => n.status === options.status);
      } else {
        notes = notes.filter((n) => !n.status || n.status === 'active');
      }
      if (options.eventId != null) {
        notes = notes.filter((n) => n.event_id === options.eventId);
      }
      if (options.searchQuery?.trim()) {
        const q = options.searchQuery.toLowerCase().trim();
        notes = notes.filter(
          (n) =>
            (n.title || '').toLowerCase().includes(q) ||
            (n.body || '').toLowerCase().includes(q)
        );
      }
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;
      const slice = notes.slice(offset, offset + limit);
      return {
        notes: slice,
        totalCount: notes.length,
        hasMore: offset + slice.length < notes.length,
        nextOffset: offset + slice.length < notes.length ? offset + limit : undefined,
      };
    }
  }

  public static getNotes(): NoteRecord[] {
    if (this.notesCache !== null && this.notesCacheFullyHydrated) return this.notesCache;
    try {
      this.notesCache = SqliteRepository.getAllNotes();
      this.notesCacheFullyHydrated = true;
    } catch (e) {
      AppLogger.error('StorageManager', 'Failed to load notes', e);
      this.notesCache = this.notesCache ?? [];
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

  public static getNotesForEvent(eventId: number): NoteRecord[] {
    return this.getActiveNotes().filter((n) => n.event_id === eventId);
  }

  public static getNoteById(id: number): NoteRecord | undefined {
    const cached = this.notesCache?.find((n) => n.id === id);
    if (cached) return cached;
    try {
      return SqliteRepository.getNoteById(id) ?? undefined;
    } catch {
      return undefined;
    }
  }

  public static addNote(note: Omit<NoteRecord, 'id'>): NoteRecord {
    const created = SqliteRepository.saveNote({
      ...note,
      id: 0,
      status: note.status || 'active',
      note_type: note.note_type || 'text',
      checklist_items: note.checklist_items || [],
      created_at: note.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    });
    if (this.notesCache) this.notesCache = [created, ...this.notesCache];
    else this.notesCache = [created];
    return created;
  }

  public static updateNote(id: number, updates: Partial<NoteRecord>): NoteRecord | null {
    const existing = this.getNoteById(id);
    if (!existing) return null;
    const updated: NoteRecord = {
      ...existing,
      ...updates,
      version: (existing.version || 1) + 1,
      updated_at: updates.updated_at || new Date().toISOString(),
    };
    SqliteRepository.saveNote(updated);
    if (this.notesCache) {
      const i = this.notesCache.findIndex((n) => n.id === id);
      if (i >= 0) this.notesCache[i] = updated;
      else this.notesCache.push(updated);
    }
    return updated;
  }

  public static deleteNote(id: number): void {
    try {
      SqliteRepository.deleteNote(id);
    } catch {
      /* ignore */
    }
    if (this.notesCache) this.notesCache = this.notesCache.filter((n) => n.id !== id);
  }

  public static archiveNote(id: number): void {
    this.updateNote(id, { status: 'archived', archived_at: new Date().toISOString() });
  }

  public static unarchiveNote(id: number): void {
    this.updateNote(id, { status: 'active', archived_at: undefined });
  }

  public static trashNote(id: number): void {
    this.updateNote(id, { status: 'trash', trashed_at: new Date().toISOString() });
  }

  public static restoreNote(id: number): void {
    this.updateNote(id, { status: 'active', trashed_at: undefined });
  }

  /** Permanently delete all notes in trash. */
  public static emptyTrash(): void {
    const trash = this.getTrashNotes();
    for (const n of trash) {
      this.deleteNote(n.id);
    }
    this.refreshCaches();
  }

  // --- Media / ancillary ---
  public static getRecordings(): RecordingRecord[] {
    if (this.recordingsCache) return this.recordingsCache;
    try {
      this.recordingsCache =
        typeof (SqliteRepository as any).getAllRecordings === 'function'
          ? (SqliteRepository as any).getAllRecordings()
          : [];
    } catch {
      this.recordingsCache = [];
    }
    return this.recordingsCache;
  }

  public static getTranscripts(): TranscriptRecord[] {
    if (this.transcriptsCache) return this.transcriptsCache;
    try {
      this.transcriptsCache =
        typeof (SqliteRepository as any).getAllTranscripts === 'function'
          ? (SqliteRepository as any).getAllTranscripts()
          : [];
    } catch {
      this.transcriptsCache = [];
    }
    return this.transcriptsCache;
  }

  public static getOcrScans(): OcrScanRecord[] {
    if (this.ocrScansCache) return this.ocrScansCache;
    try {
      this.ocrScansCache =
        typeof (SqliteRepository as any).getAllOcrScans === 'function'
          ? (SqliteRepository as any).getAllOcrScans()
          : [];
    } catch {
      this.ocrScansCache = [];
    }
    return this.ocrScansCache;
  }

  public static getSyncConflicts(_status?: string): SyncConflictRecord[] {
    try {
      return typeof (SqliteRepository as any).getSyncConflicts === 'function'
        ? (SqliteRepository as any).getSyncConflicts('open')
        : [];
    } catch {
      return [];
    }
  }

  public static getNoteRevisions(noteId: number): NoteRevisionRecord[] {
    try {
      return typeof (SqliteRepository as any).getNoteRevisions === 'function'
        ? (SqliteRepository as any).getNoteRevisions(noteId)
        : [];
    } catch {
      return [];
    }
  }

  public static async checkColdStartIntegrity(): Promise<void> {}
  public static async autoMaintenanceIfNeeded(): Promise<void> {}
}

export const SQLiteDatabase = StorageManager;
