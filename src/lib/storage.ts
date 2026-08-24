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

const STORAGE_KEYS = {
  EVENTS: 'omninote_sqlite_events_v1',
  NOTES: 'omninote_sqlite_notes_v1',
  RECORDINGS: 'omninote_sqlite_recordings_v1',
  TRANSCRIPTS: 'omninote_sqlite_transcripts_v1',
  OCR_SCANS: 'omninote_sqlite_ocr_scans_v1',
};

export class SQLiteDatabase {
  // --- EVENTS ---
  public static getEvents(): EventRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
      return data ? JSON.parse(data) : INITIAL_EVENTS;
    } catch {
      return INITIAL_EVENTS;
    }
  }

  public static saveEvents(events: EventRecord[]) {
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
  }

  public static addEvent(event: Omit<EventRecord, 'id'>): EventRecord {
    const events = this.getEvents();
    const newId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1;
    const newEvent: EventRecord = { ...event, id: newId };
    events.unshift(newEvent);
    this.saveEvents(events);
    return newEvent;
  }

  public static updateEvent(id: number, updates: Partial<EventRecord>): EventRecord | null {
    const events = this.getEvents();
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
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTES);
      return data ? JSON.parse(data) : INITIAL_NOTES;
    } catch {
      return INITIAL_NOTES;
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

  public static saveNotes(notes: NoteRecord[]) {
    localStorage.setItem(STORAGE_KEYS.NOTES, JSON.stringify(notes));
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
    const notes = this.getNotes();
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    notes[idx].cloud_save_enabled = !notes[idx].cloud_save_enabled;
    notes[idx].updated_at = new Date().toISOString();
    this.saveNotes(notes);
    return notes[idx];
  }

  public static updateNote(id: number, updates: Partial<NoteRecord>): NoteRecord | null {
    const notes = this.getNotes();
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

  public static exportFullBackup(): string {
    const data = {
      app: 'VellumScribe',
      exported_at: new Date().toISOString(),
      events: this.getEvents(),
      notes: this.getNotes(),
      recordings: this.getRecordings(),
      transcripts: this.getTranscripts(),
      ocr_scans: this.getOcrScans(),
    };
    return JSON.stringify(data, null, 2);
  }

  public static importFullBackup(jsonContent: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonContent);
      if (Array.isArray(data.events)) this.saveEvents(data.events);
      if (Array.isArray(data.notes)) this.saveNotes(data.notes);
      if (Array.isArray(data.recordings)) this.saveRecordings(data.recordings);
      if (Array.isArray(data.transcripts)) this.saveTranscripts(data.transcripts);
      if (Array.isArray(data.ocr_scans)) this.saveOcrScans(data.ocr_scans);
      return { success: true, message: `Successfully imported ${data.notes?.length || 0} notes and ${data.events?.length || 0} categories.` };
    } catch (e: any) {
      return { success: false, message: `Import error: ${e.message}` };
    }
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
    const notes = this.getNotes();
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
    const notes = this.getNotes();
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
    const notes = this.getNotes();
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
    const notes = this.getNotes();
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
    const notes = this.getNotes();
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
    const notes = this.getNotes();
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
    const notes = this.getNotes();
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
    const notes = this.getNotes();
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

  public static batchLockNotes(ids: number[], pin: string): number {
    if (!ids || ids.length === 0 || !pin) return 0;
    const notes = this.getNotes();
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.is_locked = true;
        note.lock_pin = pin;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchUnlockNotes(ids: number[]): number {
    if (!ids || ids.length === 0) return 0;
    const notes = this.getNotes();
    let count = 0;
    const now = new Date().toISOString();
    for (const note of notes) {
      if (ids.includes(note.id)) {
        note.is_locked = false;
        note.lock_pin = undefined;
        note.updated_at = now;
        count++;
      }
    }
    this.saveNotes(notes);
    return count;
  }

  public static batchToggleCloudSave(ids: number[], enabled: boolean): number {
    if (!ids || ids.length === 0) return 0;
    const notes = this.getNotes();
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
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RECORDINGS);
      return data ? JSON.parse(data) : INITIAL_RECORDINGS;
    } catch {
      return INITIAL_RECORDINGS;
    }
  }

  public static saveRecordings(recordings: RecordingRecord[]) {
    localStorage.setItem(STORAGE_KEYS.RECORDINGS, JSON.stringify(recordings));
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
    try {
      const data = localStorage.getItem(STORAGE_KEYS.TRANSCRIPTS);
      return data ? JSON.parse(data) : INITIAL_TRANSCRIPTS;
    } catch {
      return INITIAL_TRANSCRIPTS;
    }
  }

  public static saveTranscripts(transcripts: TranscriptRecord[]) {
    localStorage.setItem(STORAGE_KEYS.TRANSCRIPTS, JSON.stringify(transcripts));
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
    transcripts.unshift(newTranscript);
    this.saveTranscripts(transcripts);
    return newTranscript;
  }

  // --- OCR SCANS ---
  public static getOcrScans(): OcrScanRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.OCR_SCANS);
      return data ? JSON.parse(data) : INITIAL_OCR_SCANS;
    } catch {
      return INITIAL_OCR_SCANS;
    }
  }

  public static saveOcrScans(scans: OcrScanRecord[]) {
    localStorage.setItem(STORAGE_KEYS.OCR_SCANS, JSON.stringify(scans));
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
    scans.unshift(newScan);
    this.saveOcrScans(scans);
    return newScan;
  }

  public static deleteOcrScan(id: number): boolean {
    const scans = this.getOcrScans().filter((s) => s.id !== id);
    this.saveOcrScans(scans);
    return true;
  }

  // --- SQL EXECUTOR ENGINE FOR INSPECTOR ---
  public static executeSql(query: string): { columns: string[]; rows: any[][]; message?: string } {
    const clean = query.trim().replace(/;$/, '');
    const upper = clean.toUpperCase();

    try {
      if (upper.startsWith('SELECT')) {
        let table = '';
        if (upper.includes('FROM EVENTS')) table = 'events';
        else if (upper.includes('FROM NOTES')) table = 'notes';
        else if (upper.includes('FROM RECORDINGS')) table = 'recordings';
        else if (upper.includes('FROM TRANSCRIPTS')) table = 'transcripts';
        else if (upper.includes('FROM OCR_SCANS')) table = 'ocr_scans';
        else if (upper.includes('FROM SQLITE_MASTER') || upper.includes('FROM SQLITE_SCHEMA')) {
          return {
            columns: ['type', 'name', 'tbl_name', 'sql'],
            rows: [
              ['table', 'events', 'events', 'CREATE TABLE events (id INTEGER PRIMARY KEY, title TEXT, event_date TEXT)'],
              ['table', 'notes', 'notes', 'CREATE TABLE notes (id INTEGER PRIMARY KEY, event_id INTEGER, body TEXT, created_at TEXT)'],
              ['table', 'recordings', 'recordings', 'CREATE TABLE recordings (id INTEGER PRIMARY KEY, note_id INTEGER, file_path TEXT, file_size INTEGER)'],
              ['table', 'transcripts', 'transcripts', 'CREATE TABLE transcripts (id INTEGER PRIMARY KEY, recording_id INTEGER, transcript_text TEXT)'],
              ['table', 'ocr_scans', 'ocr_scans', 'CREATE TABLE ocr_scans (id INTEGER PRIMARY KEY, note_id INTEGER, image_path TEXT, ocr_text TEXT)'],
            ],
          };
        }

        let dataset: any[] = [];
        if (table === 'events') dataset = this.getEvents();
        else if (table === 'notes') dataset = this.getNotes();
        else if (table === 'recordings') dataset = this.getRecordings();
        else if (table === 'transcripts') dataset = this.getTranscripts();
        else if (table === 'ocr_scans') dataset = this.getOcrScans();
        else {
          return {
            columns: ['error'],
            rows: [[`Unknown table specified in query. Available tables: events, notes, recordings, transcripts, ocr_scans`]],
          };
        }

        if (dataset.length === 0) {
          return { columns: ['status'], rows: [['(0 rows returned)']] };
        }

        const columns = Object.keys(dataset[0]);
        const rows = dataset.map((item) => columns.map((col) => {
          const val = item[col];
          return typeof val === 'object' ? JSON.stringify(val) : String(val ?? 'NULL');
        }));

        return { columns, rows, message: `${rows.length} row(s) returned` };
      }

      return {
        columns: ['status'],
        rows: [[`Query executed successfully against local SQLite engine.`]],
        message: 'Query executed.',
      };
    } catch (e: any) {
      return {
        columns: ['error'],
        rows: [[e.message || 'SQL execution error']],
      };
    }
  }

  // --- STORAGE STATS ---
  public static getStorageStats(): {
    totalNotes: number;
    cloudSavedNotes: number;
    localOnlyNotes: number;
    totalRecordings: number;
    cloudRecordings: number;
    localOnlyRecordings: number;
  } {
    const notes = this.getNotes();
    const recordings = this.getRecordings();
    const cloudSavedNotesList = notes.filter((n) => n.cloud_save_enabled);
    const cloudNoteIds = new Set(cloudSavedNotesList.map((n) => n.id));
    const cloudRecordingsList = recordings.filter((r) => cloudNoteIds.has(r.note_id));

    return {
      totalNotes: notes.length,
      cloudSavedNotes: cloudSavedNotesList.length,
      localOnlyNotes: notes.length - cloudSavedNotesList.length,
      totalRecordings: recordings.length,
      cloudRecordings: cloudRecordingsList.length,
      localOnlyRecordings: recordings.length - cloudRecordingsList.length,
    };
  }

  // --- BACKUP & RESTORE DUMP ---
  // Local full dump (all items)
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

  // Cloud-only dump (strictly filters for notes with cloud_save_enabled === true)
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

  public static resetToFactoryDefaults() {
    this.saveEvents(INITIAL_EVENTS);
    this.saveNotes(INITIAL_NOTES);
    this.saveRecordings(INITIAL_RECORDINGS);
    this.saveTranscripts(INITIAL_TRANSCRIPTS);
    this.saveOcrScans(INITIAL_OCR_SCANS);
  }
}
