import { NoteRecord, ChecklistItem } from '../types';
import { getDatabaseAdapter, DatabaseAdapter } from '../lib/sqlite/databaseAdapter';
import { ChecklistRow, SearchOptions, SearchResult, TagRow } from '../lib/sqlite/sqliteRepository';
import { AppLogger } from '../lib/logger';
import { MetricsManager } from '../lib/metricsManager';
import { generatePrefixedId } from '../lib/uuid';

export interface CreateNoteInput {
  title?: string;
  body?: string;
  event_id?: number;
  tags?: string[];
  note_type?: 'text' | 'checklist' | 'sketch';
  checklist_items?: ChecklistItem[];
  color?: string;
  reminder_at?: string;
  sketch_data?: string;
  sketch_media_key?: string;
  is_pinned?: boolean;
  is_locked?: boolean;
  lock_mode?: 'standard' | 'private';
  security_type?: 'pin' | 'passphrase';
  pin_salt?: string;
  pin_hash?: string;
}

export interface UpdateNoteInput extends Partial<CreateNoteInput> {
  status?: 'active' | 'archived' | 'trash';
  archived_at?: string;
  deleted_at?: string;
}

export interface NotesPageOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
  status?: 'active' | 'archived' | 'trash';
  eventId?: number;
  tag?: string;
  filterType?: 'all' | 'text' | 'checklist' | 'sketch' | 'audio' | 'scan';
  hasReminder?: boolean;
  hasAttachments?: boolean;
  searchQuery?: string;
  sortBy?: 'updated_at' | 'created_at' | 'title';
  sortDirection?: 'ASC' | 'DESC';
}

export interface NotesPageResult {
  notes: NoteRecord[];
  totalCount: number;
  hasMore: boolean;
  nextOffset?: number;
  nextCursor?: string;
}

export interface INoteRepository {
  getById(id: number): Promise<NoteRecord | null>;
  list(options?: NotesPageOptions): Promise<NotesPageResult>;
  create(input: CreateNoteInput): Promise<NoteRecord>;
  update(id: number, patch: UpdateNoteInput): Promise<NoteRecord>;
  delete(id: number): Promise<void>;
  search(options: SearchOptions): Promise<SearchResult>;
}

/**
 * Hydrates checklist items and tags for a batch of note rows asynchronously
 * using the DatabaseAdapter directly. Eliminates N+1 query overhead.
 */
async function populateNotesBatchAsync(
  db: DatabaseAdapter,
  noteRows: NoteRecord[]
): Promise<NoteRecord[]> {
  if (!noteRows || noteRows.length === 0) return [];
  const noteIds = noteRows.map((r) => r.id);
  const placeholders = noteIds.map(() => '?').join(',');

  const chkRows = await db.query<ChecklistRow>(
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

  const tagRows = await db.query<TagRow>(
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
    cloud_save_enabled:
      row.cloud_save_enabled !== undefined && row.cloud_save_enabled !== null
        ? Boolean(row.cloud_save_enabled)
        : true,
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

/**
 * Record entity modification in the item_changes table matching the v11 schema.
 */
async function recordItemChange(
  db: DatabaseAdapter,
  entityType: string,
  entityId: string | number,
  operation: 'create' | 'update' | 'delete',
  version: number,
  payload: unknown
): Promise<void> {
  try {
    const id = generatePrefixedId('chg');
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '');
    let hash = 0;
    for (let i = 0; i < payloadStr.length; i++) {
      hash = (hash << 5) - hash + payloadStr.charCodeAt(i);
      hash |= 0;
    }
    const payloadHash = Math.abs(hash).toString(16);

    await db.run(
      `INSERT INTO item_changes (id, entity_type, entity_id, operation, version, changed_at, payload_hash, sync_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, entityType, String(entityId), operation, version, Date.now(), payloadHash]
    );
  } catch (e) {
    AppLogger.warn('NoteRepository', 'Failed to record item change', e);
  }
}

/**
 * Genuinely Asynchronous NoteRepository operating over the authoritative DatabaseAdapter.
 * Executes all SQL statements directly on the adapter without synchronous wrapper delegations.
 */
export class NoteRepository implements INoteRepository {
  public async getById(id: number): Promise<NoteRecord | null> {
    return NoteRepository.getById(id);
  }

  public async list(options?: NotesPageOptions): Promise<NotesPageResult> {
    return NoteRepository.list(options);
  }

  public async create(input: CreateNoteInput): Promise<NoteRecord> {
    return NoteRepository.create(input);
  }

  public async update(id: number, patch: UpdateNoteInput): Promise<NoteRecord> {
    return NoteRepository.update(id, patch);
  }

  public async delete(id: number): Promise<void> {
    return NoteRepository.delete(id);
  }

  public async search(options: SearchOptions): Promise<SearchResult> {
    return NoteRepository.search(options);
  }

  public static async getById(id: number): Promise<NoteRecord | null> {
    try {
      const db = getDatabaseAdapter();
      const rows = await db.query<NoteRecord>('SELECT * FROM notes WHERE id = ?;', [id]);
      if (!rows || rows.length === 0) return null;
      const populated = await populateNotesBatchAsync(db, rows);
      return populated.length > 0 ? populated[0] : null;
    } catch (e) {
      AppLogger.error('NoteRepository', `Failed to get note ${id}`, e);
      return null;
    }
  }

  public static async list(options: NotesPageOptions = {}): Promise<NotesPageResult> {
    const db = getDatabaseAdapter();
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];

    if (options.status) {
      whereClause += ' AND n.status = ?';
      params.push(options.status);
    } else {
      whereClause += ' AND (n.status = "active" OR n.status IS NULL)';
    }

    if (options.eventId !== undefined && options.eventId !== null) {
      whereClause += ' AND n.event_id = ?';
      params.push(options.eventId);
    }

    if (options.tag) {
      whereClause +=
        ' AND EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_name = ?)';
      params.push(options.tag);
    }

    if (options.filterType === 'audio') {
      whereClause += ' AND EXISTS (SELECT 1 FROM recordings rec WHERE rec.note_id = n.id)';
    } else if (options.filterType === 'scan') {
      whereClause += ' AND EXISTS (SELECT 1 FROM ocr_scans ocr WHERE ocr.note_id = n.id)';
    } else if (options.filterType && options.filterType !== 'all') {
      whereClause += ' AND n.note_type = ?';
      params.push(options.filterType);
    }

    if (options.hasReminder) {
      whereClause += ' AND n.reminder_at IS NOT NULL';
    }

    if (options.hasAttachments) {
      whereClause +=
        ' AND (n.sketch_media_key IS NOT NULL OR EXISTS (SELECT 1 FROM recordings rec2 WHERE rec2.note_id = n.id) OR EXISTS (SELECT 1 FROM ocr_scans ocr2 WHERE ocr2.note_id = n.id))';
    }

    if (options.cursor) {
      whereClause += ' AND n.updated_at < ?';
      params.push(options.cursor);
    }

    const countRes = await db.query<{ cnt: number }>(
      `SELECT COUNT(DISTINCT n.id) as cnt FROM notes n ${whereClause}`,
      params
    );
    const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;

    const querySql = `
      SELECT DISTINCT n.*, e.title as event_title, e.color as event_color
      FROM notes n
      LEFT JOIN events e ON n.event_id = e.id
      ${whereClause}
      ORDER BY n.is_pinned DESC, n.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.query<NoteRecord>(querySql, [...params, limit, offset]);
    const notes = await populateNotesBatchAsync(db, rows);
    const hasMore = offset + notes.length < totalCount;
    const lastNote = notes.length > 0 ? notes[notes.length - 1] : undefined;

    return {
      notes,
      totalCount,
      hasMore,
      nextOffset: hasMore ? offset + limit : undefined,
      nextCursor: hasMore && lastNote ? lastNote.updated_at : undefined,
    };
  }

  public static async create(input: CreateNoteInput): Promise<NoteRecord> {
    const db = getDatabaseAdapter();
    const now = new Date().toISOString();

    return await db.transaction(async () => {
      const res = await db.run(
        `INSERT INTO notes (
          event_id, title, body, note_type, color, is_pinned, is_locked,
          lock_mode, security_type, cloud_save_enabled,
          pin_hash, pin_salt, encrypted_payload, status, archived_at, trashed_at,
          reminder_at, location_name, latitude, longitude, version,
          sketch_media_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.event_id || null,
          input.title || '',
          input.body || '',
          input.note_type || 'text',
          input.color || null,
          input.is_pinned ? 1 : 0,
          input.is_locked ? 1 : 0,
          input.lock_mode || 'standard',
          input.security_type || 'pin',
          1,
          input.pin_hash || null,
          input.pin_salt || null,
          null,
          'active',
          null,
          null,
          input.reminder_at || null,
          null,
          null,
          null,
          1,
          input.sketch_media_key || null,
          now,
          now,
        ]
      );

      const noteId = res.lastInsertRowId ?? (db.getLastInsertId ? db.getLastInsertId() : 0);

      // Insert checklists
      if (input.checklist_items && input.checklist_items.length > 0) {
        for (let i = 0; i < input.checklist_items.length; i++) {
          const item = input.checklist_items[i];
          const chkId = item.id || `chk_${noteId}_${i}_${Date.now()}`;
          await db.run(
            'INSERT INTO checklists (id, note_id, text, completed, position) VALUES (?, ?, ?, ?, ?)',
            [chkId, noteId, item.text, item.completed ? 1 : 0, i]
          );
        }
      }

      // Insert tags
      if (input.tags && input.tags.length > 0) {
        for (const tag of input.tags) {
          const trimmed = tag.trim();
          if (trimmed) {
            await db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [trimmed]);
            await db.run('INSERT OR IGNORE INTO note_tags (note_id, tag_name) VALUES (?, ?)', [
              noteId,
              trimmed,
            ]);
          }
        }
      }

      // Insert FTS
      await db.run('DELETE FROM notes_fts WHERE note_id = ?;', [noteId]);
      const checklistText = (input.checklist_items || []).map((c) => c.text).join(' ');
      await db.run(
        'INSERT INTO notes_fts (note_id, title, body, checklist_text, ocr_text, tags) VALUES (?, ?, ?, ?, ?, ?)',
        [
          noteId,
          input.title || '',
          input.body || '',
          checklistText,
          '',
          (input.tags || []).join(' '),
        ]
      );

      // Record item change for sync
      await recordItemChange(db, 'note', noteId, 'create', 1, input);

      const createdNote = await NoteRepository.getById(noteId);
      if (!createdNote) throw new Error(`Failed to retrieve newly created note ${noteId}`);
      MetricsManager.record('note_created');
      return createdNote;
    });
  }

  public static async update(id: number, patch: UpdateNoteInput): Promise<NoteRecord> {
    const db = getDatabaseAdapter();
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Note ${id} not found`);
    }

    const now = new Date().toISOString();
    const nextVersion = (existing.version || 1) + 1;

    return await db.transaction(async () => {
      const mergedTitle = patch.title !== undefined ? patch.title : existing.title;
      const mergedBody = patch.body !== undefined ? patch.body : existing.body;
      const mergedEventId = patch.event_id !== undefined ? patch.event_id : existing.event_id;
      const mergedNoteType = patch.note_type !== undefined ? patch.note_type : existing.note_type;
      const mergedColor = patch.color !== undefined ? patch.color : existing.color;
      const mergedPinned = patch.is_pinned !== undefined ? patch.is_pinned : existing.is_pinned;
      const mergedLocked = patch.is_locked !== undefined ? patch.is_locked : existing.is_locked;
      const mergedLockMode = patch.lock_mode !== undefined ? patch.lock_mode : existing.lock_mode;
      const mergedSecType =
        patch.security_type !== undefined ? patch.security_type : existing.security_type;
      const mergedPinHash = patch.pin_hash !== undefined ? patch.pin_hash : existing.pin_hash;
      const mergedPinSalt = patch.pin_salt !== undefined ? patch.pin_salt : existing.pin_salt;
      const mergedStatus = patch.status !== undefined ? patch.status : existing.status;
      const mergedArchivedAt =
        patch.archived_at !== undefined ? patch.archived_at : existing.archived_at;
      const mergedTrashedAt =
        patch.deleted_at !== undefined
          ? patch.deleted_at
          : patch.status === 'trash'
            ? existing.trashed_at || now
            : existing.trashed_at;
      const mergedReminderAt =
        patch.reminder_at !== undefined ? patch.reminder_at : existing.reminder_at;
      const mergedSketchMediaKey =
        patch.sketch_media_key !== undefined ? patch.sketch_media_key : existing.sketch_media_key;

      await db.run(
        `UPDATE notes SET
          event_id = ?, title = ?, body = ?, note_type = ?, color = ?,
          is_pinned = ?, is_locked = ?, lock_mode = ?, security_type = ?,
          pin_hash = ?, pin_salt = ?, status = ?, archived_at = ?, trashed_at = ?,
          reminder_at = ?, version = ?, sketch_media_key = ?, updated_at = ?
         WHERE id = ?`,
        [
          mergedEventId || null,
          mergedTitle || '',
          mergedBody || '',
          mergedNoteType || 'text',
          mergedColor || null,
          mergedPinned ? 1 : 0,
          mergedLocked ? 1 : 0,
          mergedLockMode || 'standard',
          mergedSecType || 'pin',
          mergedPinHash || null,
          mergedPinSalt || null,
          mergedStatus || 'active',
          mergedArchivedAt || null,
          mergedTrashedAt || null,
          mergedReminderAt || null,
          nextVersion,
          mergedSketchMediaKey || null,
          now,
          id,
        ]
      );

      // Checklists update
      if (patch.checklist_items !== undefined) {
        const existingChecklists = await db.query<{
          id: string;
          text: string;
          completed: number;
          position: number;
        }>('SELECT id, text, completed, position FROM checklists WHERE note_id = ?', [id]);
        const existingChkMap = new Map(existingChecklists.map((c) => [c.id, c]));
        const incomingChkIds = new Set<string>();

        for (let i = 0; i < patch.checklist_items.length; i++) {
          const item = patch.checklist_items[i];
          const chkId = item.id || `chk_${id}_${i}_${Date.now()}`;
          incomingChkIds.add(chkId);
          const existingChk = existingChkMap.get(chkId);
          const completedNum = item.completed ? 1 : 0;

          if (existingChk) {
            if (
              existingChk.text !== item.text ||
              existingChk.completed !== completedNum ||
              existingChk.position !== i
            ) {
              await db.run(
                'UPDATE checklists SET text = ?, completed = ?, position = ? WHERE id = ? AND note_id = ?',
                [item.text, completedNum, i, chkId, id]
              );
            }
          } else {
            await db.run(
              'INSERT INTO checklists (id, note_id, text, completed, position) VALUES (?, ?, ?, ?, ?)',
              [chkId, id, item.text, completedNum, i]
            );
          }
        }
        for (const chk of existingChecklists) {
          if (!incomingChkIds.has(chk.id)) {
            await db.run('DELETE FROM checklists WHERE id = ? AND note_id = ?', [chk.id, id]);
          }
        }
      }

      // Tags update
      if (patch.tags !== undefined) {
        const incomingTags = new Set((patch.tags || []).map((t) => t.trim()).filter(Boolean));
        const currentTagRows = await db.query<{ tag_name: string }>(
          'SELECT tag_name FROM note_tags WHERE note_id = ?',
          [id]
        );
        const currentTags = new Set(currentTagRows.map((r) => r.tag_name));

        for (const tag of incomingTags) {
          if (!currentTags.has(tag)) {
            await db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tag]);
            await db.run('INSERT OR IGNORE INTO note_tags (note_id, tag_name) VALUES (?, ?)', [
              id,
              tag,
            ]);
          }
        }
        for (const tag of currentTags) {
          if (!incomingTags.has(tag)) {
            await db.run('DELETE FROM note_tags WHERE note_id = ? AND tag_name = ?', [id, tag]);
          }
        }
      }

      // Update FTS
      await db.run('DELETE FROM notes_fts WHERE note_id = ?;', [id]);
      const finalTags = patch.tags !== undefined ? patch.tags : existing.tags;
      const checklistText = (
        patch.checklist_items !== undefined ? patch.checklist_items : existing.checklist_items || []
      )
        .map((c) => c.text)
        .join(' ');
      await db.run(
        'INSERT INTO notes_fts (note_id, title, body, checklist_text, ocr_text, tags) VALUES (?, ?, ?, ?, ?, ?)',
        [id, mergedTitle, mergedBody, checklistText, '', (finalTags || []).join(' ')]
      );

      // Record item change for sync
      await recordItemChange(db, 'note', id, 'update', nextVersion, patch);

      const updatedNote = await NoteRepository.getById(id);
      if (!updatedNote) throw new Error(`Note ${id} could not be retrieved after update`);
      return updatedNote;
    });
  }

  public static async delete(id: number): Promise<void> {
    const db = getDatabaseAdapter();
    await db.transaction(async () => {
      await db.run('DELETE FROM notes WHERE id = ?;', [id]);
      await db.run('DELETE FROM notes_fts WHERE note_id = ?;', [id]);
      await db.run('DELETE FROM checklists WHERE note_id = ?;', [id]);
      await db.run('DELETE FROM note_tags WHERE note_id = ?;', [id]);
      await db.run('DELETE FROM note_versions WHERE note_id = ?;', [id]);
      await db.run('DELETE FROM recordings WHERE note_id = ?;', [id]);
      await db.run('DELETE FROM ocr_scans WHERE note_id = ?;', [id]);
      await db.run('UPDATE media_files SET note_id = NULL WHERE note_id = ?;', [id]);
      // Record item change for sync
      await recordItemChange(db, 'note', id, 'delete', 0, { id });
      MetricsManager.record('note_deleted');
    });
  }

  public static async search(options: SearchOptions): Promise<SearchResult> {
    const db = getDatabaseAdapter();
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const trimmed = (options.query || '').trim();

    let whereClause = '1=1';
    const params: unknown[] = [];

    if (options.status) {
      whereClause += ' AND n.status = ?';
      params.push(options.status);
    } else {
      whereClause += ' AND (n.status = "active" OR n.status IS NULL)';
    }

    if (options.eventId !== undefined && options.eventId !== null && options.eventId > 0) {
      whereClause += ' AND n.event_id = ?';
      params.push(options.eventId);
    }

    if (options.tag) {
      whereClause +=
        ' AND EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag_name = ?)';
      params.push(options.tag);
    }

    if (options.filterType === 'audio') {
      whereClause += ' AND EXISTS (SELECT 1 FROM recordings rec WHERE rec.note_id = n.id)';
    } else if (options.filterType === 'scan') {
      whereClause += ' AND EXISTS (SELECT 1 FROM ocr_scans ocr WHERE ocr.note_id = n.id)';
    } else if (options.filterType && options.filterType !== 'all') {
      whereClause += ' AND n.note_type = ?';
      params.push(options.filterType);
    }

    if (options.hasReminder) {
      whereClause += ' AND n.reminder_at IS NOT NULL';
    }

    if (options.hasAttachments) {
      whereClause +=
        ' AND (n.sketch_media_key IS NOT NULL OR EXISTS (SELECT 1 FROM recordings rec2 WHERE rec2.note_id = n.id) OR EXISTS (SELECT 1 FROM ocr_scans ocr2 WHERE ocr2.note_id = n.id))';
    }

    if (!options.includeLocked) {
      whereClause += ' AND (n.is_locked = 0 OR n.is_locked IS NULL)';
    }

    if (trimmed) {
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
            WHERE notes_fts MATCH ? AND ${whereClause}
          `;
          const countRes = await db.query<{ cnt: number }>(countSql, [ftsExpression, ...params]);
          const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;

          const matchSql = `
            SELECT DISTINCT n.*, e.title as event_title, e.color as event_color
            FROM notes n
            JOIN notes_fts fts ON n.id = fts.note_id
            LEFT JOIN events e ON n.event_id = e.id
            WHERE notes_fts MATCH ? AND ${whereClause}
            ORDER BY n.is_pinned DESC, n.updated_at DESC
            LIMIT ? OFFSET ?
          `;
          const rows = await db.query<NoteRecord>(matchSql, [
            ftsExpression,
            ...params,
            limit,
            offset,
          ]);
          const notes = await populateNotesBatchAsync(db, rows);
          return { notes, totalCount };
        } catch (ftsErr) {
          AppLogger.warn('NoteRepository', 'FTS query syntax error, falling back to LIKE', ftsErr);
        }
      }

      // LIKE fallback
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
        WHERE ${whereClause} ${likeWhere}
      `;
      const countRes = await db.query<{ cnt: number }>(countSql, likeParams);
      const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;

      const fallbackSql = `
        SELECT DISTINCT n.*, e.title as event_title, e.color as event_color
        FROM notes n
        LEFT JOIN events e ON n.event_id = e.id
        WHERE ${whereClause} ${likeWhere}
        ORDER BY n.is_pinned DESC, n.updated_at DESC
        LIMIT ? OFFSET ?
      `;
      const rows = await db.query<NoteRecord>(fallbackSql, [...likeParams, limit, offset]);
      const notes = await populateNotesBatchAsync(db, rows);
      return { notes, totalCount };
    }

    // Default list query
    const countSql = `SELECT COUNT(DISTINCT n.id) as cnt FROM notes n WHERE ${whereClause}`;
    const countRes = await db.query<{ cnt: number }>(countSql, params);
    const totalCount = countRes.length > 0 ? Number(countRes[0].cnt) : 0;

    const querySql = `
      SELECT DISTINCT n.*, e.title as event_title, e.color as event_color
      FROM notes n
      LEFT JOIN events e ON n.event_id = e.id
      WHERE ${whereClause}
      ORDER BY n.is_pinned DESC, n.updated_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await db.query<NoteRecord>(querySql, [...params, limit, offset]);
    const notes = await populateNotesBatchAsync(db, rows);
    return { notes, totalCount };
  }
}
