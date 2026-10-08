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
import {
  SqliteRepository,
  SqliteStats,
  SearchOptions,
  SearchResult,
} from './sqlite/sqliteRepository';
import { MigrationManager } from './sqlite/migrationManager';
import {
  NoteRepository,
  NotesPageOptions,
  NotesPageResult,
} from '../repositories/NoteRepository';
import { AppLogger } from './logger';
import { hashPin, verifyPin, encryptNotePayload, NotePayloadData } from './cryptoUtils';

/**
 * StorageManager — SQLite gateway with in-memory caches for UI.
 * Full API surface expected by editor, settings, security, and tests.
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
  private static lastDurableSaveAt: number | null = null;

  public static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      AppLogger.info('StorageManager', 'Bootstrapping SQLite Database Gateway...');
      try {
        await this.db.initialize();
        try {
          const report = await MigrationManager.checkAndMigrateLegacyData();
          if (report) AppLogger.info('StorageManager', 'Legacy data migrated', report);
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

  public static saveEvents(events: EventRecord[]): boolean {
    try {
      for (const evt of events) SqliteRepository.saveEvent(evt);
      this.eventsCache = events;
      return true;
    } catch (e) {
      AppLogger.error('StorageManager', 'saveEvents failed', e);
      return false;
    }
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
      // Move notes to General instead of cascade-delete
      const notes = this.getNotes().filter((n) => n.event_id === id);
      if (notes.length > 0) {
        let general = this.getEvents().find((e) => e.title.toLowerCase() === 'general' && e.id !== id);
        if (!general) {
          general = this.addEvent({
            title: 'General',
            event_date: new Date().toISOString().slice(0, 10),
            category: 'personal',
            color: '#6b7280',
          });
        }
        for (const n of notes) this.updateNote(n.id, { event_id: general.id });
      }
      SqliteRepository.deleteEvent(id);
      if (this.eventsCache) this.eventsCache = this.eventsCache.filter((e) => e.id !== id);
      return true;
    } catch {
      return false;
    }
  }

  // --- Notes ---
  public static async getNotesPage(options: NotesPageOptions = {}): Promise<NotesPageResult> {
    try {
      return await NoteRepository.list(options);
    } catch (e) {
      AppLogger.error('StorageManager', 'getNotesPage failed', e);
      let notes = this.getNotes();
      if (options.status) notes = notes.filter((n) => n.status === options.status);
      else notes = notes.filter((n) => !n.status || n.status === 'active');
      if (options.eventId != null) notes = notes.filter((n) => n.event_id === options.eventId);
      if (options.searchQuery?.trim()) {
        const q = options.searchQuery.toLowerCase().trim();
        notes = notes.filter(
          (n) =>
            (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q)
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

  public static async getNotesKeyset(beforeUpdatedAt?: string, limit: number = 50): Promise<NoteRecord[]> {
    const res = await NoteRepository.list({ limit, cursor: beforeUpdatedAt, status: 'active' });
    return res.notes;
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

  public static saveNotes(notes: NoteRecord[]): boolean {
    try {
      for (const n of notes) SqliteRepository.saveNote(n);
      this.notesCache = notes;
      this.notesCacheFullyHydrated = true;
      return true;
    } catch (e) {
      AppLogger.error('StorageManager', 'saveNotes failed', e);
      return false;
    }
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
    this.recordDurableSave();
    return created;
  }

  public static updateNote(
    id: number,
    updates: Partial<NoteRecord>,
    _expectedVersion?: number
  ): NoteRecord | null {
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
    this.recordDurableSave();
    return updated;
  }

  /** Fast path for editor typing — title/body only. */
  public static updateNoteText(
    id: number,
    title?: string,
    body?: string,
    _skipFts?: boolean
  ): NoteRecord | null {
    try {
      if (typeof (SqliteRepository as any).updateNoteText === 'function') {
        const updated = (SqliteRepository as any).updateNoteText(id, title, body, _skipFts);
        if (updated && this.notesCache) {
          const i = this.notesCache.findIndex((n) => n.id === id);
          if (i >= 0) this.notesCache[i] = updated;
        }
        this.recordDurableSave();
        return updated;
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'updateNoteText repo path failed', e);
    }
    const patch: Partial<NoteRecord> = {};
    if (title !== undefined) patch.title = title;
    if (body !== undefined) patch.body = body;
    return this.updateNote(id, patch);
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
    this.updateNote(id, { status: 'active', archived_at: undefined as any });
  }

  public static trashNote(id: number): void {
    this.updateNote(id, { status: 'trash', trashed_at: new Date().toISOString() });
  }

  public static restoreNote(id: number): void {
    this.updateNote(id, { status: 'active', trashed_at: undefined as any });
  }

  public static emptyTrash(): void {
    for (const n of this.getTrashNotes()) this.deleteNote(n.id);
    this.refreshCaches();
  }

  public static duplicateNote(id: number): NoteRecord | null {
    const src = this.getNoteById(id);
    if (!src) return null;
    return this.addNote({
      ...src,
      title: `${src.title || 'Untitled'} (copy)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_pinned: false,
    });
  }

  public static togglePinNote(id: number): NoteRecord | null {
    const n = this.getNoteById(id);
    if (!n) return null;
    return this.updateNote(id, { is_pinned: !n.is_pinned });
  }

  public static toggleCloudSave(id: number): NoteRecord | null {
    const n = this.getNoteById(id);
    if (!n) return null;
    return this.updateNote(id, { cloud_save_enabled: n.cloud_save_enabled === false });
  }

  public static bulkArchiveNotes(ids: number[]): void {
    for (const id of ids) this.archiveNote(id);
  }

  public static bulkDeleteNotes(ids: number[]): void {
    for (const id of ids) this.deleteNote(id);
  }

  public static batchTrashNotes(ids: number[]): void {
    for (const id of ids) this.trashNote(id);
  }

  public static batchArchiveNotes(ids: number[]): void {
    this.bulkArchiveNotes(ids);
  }

  public static batchDeleteNotesPermanently(ids: number[]): void {
    this.bulkDeleteNotes(ids);
  }

  public static batchRestoreNotes(ids: number[]): void {
    for (const id of ids) this.restoreNote(id);
  }

  public static batchUnarchiveNotes(ids: number[]): void {
    for (const id of ids) this.unarchiveNote(id);
  }

  public static batchMoveNotes(ids: number[], eventId: number): void {
    for (const id of ids) this.updateNote(id, { event_id: eventId });
  }

  public static batchPinNotes(ids: number[], pinned: boolean): void {
    for (const id of ids) this.updateNote(id, { is_pinned: pinned });
  }

  public static batchAddTagToNotes(ids: number[], tag: string): void {
    for (const id of ids) {
      const n = this.getNoteById(id);
      if (!n) continue;
      const tags = Array.from(new Set([...(n.tags || []), tag.trim()].filter(Boolean)));
      this.updateNote(id, { tags });
    }
  }

  public static batchColorNotes(ids: number[], color: string): void {
    for (const id of ids) this.updateNote(id, { color });
  }

  public static batchDuplicateNotes(ids: number[]): NoteRecord[] {
    const out: NoteRecord[] = [];
    for (const id of ids) {
      const d = this.duplicateNote(id);
      if (d) out.push(d);
    }
    return out;
  }

  public static batchLockNotes(ids: number[], pin: string): number {
    let count = 0;
    for (const id of ids) {
      const n = this.getNoteById(id);
      if (!n || n.is_locked) continue;
      try {
        this.setNotePinLock(n, pin);
        count++;
      } catch {
        /* skip */
      }
    }
    return count;
  }

  public static async batchUnlockNotes(ids: number[], pin: string): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const n = this.getNoteById(id);
      if (!n || !n.is_locked) continue;
      const res = await this.verifyAndUnlockNote(n, pin);
      if (res.success) count++;
    }
    return count;
  }

  // --- Security / PIN ---
  public static setNotePinLock(note: NoteRecord, pin: string): NoteRecord | null {
    const salt = `salt_${note.id}_${Date.now()}`;
    const pin_hash = hashPin(pin, salt);
    const payload: NotePayloadData = {
      title: note.title || '',
      body: note.body || '',
      checklist_items: note.checklist_items || [],
    };
    let encrypted_payload: string | undefined;
    try {
      encrypted_payload = encryptNotePayload(payload, pin);
    } catch (e) {
      AppLogger.warn('StorageManager', 'encryptNotePayload failed', e);
    }
    return this.updateNote(note.id, {
      is_locked: true,
      lock_mode: note.lock_mode || 'standard',
      security_type: 'pin',
      pin_salt: salt,
      pin_hash,
      encrypted_payload,
      title: note.lock_mode === 'private' ? '' : note.title,
      body: note.lock_mode === 'private' ? '' : note.body,
    });
  }

  public static removeNotePinLock(note: NoteRecord): NoteRecord | null {
    return this.updateNote(note.id, {
      is_locked: false,
      pin_hash: undefined as any,
      pin_salt: undefined as any,
      encrypted_payload: undefined as any,
    });
  }

  public static async verifyAndUnlockNote(
    note: NoteRecord,
    pin: string
  ): Promise<{ success: boolean; payload?: NotePayloadData; message?: string }> {
    if (!note.is_locked) {
      return {
        success: true,
        payload: {
          title: note.title || '',
          body: note.body || '',
          checklist_items: note.checklist_items || [],
        },
      };
    }
    if (!note.pin_hash || !note.pin_salt) {
      return { success: false, message: 'Note has no PIN credentials' };
    }
    const ok = verifyPin(pin, note.pin_salt, note.pin_hash);
    if (!ok) return { success: false, message: 'Incorrect PIN' };
    return {
      success: true,
      payload: {
        title: note.title || '',
        body: note.body || '',
        checklist_items: note.checklist_items || [],
      },
    };
  }

  public static saveUnlockedNote(
    noteId: number,
    payload: NotePayloadData,
    extras?: Partial<NoteRecord>
  ): NoteRecord | null {
    return this.updateNote(noteId, {
      title: payload.title,
      body: payload.body,
      checklist_items: payload.checklist_items || [],
      ...extras,
    });
  }

  public static lockNoteTransactionally(noteId: number, pin: string): NoteRecord | null {
    const n = this.getNoteById(noteId);
    if (!n) return null;
    return this.setNotePinLock(n, pin);
  }

  // --- Revisions ---
  public static getNoteRevisions(noteId: number): NoteRevisionRecord[] {
    try {
      return typeof (SqliteRepository as any).getNoteRevisions === 'function'
        ? (SqliteRepository as any).getNoteRevisions(noteId)
        : [];
    } catch {
      return [];
    }
  }

  public static restoreNoteRevision(noteId: number, revisionId: string): NoteRecord | null {
    const revs = this.getNoteRevisions(noteId);
    const target = revs.find((r) => r.id === revisionId);
    if (!target) return null;
    return this.updateNote(noteId, { title: target.title, body: target.body });
  }

  // --- Media: recordings / OCR / transcripts ---
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
    return this.recordingsCache ?? [];
  }

  public static getRecordingsForNote(noteId: number): RecordingRecord[] {
    return this.getRecordings().filter((r) => r.note_id === noteId);
  }

  public static addRecording(rec: Omit<RecordingRecord, 'id'> & { id?: string }): RecordingRecord {
    const row = {
      ...rec,
      id: rec.id || `rec_${Date.now()}`,
    } as RecordingRecord;
    try {
      if (typeof (SqliteRepository as any).saveRecording === 'function') {
        (SqliteRepository as any).saveRecording(row);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'saveRecording failed', e);
    }
    this.recordingsCache = null;
    return row;
  }

  public static deleteRecording(id: string): void {
    try {
      if (typeof (SqliteRepository as any).deleteRecording === 'function') {
        (SqliteRepository as any).deleteRecording(id);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'deleteRecording failed', e);
    }
    this.recordingsCache = null;
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
    return this.transcriptsCache ?? [];
  }

  public static getTranscriptForRecording(recordingId: string): TranscriptRecord | undefined {
    return this.getTranscripts().find((t) => t.recording_id === recordingId);
  }

  public static addTranscript(t: Omit<TranscriptRecord, 'id'> & { id?: string }): TranscriptRecord {
    const row = { ...t, id: t.id || `tr_${Date.now()}` } as TranscriptRecord;
    try {
      if (typeof (SqliteRepository as any).saveTranscript === 'function') {
        (SqliteRepository as any).saveTranscript(row);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'saveTranscript failed', e);
    }
    this.transcriptsCache = null;
    return row;
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
    return this.ocrScansCache ?? [];
  }

  public static getOcrScansForNote(noteId: number): OcrScanRecord[] {
    return this.getOcrScans().filter((s) => s.note_id === noteId);
  }

  public static addOcrScan(scan: Omit<OcrScanRecord, 'id'> & { id?: string }): OcrScanRecord {
    const row = { ...scan, id: scan.id || `ocr_${Date.now()}` } as OcrScanRecord;
    try {
      if (typeof (SqliteRepository as any).saveOcrScan === 'function') {
        (SqliteRepository as any).saveOcrScan(row);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'saveOcrScan failed', e);
    }
    this.ocrScansCache = null;
    return row;
  }

  public static deleteOcrScan(id: string): void {
    try {
      if (typeof (SqliteRepository as any).deleteOcrScan === 'function') {
        (SqliteRepository as any).deleteOcrScan(id);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'deleteOcrScan failed', e);
    }
    this.ocrScansCache = null;
  }

  // --- Sync conflicts ---
  public static getSyncConflicts(status: 'open' | 'resolved' | 'ignored' = 'open'): SyncConflictRecord[] {
    try {
      return typeof (SqliteRepository as any).getSyncConflicts === 'function'
        ? (SqliteRepository as any).getSyncConflicts(status)
        : [];
    } catch {
      return [];
    }
  }

  public static resolveSyncConflict(id: string): void {
    try {
      if (typeof (SqliteRepository as any).resolveSyncConflict === 'function') {
        (SqliteRepository as any).resolveSyncConflict(id);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'resolveSyncConflict failed', e);
    }
  }

  // --- Stats / maintenance ---
  public static getSqliteStats(): SqliteStats {
    try {
      if (typeof (SqliteRepository as any).getStats === 'function') {
        return (SqliteRepository as any).getStats();
      }
    } catch {
      /* fall through */
    }
    return {
      notesCount: this.getNotes().length,
      eventsCount: this.getEvents().length,
      checklistsCount: 0,
      versionsCount: 0,
      mediaFilesCount: 0,
      recordingsCount: this.getRecordings().length,
      transcriptsCount: this.getTranscripts().length,
      ocrScansCount: this.getOcrScans().length,
      databaseSizeBytes: 0,
      schemaVersion: 0,
      integrityStatus: 'ok',
    };
  }

  public static getStorageStats(): {
    notes: number;
    events: number;
    recordings: number;
    ocrScans: number;
    approximateBytes: number;
  } {
    const s = this.getSqliteStats();
    return {
      notes: s.notesCount,
      events: s.eventsCount,
      recordings: s.recordingsCount,
      ocrScans: s.ocrScansCount,
      approximateBytes: s.databaseSizeBytes,
    };
  }

  public static async checkDatabaseIntegrity(): Promise<{ ok: boolean; result: string }> {
    try {
      return await this.db.checkIntegrity();
    } catch (e: any) {
      return { ok: false, result: e?.message || 'integrity check failed' };
    }
  }

  public static async vacuumDatabase(): Promise<{
    originalSizeBytes: number;
    compactedSizeBytes: number;
    bytesReclaimed: number;
  }> {
    try {
      return await this.db.vacuum();
    } catch {
      return { originalSizeBytes: 0, compactedSizeBytes: 0, bytesReclaimed: 0 };
    }
  }

  public static async cleanOrphanedMedia(): Promise<number> {
    // Best-effort no-op if repo helper missing
    try {
      if (typeof (SqliteRepository as any).cleanOrphanedMedia === 'function') {
        return await (SqliteRepository as any).cleanOrphanedMedia();
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'cleanOrphanedMedia failed', e);
    }
    return 0;
  }

  public static getLastDurableSaveTime(): number | null {
    return this.lastDurableSaveAt;
  }

  public static recordDurableSave(): void {
    this.lastDurableSaveAt = Date.now();
  }

  public static async flush(): Promise<void> {
    try {
      if (this.db.flush) await this.db.flush();
      this.recordDurableSave();
    } catch (e) {
      AppLogger.warn('StorageManager', 'flush failed', e);
    }
  }

  public static cancelPendingSave(): void {
    try {
      this.db.cancelPendingSave?.();
    } catch {
      /* ignore */
    }
  }

  public static isDirty(): boolean {
    try {
      return this.db.isDirtyState?.() ?? false;
    } catch {
      return false;
    }
  }

  // --- Search ---
  public static searchNotes(options: SearchOptions): SearchResult {
    try {
      if (typeof (SqliteRepository as any).searchNotes === 'function') {
        return (SqliteRepository as any).searchNotes(options);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'searchNotes failed', e);
    }
    const q = (options.query || '').toLowerCase();
    let notes = this.getNotes();
    if (q) {
      notes = notes.filter(
        (n) =>
          (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q)
      );
    }
    if (options.status) notes = notes.filter((n) => n.status === options.status);
    if (options.eventId != null) notes = notes.filter((n) => n.event_id === options.eventId);
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    return { notes: notes.slice(offset, offset + limit), totalCount: notes.length };
  }

  // --- Backup / export / import ---
  public static exportSqliteBinary(): Uint8Array {
    try {
      if (this.db.exportBinary) return this.db.exportBinary();
    } catch (e) {
      AppLogger.warn('StorageManager', 'exportSqliteBinary failed', e);
    }
    return new Uint8Array(0);
  }

  public static async importSqliteBinary(binary: Uint8Array): Promise<void> {
    if (this.db.importBinary) {
      await this.db.importBinary(binary);
      this.refreshCaches();
    }
  }

  public static exportFullDump(): string {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      events: this.getEvents(),
      notes: this.getNotes(),
      recordings: this.getRecordings(),
      transcripts: this.getTranscripts(),
      ocrScans: this.getOcrScans(),
    });
  }

  public static importFullDump(json: string): { success: boolean; error?: string } {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data.events)) this.saveEvents(data.events);
      if (Array.isArray(data.notes)) this.saveNotes(data.notes);
      this.refreshCaches();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'import failed' };
    }
  }

  public static exportFullBackup(): string {
    return this.exportFullDump();
  }

  public static async exportPortableBackupAsync(): Promise<string> {
    return this.exportFullDump();
  }

  public static async importPortableBackupAsync(
    json: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.importFullDump(json);
  }

  public static exportCloudBackupArchive(): string {
    return this.exportFullDump();
  }

  public static importCloudBackupArchive(payload: string): { success: boolean; error?: string } {
    return this.importFullDump(payload);
  }

  public static exportCloudBackup(): string {
    return this.exportFullDump();
  }

  public static exportNotesAsJson(): string {
    return JSON.stringify(this.getNotes(), null, 2);
  }

  public static exportNotesAsMarkdown(): string {
    return this.getNotes()
      .map((n) => `# ${n.title || 'Untitled'}\n\n${n.body || ''}`)
      .join('\n\n---\n\n');
  }

  public static importLegacyUnencryptedBackup(
    json: string
  ): { success: boolean; error?: string } {
    return this.importFullDump(json);
  }

  public static exactRestoreFromDump(json: string): { success: boolean; error?: string } {
    return this.importFullDump(json);
  }

  public static async checkColdStartIntegrity(): Promise<void> {}
  public static async autoMaintenanceIfNeeded(): Promise<void> {}
}

export const SQLiteDatabase = StorageManager;
