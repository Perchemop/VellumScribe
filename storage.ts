import {
  EventRecord,
  NoteRecord,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
} from '../types';
import {
  INITIAL_EVENTS,
  INITIAL_NOTES,
  INITIAL_RECORDINGS,
  INITIAL_TRANSCRIPTS,
  INITIAL_OCR_SCANS,
} from './sampleData';
import {
  hashPin,
  verifyPin,
  encryptNotePayload,
  decryptNotePayload,
  NotePayloadData,
} from './cryptoUtils';

const STORAGE_KEYS = {
  EVENTS: 'omninote_sqlite_events_v1',
  NOTES: 'omninote_sqlite_notes_v1',
  RECORDINGS: 'omninote_sqlite_recordings_v1',
  TRANSCRIPTS: 'omninote_sqlite_transcripts_v1',
  OCR_SCANS: 'omninote_sqlite_ocr_scans_v1',
};

/**
 * Storage quota & safe persistence helper with try/catch quota protection
 */
function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    if (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    ) {
      console.error(`[StorageManager] LocalStorage quota exceeded while saving key "${key}".`, err);
    } else {
      console.error(`[StorageManager] Failed to write key "${key}" to LocalStorage.`, err);
    }
    return false;
  }
}

/**
 * High-performance, offline-first Local Storage Engine with in-memory caching,
 * quota protection, and transactional record management.
 */
export class StorageManager {
  // Safe KV Accessors
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
      console.warn(`[StorageManager] Failed to read key "${key}":`, e);
      return fallback;
    }
  }

  public static setItem<T>(key: string, value: T): boolean {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      return safeSetItem(key, serialized);
    } catch (e) {
      console.error(`[StorageManager] Failed to write key "${key}":`, e);
      return false;
    }
  }

  public static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[StorageManager] Failed to remove key "${key}":`, e);
    }
  }

  public static hasItem(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  }

  // In-memory cache layer to eliminate O(n) serialization overhead on reads
  private static eventsCache: EventRecord[] | null = null;
  private static notesCache: NoteRecord[] | null = null;
  private static recordingsCache: RecordingRecord[] | null = null;
  private static transcriptsCache: TranscriptRecord[] | null = null;
  private static ocrScansCache: OcrScanRecord[] | null = null;

  // --- EVENTS ---
  public static getEvents(): EventRecord[] {
    if (this.eventsCache !== null) {
      return this.eventsCache;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
      this.eventsCache = data ? JSON.parse(data) : [...INITIAL_EVENTS];
    } catch {
      this.eventsCache = [...INITIAL_EVENTS];
    }
    return this.eventsCache || [];
  }

  public static saveEvents(events: EventRecord[]) {
    this.eventsCache = events;
    safeSetItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  }

  public static addEvent(event: Omit<EventRecord, 'id'>): EventRecord {
    const events = [...this.getEvents()];
    const newId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1;
    const newEvent: EventRecord = { ...event, id: newId };
    events.unshift(newEvent);
    this.saveEvents(events);
    return newEvent;
  }

  public static updateEvent(id: number, updates: Partial<EventRecord>): EventRecord | null {
    const events = [...this.getEvents()];
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    events[idx] = { ...events[idx], ...updates };
    this.saveEvents(events);
    return events[idx];
  }

  public static deleteEvent(id: number): boolean {
    const events = this.getEvents().filter((e) => e.id !== id);
    this.saveEvents(events);

    // Cascading delete notes associated with this event
    const notes = this.getNotes();
    const notesToDelete = notes.filter((n) => n.event_id === id);
    for (const note of notesToDelete) {
      this.deleteNote(note.id);
    }
    return true;
  }

  // --- NOTES ---
  public static getNotes(): NoteRecord[] {
    if (this.notesCache !== null) {
      return this.notesCache;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTES);
      this.notesCache = data ? JSON.parse(data) : [...INITIAL_NOTES];
    } catch {
      this.notesCache = [...INITIAL_NOTES];
    }
    return this.notesCache || [];
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

  public static saveNotes(notes: NoteRecord[]) {
    this.notesCache = notes;
    safeSetItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
  }

  public static getNotesForEvent(eventId: number): NoteRecord[] {
    return this.getActiveNotes().filter((n) => n.event_id === eventId);
  }

  public static getNoteById(id: number): NoteRecord | undefined {
    return this.getNotes().find((n) => n.id === id);
  }

  public static addNote(note: Omit<NoteRecord, 'id'>): NoteRecord {
    const notes = [...this.getNotes()];
    const newId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 101;
    const newNote: NoteRecord = {
      ...note,
      id: newId,
      status: note.status || 'active',
      note_type: note.note_type || 'text',
      checklist_items: note.checklist_items || [],
      cloud_save_enabled: note.cloud_save_enabled ?? false,
      created_at: note.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };
    notes.unshift(newNote);
    this.saveNotes(notes);
    return newNote;
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

  public static duplicateNote(id: number): NoteRecord | null {
    const original = this.getNoteById(id);
    if (!original) return null;
    const { id: _, ...rest } = original;
    return this.addNote({
      ...rest,
      title: `${original.title || 'Untitled'} (Copy)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  public static mergeNotes(noteIds: number[], mergedTitle?: string): NoteRecord | null {
    const allNotes = this.getNotes();
    const targetNotes = allNotes.filter((n) => noteIds.includes(n.id));
    if (targetNotes.length === 0) return null;

    const title = mergedTitle || `Merged: ${targetNotes.map((n) => n.title || 'Untitled').join(', ')}`;
    const mergedBody = targetNotes
      .map((n) => `### ${n.title || 'Note'}\n*Created: ${new Date(n.created_at).toLocaleDateString()}*\n\n${n.body}`)
      .join('\n\n---\n\n');

    const mergedTags = Array.from(new Set(targetNotes.flatMap((n) => n.tags || [])));
    const primaryEventId = targetNotes[0].event_id;

    return this.addNote({
      event_id: primaryEventId,
      title,
      body: mergedBody,
      tags: mergedTags,
      note_type: 'text',
      status: 'active',
      created_at: new Date().toISOString(),
    });
  }

  public static emptyTrash(): number {
    const notes = this.getNotes();
    const trashIds = notes.filter((n) => n.status === 'trash').map((n) => n.id);
    for (const id of trashIds) {
      this.deleteNote(id);
    }
    return trashIds.length;
  }

  public static toggleCloudSave(id: number): NoteRecord | null {
    const notes = [...this.getNotes()];
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    notes[idx].cloud_save_enabled = !notes[idx].cloud_save_enabled;
    notes[idx].updated_at = new Date().toISOString();
    this.saveNotes(notes);
    return notes[idx];
  }

  public static updateNote(id: number, updates: Partial<NoteRecord>): NoteRecord | null {
    const notes = [...this.getNotes()];
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    const currentVer = notes[idx].version || 1;
    notes[idx] = {
      ...notes[idx],
      ...updates,
      updated_at: new Date().toISOString(),
      version: currentVer + 1,
    };
    this.saveNotes(notes);
    return notes[idx];
  }

  /**
   * Set hashed PIN security and AES-256-GCM encryption on a note.
   * Blanks the plaintext body, checklist_items, and sketch_data in persistent storage.
   */
  public static async setNotePinLock(
    id: number,
    plaintextPin: string,
    payload?: NotePayloadData
  ): Promise<NoteRecord | null> {
    const note = this.getNoteById(id);
    if (!note) return null;

    const { hash, salt } = await hashPin(plaintextPin);
    const dataToEncrypt: NotePayloadData = payload || {
      body: note.body || '',
      checklist_items: note.checklist_items || [],
      sketch_data: note.sketch_data || undefined,
    };

    const encryptedPayload = await encryptNotePayload(dataToEncrypt, plaintextPin, salt);

    return this.updateNote(id, {
      is_locked: true,
      pin_hash: hash,
      pin_salt: salt,
      encrypted_payload: encryptedPayload,
      body: '', // Zero out plaintext fields
      checklist_items: [],
      sketch_data: undefined,
      lock_pin: undefined, // Clear legacy plaintext representation
    });
  }

  /**
   * Session-only verification and decryption of a locked note.
   * Does NOT modify is_locked or destroy the encryption payload.
   */
  public static async verifyAndUnlockNote(
    note: NoteRecord,
    enteredPin: string
  ): Promise<{ success: boolean; payload?: NotePayloadData }> {
    const isMatch = await verifyPin(
      enteredPin,
      note.pin_hash,
      note.pin_salt,
      note.lock_pin
    );

    if (!isMatch) {
      return { success: false };
    }

    // If encrypted_payload exists, decrypt it with the entered PIN
    if (note.encrypted_payload && note.pin_salt) {
      const decrypted = await decryptNotePayload(note.encrypted_payload, enteredPin, note.pin_salt);
      if (decrypted) {
        return { success: true, payload: decrypted };
      }
    }

    // Legacy unencrypted lock fallback (note had body in plaintext)
    return {
      success: true,
      payload: {
        body: note.body,
        checklist_items: note.checklist_items,
        sketch_data: note.sketch_data,
      },
    };
  }

  /**
   * Explicit removal of PIN protection. Verifies PIN, decrypts note, restores plaintext, and clears lock.
   */
  public static async removeNotePinLock(id: number, enteredPin: string): Promise<NoteRecord | null> {
    const note = this.getNoteById(id);
    if (!note) return null;

    const verifyResult = await this.verifyAndUnlockNote(note, enteredPin);
    if (!verifyResult.success || !verifyResult.payload) {
      return null;
    }

    return this.updateNote(id, {
      is_locked: false,
      pin_hash: undefined,
      pin_salt: undefined,
      encrypted_payload: undefined,
      lock_pin: undefined,
      body: verifyResult.payload.body,
      checklist_items: verifyResult.payload.checklist_items || [],
      sketch_data: verifyResult.payload.sketch_data || undefined,
    });
  }

  /**
   * Save an active editing session of a note. If note is PIN-locked, re-encrypts the payload.
   */
  public static async saveUnlockedNote(
    id: number,
    updates: Partial<NoteRecord>,
    pinHeld?: string
  ): Promise<NoteRecord | null> {
    const note = this.getNoteById(id);
    if (!note) return null;

    if (note.is_locked && pinHeld && note.pin_salt) {
      const payload: NotePayloadData = {
        body: updates.body !== undefined ? updates.body : (note.body || ''),
        checklist_items: updates.checklist_items !== undefined ? updates.checklist_items : (note.checklist_items || []),
        sketch_data: updates.sketch_data !== undefined ? updates.sketch_data : (note.sketch_data || undefined),
      };

      const encryptedPayload = await encryptNotePayload(payload, pinHeld, note.pin_salt);

      const sanitizedUpdates = { ...updates };
      delete sanitizedUpdates.body;
      delete sanitizedUpdates.checklist_items;
      delete sanitizedUpdates.sketch_data;

      return this.updateNote(id, {
        ...sanitizedUpdates,
        encrypted_payload: encryptedPayload,
        body: '',
        checklist_items: [],
        sketch_data: undefined,
      });
    }

    return this.updateNote(id, updates);
  }

  /**
   * Unlock or remove PIN security from note after validating PIN (compatibility helper)
   */
  public static async unlockNoteWithPin(note: NoteRecord, enteredPin: string): Promise<boolean> {
    const isMatch = await verifyPin(
      enteredPin,
      note.pin_hash,
      note.pin_salt,
      note.lock_pin
    );
    return isMatch;
  }

  public static deleteNote(id: number): boolean {
    const notes = this.getNotes().filter((n) => n.id !== id);
    this.saveNotes(notes);

    // Cascading delete recordings and OCR scans
    const recordings = this.getRecordings();
    const recsToDelete = recordings.filter((r) => r.note_id === id);
    for (const rec of recsToDelete) {
      this.deleteRecording(rec.id);
    }

    const scans = this.getOcrScans();
    const scansRemaining = scans.filter((s) => s.note_id !== id);
    this.saveOcrScans(scansRemaining);
    return true;
  }

  // --- BATCH NOTE OPERATIONS ---
  public static batchTrashNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.status = 'trash';
        note.trashed_at = now;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchRestoreNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.status = 'active';
        note.trashed_at = undefined;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchArchiveNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.status = 'archived';
        note.archived_at = now;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchUnarchiveNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.status = 'active';
        note.archived_at = undefined;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchDeleteNotesPermanently(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const idSet = new Set(ids);
    const notes = this.getNotes().filter((n) => !idSet.has(n.id));
    this.saveNotes(notes);

    // Cascading delete recordings and OCR scans
    const recordings = this.getRecordings().filter((r) => !idSet.has(r.note_id));
    this.saveRecordings(recordings);

    const scans = this.getOcrScans().filter((s) => !idSet.has(s.note_id));
    this.saveOcrScans(scans);

    return ids.length;
  }

  public static batchPinNotes(ids: number[], isPinned: boolean): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.is_pinned = isPinned;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchMoveNotes(ids: number[], newEventId: number): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.event_id = newEventId;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchColorNotes(ids: number[], color: string): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.color = color || undefined;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchAddTagToNotes(ids: number[], tag: string): number {
    if (!ids || ids.length === 0 || !tag.trim()) return 0;
    const cleanTag = tag.trim().replace(/^#/, '');
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        const existingTags = note.tags || [];
        if (!existingTags.includes(cleanTag)) {
          note.tags = [...existingTags, cleanTag];
          note.updated_at = now;
          count++;
        }
      }
    }
    this.saveNotes(notes);
    return count;
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
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    const { hash, salt } = await hashPin(pin);

    for (const note of notes) {
      if (ids.includes(note.id)) {
        const payload: NotePayloadData = {
          body: note.body || '',
          checklist_items: note.checklist_items || [],
          sketch_data: note.sketch_data || undefined,
        };
        const encryptedPayload = await encryptNotePayload(payload, pin, salt);

        note.is_locked = true;
        note.pin_hash = hash;
        note.pin_salt = salt;
        note.encrypted_payload = encryptedPayload;
        note.body = '';
        note.checklist_items = [];
        note.sketch_data = undefined;
        note.lock_pin = undefined;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static async batchUnlockNotes(
    ids: number[],
    pin: string
  ): Promise<{ unlockedCount: number; failedIds: number[] }> {
    if (!ids || ids.length === 0 || !pin) {
      return { unlockedCount: 0, failedIds: ids || [] };
    }

    const notes = [...this.getNotes()];
    let unlockedCount = 0;
    const failedIds: number[] = [];
    const now = new Date().toISOString();

    for (const note of notes) {
      if (ids.includes(note.id)) {
        if (!note.is_locked) {
          continue;
        }

        const verifyResult = await this.verifyAndUnlockNote(note, pin);
        if (verifyResult.success && verifyResult.payload) {
          note.is_locked = false;
          note.pin_hash = undefined;
          note.pin_salt = undefined;
          note.encrypted_payload = undefined;
          note.lock_pin = undefined;
          note.body = verifyResult.payload.body;
          note.checklist_items = verifyResult.payload.checklist_items || [];
          note.sketch_data = verifyResult.payload.sketch_data || undefined;
          note.updated_at = now;
          unlockedCount++;
        } else {
          failedIds.push(note.id);
        }
      }
    }

    this.saveNotes(notes);
    return { unlockedCount, failedIds };
  }

  public static batchToggleCloudSave(ids: number[], enabled: boolean): number {
    if (!ids || ids.length === 0) return 0;
    const notes = [...this.getNotes()];
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.cloud_save_enabled = enabled;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

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
      exported_at: new Date().toISOString(),
      notes_count: targetNotes.length,
      notes: targetNotes,
      recordings: allRecordings,
      ocr_scans: allScans,
    };

    return JSON.stringify(exportBundle, null, 2);
  }

  // --- RECORDINGS ---
  public static getRecordings(): RecordingRecord[] {
    if (this.recordingsCache !== null) {
      return this.recordingsCache;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RECORDINGS);
      this.recordingsCache = data ? JSON.parse(data) : [...INITIAL_RECORDINGS];
    } catch {
      this.recordingsCache = [...INITIAL_RECORDINGS];
    }
    return this.recordingsCache || [];
  }

  public static saveRecordings(recordings: RecordingRecord[]) {
    this.recordingsCache = recordings;
    safeSetItem(STORAGE_KEYS.RECORDINGS, JSON.stringify(recordings));
  }

  public static getRecordingsForNote(noteId: number): RecordingRecord[] {
    return this.getRecordings().filter((r) => r.note_id === noteId);
  }

  public static addRecording(rec: Omit<RecordingRecord, 'id'>): RecordingRecord {
    const recordings = [...this.getRecordings()];
    const newId = recordings.length > 0 ? Math.max(...recordings.map((r) => r.id)) + 1 : 201;
    const newRec: RecordingRecord = {
      ...rec,
      id: newId,
      created_at: rec.created_at || new Date().toISOString(),
    };
    recordings.unshift(newRec);
    this.saveRecordings(recordings);
    return newRec;
  }

  public static deleteRecording(id: number): boolean {
    const recordings = this.getRecordings().filter((r) => r.id !== id);
    this.saveRecordings(recordings);

    // Cascading delete transcripts
    const transcripts = this.getTranscripts().filter((t) => t.recording_id !== id);
    this.saveTranscripts(transcripts);
    return true;
  }

  // --- TRANSCRIPTS ---
  public static getTranscripts(): TranscriptRecord[] {
    if (this.transcriptsCache !== null) {
      return this.transcriptsCache;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSCRIPTS);
      this.transcriptsCache = data ? JSON.parse(data) : [...INITIAL_TRANSCRIPTS];
    } catch {
      this.transcriptsCache = [...INITIAL_TRANSCRIPTS];
    }
    return this.transcriptsCache || [];
  }

  public static saveTranscripts(transcripts: TranscriptRecord[]) {
    this.transcriptsCache = transcripts;
    safeSetItem(STORAGE_KEYS.TRANSCRIPTS, JSON.stringify(transcripts));
  }

  public static getTranscriptForRecording(recordingId: number): TranscriptRecord | undefined {
    return this.getTranscripts().find((t) => t.recording_id === recordingId);
  }

  public static addTranscript(t: Omit<TranscriptRecord, 'id'>): TranscriptRecord {
    const transcripts = [...this.getTranscripts()];
    const newId = transcripts.length > 0 ? Math.max(...transcripts.map((x) => x.id)) + 1 : 301;
    const newTranscript: TranscriptRecord = {
      ...t,
      id: newId,
      created_at: t.created_at || new Date().toISOString(),
    };
    transcripts.unshift(newTranscript);
    this.saveTranscripts(transcripts);
    return newTranscript;
  }

  // --- OCR SCANS ---
  public static getOcrScans(): OcrScanRecord[] {
    if (this.ocrScansCache !== null) {
      return this.ocrScansCache;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OCR_SCANS);
      this.ocrScansCache = data ? JSON.parse(data) : [...INITIAL_OCR_SCANS];
    } catch {
      this.ocrScansCache = [...INITIAL_OCR_SCANS];
    }
    return this.ocrScansCache || [];
  }

  public static saveOcrScans(scans: OcrScanRecord[]) {
    this.ocrScansCache = scans;
    safeSetItem(STORAGE_KEYS.OCR_SCANS, JSON.stringify(scans));
  }

  public static getOcrScansForNote(noteId: number): OcrScanRecord[] {
    return this.getOcrScans().filter((s) => s.note_id === noteId);
  }

  public static addOcrScan(scan: Omit<OcrScanRecord, 'id'>): OcrScanRecord {
    const scans = [...this.getOcrScans()];
    const newId = scans.length > 0 ? Math.max(...scans.map((s) => s.id)) + 1 : 401;
    const newScan: OcrScanRecord = {
      ...scan,
      id: newId,
      created_at: scan.created_at || new Date().toISOString(),
    };
    scans.unshift(newScan);
    this.saveOcrScans(scans);
    return newScan;
  }

  public static deleteOcrScan(id: number): boolean {
    const scans = this.getOcrScans().filter((s) => s.id !== id);
    this.saveOcrScans(scans);
    return true;
  }

  // --- STORAGE STATS & USAGE METRICS ---
  public static getStorageStats(): {
    totalNotes: number;
    cloudSavedNotes: number;
    localOnlyNotes: number;
    totalRecordings: number;
    cloudRecordings: number;
    localOnlyRecordings: number;
    estimatedBytesUsed: number;
  } {
    const notes = this.getNotes();
    const recordings = this.getRecordings();
    const cloudSavedNotesList = notes.filter((n) => n.cloud_save_enabled);
    const cloudNoteIds = new Set(cloudSavedNotesList.map((n) => n.id));
    const cloudRecordingsList = recordings.filter((r) => cloudNoteIds.has(r.note_id));

    let bytesUsed = 0;
    try {
      for (const key of Object.values(STORAGE_KEYS)) {
        const item = localStorage.getItem(key);
        if (item) bytesUsed += item.length * 2; // UTF-16 characters
      }
    } catch {
      bytesUsed = 0;
    }

    return {
      totalNotes: notes.length,
      cloudSavedNotes: cloudSavedNotesList.length,
      localOnlyNotes: notes.length - cloudSavedNotesList.length,
      totalRecordings: recordings.length,
      cloudRecordings: cloudRecordingsList.length,
      localOnlyRecordings: recordings.length - cloudRecordingsList.length,
      estimatedBytesUsed: bytesUsed,
    };
  }

  // --- BACKUP & RESTORE DUMP ---
  public static exportFullDump(): string {
    const bundle = {
      version: '2.5',
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

  public static exportCloudBackupDump(): {
    dumpJson: string;
    cloudNotes: NoteRecord[];
    cloudRecordings: RecordingRecord[];
    cloudTranscripts: TranscriptRecord[];
    cloudScans: OcrScanRecord[];
  } {
    const allNotes = this.getNotes();
    const cloudNotes = allNotes.filter((n) => n.cloud_save_enabled === true);
    const cloudNoteIds = new Set(cloudNotes.map((n) => n.id));

    const cloudRecordings = this.getRecordings().filter((r) => cloudNoteIds.has(r.note_id));
    const cloudRecIds = new Set(cloudRecordings.map((r) => r.id));

    const cloudTranscripts = this.getTranscripts().filter((t) => cloudRecIds.has(t.recording_id));
    const cloudScans = this.getOcrScans().filter((s) => cloudNoteIds.has(s.note_id));

    const relevantEventIds = new Set(cloudNotes.map((n) => n.event_id));
    const cloudEvents = this.getEvents().filter((e) => relevantEventIds.has(e.id));

    const bundle = {
      version: '2.5',
      export_timestamp: new Date().toISOString(),
      backup_type: 'selective_cloud_save',
      schema: {
        events: cloudEvents,
        notes: cloudNotes,
        recordings: cloudRecordings,
        transcripts: cloudTranscripts,
        ocr_scans: cloudScans,
      },
    };

    return {
      dumpJson: JSON.stringify(bundle, null, 2),
      cloudNotes,
      cloudRecordings,
      cloudTranscripts,
      cloudScans,
    };
  }

  public static importFullDump(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.schema) {
        if (parsed.schema.events) this.saveEvents(parsed.schema.events);
        if (parsed.schema.notes) this.saveNotes(parsed.schema.notes);
        if (parsed.schema.recordings) this.saveRecordings(parsed.schema.recordings);
        if (parsed.schema.transcripts) this.saveTranscripts(parsed.schema.transcripts);
        if (parsed.schema.ocr_scans) this.saveOcrScans(parsed.schema.ocr_scans);
        return true;
      }
    } catch (e) {
      console.error('Failed to import database dump', e);
    }
    return false;
  }

  public static exportFullBackup(): string {
    return this.exportFullDump();
  }

  public static importFullBackup(jsonContent: string): { success: boolean; message: string } {
    const success = this.importFullDump(jsonContent);
    if (success) {
      return { success: true, message: 'Backup successfully imported into local store.' };
    }
    return { success: false, message: 'Invalid backup file format.' };
  }

  public static resetToFactoryDefaults() {
    this.saveEvents(INITIAL_EVENTS);
    this.saveNotes(INITIAL_NOTES);
    this.saveRecordings(INITIAL_RECORDINGS);
    this.saveTranscripts(INITIAL_TRANSCRIPTS);
    this.saveOcrScans(INITIAL_OCR_SCANS);
  }
}

/**
 * Backward compatible alias for components and utilities
 */
export const SQLiteDatabase = StorageManager;
export const LocalStorageStore = StorageManager;
