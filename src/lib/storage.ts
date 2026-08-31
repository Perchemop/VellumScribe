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
  public static async initialize(): Promise<void> {
    const notes = this.getNotes();
    let changed = false;

    // Migrate legacy data URLs to binary media storage
    for (const note of notes) {
      if (note.sketch_data && !note.sketch_media_key && !note.is_locked) {
        try {
          const mediaKey = `sketch_${note.id}_${Date.now()}.png`;
          const response = await fetch(note.sketch_data);
          const blob = await response.blob();
          
          // Import MediaRepository dynamically to avoid circular dependency
          const { MediaRepository } = await import('./MediaRepository');
          await MediaRepository.putBinary(mediaKey, blob);
          
          note.sketch_media_key = mediaKey;
          note.sketch_data = undefined;
          changed = true;
        } catch (e) {
          console.warn(`Failed to migrate sketch for note ${note.id}`, e);
        }
      }
    }
    
    if (changed) {
      this.saveNotes(notes);
    }
  }

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

  public static saveEvents(events: EventRecord[]): boolean {
    if (safeSetItem(STORAGE_KEYS.EVENTS, JSON.stringify(events))) {
      this.eventsCache = events;
      return true;
    }
    return false;
  }

  public static addEvent(event: Omit<EventRecord, 'id'>): EventRecord {
    const events = [...this.getEvents()];
    const newId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1;
    const newEvent: EventRecord = { ...event, id: newId };
    events.unshift(newEvent);
    if (!this.saveEvents(events)) {
      throw new Error("Failed to persist new event to storage.");
    }
    return newEvent;
  }

  public static updateEvent(id: number, updates: Partial<EventRecord>): EventRecord | null {
    const events = [...this.getEvents()];
    const idx = events.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    events[idx] = { ...events[idx], ...updates };
    if (!this.saveEvents(events)) {
      throw new Error("Failed to persist event updates to storage.");
    }
    return events[idx];
  }

  public static deleteEvent(id: number): boolean {
    const events = this.getEvents();
    const eventIndex = events.findIndex((e) => e.id === id);
    if (eventIndex === -1) return false;

    // Safety Requirement: Deleting an event/category must NEVER cascade-delete notes.
    // Instead, move any notes associated with this event to "General"
    const notes = this.getNotes();
    const notesToMove = notes.filter((n) => n.event_id === id);
    
    if (notesToMove.length > 0) {
      let generalEvent = events.find((e) => e.title.toLowerCase() === 'general' && e.id !== id);
      if (!generalEvent) {
        // Create "General" category
        const newGeneral = this.addEvent({
          title: 'General',
          event_date: new Date().toISOString().slice(0, 10),
          category: 'personal',
          color: '#6b7280',
        });
        generalEvent = newGeneral;
      }
      
      if (generalEvent) {
        for (const note of notesToMove) {
          this.updateNote(note.id, { event_id: generalEvent.id });
        }
      }
    }

    const updatedEvents = this.getEvents().filter((e) => e.id !== id);
    return this.saveEvents(updatedEvents);
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

  public static saveNotes(notes: NoteRecord[]): boolean {
    if (safeSetItem(STORAGE_KEYS.NOTES, JSON.stringify(notes))) {
      this.notesCache = notes;
      return true;
    }
    return false;
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
      created_at: note.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };
    notes.unshift(newNote);
    if (!this.saveNotes(notes)) {
      throw new Error("Failed to persist new note to storage.");
    }
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
    if (!this.saveNotes(notes)) {
      throw new Error("Failed to persist note updates to storage.");
    }
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

    // Initialize session automatically
    const { UnlockSessionManager } = await import('./UnlockSessionManager');
    if (note.pin_salt) {
      await UnlockSessionManager.createSession(note.id, enteredPin, note.pin_salt);
    }

    // If encrypted_payload exists, decrypt it
    if (note.encrypted_payload && note.pin_salt) {
      const { decryptNotePayload, decryptNotePayloadV2 } = await import('./cryptoUtils');
      const sessionKey = UnlockSessionManager.getSessionKey(note.id);
      
      let decrypted: NotePayloadData | null = null;
      
      try {
        const parsed = JSON.parse(note.encrypted_payload);
        if (parsed.v === 2 && sessionKey) {
          decrypted = await decryptNotePayloadV2(note.encrypted_payload, sessionKey);
        } else {
          decrypted = await decryptNotePayload(note.encrypted_payload, enteredPin, note.pin_salt);
          // Transparent upgrade to V2 on next save
          if (decrypted) {
             // We do this by triggering an automatic resave with V2 later or directly if we want
             // But the instructions say "transparently upgraded to v2 after successful PIN verification"
             this.saveUnlockedNote(note.id, decrypted, enteredPin).catch(console.warn);
          }
        }
      } catch (e) {
        // Fallback if not JSON or parsing fails for v2 logic
        decrypted = await decryptNotePayload(note.encrypted_payload, enteredPin, note.pin_salt);
      }

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

    if (note.is_locked) {
      // Must use UnlockSessionManager
      // Import it dynamically to avoid circular dependencies if any
      const { UnlockSessionManager } = await import('./UnlockSessionManager');
      const sessionKey = UnlockSessionManager.getSessionKey(id);
      const { encryptNotePayloadV2, encryptNotePayload } = await import('./cryptoUtils');
      
      let encryptedPayload: string | null = null;
      

      const payload = {
        body: updates.body !== undefined ? updates.body : note.body,
        checklist_items: updates.checklist_items !== undefined ? updates.checklist_items : note.checklist_items,
        sketch_data: updates.sketch_data !== undefined ? updates.sketch_data : note.sketch_data,
      };

      if (sessionKey) {
        encryptedPayload = await encryptNotePayloadV2(payload, sessionKey);
      } else if (pinHeld) {
        encryptedPayload = await encryptNotePayload(payload, pinHeld, note.pin_salt!);
      } else {
        throw new Error('No active unlock session and no legacy PIN provided for locked note save.');
      }

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
    if (!this.saveNotes(notes)) {
      return false;
    }

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

  public static saveRecordings(recordings: RecordingRecord[]): boolean {
    if (safeSetItem(STORAGE_KEYS.RECORDINGS, JSON.stringify(recordings))) {
      this.recordingsCache = recordings;
      return true;
    }
    return false;
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
    if (!this.saveRecordings(recordings)) {
      throw new Error("Failed to persist new recording to storage.");
    }
    return newRec;
  }

  public static deleteRecording(id: number): boolean {
    const recordings = this.getRecordings().filter((r) => r.id !== id);
    if (!this.saveRecordings(recordings)) {
      return false;
    }

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

  public static saveTranscripts(transcripts: TranscriptRecord[]): boolean {
    if (safeSetItem(STORAGE_KEYS.TRANSCRIPTS, JSON.stringify(transcripts))) {
      this.transcriptsCache = transcripts;
      return true;
    }
    return false;
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
    if (!this.saveTranscripts(transcripts)) {
      throw new Error("Failed to persist new transcript to storage.");
    }
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

  public static saveOcrScans(scans: OcrScanRecord[]): boolean {
    if (safeSetItem(STORAGE_KEYS.OCR_SCANS, JSON.stringify(scans))) {
      this.ocrScansCache = scans;
      return true;
    }
    return false;
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
    if (!this.saveOcrScans(scans)) {
      throw new Error("Failed to persist new OCR scan to storage.");
    }
    return newScan;
  }

  public static deleteOcrScan(id: number): boolean {
    const scans = this.getOcrScans().filter((s) => s.id !== id);
    if (!this.saveOcrScans(scans)) {
      return false;
    }
    return true;
  }

  // --- STORAGE STATS & USAGE METRICS ---
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
    const recordings = this.getRecordings();
    const transcripts = this.getTranscripts();
    const ocrScans = this.getOcrScans();

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
      activeNotes: notes.filter((n) => n.status === 'active').length,
      archivedNotes: notes.filter((n) => n.status === 'archived').length,
      trashedNotes: notes.filter((n) => n.status === 'trash').length,
      totalRecordings: recordings.length,
      totalTranscripts: transcripts.length,
      totalOcrScans: ocrScans.length,
      estimatedBytesUsed: bytesUsed,
    };
  }

  // --- CLOUD BACKUP ---
  public static exportCloudBackup(): string {
    const allNotes = this.getNotes();
    const cloudNotes = allNotes.filter(n => n.cloud_save_enabled !== false);
    
    const noteIds = new Set(cloudNotes.map(n => n.id));
    const eventIds = new Set(cloudNotes.map(n => n.event_id));

    const cloudEvents = this.getEvents().filter(e => eventIds.has(e.id));
    const cloudRecordings = this.getRecordings().filter(r => noteIds.has(r.note_id));
    
    const recordingIds = new Set(cloudRecordings.map(r => r.id));
    const cloudTranscripts = this.getTranscripts().filter(t => recordingIds.has(t.recording_id));
    const cloudOcrScans = this.getOcrScans().filter(o => noteIds.has(o.note_id));

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
    const note = this.getNotes().find(n => n.id === noteId);
    if (!note) return false;
    const current = note.cloud_save_enabled !== false;
    const updated = this.updateNote(noteId, { cloud_save_enabled: !current });
    return !!updated;
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

  public static clearCache() {
    this.eventsCache = null;
    this.notesCache = null;
    this.recordingsCache = null;
    this.transcriptsCache = null;
    this.ocrScansCache = null;
  }

  public static importFullDump(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object' || !parsed.schema) {
        return false;
      }
      
      const s = parsed.schema;
      if (
        (s.events && !Array.isArray(s.events)) ||
        (s.notes && !Array.isArray(s.notes)) ||
        (s.recordings && !Array.isArray(s.recordings)) ||
        (s.transcripts && !Array.isArray(s.transcripts)) ||
        (s.ocr_scans && !Array.isArray(s.ocr_scans))
      ) {
        return false;
      }

      const prevEvents = this.getEvents();
      const prevNotes = this.getNotes();
      const prevRecordings = this.getRecordings();
      const prevTranscripts = this.getTranscripts();
      const prevOcrScans = this.getOcrScans();

      let ok = true;
      if (s.events) ok = ok && this.saveEvents(s.events);
      if (s.notes) ok = ok && this.saveNotes(s.notes);
      if (s.recordings) ok = ok && this.saveRecordings(s.recordings);
      if (s.transcripts) ok = ok && this.saveTranscripts(s.transcripts);
      if (s.ocr_scans) ok = ok && this.saveOcrScans(s.ocr_scans);

      if (!ok) {
        // Rollback on failure
        this.saveEvents(prevEvents);
        this.saveNotes(prevNotes);
        this.saveRecordings(prevRecordings);
        this.saveTranscripts(prevTranscripts);
        this.saveOcrScans(prevOcrScans);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Failed to import database dump', e);
      return false;
    }
  }

  public static async exportPortableBackupAsync(): Promise<string> {
    const bundle: any = {
      version: '2.5',
      export_timestamp: new Date().toISOString(),
      schema: {
        events: this.getEvents(),
        notes: this.getNotes(),
        recordings: this.getRecordings(),
        transcripts: this.getTranscripts(),
        ocr_scans: this.getOcrScans(),
      },
      media: {}
    };

    const { MediaRepository } = await import('./MediaRepository');
    
    // Collect all media keys
    const mediaKeys = new Set<string>();
    for (const note of bundle.schema.notes) {
      if (note.sketch_media_key) mediaKeys.add(note.sketch_media_key);
    }
    for (const rec of bundle.schema.recordings) {
      if (rec.media_key) mediaKeys.add(rec.media_key);
    }
    for (const scan of bundle.schema.ocr_scans) {
      if (scan.media_key) mediaKeys.add(scan.media_key);
    }

    const blobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    for (const key of mediaKeys) {
      // Just fetch raw binary, no crypto logic required here since we just want to back up whatever bytes exist
      const blob = await MediaRepository.getBinary(key, 'application/octet-stream');
      if (blob) {
        bundle.media[key] = {
          mimeType: blob.type,
          data: await blobToBase64(blob)
        };
      }
    }

    return JSON.stringify(bundle, null, 2);
  }

  public static async importPortableBackupAsync(jsonStr: string): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object' || !parsed.schema) {
        return { success: false, message: 'Invalid backup file format.' };
      }
      
      const s = parsed.schema;
      if (
        (s.events && !Array.isArray(s.events)) ||
        (s.notes && !Array.isArray(s.notes)) ||
        (s.recordings && !Array.isArray(s.recordings)) ||
        (s.transcripts && !Array.isArray(s.transcripts)) ||
        (s.ocr_scans && !Array.isArray(s.ocr_scans))
      ) {
        return { success: false, message: 'Invalid backup schema format.' };
      }

      const prevEvents = this.getEvents();
      const prevNotes = this.getNotes();
      const prevRecordings = this.getRecordings();
      const prevTranscripts = this.getTranscripts();
      const prevOcrScans = this.getOcrScans();

      let ok = true;
      if (s.events) ok = ok && this.saveEvents(s.events);
      if (s.notes) ok = ok && this.saveNotes(s.notes);
      if (s.recordings) ok = ok && this.saveRecordings(s.recordings);
      if (s.transcripts) ok = ok && this.saveTranscripts(s.transcripts);
      if (s.ocr_scans) ok = ok && this.saveOcrScans(s.ocr_scans);

      if (!ok) {
        // Rollback on failure
        this.saveEvents(prevEvents);
        this.saveNotes(prevNotes);
        this.saveRecordings(prevRecordings);
        this.saveTranscripts(prevTranscripts);
        this.saveOcrScans(prevOcrScans);
        return { success: false, message: 'Failed to write collections. Rolled back.' };
      }

      if (parsed.media) {
        const { MediaRepository } = await import('./MediaRepository');
        
        const base64ToBlob = (base64: string, mimeType: string): Blob => {
          const byteCharacters = atob(base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          return new Blob([byteArray], { type: mimeType });
        };

        for (const key in parsed.media) {
          try {
            const mediaObj = parsed.media[key];
            const blob = base64ToBlob(mediaObj.data, mediaObj.mimeType);
            await MediaRepository.putBinary(key, blob);
          } catch (e) {
            console.warn(`Failed to restore media blob ${key}`, e);
          }
        }
      }
      return { success: true, message: 'Backup successfully imported into local store.' };
    } catch (e) {
      console.error('Failed to import database dump', e);
      return { success: false, message: 'Failed to parse backup.' };
    }
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

  public static async exportCloudBackupArchive(): Promise<Blob> {
    const backupStr = this.exportCloudBackup();
    const encoder = new TextEncoder();
    const data = encoder.encode(backupStr);
    
    // Gzip compression via browser-native CompressionStream
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    
    const res = new Response(cs.readable);
    return await res.blob();
  }
}

/**
 * Backward compatible alias for components and utilities
 */
export const SQLiteDatabase = StorageManager;
export const LocalStorageStore = StorageManager;
