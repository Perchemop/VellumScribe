import { SqliteEngine } from './sqliteEngine';
import { AppLogger } from '../logger';
import {
  NoteRecord,
  EventRecord,
  ChecklistItem,
  RecordingRecord,
  TranscriptRecord,
  OcrScanRecord,
  DocumentVersion,
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
}

export class SqliteRepository {
  // --- NOTES CRUD ---

  public static getAllNotes(): NoteRecord[] {
    const rawNotes = SqliteEngine.query<any>(`
      SELECT n.*, e.title as event_title, e.color as event_color
      FROM notes n
      LEFT JOIN events e ON n.event_id = e.id
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `);

    // Fetch all checklists
    const allChecklists = SqliteEngine.query<{ id: string; note_id: number; text: string; completed: number; position: number }>(`
      SELECT * FROM checklists ORDER BY note_id, position ASC
    `);
    const checklistsByNote: Record<number, ChecklistItem[]> = {};
    for (const chk of allChecklists) {
      if (!checklistsByNote[chk.note_id]) checklistsByNote[chk.note_id] = [];
      checklistsByNote[chk.note_id].push({
        id: chk.id,
        text: chk.text,
        completed: Boolean(chk.completed),
      });
    }

    // Fetch all tags
    const allTags = SqliteEngine.query<{ note_id: number; tag_name: string }>(`
      SELECT note_id, tag_name FROM note_tags
    `);
    const tagsByNote: Record<number, string[]> = {};
    for (const t of allTags) {
      if (!tagsByNote[t.note_id]) tagsByNote[t.note_id] = [];
      tagsByNote[t.note_id].push(t.tag_name);
    }

    return rawNotes.map((row) => ({
      id: row.id,
      event_id: row.event_id || 0,
      title: row.title || '',
      body: row.body || '',
      note_type: row.note_type || 'text',
      color: row.color || undefined,
      is_pinned: Boolean(row.is_pinned),
      is_locked: Boolean(row.is_locked),
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
      checklist_items: checklistsByNote[row.id] || [],
      tags: tagsByNote[row.id] || [],
    }));
  }

  public static getNoteById(id: number): NoteRecord | null {
    const rawNotes = SqliteEngine.query<any>('SELECT * FROM notes WHERE id = ?', [id]);
    if (rawNotes.length === 0) return null;
    const row = rawNotes[0];

    const checklists = SqliteEngine.query<any>(
      'SELECT * FROM checklists WHERE note_id = ? ORDER BY position ASC',
      [id]
    ).map((chk) => ({
      id: chk.id,
      text: chk.text,
      completed: Boolean(chk.completed),
    }));

    const tags = SqliteEngine.query<any>(
      'SELECT tag_name FROM note_tags WHERE note_id = ?',
      [id]
    ).map((t) => t.tag_name);

    return {
      id: row.id,
      event_id: row.event_id || 0,
      title: row.title || '',
      body: row.body || '',
      note_type: row.note_type || 'text',
      color: row.color || undefined,
      is_pinned: Boolean(row.is_pinned),
      is_locked: Boolean(row.is_locked),
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
      checklist_items: checklists,
      tags,
    };
  }

  public static saveNote(note: NoteRecord): void {
    SqliteEngine.transaction(() => {
      // 1. Insert/Update Note Record
      SqliteEngine.run(
        `INSERT OR REPLACE INTO notes (
           id, event_id, title, body, note_type, color, is_pinned, is_locked,
           pin_hash, pin_salt, encrypted_payload, status, archived_at, trashed_at,
           reminder_at, location_name, latitude, longitude, version,
           sketch_media_key, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          note.id,
          note.event_id || null,
          note.title || '',
          note.body || '',
          note.note_type || 'text',
          note.color || null,
          note.is_pinned ? 1 : 0,
          note.is_locked ? 1 : 0,
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
          note.created_at || new Date().toISOString(),
          note.updated_at || new Date().toISOString(),
        ]
      );

      // 2. Replace checklists
      SqliteEngine.run('DELETE FROM checklists WHERE note_id = ?', [note.id]);
      if (note.checklist_items && note.checklist_items.length > 0) {
        for (let i = 0; i < note.checklist_items.length; i++) {
          const item = note.checklist_items[i];
          SqliteEngine.run(
            `INSERT INTO checklists (id, note_id, text, completed, position)
             VALUES (?, ?, ?, ?, ?)`,
            [item.id || `chk_${note.id}_${i}`, note.id, item.text, item.completed ? 1 : 0, i]
          );
        }
      }

      // 3. Replace tags
      SqliteEngine.run('DELETE FROM note_tags WHERE note_id = ?', [note.id]);
      if (note.tags && note.tags.length > 0) {
        for (const tag of note.tags) {
          const trimmed = tag.trim();
          if (trimmed) {
            SqliteEngine.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [trimmed]);
            SqliteEngine.run('INSERT OR IGNORE INTO note_tags (note_id, tag_name) VALUES (?, ?)', [note.id, trimmed]);
          }
        }
      }

      // 4. Record media association if sketch key present
      if (note.sketch_media_key) {
        SqliteEngine.run(
          `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [note.sketch_media_key, note.id, 'sketch', 'image/png', 0, Date.now()]
        );
      }
    });
  }

  public static deleteNote(id: number): void {
    SqliteEngine.transaction(() => {
      SqliteEngine.run('DELETE FROM notes WHERE id = ?', [id]);
      SqliteEngine.run('DELETE FROM checklists WHERE note_id = ?', [id]);
      SqliteEngine.run('DELETE FROM note_tags WHERE note_id = ?', [id]);
      SqliteEngine.run('DELETE FROM note_versions WHERE note_id = ?', [id]);
      SqliteEngine.run('DELETE FROM recordings WHERE note_id = ?', [id]);
      SqliteEngine.run('DELETE FROM ocr_scans WHERE note_id = ?', [id]);
      SqliteEngine.run('UPDATE media_files SET note_id = NULL WHERE note_id = ?', [id]);
    });
  }

  // --- SQLITE-BACKED FULL-TEXT SEARCH ---

  public static searchNotes(options: SearchOptions): NoteRecord[] {
    const { query, category, tag, status, eventId, includeLocked } = options;
    const trimmedQuery = query.trim().toLowerCase();

    let sql = `
      SELECT DISTINCT n.*
      FROM notes n
      LEFT JOIN events e ON n.event_id = e.id
      LEFT JOIN note_tags nt ON n.id = nt.note_id
      LEFT JOIN checklists c ON n.id = c.note_id
      LEFT JOIN ocr_scans o ON n.id = o.note_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      sql += ' AND n.status = ?';
      params.push(status);
    } else {
      sql += " AND (n.status = 'active' OR n.status IS NULL)";
    }

    if (eventId) {
      sql += ' AND n.event_id = ?';
      params.push(eventId);
    }

    if (category) {
      sql += ' AND e.category = ?';
      params.push(category);
    }

    if (tag) {
      sql += ' AND nt.tag_name = ?';
      params.push(tag);
    }

    if (!includeLocked) {
      // Locked notes are omitted from plaintext keyword search if encrypted
    }

    if (trimmedQuery) {
      sql += ` AND (
        LOWER(n.title) LIKE ? OR
        LOWER(n.body) LIKE ? OR
        LOWER(c.text) LIKE ? OR
        LOWER(o.ocr_text) LIKE ?
      )`;
      const wild = `%${trimmedQuery}%`;
      params.push(wild, wild, wild, wild);
    }

    sql += ' ORDER BY n.is_pinned DESC, n.updated_at DESC';

    const matchedRaw = SqliteEngine.query<any>(sql, params);
    const matchedIds = new Set(matchedRaw.map((r) => r.id));

    // Return populated note records
    const allNotes = this.getAllNotes();
    return allNotes.filter((n) => matchedIds.has(n.id));
  }

  // --- EVENTS / NOTEBOOKS CRUD ---

  public static getAllEvents(): EventRecord[] {
    const rawEvents = SqliteEngine.query<any>('SELECT * FROM events ORDER BY event_date DESC, created_at DESC');
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

  public static saveEvent(evt: EventRecord): void {
    SqliteEngine.run(
      `INSERT OR REPLACE INTO events (id, title, event_date, description, location, category, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evt.id,
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
  }

  public static deleteEvent(id: number): void {
    SqliteEngine.transaction(() => {
      SqliteEngine.run('DELETE FROM events WHERE id = ?', [id]);
      SqliteEngine.run('UPDATE notes SET event_id = 0 WHERE event_id = ?', [id]);
    });
  }

  // --- VERSION CONTROL & RETENTION POLICY ---

  public static getNoteVersions(noteId: number): DocumentVersion[] {
    const rows = SqliteEngine.query<any>(
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
    SqliteEngine.transaction(() => {
      const noteId = version.note_id || version.document_id || 0;
      const verNum = version.version_number || version.version_id || Date.now();
      const verId = version.id || `ver_${noteId}_${verNum}`;

      // Deduplication: Check if latest version has identical body
      const latest = SqliteEngine.query<any>(
        'SELECT body FROM note_versions WHERE note_id = ? ORDER BY version_number DESC LIMIT 1',
        [noteId]
      );
      if (latest.length > 0 && latest[0].body === version.body) {
        return; // Skip creating redundant identical snapshot
      }

      SqliteEngine.run(
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
      const versions = SqliteEngine.query<{ id: string }>(
        'SELECT id FROM note_versions WHERE note_id = ? ORDER BY version_number DESC',
        [noteId]
      );
      if (versions.length > maxVersionsPerNote) {
        const toDelete = versions.slice(maxVersionsPerNote);
        for (const item of toDelete) {
          SqliteEngine.run('DELETE FROM note_versions WHERE id = ?', [item.id]);
        }
      }
    });
  }

  public static pruneAllVersions(keepCount = 5): number {
    let pruned = 0;
    SqliteEngine.transaction(() => {
      const noteIds = SqliteEngine.query<{ id: number }>('SELECT id FROM notes');
      for (const n of noteIds) {
        const versions = SqliteEngine.query<{ id: string }>(
          'SELECT id FROM note_versions WHERE note_id = ? ORDER BY version_number DESC',
          [n.id]
        );
        if (versions.length > keepCount) {
          const toDelete = versions.slice(keepCount);
          for (const item of toDelete) {
            SqliteEngine.run('DELETE FROM note_versions WHERE id = ?', [item.id]);
            pruned++;
          }
        }
      }
    });
    return pruned;
  }

  // --- RECORDINGS, TRANSCRIPTS & OCR ---

  public static getAllRecordings(): RecordingRecord[] {
    const rows = SqliteEngine.query<any>('SELECT * FROM recordings ORDER BY created_at DESC');
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

  public static saveRecording(rec: RecordingRecord): void {
    SqliteEngine.run(
      `INSERT OR REPLACE INTO recordings (id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rec.id,
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

    if (rec.media_key) {
      SqliteEngine.run(
        `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [rec.media_key, rec.note_id, 'audio', 'audio/webm', rec.file_size || 0, Date.now()]
      );
    }
  }

  public static getAllTranscripts(): TranscriptRecord[] {
    const rows = SqliteEngine.query<any>('SELECT * FROM transcripts ORDER BY created_at DESC');
    return rows.map((r) => ({
      id: r.id,
      recording_id: r.recording_id,
      transcript_text: r.transcript_text,
      confidence: r.confidence || undefined,
      speaker_count: r.speaker_count || undefined,
      created_at: r.created_at,
    }));
  }

  public static saveTranscript(tr: TranscriptRecord): void {
    SqliteEngine.run(
      `INSERT OR REPLACE INTO transcripts (id, recording_id, transcript_text, confidence, speaker_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tr.id,
        tr.recording_id,
        tr.transcript_text,
        tr.confidence || null,
        tr.speaker_count || null,
        tr.created_at || new Date().toISOString(),
      ]
    );
  }

  public static getAllOcrScans(): OcrScanRecord[] {
    const rows = SqliteEngine.query<any>('SELECT * FROM ocr_scans ORDER BY created_at DESC');
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

  public static saveOcrScan(ocr: OcrScanRecord): void {
    SqliteEngine.run(
      `INSERT OR REPLACE INTO ocr_scans (id, note_id, image_path, media_key, ocr_text, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ocr.id,
        ocr.note_id,
        ocr.image_path || null,
        ocr.media_key || null,
        ocr.ocr_text,
        ocr.confidence || null,
        ocr.created_at || new Date().toISOString(),
      ]
    );

    if (ocr.media_key) {
      SqliteEngine.run(
        `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ocr.media_key, ocr.note_id, 'ocr_image', 'image/jpeg', 0, Date.now()]
      );
    }
  }

  // --- DATABASE METRICS, INTEGRITY & ORPHAN DETECTION ---

  public static getDatabaseStats(): SqliteStats {
    const notesCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM notes')[0]?.c || 0;
    const eventsCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM events')[0]?.c || 0;
    const checklistsCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM checklists')[0]?.c || 0;
    const versionsCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM note_versions')[0]?.c || 0;
    const mediaFilesCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM media_files')[0]?.c || 0;
    const recordingsCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM recordings')[0]?.c || 0;
    const transcriptsCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM transcripts')[0]?.c || 0;
    const ocrScansCount = SqliteEngine.query<{ c: number }>('SELECT COUNT(*) as c FROM ocr_scans')[0]?.c || 0;

    let binarySize = 0;
    try {
      const binary = SqliteEngine.exportDatabaseBinary();
      binarySize = binary.byteLength;
    } catch {
      // ignore
    }

    const integrity = SqliteEngine.checkIntegrity();

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
      schemaVersion: 2,
      integrityStatus: integrity.status,
    };
  }

  public static findOrphanMediaKeys(): string[] {
    const mediaRows = SqliteEngine.query<{ media_key: string; note_id: number | null }>('SELECT media_key, note_id FROM media_files');
    const existingNotes = new Set(SqliteEngine.query<{ id: number }>('SELECT id FROM notes').map((n) => n.id));

    const orphans: string[] = [];
    for (const m of mediaRows) {
      if (!m.note_id || !existingNotes.has(m.note_id)) {
        orphans.push(m.media_key);
      }
    }
    return orphans;
  }

  public static removeOrphanMediaRecord(mediaKey: string): void {
    SqliteEngine.run('DELETE FROM media_files WHERE media_key = ?', [mediaKey]);
  }
}
