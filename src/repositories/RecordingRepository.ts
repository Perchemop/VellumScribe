import { getDatabaseAdapter } from '../lib/sqlite/databaseAdapter';
import { RecordingRecord } from '../types';
import { AppLogger } from '../lib/logger';

export class RecordingRepository {
  /**
   * Get recording by ID asynchronously
   */
  public static async getByIdAsync(id: number): Promise<RecordingRecord | null> {
    const db = getDatabaseAdapter();
    const rows = await db.query<any>(
      `SELECT id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps,
              created_at, checksum, duration_ms, mime_type, channels, status
       FROM recordings WHERE id = ?`,
      [id]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Get recording by ID
   */
  public static getById(id: number): RecordingRecord | null {
    const db = getDatabaseAdapter();
    const rows = db.querySync ? db.querySync<any>(
      `SELECT id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps,
              created_at, checksum, duration_ms, mime_type, channels, status
       FROM recordings WHERE id = ?`,
      [id]
    ) : [];
    if (!rows || rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  /**
   * Get all recordings for a given note ID asynchronously
   */
  public static async getByNoteIdAsync(noteId: number): Promise<RecordingRecord[]> {
    const db = getDatabaseAdapter();
    const rows = await db.query<any>(
      `SELECT id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps,
              created_at, checksum, duration_ms, mime_type, channels, status
       FROM recordings WHERE note_id = ? ORDER BY id DESC`,
      [noteId]
    );
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Get all recordings for a given note ID
   */
  public static getByNoteId(noteId: number): RecordingRecord[] {
    const db = getDatabaseAdapter();
    const rows = db.querySync ? db.querySync<any>(
      `SELECT id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps,
              created_at, checksum, duration_ms, mime_type, channels, status
       FROM recordings WHERE note_id = ? ORDER BY id DESC`,
      [noteId]
    ) : [];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Get all recordings across workspace asynchronously
   */
  public static async getAllAsync(): Promise<RecordingRecord[]> {
    const db = getDatabaseAdapter();
    const rows = await db.query<any>(
      `SELECT id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps,
              created_at, checksum, duration_ms, mime_type, channels, status
       FROM recordings ORDER BY id DESC`
    );
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Get all recordings across workspace
   */
  public static getAll(): RecordingRecord[] {
    const db = getDatabaseAdapter();
    const rows = db.querySync ? db.querySync<any>(
      `SELECT id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps,
              created_at, checksum, duration_ms, mime_type, channels, status
       FROM recordings ORDER BY id DESC`
    ) : [];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Save or insert recording asynchronously
   */
  public static async saveAsync(recording: Partial<RecordingRecord> & { note_id: number; file_path: string }): Promise<RecordingRecord> {
    const db = getDatabaseAdapter();
    let recordingId = recording.id;
    const createdAt = recording.created_at || new Date().toISOString();
    const durationMs = recording.duration_ms ?? (recording.duration_seconds ? recording.duration_seconds * 1000 : 0);
    const durationSec = recording.duration_seconds ?? Math.round(durationMs / 1000);
    const checksum = recording.checksum || '';
    const mimeType = recording.mime_type || 'audio/wav';
    const channels = recording.channels ?? 1;
    const status = recording.status || 'ready';

    if (recordingId && recordingId > 0) {
      await db.run(
        `INSERT OR REPLACE INTO recordings 
         (id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps, created_at, checksum, duration_ms, mime_type, channels, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recordingId,
          recording.note_id,
          recording.file_path,
          recording.media_key || null,
          durationSec,
          recording.file_size || 0,
          recording.sample_rate || 16000,
          recording.bitrate_kbps || 256,
          createdAt,
          checksum,
          durationMs,
          mimeType,
          channels,
          status,
        ]
      );
    } else {
      const res = await db.run(
        `INSERT INTO recordings 
         (note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps, created_at, checksum, duration_ms, mime_type, channels, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recording.note_id,
          recording.file_path,
          recording.media_key || null,
          durationSec,
          recording.file_size || 0,
          recording.sample_rate || 16000,
          recording.bitrate_kbps || 256,
          createdAt,
          checksum,
          durationMs,
          mimeType,
          channels,
          status,
        ]
      );
      recordingId = res?.lastInsertRowId || Date.now();
    }

    if (recording.media_key) {
      try {
        await db.run(
          `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [recording.media_key, recording.note_id, 'audio', mimeType, recording.file_size || 0, Date.now()]
        );
      } catch (err) {
        AppLogger.warn('RecordingRepository', 'Failed to register media_files entry', err);
      }
    }

    return {
      id: recordingId,
      note_id: recording.note_id,
      file_path: recording.file_path,
      media_key: recording.media_key,
      duration_seconds: durationSec,
      duration_ms: durationMs,
      file_size: recording.file_size || 0,
      sample_rate: recording.sample_rate || 16000,
      bitrate_kbps: recording.bitrate_kbps || 256,
      checksum,
      mime_type: mimeType,
      channels,
      status,
      created_at: createdAt,
    };
  }

  /**
   * Save or insert recording with strict schema conformance
   */
  public static save(recording: Partial<RecordingRecord> & { note_id: number; file_path: string }): RecordingRecord {
    const db = getDatabaseAdapter();
    let recordingId = recording.id;
    const createdAt = recording.created_at || new Date().toISOString();
    const durationMs = recording.duration_ms ?? (recording.duration_seconds ? recording.duration_seconds * 1000 : 0);
    const durationSec = recording.duration_seconds ?? Math.round(durationMs / 1000);
    const checksum = recording.checksum || '';
    const mimeType = recording.mime_type || 'audio/wav';
    const channels = recording.channels ?? 1;
    const status = recording.status || 'ready';

    if (recordingId && recordingId > 0) {
      db.runSync?.(
        `INSERT OR REPLACE INTO recordings 
         (id, note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps, created_at, checksum, duration_ms, mime_type, channels, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recordingId,
          recording.note_id,
          recording.file_path,
          recording.media_key || null,
          durationSec,
          recording.file_size || 0,
          recording.sample_rate || 16000,
          recording.bitrate_kbps || 256,
          createdAt,
          checksum,
          durationMs,
          mimeType,
          channels,
          status,
        ]
      );
    } else {
      const res = db.runSync?.(
        `INSERT INTO recordings 
         (note_id, file_path, media_key, duration_seconds, file_size, sample_rate, bitrate_kbps, created_at, checksum, duration_ms, mime_type, channels, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recording.note_id,
          recording.file_path,
          recording.media_key || null,
          durationSec,
          recording.file_size || 0,
          recording.sample_rate || 16000,
          recording.bitrate_kbps || 256,
          createdAt,
          checksum,
          durationMs,
          mimeType,
          channels,
          status,
        ]
      );
      recordingId = res?.lastInsertRowId || Date.now();
    }

    if (recording.media_key) {
      try {
        db.runSync?.(
          `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [recording.media_key, recording.note_id, 'audio', mimeType, recording.file_size || 0, Date.now()]
        );
      } catch (err) {
        AppLogger.warn('RecordingRepository', 'Failed to register media_files entry', err);
      }
    }

    return {
      id: recordingId,
      note_id: recording.note_id,
      file_path: recording.file_path,
      media_key: recording.media_key,
      duration_seconds: durationSec,
      duration_ms: durationMs,
      file_size: recording.file_size || 0,
      sample_rate: recording.sample_rate || 16000,
      bitrate_kbps: recording.bitrate_kbps || 256,
      checksum,
      mime_type: mimeType,
      channels,
      status,
      created_at: createdAt,
    };
  }

  /**
   * Update recording status safely
   */
  public static updateStatus(id: number, status: string): void {
    const db = getDatabaseAdapter();
    db.runSync?.('UPDATE recordings SET status = ? WHERE id = ?', [status, id]);
  }

  /**
   * Delete a recording
   */
  public static delete(id: number): void {
    const db = getDatabaseAdapter();
    db.runSync?.('DELETE FROM recordings WHERE id = ?', [id]);
  }

  private static mapRow(r: any): RecordingRecord {
    return {
      id: r.id,
      note_id: r.note_id,
      file_path: r.file_path || '',
      media_key: r.media_key || undefined,
      duration_seconds: r.duration_seconds || 0,
      duration_ms: r.duration_ms || (r.duration_seconds ? r.duration_seconds * 1000 : 0),
      file_size: r.file_size || 0,
      sample_rate: r.sample_rate || 16000,
      bitrate_kbps: r.bitrate_kbps || undefined,
      created_at: r.created_at,
      checksum: r.checksum || undefined,
      mime_type: r.mime_type || 'audio/wav',
      channels: r.channels ?? 1,
      status: r.status || 'ready',
    };
  }
}
