import { beforeAll, describe, expect, it } from 'vitest';
import { StorageManager } from './storage';
import { RecordingRepository } from '../repositories/RecordingRepository';
import { SqliteRepository } from './sqlite/sqliteRepository';
import { getDatabaseAdapter } from './sqlite/databaseAdapter';

/**
 * Regression proofs for the data-integrity findings of the E2E audit
 * (`docs/qc/e2e-audit-2026-10-29.md`, S-F1/S-F2):
 *  - deleting a recording only invalidated a cache, so the row came back;
 *  - the orphan-media sweep was a stub that always reported zero.
 */
describe('storage lifecycle — deletions must persist (audit S-F1/S-F2)', () => {
  beforeAll(async () => {
    const { SqliteEngine } = await import('./sqlite/sqliteEngine');
    await SqliteEngine.resetForTesting();
    await StorageManager.initialize();
  });

  function makeNote(title: string): number {
    const note = SqliteRepository.saveNote({
      title,
      body: 'body',
      event_id: null,
    } as never) as unknown as { id: number };
    return note.id;
  }

  function insertRecording(noteId: number, mediaKey: string): number {
    const db = getDatabaseAdapter();
    db.run(
      `INSERT INTO recordings (note_id, file_path, media_key, duration_seconds, duration_ms, file_size, sample_rate, channels, checksum, mime_type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        noteId,
        'voice.wav',
        mediaKey,
        3,
        3000,
        1024,
        16000,
        1,
        'checksum',
        'audio/wav',
        'ready',
        Date.now(),
      ]
    );
    const rows = db.querySync?.<{ id: number }>(
      'SELECT id FROM recordings WHERE media_key = ? ORDER BY id DESC LIMIT 1',
      [mediaKey]
    );
    return rows?.[0]?.id ?? 0;
  }

  it('really deletes a recording row instead of only clearing a cache', async () => {
    const noteId = makeNote('Recording note');
    const recordingId = insertRecording(noteId, 'media-del-1');
    expect(recordingId).toBeGreaterThan(0);
    expect(RecordingRepository.getById(recordingId)).toBeDefined();

    await StorageManager.deleteRecording(recordingId);

    expect(RecordingRepository.getById(recordingId)).toBeUndefined();
  });

  it('deletes the OCR scan row for real', () => {
    const db = getDatabaseAdapter();
    const noteId = makeNote('Scan note');
    db.run(
      `INSERT INTO ocr_scans (note_id, ocr_text, confidence, created_at) VALUES (?, ?, ?, ?)`,
      [noteId, 'scanned text', 0.9, Date.now()]
    );
    const rows = db.querySync?.<{ id: number }>(
      'SELECT id FROM ocr_scans ORDER BY id DESC LIMIT 1'
    );
    const scanId = rows?.[0]?.id ?? 0;
    expect(scanId).toBeGreaterThan(0);

    StorageManager.deleteOcrScan(scanId);

    const after = db.querySync?.<{ id: number }>('SELECT id FROM ocr_scans WHERE id = ?', [scanId]);
    expect(after?.length ?? 0).toBe(0);
  });

  it('sweeps orphan media for real and reports the count', async () => {
    const db = getDatabaseAdapter();
    db.run(
      `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['media-orphan-sweep', 424242, 'image', 'image/png', 10, Date.now()]
    );
    expect(SqliteRepository.findOrphanMediaKeys()).toContain('media-orphan-sweep');

    const result = await StorageManager.cleanOrphanedMedia();

    expect(result.cleanedCount).toBeGreaterThanOrEqual(1);
    expect(SqliteRepository.findOrphanMediaKeys()).not.toContain('media-orphan-sweep');
  });
});
