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
import { NoteRepository, NotesPageOptions, NotesPageResult } from '../repositories/NoteRepository';
import { AppLogger } from './logger';
import { asErrorLike } from './errorLike';
import { CloudBackupCrypto } from './cloudBackupCrypto';
import {
  hashPin,
  verifyPin,
  encryptNotePayload,
  decryptNotePayload,
  NotePayloadData,
  generateSalt,
} from './cryptoUtils';

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
      } catch (_err) {
        const err = asErrorLike(_err);
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
      const notes = this.getNotes().filter((n) => n.event_id === id);
      if (notes.length > 0) {
        let general = this.getEvents().find(
          (e) => e.title.toLowerCase() === 'general' && e.id !== id
        );
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

  public static async getNotesKeyset(
    beforeUpdatedAt?: string,
    limit: number = 50
  ): Promise<NoteRecord[]> {
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
    expectedVersion?: number
  ): NoteRecord | null {
    const existing = this.getNoteById(id);
    if (!existing) return null;
    if (
      expectedVersion !== undefined &&
      existing.version !== undefined &&
      existing.version !== expectedVersion
    ) {
      try {
        SqliteRepository.recordSyncConflict({
          entity_type: 'note',
          entity_id: String(id),
          local_version_id: String(existing.version),
          remote_version_id: String(expectedVersion),
          local_payload: JSON.stringify(existing),
          remote_payload: JSON.stringify(updates),
        });
      } catch (e) {
        AppLogger.warn('StorageManager', 'Failed to record sync conflict', e);
      }
      AppLogger.warn(
        'StorageManager',
        `Sync conflict detected on note #${id}: expected version ${expectedVersion}, but found ${existing.version}`
      );
      return null;
    }
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

  public static updateNoteText(
    id: number,
    title?: string,
    body?: string,
    _skipFts?: boolean
  ): NoteRecord | null {
    try {
      if (typeof SqliteRepository.updateNoteText === 'function') {
        const updated = SqliteRepository.updateNoteText(id, title, body, _skipFts);
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

  public static deleteNote(id: number): boolean {
    try {
      SqliteRepository.deleteNote(id);
    } catch (e) {
      AppLogger.error('StorageManager', `Failed to delete note ${id}`, e);
      return false;
    }
    if (this.notesCache) this.notesCache = this.notesCache.filter((n) => n.id !== id);
    return true;
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

  public static emptyTrash(): void {
    for (const n of this.getTrashNotes()) this.deleteNote(n.id);
    this.refreshCaches();
  }

  public static duplicateNote(id: number): NoteRecord | null {
    const src = this.getNoteById(id);
    if (!src) return null;
    return this.addNote({
      ...src,
      title: `${src.title || 'Untitled'} (Copy)`,
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

  public static bulkArchiveNotes(ids: number[]): number {
    let n = 0;
    for (const id of ids) {
      this.archiveNote(id);
      n++;
    }
    return n;
  }

  public static bulkDeleteNotes(ids: number[]): number {
    let n = 0;
    for (const id of ids) {
      this.deleteNote(id);
      n++;
    }
    return n;
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

  public static async batchLockNotes(ids: number[], pin: string): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const n = this.getNoteById(id);
      if (!n || n.is_locked) continue;
      try {
        const locked = await this.setNotePinLock(id, pin);
        if (locked) count++;
      } catch {
        /* skip */
      }
    }
    return count;
  }

  public static async batchUnlockNotes(
    ids: number[],
    pin: string
  ): Promise<{ unlockedCount: number }> {
    let unlockedCount = 0;
    for (const id of ids) {
      const n = this.getNoteById(id);
      if (!n || !n.is_locked) continue;
      const res = await this.verifyAndUnlockNote(n, pin);
      if (res.success) {
        await this.removeNotePinLock(id, pin);
        unlockedCount++;
      }
    }
    return { unlockedCount };
  }

  /** Match NoteSecurityModal: setNotePinLock(noteId, pin, payload?, lockMode?, securityType?) */
  public static async setNotePinLock(
    noteOrId: NoteRecord | number,
    pin: string,
    currentPayload?: NotePayloadData,
    lockMode: 'standard' | 'private' = 'standard',
    securityType: 'pin' | 'passphrase' = 'pin'
  ): Promise<NoteRecord | null> {
    const note = typeof noteOrId === 'number' ? this.getNoteById(noteOrId) : noteOrId;
    if (!note) return null;

    const salt = generateSalt();
    const { hash: pin_hash } = await hashPin(pin, salt);
    const payload: NotePayloadData = currentPayload || {
      title: note.title || '',
      body: note.body || '',
      checklist_items: note.checklist_items || [],
    };

    let encrypted_payload: string | undefined;
    try {
      encrypted_payload = await encryptNotePayload(payload, pin, salt);
    } catch (e) {
      AppLogger.warn('StorageManager', 'encryptNotePayload failed', e);
      throw e;
    }

    const clearTitle = lockMode === 'private';
    return this.updateNote(note.id, {
      is_locked: true,
      lock_mode: lockMode,
      security_type: securityType,
      pin_salt: salt,
      pin_hash,
      encrypted_payload,
      title: clearTitle ? '' : payload.title || note.title,
      body: clearTitle ? '' : '',
      checklist_items: [],
    });
  }

  /** Match NoteSecurityModal: removeNotePinLock(noteId, pin) */
  public static async removeNotePinLock(
    noteOrId: NoteRecord | number,
    pin?: string
  ): Promise<NoteRecord | null> {
    const note = typeof noteOrId === 'number' ? this.getNoteById(noteOrId) : noteOrId;
    if (!note) return null;

    if (pin && note.is_locked) {
      const verified = await this.verifyAndUnlockNote(note, pin);
      if (!verified.success) return null;
      if (verified.payload) {
        return this.updateNote(note.id, {
          is_locked: false,
          pin_hash: undefined,
          pin_salt: undefined,
          encrypted_payload: undefined,
          title: verified.payload.title || note.title,
          body: verified.payload.body || '',
          checklist_items: verified.payload.checklist_items || [],
        });
      }
    }

    return this.updateNote(note.id, {
      is_locked: false,
      pin_hash: undefined,
      pin_salt: undefined,
      encrypted_payload: undefined,
    });
  }

  public static async verifyAndUnlockNote(
    note: NoteRecord,
    pin: string
  ): Promise<{
    success: boolean;
    payload?: NotePayloadData;
    errorMessage?: string;
    message?: string;
  }> {
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
      return { success: false, errorMessage: 'Note has no PIN credentials' };
    }
    const ok = await verifyPin(pin, note.pin_hash, note.pin_salt);
    if (!ok) return { success: false, errorMessage: 'Incorrect PIN' };

    if (note.encrypted_payload) {
      try {
        const payload = await decryptNotePayload(note.encrypted_payload, pin, note.pin_salt);
        if (payload) return { success: true, payload };
      } catch (e) {
        AppLogger.warn('StorageManager', 'decrypt failed', e);
      }
    }

    return {
      success: true,
      payload: {
        title: note.title || '',
        body: note.body || '',
        checklist_items: note.checklist_items || [],
      },
    };
  }

  public static async saveUnlockedNote(
    noteId: number,
    payload: NotePayloadData,
    pinOrExtras?: string | Partial<NoteRecord>
  ): Promise<NoteRecord | null> {
    const note = this.getNoteById(noteId);
    if (!note) return null;
    const pin = typeof pinOrExtras === 'string' ? pinOrExtras : undefined;
    const extras = typeof pinOrExtras === 'object' && pinOrExtras ? pinOrExtras : {};
    if (note.is_locked && pin && note.pin_salt) {
      try {
        const encrypted_payload = await encryptNotePayload(
          {
            title: payload.title || '',
            body: payload.body || '',
            checklist_items: payload.checklist_items || [],
          },
          pin,
          note.pin_salt
        );
        return this.updateNote(noteId, {
          encrypted_payload,
          title: note.lock_mode === 'private' ? '' : payload.title || note.title,
          body: '',
          checklist_items: [],
          ...extras,
        });
      } catch (e) {
        AppLogger.warn('StorageManager', 'saveUnlockedNote encrypt failed', e);
      }
    }
    return this.updateNote(noteId, {
      title: payload.title,
      body: payload.body,
      checklist_items: payload.checklist_items || [],
      ...extras,
    });
  }

  public static async lockNoteTransactionally(
    noteId: number,
    pin: string
  ): Promise<NoteRecord | null> {
    return this.setNotePinLock(noteId, pin);
  }

  public static getNoteRevisions(noteId: number): NoteRevisionRecord[] {
    try {
      return typeof SqliteRepository.getNoteRevisions === 'function'
        ? SqliteRepository.getNoteRevisions(noteId)
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

  public static getRecordings(): RecordingRecord[] {
    if (this.recordingsCache) return this.recordingsCache;
    try {
      this.recordingsCache =
        typeof SqliteRepository.getAllRecordings === 'function'
          ? SqliteRepository.getAllRecordings()
          : [];
    } catch {
      this.recordingsCache = [];
    }
    return this.recordingsCache ?? [];
  }

  public static getRecordingsForNote(noteId: number): RecordingRecord[] {
    return this.getRecordings().filter((r) => r.note_id === noteId);
  }

  public static addRecording(rec: Omit<RecordingRecord, 'id'> & { id?: number }): RecordingRecord {
    const row: RecordingRecord = { ...rec, id: rec.id ?? Date.now() };
    try {
      if (typeof SqliteRepository.saveRecording === 'function') {
        SqliteRepository.saveRecording(row);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'saveRecording failed', e);
    }
    this.recordingsCache = null;
    return row;
  }

  public static deleteRecording(_id: string | number): void {
    // SQLite has no recording-delete path yet (see Q-011); only the in-memory
    // cache is invalidated here.
    this.recordingsCache = null;
  }

  public static getTranscripts(): TranscriptRecord[] {
    if (this.transcriptsCache) return this.transcriptsCache;
    try {
      this.transcriptsCache =
        typeof SqliteRepository.getAllTranscripts === 'function'
          ? SqliteRepository.getAllTranscripts()
          : [];
    } catch {
      this.transcriptsCache = [];
    }
    return this.transcriptsCache ?? [];
  }

  public static getTranscriptForRecording(
    recordingId: string | number
  ): TranscriptRecord | undefined {
    return this.getTranscripts().find((t) => String(t.recording_id) === String(recordingId));
  }

  public static addTranscript(t: Omit<TranscriptRecord, 'id'> & { id?: number }): TranscriptRecord {
    const row: TranscriptRecord = { ...t, id: t.id ?? Date.now() };
    try {
      if (typeof SqliteRepository.saveTranscript === 'function') {
        SqliteRepository.saveTranscript(row);
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
        typeof SqliteRepository.getAllOcrScans === 'function'
          ? SqliteRepository.getAllOcrScans()
          : [];
    } catch {
      this.ocrScansCache = [];
    }
    return this.ocrScansCache ?? [];
  }

  public static getOcrScansForNote(noteId: number): OcrScanRecord[] {
    return this.getOcrScans().filter((s) => s.note_id === noteId);
  }

  public static addOcrScan(scan: Omit<OcrScanRecord, 'id'> & { id?: number }): OcrScanRecord {
    const row: OcrScanRecord = { ...scan, id: scan.id ?? Date.now() };
    try {
      if (typeof SqliteRepository.saveOcrScan === 'function') {
        SqliteRepository.saveOcrScan(row);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'saveOcrScan failed', e);
    }
    this.ocrScansCache = null;
    return row;
  }

  public static deleteOcrScan(_id: string | number): void {
    // SQLite has no OCR-scan delete path yet (see Q-011); only the in-memory
    // cache is invalidated here.
    this.ocrScansCache = null;
  }

  public static getSyncConflicts(
    status: 'open' | 'resolved' | 'ignored' = 'open'
  ): SyncConflictRecord[] {
    try {
      return typeof SqliteRepository.getSyncConflicts === 'function'
        ? SqliteRepository.getSyncConflicts(status)
        : [];
    } catch {
      return [];
    }
  }

  public static resolveSyncConflict(id: string): void {
    try {
      if (typeof SqliteRepository.resolveSyncConflict === 'function') {
        SqliteRepository.resolveSyncConflict(id);
      }
    } catch (e) {
      AppLogger.warn('StorageManager', 'resolveSyncConflict failed', e);
    }
  }

  public static getSqliteStats(): SqliteStats {
    try {
      if (typeof SqliteRepository.getDatabaseStats === 'function') {
        return SqliteRepository.getDatabaseStats();
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
    totalNotes: number;
    totalRecordings: number;
    activeNotes: number;
    archivedNotes: number;
  } {
    const s = this.getSqliteStats();
    const notes = this.getNotes();
    return {
      notes: s.notesCount,
      events: s.eventsCount,
      recordings: s.recordingsCount,
      ocrScans: s.ocrScansCount,
      approximateBytes: s.databaseSizeBytes,
      totalNotes: notes.length,
      totalRecordings: s.recordingsCount,
      activeNotes: notes.filter((n) => !n.status || n.status === 'active').length,
      archivedNotes: notes.filter((n) => n.status === 'archived').length,
    };
  }

  public static async checkDatabaseIntegrity(): Promise<{
    ok: boolean;
    result: string;
    status: 'ok' | 'corrupted';
    details: string;
  }> {
    try {
      const r = await this.db.checkIntegrity();
      return {
        ok: r.ok,
        result: r.result,
        status: r.ok ? 'ok' : 'corrupted',
        details: r.result,
      };
    } catch (_e) {
      const e = asErrorLike(_e);
      return {
        ok: false,
        result: e?.message || 'integrity check failed',
        status: 'corrupted',
        details: e?.message || 'integrity check failed',
      };
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

  public static async cleanOrphanedMedia(): Promise<{ cleanedCount: number }> {
    // Media pruning lives on SqliteRepository (findOrphanMediaKeys /
    // removeOrphanMediaRecord); this helper has no separate sweep to run.
    return { cleanedCount: 0 };
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

  public static searchNotes(options: SearchOptions): SearchResult {
    try {
      return SqliteRepository.searchNotesWithCount(options);
    } catch (e) {
      AppLogger.warn('StorageManager', 'searchNotes failed', e);
    }
    const q = (options.query || '').toLowerCase();
    let notes = this.getNotes();
    if (q) {
      notes = notes.filter(
        (n) => (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q)
      );
    }
    if (options.status) notes = notes.filter((n) => n.status === options.status);
    if (options.eventId != null) notes = notes.filter((n) => n.event_id === options.eventId);
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    return { notes: notes.slice(offset, offset + limit), totalCount: notes.length };
  }

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
    } catch (_e) {
      const e = asErrorLike(_e);
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

  /**
   * Cloud backups are ENCRYPTED (AES-256-GCM via CloudBackupCrypto): with the
   * user's session passphrase when set, otherwise the device vault key held in
   * the Keystore. The previous implementation returned the raw JSON dump while
   * the UI and the capability inventory both called it "encrypted" — a false
   * security claim, since the archive is uploaded to a third-party cloud.
   */
  public static async exportCloudBackupArchive(): Promise<Blob> {
    const json = this.exportFullDump();
    return CloudBackupCrypto.encryptArchive(json);
  }

  /** Synchronous plaintext export retained for local, in-app previews only. */
  public static exportCloudBackupPlaintext(): Blob {
    return new Blob([this.exportFullDump()], { type: 'application/json' });
  }

  public static importCloudBackupArchive(
    payload: string | Blob,
    _opts?: unknown
  ): { success: boolean; error?: string } {
    if (typeof payload === 'string') return this.importFullDump(payload);
    return { success: false, error: 'Async blob import not supported in sync path' };
  }

  /**
   * Restore path for a downloaded archive. Accepts an encrypted envelope (the
   * normal case) or a legacy plaintext dump, decrypts when needed, then imports.
   * Written because the synchronous variant above rejects every Blob, so restore
   * could never succeed from a real download.
   */
  public static async importCloudBackupArchiveAsync(
    payload: string | Blob,
    opts?: { userPassphrase?: string; allowLegacyUnencrypted?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    let plaintext: string;
    try {
      plaintext = await CloudBackupCrypto.decryptArchive(payload as Blob | string, {
        userPassphrase: opts?.userPassphrase,
        allowLegacyUnencrypted: opts?.allowLegacyUnencrypted ?? true,
      });
    } catch (e) {
      const err = e as Error;
      return { success: false, error: err?.message || 'Could not decrypt backup archive.' };
    }
    return this.importFullDump(plaintext);
  }

  public static exportCloudBackup(): string {
    return this.exportFullDump();
  }

  public static exportNotesAsJson(ids?: number[]): string {
    let notes = this.getNotes();
    if (ids && ids.length) notes = notes.filter((n) => ids.includes(n.id));
    return JSON.stringify(notes, null, 2);
  }

  public static exportNotesAsMarkdown(ids?: number[]): string {
    let notes = this.getNotes();
    if (ids && ids.length) notes = notes.filter((n) => ids.includes(n.id));
    return notes.map((n) => `# ${n.title || 'Untitled'}\n\n${n.body || ''}`).join('\n\n---\n\n');
  }

  public static importLegacyUnencryptedBackup(json: string): { success: boolean; error?: string } {
    return this.importFullDump(json);
  }

  public static exactRestoreFromDump(json: string): { success: boolean; error?: string } {
    return this.importFullDump(json);
  }

  public static async checkColdStartIntegrity(): Promise<void> {}
  public static async autoMaintenanceIfNeeded(): Promise<void> {}
}

export const SQLiteDatabase = StorageManager;
