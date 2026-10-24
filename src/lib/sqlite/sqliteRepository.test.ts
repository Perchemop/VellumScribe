import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteRepository } from './sqliteRepository';
import { getDatabaseAdapter } from './databaseAdapter';
import { SqliteEngine } from './sqliteEngine';
import { StorageManager } from '../storage';

describe('Orphan media repair at cold start (R-1.5)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    const { SqliteEngine: SE } = await import('./sqliteEngine');
    await SE.resetForTesting();
    const { StorageManager: SM } = await import('../storage');
    await SM.initialize();
  });

  function insertMedia(mediaKey: string, noteId: number | null): void {
    const db = getDatabaseAdapter();
    db.run(
      `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mediaKey, noteId, 'image', 'image/png', 100, Date.now()]
    );
  }

  it('finds media whose note no longer exists as orphans', async () => {
    const note = StorageManager.addNote({
      event_id: null,
      title: 'Valid note',
      body: 'body',
    });

    // media attached to an existing note -> not an orphan
    insertMedia('media-valid', note.id);
    // media referencing a deleted/non-existent note -> orphan
    insertMedia('media-orphan-deleted', 99999);
    // media with no note reference at all -> orphan
    insertMedia('media-orphan-null', null);

    const orphans = SqliteRepository.findOrphanMediaKeys();
    expect(orphans).toContain('media-orphan-deleted');
    expect(orphans).toContain('media-orphan-null');
    expect(orphans).not.toContain('media-valid');
  });

  it('removes an orphan media record', async () => {
    const note = StorageManager.addNote({
      event_id: null,
      title: 'Valid note',
      body: 'body',
    });
    insertMedia('media-valid', note.id);
    insertMedia('media-orphan', null);

    SqliteRepository.removeOrphanMediaRecord('media-orphan');

    const remaining = SqliteRepository.findOrphanMediaKeys();
    expect(remaining).not.toContain('media-orphan');
    expect(remaining).not.toContain('media-valid');
    expect(remaining).toEqual([]);
  });

  it('treats media as orphan after its note is deleted', async () => {
    const note = StorageManager.addNote({
      event_id: null,
      title: 'To be deleted',
      body: 'body',
    });
    insertMedia('media-orphan-after-delete', note.id);

    StorageManager.deleteNote(note.id);

    const orphans = SqliteRepository.findOrphanMediaKeys();
    expect(orphans).toContain('media-orphan-after-delete');

    SqliteRepository.removeOrphanMediaRecord('media-orphan-after-delete');
    expect(SqliteRepository.findOrphanMediaKeys()).toEqual([]);
  });
});
