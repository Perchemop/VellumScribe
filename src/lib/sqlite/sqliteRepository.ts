import { getDatabaseAdapter } from './databaseAdapter';
import { AppLogger } from '../logger';
import { generatePrefixedId } from '../uuid';
import { CURRENT_SCHEMA_VERSION } from './schema';
import {
  NoteRecord,
  EventRecord,
  ChecklistItem,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
  DocumentVersion,
  ItemChangeRecord,
  NoteRevisionRecord,
  SyncConflictRecord,
  LocalSnapshotRecord,
} from '../../types';

export interface SqliteStats {
  notesCount: number;
  eventsCount: number;
  checklistsCount: number;
  versionsCount: number;
  mediaFilesCount: number;
  recordingsCount: number;
  transcriptsCount: number;
  ocrScansCount: number;
  databaseSizeBytes: number;
  schemaVersion: number;
  integrityStatus: 'ok' | 'corrupted';
}

export interface SearchOptions {
  query: string;
  category?: string;
  tag?: string;
  status?: 'active' | 'archived' | 'trash';
  eventId?: number;
  includeLocked?: boolean;
  filterType?: 'all' | 'text' | 'checklist' | 'sketch' | 'audio' | 'scan';
  hasReminder?: boolean;
  hasAttachments?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  notes: NoteRecord[];
  totalCount: number;
}

export interface NotesPageOptions {
  page?: number;
  pageSize?: number;
  status?: 'active' | 'archived' | 'trash';
  eventId?: number | null;
  tag?: string | null;
  filterType?: 'all' | 'text' | 'checklist' | 'sketch';
  searchQuery?: string;
  sortBy?: 'updated_at' | 'created_at' | 'title';
  sortDirection?: 'ASC' | 'DESC';
  includeLocked?: boolean;
}

export interface NotesPageResult {
  notes: NoteRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

/** Raw rows from the `checklists` table, hydrated into ChecklistItem entries. */
interface ChecklistRow {
  id: string; // checklists.id is TEXT PRIMARY KEY (see schema.ts)
  note_id: number;
  text: string;
  completed: unknown; // stored as 0/1 in SQLite
}

/** Raw rows from the `note_tags` table. */
interface TagRow {
  note_id: number;
  tag_name: string;
}

export class SqliteRepository {
  private static get db() {
    return getDatabaseAdapter();
  }

  public static async queryAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const adapter = this.db;
    return await adapter.query<T>(sql, params);
  }

  public static async runAsync(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowId?: number }> {
    const adapter = this.db;
    return await adapter.run(sql, params);
  }

  public static async transactionAsync<T>(fn: () => Promise<T>): Promise<T> {
    const adapter = this.db;
    return await adapter.transaction(fn);
  }

  private static query<T>(sql: string, params: unknown[] = []): T[] {
    const adapter = this.db;
    if (adapter.querySync) {
      return adapter.querySync<T>(sql, params);
    }
    throw new Error('SqliteRepository: Synchronous query unsupported on current adapter. Use queryAsync.');
  }

  private static run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowId?: number } {
    const adapter = this.db;
    if (adapter.runSync) {
      return adapter.runSync(sql, params);
    }
    throw new Error('SqliteRepository: Synchronous run unsupported on current adapter. Use runAsync.');
  }

  private static transaction<T>(fn: () => T): T {
    const adapter = this.db;
    if (adapter.transactionSync) {
      return adapter.transactionSync(fn);
    }
    throw new Error('SqliteRepository: Synchronous transaction unsupported on current adapter. Use transactionAsync.');
  }

  private static getLastInsertId(): number {
    const adapter = this.db;
    if (adapter.getLastInsertId) {
      return adapter.getLastInsertId();
    }
    return 0;
  }
  /**
   * Efficient batch hydrator for note items (checklists and tags)
   * Prevents full database loading and eliminates N+1 query overhead
   */
  private static populateNotesBatch(noteRows: NoteRecord[]): NoteRecord[] {
    if (!noteRows || noteRows.length === 0) return [];
    const noteIds = noteRows.map((r) => r.id);
    const placeholders = noteIds.map(() => '?').join(',');

    // Fetch checklists only for this batch
    const chkRows = this.query<ChecklistRow>(
      `SELECT id, note_id, text, completed, position FROM checklists WHERE note_id IN (${placeholders}) ORDER BY position ASC, id ASC`,
      noteIds
    );
    const chkMap = new Map<number, ChecklistItem[]>();
    for (const row of chkRows) {
      if (!chkMap.has(row.note_id)) chkMap.set(row.note_id, []);
      chkMap.get(row.note_id)!.push({
        id: row.id,
        text: row.text,
        completed: Boolean(row.completed),
      });
    }

    // Fetch tags only for this batch
    const tagRows = this.query<TagRow>(
      `SELECT note_id, tag_name FROM note_tags WHERE note_id IN (${placeholders})`,
      noteIds
    );
    const tagMap = new Map<number, string[]>();
    for (const row of tagRows) {
      if (!tagMap.has(row.note_id)) tagMap.set(row.note_id, []);
      tagMap.get(row.note_id)!.push(row.tag_name);
    }

    return noteRows.map((row) => ({
      id: row.id,
      event_id: row.event_id || 0,
      title: row.title || '',
      body: row.body || '',
      note_type: row.note_type || 'text',
      color: row.color || undefined,
      is_pinned: Boolean(row.is_pinned),
      is_locked: Boolean(row.is_locked),
      lock_mode: row.lock_mode || undefined,
      security_type: row.security_type || undefined,
      cloud_save_enabled: row.cloud_save_enabled !== undefined && row.cloud_save_enabled !== null ? Boolean(row.cloud_save_enabled) : true,
      pin_hash: row.pin_hash || undefined,
      pin_salt: row.pin_salt || undefined,
      encrypted_payload: row.encrypted_payload || undefined,
      status: row.status || 'active',
      archived_at: row.archived_at || undefined,
      trashed_at: row.trashed_at || undefined,
      reminder_at: row.reminder_at || undefined,
      location_name: row.location_name || undefined,
      latitude: row.latitude || undefined,
      longitude: row.longitude || undefined,
      version: row.version || 1,
      sketch_media_key: row.sketch_media_key || undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      checklist_items: chkMap.get(row.id) || [],
      tags: tagMap.get(row.id) || [],
    }));
  }

  // --- NOTES CRUD ---

  public static getAllNotes(): NoteRecord[] {
    const rawNotes = this.query<NoteRecord>(`
      SELECT n.*, e.title as event_title, e.color as event_color
      FROM notes n
      LEFT JOIN events e ON n.event_id = e.id
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `);
    return this.populateNotesBatch(rawNotes);
  }

  public static getNoteById(id: number): NoteRecord | null {
    const rawNotes = this.query<NoteRecord>('SELECT * FROM notes WHERE id = ?', [id]);
    if (rawNotes.length === 0) return null;
    const populated = this.populateNotesBatch(rawNotes);
    return populated.length > 0 ? populated[0] : null;
  }

  public static saveNote(note: NoteRecord): NoteRecord {
    return this.transaction(() => {
      let noteId = note.id;
      const isExisting =
        noteId && noteId > 0
          ? this.query<{ id: number }>('SELECT id FROM notes WHERE id = ?', [noteId]).length > 0
          : false;

      const now = new Date().toISOString();
      const createdAt = note.created_at || now;
      const updatedAt = note.updated_at || now;

      if (isExisting) {
        this.run(
          `UPDATE notes SET
            event_id = ?, title = ?, body = ?, note_type = ?, color = ?,
            is_pinned = ?, is_locked = ?, lock_mode = ?, security_type = ?, cloud_save_enabled = ?,
            pin_hash = ?, pin_salt = ?, encrypted_payload = ?, status = ?, archived_at = ?, trashed_at = ?,
            reminder_at = ?, location_name = ?, latitude = ?, longitude = ?,
            version = ?, sketch_media_key = ?, updated_at = ?
           WHERE id = ?`,
          [
            note.event_id || null,
            note.title || '',
            note.body || '',
            note.note_type || 'text',
            note.color || null,
            note.is_pinned ? 1 : 0,
            note.is_locked ? 1 : 0,
            note.lock_mode || 'standard',
            note.security_type || 'pin',
            note.cloud_save_enabled !== false ? 1 : 0,
            note.pin_hash || null,
            note.pin_salt || null,
            note.encrypted_payload || null,
            note.status || 'active',
            note.archived_at || null,
            note.trashed_at || null,
            note.reminder_at || null,
            note.location_name || null,
            note.latitude || null,
            note.longitude || null,
            note.version || 1,
            note.sketch_media_key || null,
            updatedAt,
            noteId,
          ]
        );
      } else {
        if (noteId && noteId > 0) {
          this.run(
            `INSERT INTO notes (
              id, event_id, title, body, note_type, color, is_pinned, is_locked,
              lock_mode, security_type, cloud_save_enabled,
              pin_hash, pin_salt, encrypted_payload, status, archived_at, trashed_at,
              reminder_at, location_name, latitude, longitude, version,
              sketch_media_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              noteId,
              note.event_id || null,
              note.title || '',
              note.body || '',
              note.note_type || 'text',
              note.color || null,
              note.is_pinned ? 1 : 0,
              note.is_locked ? 1 : 0,
              note.lock_mode || 'standard',
              note.security_type || 'pin',
              note.cloud_save_enabled !== false ? 1 : 0,
              note.pin_hash || null,
              note.pin_salt || null,
              note.encrypted_payload || null,
              note.status || 'active',
              note.archived_at || null,
              note.trashed_at || null,
              note.reminder_at || null,
              note.location_name || null,
              note.latitude || null,
              note.longitude || null,
              note.version || 1,
              note.sketch_media_key || null,
              createdAt,
              updatedAt,
            ]
          );
        } else {
          this.run(
            `INSERT INTO notes (
              event_id, title, body, note_type, color, is_pinned, is_locked,
              lock_mode, security_type, cloud_save_enabled,
              pin_hash, pin_salt, encrypted_payload, status, archived_at, trashed_at,
              reminder_at, location_name, latitude, longitude, version,
              sketch_media_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              note.event_id || null,
              note.title || '',
              note.body || '',
              note.note_type || 'text',
              note.color || null,
              note.is_pinned ? 1 : 0,
              note.is_locked ? 1 : 0,
              note.lock_mode || 'standard',
              note.security_type || 'pin',
              note.cloud_save_enabled !== false ? 1 : 0,
              note.pin_hash || null,
              note.pin_salt || null,
              note.encrypted_payload || null,
              note.status || 'active',
              note.archived_at || null,
              note.trashed_at || null,
              note.reminder_at || null,
              note.location_name || null,
              note.latitude || null,
              note.longitude || null,
              note.version || 1,
              note.sketch_media_key || null,
              createdAt,
              updatedAt,
            ]
          );
          noteId = this.getLastInsertId();
        }
      }

      // 2. Targeted Checklists differential synchronization
      const existingChecklists = this.query<{ id: string; text: string; completed: number; position: number }>(
        'SELECT id, text, completed, position FROM checklists WHERE note_id = ?',
        [noteId]
      );
      const existingChkMap = new Map(existingChecklists.map((c) => [c.id, c]));
      const incomingChkIds = new Set<string>();

      if (note.checklist_items && note.checklist_items.length > 0) {
        for (let i = 0; i < note.checklist_items.length; i++) {
          const item = note.checklist_items[i];
          const chkId = item.id || `chk_${noteId}_${i}_${Date.now()}`;
          incomingChkIds.add(chkId);
          const existing = existingChkMap.get(chkId);
          const completedNum = item.completed ? 1 : 0;

          if (existing) {
            if (existing.text !== item.text || existing.completed !== completedNum || existing.position !== i) {
              this.run(
                'UPDATE checklists SET text = ?, completed = ?, position = ? WHERE id = ? AND note_id = ?',
                [item.text, completedNum, i, chkId, noteId]
              );
            }
          } else {
            this.run(
              'INSERT INTO checklists (id, note_id, text, completed, position) VALUES (?, ?, ?, ?, ?)',
              [chkId, noteId, item.text, completedNum, i]
            );
          }
        }
      }
      // Delete removed checklists
      for (const chk of existingChecklists) {
        if (!incomingChkIds.has(chk.id)) {
          this.run('DELETE FROM checklists WHERE id = ? AND note_id = ?', [chk.id, noteId]);
        }
      }

      // 3. Targeted Tags differential synchronization
      const existingTags = this.query<{ tag_name: string }>(
        'SELECT tag_name FROM note_tags WHERE note_id = ?',
        [noteId]
      ).map((t) => t.tag_name);
      const existingTagSet = new Set(existingTags);
      const incomingTagSet = new Set((note.tags || []).map((t) => t.trim()).filter(Boolean));

      for (const tag of incomingTagSet) {
        if (!existingTagSet.has(tag)) {
          this.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tag]);
          this.run('INSERT OR IGNORE INTO note_tags (note_id, tag_name) VALUES (?, ?)', [noteId, tag]);
        }
      }
      for (const tag of existingTagSet) {
        if (!incomingTagSet.has(tag)) {
          this.run('DELETE FROM note_tags WHERE note_id = ? AND tag_name = ?', [noteId, tag]);
        }
      }

      // 4. Synchronize FTS table notes_fts
      try {
        this.run('DELETE FROM notes_fts WHERE note_id = ?;', [noteId]);
        if (!note.is_locked) {
          const chkText = (note.checklist_items || []).map((c) => c.text).join(' ');
          const tagText = Array.from(incomingTagSet).join(' ');
          const ocrRows = this.query<{ ocr_text: string }>(
            'SELECT ocr_text FROM ocr_scans WHERE note_id = ?',
            [noteId]
          );
          const ocrText = ocrRows.map((o) => o.ocr_text).join(' ');
          this.run(
            'INSERT INTO notes_fts (note_id, title, body, checklist_text, ocr_text, tags) VALUES (?, ?, ?, ?, ?, ?);',
            [noteId, note.title || '', note.body || '', chkText, ocrText, tagText]
          );
        }
      } catch (ftsErr) {
        AppLogger.warn('SqliteRepository', 'FTS index sync warning', ftsErr);
      }

      // 5. Record media association if sketch key present
      if (note.sketch_media_key) {
        this.run(
          `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [note.sketch_media_key, noteId, 'sketch', 'image/png', 0, Date.now()]
        );
      }

      this.recordItemChange('note', noteId, isExisting ? 'update' : 'create', note.version || 1, note);

      return {
        ...note,
        id: noteId,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    });
  }

  /**
   * Fast field-specific updater for editor typing.
   * Updates only title and/or body in-place without expensive checklist or tag recalculation.
   */
  public static updateNoteText(id: number, title?: string, body?: string, skipFts = false): NoteRecord | null {
    const existing = this.getNoteById(id);
    if (!existing) return null;

    const newTitle = title !== undefined ? title : existing.title;
    const newBody = body !== undefined ? body : existing.body;
    const now = new Date().toISOString();

    this.transaction(() => {
      this.run(
        'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?',
        [newTitle, newBody, now, id]
      );

      if (!existing.is_locked && !skipFts) {
        try {
          const chkText = (existing.checklist_items || []).map((c) => c.text).join(' ');
          const tagText = (existing.tags || []).join(' ');
          const ocrRows = this.query<{ ocr_text: string }>(
            'SELECT ocr_text FROM ocr_scans WHERE note_id = ?',
            [id]
          );
          const ocrText = ocrRows.map((o) => o.ocr_text).join(' ');
          this.run('DELETE FROM notes_fts WHERE note_id = ?;', [id]);
          this.run(
            'INSERT INTO notes_fts (note_id, title, body, checklist_text, ocr_text, tags) VALUES (?, ?, ?, ?, ?, ?);',
            [id, newTitle, newBody, chkText, ocrText, tagText]
          );
        } catch (ftsErr) {
          AppLogger.warn('SqliteRepository', 'FTS quick-sync warning', ftsErr);
        }
      }
    });

    return {
      ...existing,
      title: newTitle,
      body: newBody,
      updated_at: now,
    };
  }

  /**
   * Batch reindexes note IDs into SQLite FTS
   */
  public static reindexNotes(ids: number[]): void {
    if (!ids || ids.length === 0) return;
    this.transaction(() => {
      for (const id of ids) {
        const note = this.getNoteById(id);
        if (!note || note.is_locked) continue;
        try {
          const chkText = (note.checklist_items || []).map((c) => c.text).join(' ');
          const tagText = (note.tags || []).join(' ');
          const ocrRows = this.query<{ ocr_text: string }>(
            'SELECT ocr_text FROM ocr_scans WHERE note_id = ?',
            [id]
          );
          const ocrText = ocrRows.map((o) => o.ocr_text).join(' ');
          this.run('DELETE FROM notes_fts WHERE note_id = ?;', [id]);
          this.run(
            'INSERT INTO notes_fts (note_id, title, body, checklist_text, ocr_text, tags) VALUES (?, ?, ?, ?, ?, ?);',
            [id, note.title || '', note.body || '', chkText, ocrText, tagText]
          );
        } catch (err) {
          AppLogger.warn('SqliteRepository', `Failed to reindex note ${id} in FTS`, err);
        }
      }
    });
  }

  public static deleteNote(id: number): void {
    this.transaction(() => {
      this.recordItemChange('note', id, 'delete', 1, { id });
      this.run('DELETE FROM notes WHERE id = ?', [id]);
      this.run('DELETE FROM notes_fts WHERE note_id = ?', [id]);
      this.run('DELETE FROM checklists WHERE note_id = ?', [id]);
      this.run('DELETE FROM note_tags WHERE note_id = ?', [id]);
      this.run('DELETE FROM note_versions WHERE note_id = ?', [id]);
      this.run('DELETE FROM recordings WHERE note_id = ?', [id]);
      this.run('DELETE FROM ocr_scans WHERE note_id = ?', [id]);
      this.run('UPDATE media_files SET note_id = NULL WHERE note_id = ?', [id]);
    });
  }

  // --- SQLITE-BACKED FULL-TEXT SEARCH (FTS) ---

  public static searchNotes(options: SearchOptions): NoteRecord[] {
    return this.searchNotesWithCount(options).notes;
  }

  public static searchNotesWithCount(options: SearchOptions): SearchResult {
    const {
      query,
      category,
      tag,
      status = 'active',
      eventId,
      includeLocked = false,
      filterType = 'all',
      hasReminder,
      hasAttachments,
      dateFrom,
      dateTo,
      limit = 50,
      offset = 0,
    } = options;

    const trimmed = (query || '').trim();
    const params: unknown[] = [];
    let whereClause = '1=1';

    if (status) {
      whereClause += ' AND n.status = ?';
      params.push(status);
    }

    if (eventId) {
      whereClause += ' AND n.event_id = ?';
      params.push(eventId);
    }

    if (category) {
      whereClause += ' AND e.category = ?';
      params.push(category);
    }

    if (tag) {
      whereClause += ' AND nt.tag_name = ?';
      params.push(tag);
    }

    if (filterType === 'audio') {
      whereClause += ' AND EXISTS (SELECT 1 FROM recordings rec WHERE rec.note_id = n.id)';
    } else if (filterType === 'scan') {
      whereClause += ' AND EXISTS (SELECT 1 FROM ocr_scans ocr WHERE ocr.note_id = n.id)';
    } else if (filterType && filterType !== 'all') {
      whereClause += ' AND n.note_type = ?';
      params.push(filterType);
    }

    if (hasReminder) {
      whereClause += ' AND n.reminder_at IS NOT NULL';
    }

    if (hasAttachments) {
      whereClause += ' AND (n.sketch_media_key IS NOT NULL OR EXISTS (SELECT 1 FROM recordings rec2 WHERE rec2.note_id = n.id) OR EXISTS (SELECT 1 FROM ocr_scans ocr2 WHERE ocr2.note_id = n.id))';
    }

    if (dateFrom) {
      whereClause += ' AND n.created_at >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClause += ' AND n.created_at <= ?';
      params.push(dateTo);
    }

    if (!includeLocked) {
      whereClause += ' AND (n.is_locked = 0 OR n.is_locked IS NULL)';
    }

    if (trimmed) {
      // 1. Full-text search via FTS4 virtual table
      const terms = trimmed
        .replace(/[^a-zA-Z0-9_\u00C0-\u017F]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const ftsExpression = terms.map((t) => `${t}*`).join(' ');

      if (ftsExpression) {
        try {
          const countSql = `
            SELECT COUNT(DISTINCT n.id) as cnt
            FROM notes n
            JOIN notes_fts fts ON n.id = fts.note_id
            LEFT JOIN events e ON n.event_id = e.id
            LEFT JOIN note_tags nt ON n.id = nt.note_id
            WHERE notes_fts MATCH ? AND ${whereClause}
          `;
          const countRes = this.query<{ cnt: number }>(countSql, [ftsExpression, ...params]);
          const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;

          const matchSql = `
            SELECT DISTINCT n.*
            FROM notes n
            JOIN notes_fts fts ON n.id = fts.note_id
            LEFT JOIN events e ON n.event_id = e.id
            LEFT JOIN note_tags nt ON n.id = nt.note_id
            WHERE notes_fts MATCH ? AND ${whereClause}
            ORDER BY n.is_pinned DESC, n.updated_at DESC
            LIMIT ? OFFSET ?
          `;
          const rows = this.query<NoteRecord>(matchSql, [ftsExpression, ...params, limit, offset]);
          return {
            notes: this.populateNotesBatch(rows),
            totalCount,
          };
        } catch (ftsErr) {
          AppLogger.warn('SqliteRepository', 'FTS query syntax error, falling back to LIKE search', ftsErr);
        }
      }

      // 2. Fallback parameterized LIKE query
      const likeWild = `%${trimmed.toLowerCase()}%`;
      const likeWhere = ` AND (
        LOWER(n.title) LIKE ? OR
        LOWER(n.body) LIKE ? OR
        EXISTS (SELECT 1 FROM checklists c WHERE c.note_id = n.id AND LOWER(c.text) LIKE ?) OR
        EXISTS (SELECT 1 FROM ocr_scans o WHERE o.note_id = n.id AND LOWER(o.ocr_text) LIKE ?) OR
        EXISTS (SELECT 1 FROM note_tags nt2 WHERE nt2.note_id = n.id AND LOWER(nt2.tag_name) LIKE ?)
      )`;
      const likeParams = [...params, likeWild, likeWild, likeWild, likeWild, likeWild];

      const countSql = `
        SELECT COUNT(DISTINCT n.id) as cnt
        FROM notes n
        LEFT JOIN events e ON n.event_id = e.id
        LEFT JOIN note_tags nt ON n.id = nt.note_id
        WHERE ${whereClause} ${likeWhere}
      `;
      const countRes = this.query<{ cnt: number }>(countSql, likeParams);
      const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;

      const fallbackSql = `
        SELECT DISTINCT n.*
        FROM notes n
        LEFT JOIN events e ON n.event_id = e.id
        LEFT JOIN note_tags nt ON n.id = nt.note_id
        WHERE ${whereClause} ${likeWhere}
        ORDER BY n.is_pinned DESC, n.updated_at DESC
        LIMIT ? OFFSET ?
      `;
      const rows = this.query<NoteRecord>(fallbackSql, [...likeParams, limit, offset]);
      return {
        notes: this.populateNotesBatch(rows),
        totalCount,
      };
    }

    // 3. Simple filtered search without query string
    const countSql = `
      SELECT COUNT(DISTINCT n.id) as cnt
      FROM notes n
      LEFT JOIN events e ON n.event_id = e.id
      LEFT JOIN note_tags nt ON n.id = nt.note_id
      WHERE ${whereClause}
    `;
    const countRes = this.query<{ cnt: number }>(countSql, params);
    const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;

    const sql = `
      SELECT DISTINCT n.*
      FROM notes n
      LEFT JOIN events e ON n.event_id = e.id
      LEFT JOIN note_tags nt ON n.id = nt.note_id
      WHERE ${whereClause}
      ORDER BY n.is_pinned DESC, n.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = this.query<NoteRecord>(sql, [...params, limit, offset]);
    return {
      notes: this.populateNotesBatch(rows),
      totalCount,
    };
  }

  // --- PAGINATED NOTES ACCESS (Avoids Loading Whole DB Into Memory) ---

  public static getNotesPage(options: NotesPageOptions = {}): NotesPageResult {
    const {
      page = 1,
      pageSize = 50,
      status = 'active',
      eventId,
      tag,
      filterType = 'all',
      searchQuery,
      sortBy = 'updated_at',
      sortDirection = 'DESC',
      includeLocked = true,
    } = options;

    if (searchQuery && searchQuery.trim()) {
      const searchRes = this.searchNotesWithCount({
        query: searchQuery,
        status,
        eventId: eventId ?? undefined,
        tag: tag ?? undefined,
        filterType,
        includeLocked,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const totalPages = Math.ceil(searchRes.totalCount / pageSize) || 1;
      return {
        notes: searchRes.notes,
        totalCount: searchRes.totalCount,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      };
    }

    const params: unknown[] = [];
    let where = '1=1';

    if (status) {
      where += ' AND n.status = ?';
      params.push(status);
    }

    if (eventId !== undefined && eventId !== null) {
      where += ' AND n.event_id = ?';
      params.push(eventId);
    }

    if (tag) {
      where += ' AND EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_name = ?)';
      params.push(tag);
    }

    if (filterType && filterType !== 'all') {
      where += ' AND n.note_type = ?';
      params.push(filterType);
    }

    if (!includeLocked) {
      where += ' AND (n.is_locked = 0 OR n.is_locked IS NULL)';
    }

    const countRes = this.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM notes n WHERE ${where}`,
      params
    );
    const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const offset = (page - 1) * pageSize;

    const safeSortCol = sortBy === 'created_at' ? 'n.created_at' : sortBy === 'title' ? 'n.title' : 'n.updated_at';
    const safeDirection = sortDirection.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const sql = `
      SELECT n.*
      FROM notes n
      WHERE ${where}
      ORDER BY n.is_pinned DESC, ${safeSortCol} ${safeDirection}
      LIMIT ? OFFSET ?
    `;
    const rows = this.query<NoteRecord>(sql, [...params, pageSize, offset]);
    const notes = this.populateNotesBatch(rows);

    return {
      notes,
      totalCount,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  // --- EVENTS / NOTEBOOKS CRUD ---

  public static getAllEvents(): EventRecord[] {
    const rawEvents = this.query<EventRecord>('SELECT * FROM events ORDER BY event_date DESC, created_at DESC');
    return rawEvents.map((r) => ({
      id: r.id,
      title: r.title,
      event_date: r.event_date,
      description: r.description || undefined,
      location: r.location || undefined,
      category: r.category || undefined,
      color: r.color || undefined,
    }));
  }

  public static saveEvent(evt: EventRecord): EventRecord {
    return this.transaction(() => {
      let eventId = evt.id;
      const isExisting = Boolean(eventId && eventId > 0);
      if (eventId && eventId > 0) {
        // Must use UPDATE rather than INSERT OR REPLACE.
        // SQLite's REPLACE delete-then-insert semantics triggers FOREIGN KEY ON DELETE SET NULL on notes.event_id!
        this.run(
          `UPDATE events
           SET title = ?, event_date = ?, description = ?, location = ?, category = ?, color = ?, updated_at = ?
           WHERE id = ?`,
          [
            evt.title || 'Untitled',
            evt.event_date || new Date().toISOString().slice(0, 10),
            evt.description || null,
            evt.location || null,
            evt.category || null,
            evt.color || null,
            Date.now(),
            eventId,
          ]
        );
      } else {
        this.run(
          `INSERT INTO events (title, event_date, description, location, category, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            evt.title || 'Untitled',
            evt.event_date || new Date().toISOString().slice(0, 10),
            evt.description || null,
            evt.location || null,
            evt.category || null,
            evt.color || null,
            Date.now(),
            Date.now(),
          ]
        );
        eventId = this.getLastInsertId();
      }
      this.recordItemChange('event', eventId, isExisting ? 'update' : 'create', 1, evt);
      return { ...evt, id: eventId };
    });
  }

  public static deleteEvent(id: number): void {
    this.transaction(() => {
      this.recordItemChange('event', id, 'delete', 1, { id });
      this.run('DELETE FROM events WHERE id = ?', [id]);
      this.run('UPDATE notes SET event_id = 0 WHERE event_id = ?', [id]);
    });
  }

  // --- VERSION CONTROL & RETENTION POLICY ---

  public static getNoteVersions(noteId: number): DocumentVersion[] {
    const rows = this.query<DocumentVersion>(
      'SELECT * FROM note_versions WHERE note_id = ? ORDER BY version_number DESC',
      [noteId]
    );
    return rows.map((r) => ({
      id: r.id,
      version_id: r.version_number,
      version_number: r.version_number,
      note_id: r.note_id,
      document_id: r.note_id,
      title: r.title || '',
      body: r.body,
      author: r.author || 'User',
      change_summary: r.change_summary || '',
      checksum: r.checksum || undefined,
      created_at: r.created_at,
    }));
  }

  public static saveNoteVersion(version: DocumentVersion, maxVersionsPerNote = 50): void {
    this.transaction(() => {
      const noteId = version.note_id || version.document_id || 0;
      const verNum = version.version_number || version.version_id || Date.now();
      const verId = version.id || `ver_${noteId}_${verNum}`;

      // Deduplication: Check if latest version has identical body
      const latest = this.query<{ body: string }>(
        'SELECT body FROM note_versions WHERE note_id = ? ORDER BY version_number DESC LIMIT 1',
        [noteId]
      );
      if (latest.length > 0 && latest[0].body === version.body) {
        return; // Skip creating redundant identical snapshot
      }

      this.run(
        `INSERT OR REPLACE INTO note_versions (id, note_id, version_number, title, body, author, change_summary, checksum, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          verId,
          noteId,
          verNum,
          version.title || '',
          version.body,
          version.author || 'User',
          version.change_summary || 'Snapshot',
          version.checksum || null,
          version.created_at || new Date().toISOString(),
        ]
      );

      // Enforce retention policy: Prune older versions beyond max limit
      const versions = this.query<{ id: string }>(
        'SELECT id FROM note_versions WHERE note_id = ? ORDER BY version_number DESC',
        [noteId]
      );
      if (versions.length > maxVersionsPerNote) {
        const toDelete = versions.slice(maxVersionsPerNote);
        for (const item of toDelete) {
          this.run('DELETE FROM note_versions WHERE id = ?', [item.id]);
        }
      }
    });
  }

  public static pruneAllVersions(keepCount = 5): number {
    let pruned = 0;
    this.transaction(() => {
      const noteIds = this.query<{ id: number }>('SELECT id FROM notes');
      for (const n of noteIds) {
        const versions = this.query<{ id: string }>(
          'SELECT id FROM note_versions WHERE note_id = ? ORDER BY version_number DESC',
          [n.id]
        );
        if (versions.length > keepCount) {
          const toDelete = versions.slice(keepCount);
          for (const item of toDelete) {
            this.run('DELETE FROM note_versions WHERE id = ?', [item.id]);
            pruned++;
          }
        }
      }
    });
    return pruned;
  }

  public static pruneNoteRevisions(keepCount = 10): number {
    let pruned = 0;
    this.transaction(() => {
      const noteIds = this.query<{ id: number }>('SELECT id FROM notes');
      for (const n of noteIds) {
        const revisions = this.query<{ id: string }>(
          'SELECT id FROM note_revisions WHERE note_id = ? ORDER BY version_number DESC',
          [n.id]
        );
        if (revisions.length > keepCount) {
          for (const item of revisions.slice(keepCount)) {
            this.run('DELETE FROM note_revisions WHERE id = ?', [item.id]);
            pruned++;
          }
        }
      }
    });
    return pruned;
  }

  // --- RECORDINGS, TRANSCRIPTS & OCR ---

  public static getAllRecordings(): RecordingRecord[] {
    const rows = this.query<RecordingRecord>('SELECT * FROM recordings ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      note_id: r.note_id,
      file_path: r.file_path || '',
      file_size: r.file_size || 0,
      duration_seconds: r.duration_seconds || 0,
      media_key: r.media_key || undefined,
      sample_rate: r.sample_rate || undefined,
      bitrate_kbps: r.bitrate_kbps || undefined,
      created_at: r.created_at,
    }));
  }

  public static saveRecording(rec: RecordingRecord): RecordingRecord {
    let recordingId = rec.id;
    if (recordingId && recordingId > 0) {
      this.run(
        `INSERT OR REPLACE INTO recordings (id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recordingId,
          rec.note_id,
          rec.file_path || null,
          rec.media_key || null,
          rec.duration_seconds || 0,
          rec.file_size || 0,
          rec.sample_rate || null,
          rec.bitrate_kbps || null,
          rec.created_at || new Date().toISOString(),
        ]
      );
    } else {
      this.run(
        `INSERT INTO recordings (note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rec.note_id,
          rec.file_path || null,
          rec.media_key || null,
          rec.duration_seconds || 0,
          rec.file_size || 0,
          rec.sample_rate || null,
          rec.bitrate_kbps || null,
          rec.created_at || new Date().toISOString(),
        ]
      );
      recordingId = this.getLastInsertId();
    }

    if (rec.media_key) {
      this.run(
        `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [rec.media_key, rec.note_id, 'audio', 'audio/webm', rec.file_size || 0, Date.now()]
      );
    }

    return { ...rec, id: recordingId };
  }

  public static getAllTranscripts(): TranscriptRecord[] {
    const rows = this.query<TranscriptRecord>('SELECT * FROM transcripts ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      recording_id: r.recording_id,
      transcript_text: r.transcript_text,
      confidence: r.confidence || undefined,
      speaker_count: r.speaker_count || undefined,
      created_at: r.created_at,
    }));
  }

  public static saveTranscript(tr: TranscriptRecord): TranscriptRecord {
    let transcriptId = tr.id;
    if (transcriptId && transcriptId > 0) {
      this.run(
        `INSERT OR REPLACE INTO transcripts (id, recording_id, transcript_text, confidence, speaker_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          transcriptId,
          tr.recording_id,
          tr.transcript_text,
          tr.confidence ?? null,
          tr.speaker_count ?? null,
          tr.created_at || new Date().toISOString(),
        ]
      );
    } else {
      this.run(
        `INSERT INTO transcripts (recording_id, transcript_text, confidence, speaker_count, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          tr.recording_id,
          tr.transcript_text,
          tr.confidence ?? null,
          tr.speaker_count ?? null,
          tr.created_at || new Date().toISOString(),
        ]
      );
      transcriptId = this.getLastInsertId();
    }
    return { ...tr, id: transcriptId };
  }

  public static getAllOcrScans(): OcrScanRecord[] {
    const rows = this.query<OcrScanRecord>('SELECT * FROM ocr_scans ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      note_id: r.note_id,
      image_path: r.image_path || '',
      media_key: r.media_key || undefined,
      ocr_text: r.ocr_text,
      confidence: r.confidence || undefined,
      created_at: r.created_at,
    }));
  }

  public static saveOcrScan(ocr: OcrScanRecord): OcrScanRecord {
    let ocrId = ocr.id;
    if (ocrId && ocrId > 0) {
      this.run(
        `INSERT OR REPLACE INTO ocr_scans (id, note_id, image_path, media_key, ocr_text, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          ocrId,
          ocr.note_id,
          ocr.image_path || null,
          ocr.media_key || null,
          ocr.ocr_text,
          ocr.confidence ?? null,
          ocr.created_at || new Date().toISOString(),
        ]
      );
    } else {
      this.run(
        `INSERT INTO ocr_scans (note_id, image_path, media_key, ocr_text, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          ocr.note_id,
          ocr.image_path || null,
          ocr.media_key || null,
          ocr.ocr_text,
          ocr.confidence ?? null,
          ocr.created_at || new Date().toISOString(),
        ]
      );
      ocrId = this.getLastInsertId();
    }

    if (ocr.media_key) {
      this.run(
        `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ocr.media_key, ocr.note_id, 'ocr_image', 'image/jpeg', 0, Date.now()]
      );
    }

    // Refresh FTS index for note with new OCR text
    if (ocr.note_id) {
      try {
        const note = this.getNoteById(ocr.note_id);
        if (note && !note.is_locked) {
          const chkText = (note.checklist_items || []).map((c) => c.text).join(' ');
          const tagText = (note.tags || []).join(' ');
          const ocrRows = this.query<{ ocr_text: string }>(
            'SELECT ocr_text FROM ocr_scans WHERE note_id = ?',
            [ocr.note_id]
          );
          const allOcr = ocrRows.map((o) => o.ocr_text).join(' ');
          this.run('DELETE FROM notes_fts WHERE note_id = ?;', [ocr.note_id]);
          this.run(
            'INSERT INTO notes_fts (note_id, title, body, checklist_text, ocr_text, tags) VALUES (?, ?, ?, ?, ?, ?);',
            [ocr.note_id, note.title || '', note.body || '', chkText, allOcr, tagText]
          );
        }
      } catch (err) {
        AppLogger.warn('SqliteRepository', 'Failed to update FTS on OCR scan save', err);
      }
    }

    return { ...ocr, id: ocrId };
  }

  // --- DATABASE METRICS, INTEGRITY & ORPHAN DETECTION ---

  public static getDatabaseStats(): SqliteStats {
    const notesCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM notes')[0]?.c || 0;
    const eventsCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM events')[0]?.c || 0;
    const checklistsCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM checklists')[0]?.c || 0;
    const versionsCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM note_versions')[0]?.c || 0;
    const mediaFilesCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM media_files')[0]?.c || 0;
    const recordingsCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM recordings')[0]?.c || 0;
    const transcriptsCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM transcripts')[0]?.c || 0;
    const ocrScansCount = this.query<{ c: number }>('SELECT COUNT(*) as c FROM ocr_scans')[0]?.c || 0;

    let binarySize = 0;
    try {
      const binary = (this.db.exportBinary ? this.db.exportBinary() : new Uint8Array());
      binarySize = binary.byteLength;
    } catch {
      // ignore
    }

    let activeVersion = CURRENT_SCHEMA_VERSION;
    try {
      const vRes = this.query<{ version: number }>('SELECT MAX(version) as version FROM schema_migrations');
      if (vRes.length > 0 && typeof vRes[0].version === 'number' && vRes[0].version > 0) {
        activeVersion = vRes[0].version;
      }
    } catch { /* ignore */ }

    const integrity = (this.db.checkIntegritySync ? this.db.checkIntegritySync() : true);

    return {
      notesCount,
      eventsCount,
      checklistsCount,
      versionsCount,
      mediaFilesCount,
      recordingsCount,
      transcriptsCount,
      ocrScansCount,
      databaseSizeBytes: binarySize,
      schemaVersion: activeVersion,
      integrityStatus: integrity ? 'ok' : 'corrupted',
    };
  }

  public static findOrphanMediaKeys(): string[] {
    const mediaRows = this.query<{ media_key: string; note_id: number | null }>('SELECT media_key, note_id FROM media_files');
    const existingNotes = new Set(this.query<{ id: number }>('SELECT id FROM notes').map((n) => n.id));

    const orphans: string[] = [];
    for (const m of mediaRows) {
      if (!m.note_id || !existingNotes.has(m.note_id)) {
        orphans.push(m.media_key);
      }
    }
    return orphans;
  }

  public static removeOrphanMediaRecord(mediaKey: string): void {
    this.run('DELETE FROM media_files WHERE media_key = ?', [mediaKey]);
  }

  // --- ITEM CHANGES (OFFLINE-FIRST DELTAS) ---

  public static recordItemChange(
    entityType: 'note' | 'event' | 'recording' | 'checklist' | 'media',
    entityId: string | number,
    operation: 'create' | 'update' | 'delete',
    version: number,
    payload: unknown
  ): void {
    try {
      const id = generatePrefixedId(`chg_${Date.now()}`);
      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      let hash = 0;
      for (let i = 0; i < payloadStr.length; i++) {
        hash = ((hash << 5) - hash) + payloadStr.charCodeAt(i);
        hash |= 0;
      }
      const payloadHash = Math.abs(hash).toString(16);

      this.run(
        `INSERT INTO item_changes (id, entity_type, entity_id, operation, version, changed_at, payload_hash, sync_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending');`,
        [id, entityType, String(entityId), operation, version, Date.now(), payloadHash]
      );
    } catch {
      // Table may not yet exist in early initialization
    }
  }

  public static getItemChanges(limit = 100): ItemChangeRecord[] {
    try {
      return this.query<ItemChangeRecord>(
        `SELECT * FROM item_changes ORDER BY changed_at DESC LIMIT ?;`,
        [limit]
      );
    } catch {
      return [];
    }
  }

  /**
   * Prunes offline sync change records older than maxAgeMs,
   * while enforcing a maximum retention ceiling of maxRows.
   */
  public static pruneItemChanges(maxAgeMs = 30 * 24 * 60 * 60 * 1000, maxRows = 5000): number {
    try {
      const cutoff = Date.now() - maxAgeMs;
      this.run(`DELETE FROM item_changes WHERE changed_at < ?;`, [cutoff]);
      this.run(
        `DELETE FROM item_changes WHERE id NOT IN (
           SELECT id FROM item_changes ORDER BY changed_at DESC LIMIT ?
         );`,
        [maxRows]
      );
      return 1;
    } catch (e) {
      AppLogger.warn('SqliteRepository', 'Failed to prune item_changes', e);
      return 0;
    }
  }

  // --- NOTE REVISIONS (P0-06) ---

  public static saveNoteRevision(revision: NoteRevisionRecord): void {
    try {
      this.run(
        `INSERT OR REPLACE INTO note_revisions (id, note_id, version_number, title, body, created_at, reason, source, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          revision.id,
          revision.note_id,
          revision.version_number,
          revision.title,
          revision.body,
          revision.created_at,
          revision.reason || null,
          revision.source || null,
          revision.content_hash,
        ]
      );
    } catch (e) {
      AppLogger.warn('SqliteRepository', 'Failed to save note revision', e);
    }
  }

  public static getNoteRevisions(noteId: number): NoteRevisionRecord[] {
    try {
      return this.query<NoteRevisionRecord>(
        `SELECT * FROM note_revisions WHERE note_id = ? ORDER BY version_number DESC;`,
        [noteId]
      );
    } catch {
      return [];
    }
  }

  // --- SYNC CONFLICTS (P1-02) ---

  public static recordSyncConflict(conflict: Omit<SyncConflictRecord, 'id' | 'detected_at' | 'status'> & { id?: string; detected_at?: number; status?: 'open' | 'resolved' | 'ignored' }): SyncConflictRecord {
    const id = conflict.id || generatePrefixedId('cnf');
    const detected_at = conflict.detected_at || Date.now();
    const status = conflict.status || 'open';
    const rec: SyncConflictRecord = {
      ...conflict,
      id,
      detected_at,
      status,
    };
    try {
      this.run(
        `INSERT OR REPLACE INTO sync_conflicts (id, entity_type, entity_id, local_version_id, remote_version_id, local_payload, remote_payload, detected_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [rec.id, rec.entity_type, rec.entity_id, rec.local_version_id, rec.remote_version_id, rec.local_payload, rec.remote_payload, rec.detected_at, rec.status]
      );
    } catch (e) {
      AppLogger.warn('SqliteRepository', 'Failed to record sync conflict', e);
    }
    return rec;
  }

  public static getSyncConflicts(status = 'open'): SyncConflictRecord[] {
    try {
      return this.query<SyncConflictRecord>(
        `SELECT * FROM sync_conflicts WHERE status = ? ORDER BY detected_at DESC;`,
        [status]
      );
    } catch {
      return [];
    }
  }

  public static resolveSyncConflict(id: string): void {
    try {
      this.run(
        `UPDATE sync_conflicts SET status = 'resolved' WHERE id = ?;`,
        [id]
      );
    } catch (e) {
      AppLogger.warn('SqliteRepository', 'Failed to resolve sync conflict', e);
    }
  }

  // --- LOCAL SNAPSHOTS (P1-05) ---

  public static saveLocalSnapshot(snapshot: LocalSnapshotRecord): void {
    try {
      this.run(
        `INSERT INTO local_snapshots (id, snapshot_type, notes_count, events_count, payload_blob, created_at)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [snapshot.id, snapshot.snapshot_type, snapshot.notes_count, snapshot.events_count, snapshot.payload_blob, snapshot.created_at]
      );
    } catch (e) {
      AppLogger.warn('SqliteRepository', 'Failed to save local snapshot', e);
    }
  }

  public static getLocalSnapshots(): LocalSnapshotRecord[] {
    try {
      return this.query<LocalSnapshotRecord>(
        `SELECT * FROM local_snapshots ORDER BY created_at DESC;`
      );
    } catch {
      return [];
    }
  }
}
