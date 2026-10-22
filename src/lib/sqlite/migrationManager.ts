import { getDatabaseAdapter } from './databaseAdapter';
import { AppLogger } from '../logger';
import { EventRecord, NoteRecord, RecordingRecord, TranscriptRecord, OcrScanRecord } from '../../types';

const LEGACY_STORAGE_KEYS = {
  EVENTS: 'omninote_sqlite_events_v1',
  NOTES: 'omninote_sqlite_notes_v1',
  RECORDINGS: 'omninote_sqlite_recordings_v1',
  TRANSCRIPTS: 'omninote_sqlite_transcripts_v1',
  OCR_SCANS: 'omninote_sqlite_ocr_scans_v1',
  PRE_MIGRATION_BACKUP: 'vellumscribe_legacy_backup_snapshot_v1',
};

export interface MigrationReport {
  migratedEvents: number;
  migratedNotes: number;
  migratedChecklists: number;
  migratedTags: number;
  migratedVersions: number;
  migratedRecordings: number;
  migratedTranscripts: number;
  migratedOcrScans: number;
  timestamp: string;
  backupCreated: boolean;
}

export class MigrationManager {
  /**
   * Checks if legacy localStorage data exists and hasn't been migrated into SQLite yet.
   * Uses DatabaseAdapter (NativeSqliteAdapter on Android, WebSqliteAdapter on Web).
   */
  public static async checkAndMigrateLegacyData(): Promise<MigrationReport | null> {
    const db = getDatabaseAdapter();
    await db.initialize();

    // Check if migration has already been executed in SQLite
    const metaCheck = await db.query<{ value: string }>(
      'SELECT value FROM workspace_metadata WHERE key = ?',
      ['legacy_migration_v1_completed']
    );

    if (metaCheck.length > 0 && metaCheck[0].value === 'true') {
      return null; // Already migrated
    }

    // Read legacy localStorage items
    const rawEvents = localStorage.getItem(LEGACY_STORAGE_KEYS.EVENTS);
    const rawNotes = localStorage.getItem(LEGACY_STORAGE_KEYS.NOTES);
    const rawRecordings = localStorage.getItem(LEGACY_STORAGE_KEYS.RECORDINGS);
    const rawTranscripts = localStorage.getItem(LEGACY_STORAGE_KEYS.TRANSCRIPTS);
    const rawOcrScans = localStorage.getItem(LEGACY_STORAGE_KEYS.OCR_SCANS);

    if (!rawEvents && !rawNotes) {
      // Mark as complete so we don't check again on clean workspaces
      await db.run(
        'INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['legacy_migration_v1_completed', 'true', Date.now()]
      );
      return null;
    }

    let events: EventRecord[] = [];
    let notes: NoteRecord[] = [];
    let recordings: RecordingRecord[] = [];
    let transcripts: TranscriptRecord[] = [];
    let ocrScans: OcrScanRecord[] = [];

    try {
      if (rawEvents) events = JSON.parse(rawEvents);
      if (rawNotes) notes = JSON.parse(rawNotes);
      if (rawRecordings) recordings = JSON.parse(rawRecordings);
      if (rawTranscripts) transcripts = JSON.parse(rawTranscripts);
      if (rawOcrScans) ocrScans = JSON.parse(rawOcrScans);
    } catch (parseErr) {
      AppLogger.error('MigrationManager', 'Failed to parse legacy JSON for migration', parseErr);
      return null;
    }

    if (events.length === 0 && notes.length === 0) {
      await db.run(
        'INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES (?, ?, ?)',
        ['legacy_migration_v1_completed', 'true', Date.now()]
      );
      return null;
    }

    AppLogger.info('MigrationManager', `Starting safe SQLite migration for ${notes.length} notes and ${events.length} events...`);

    // 1. Create safety pre-migration snapshot backup in localStorage / backup key
    try {
      const backupSnapshot = {
        timestamp: new Date().toISOString(),
        events,
        notes,
        recordings,
        transcripts,
        ocrScans,
      };
      localStorage.setItem(LEGACY_STORAGE_KEYS.PRE_MIGRATION_BACKUP, JSON.stringify(backupSnapshot));
    } catch (backupErr) {
      AppLogger.warn('MigrationManager', 'Could not write safety backup to localStorage, continuing with migration', backupErr);
    }

    let migratedChecklists = 0;
    let migratedTags = 0;
    const migratedVersions = 0;

    // 2. Perform Atomic Migration inside SQLite Transaction via DatabaseAdapter
    try {
      await db.transaction(async () => {
        // Migrate Events
        for (const evt of events) {
          await db.run(
            `INSERT OR REPLACE INTO events (id, title, event_date, description, location, category, color, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              evt.id,
              evt.title,
              evt.event_date,
              evt.description || null,
              evt.location || null,
              evt.category || null,
              evt.color || null,
              Date.now(),
              Date.now(),
            ]
          );
        }

        // Migrate Notes & Relational Sub-entities
        for (const note of notes) {
          await db.run(
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

          // Migrate Checklists
          if (note.checklist_items && Array.isArray(note.checklist_items)) {
            for (let i = 0; i < note.checklist_items.length; i++) {
              const item = note.checklist_items[i];
              await db.run(
                `INSERT OR REPLACE INTO checklists (id, note_id, text, completed, position)
                 VALUES (?, ?, ?, ?, ?)`,
                [item.id || `chk_${note.id}_${i}`, note.id, item.text || '', item.completed ? 1 : 0, i]
              );
              migratedChecklists++;
            }
          }

          // Migrate Tags
          if (note.tags && Array.isArray(note.tags)) {
            for (const tag of note.tags) {
              const trimmed = tag.trim();
              if (trimmed) {
                await db.run(`INSERT OR IGNORE INTO tags (name) VALUES (?)`, [trimmed]);
                await db.run(`INSERT OR IGNORE INTO note_tags (note_id, tag_name) VALUES (?, ?)`, [note.id, trimmed]);
                migratedTags++;
              }
            }
          }
        }

        // Migrate Recordings
        for (const rec of recordings) {
          await db.run(
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
        }

        // Migrate Transcripts
        for (const tr of transcripts) {
          await db.run(
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

        // Migrate OCR scans
        for (const ocr of ocrScans) {
          await db.run(
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
        }

        // Mark completion in SQLite metadata
        await db.run(
          `INSERT OR REPLACE INTO workspace_metadata (key, value, updated_at) VALUES (?, ?, ?)`,
          ['legacy_migration_v1_completed', 'true', Date.now()]
        );
      });

      if (db.flush) {
        await db.flush();
      }
      AppLogger.info('MigrationManager', 'SQLite migration successfully committed via DatabaseAdapter.');

      const report: MigrationReport = {
        migratedEvents: events.length,
        migratedNotes: notes.length,
        migratedChecklists,
        migratedTags,
        migratedVersions,
        migratedRecordings: recordings.length,
        migratedTranscripts: transcripts.length,
        migratedOcrScans: ocrScans.length,
        timestamp: new Date().toISOString(),
        backupCreated: true,
      };

      return report;
    } catch (migrationErr) {
      AppLogger.error('MigrationManager', 'Fatal error during SQLite migration, data rolled back', migrationErr);
      throw migrationErr;
    }
  }

  /**
   * Restore legacy data from pre-migration backup snapshot if needed
   */
  public static getLegacyBackupSnapshot(): any | null {
    try {
      const snap = localStorage.getItem(LEGACY_STORAGE_KEYS.PRE_MIGRATION_BACKUP);
      return snap ? JSON.parse(snap) : null;
    } catch {
      return null;
    }
  }
}
