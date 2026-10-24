import { beforeEach, describe, expect, it, vi } from 'vitest';

let SqliteRepository: typeof import('./sqliteRepository').SqliteRepository;
let getDatabaseAdapter: typeof import('./sqlite/databaseAdapter').getDatabaseAdapter;
let StorageManager: typeof import('../storage').StorageManager;

describe('Orphan media repair at cold start (R-1.5)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    const { SqliteEngine: SE } = await import('./sqlite/sqliteEngine');
    await SE.resetForTesting();
    ({ SqliteRepository } = await import('./sqlite/sqliteRepository'));
    ({ getDatabaseAdapter } = await import('./sqlite/databaseAdapter'));
    ({ StorageManager } = await import('../storage'));
    await StorageManager.initialize();
  });

  function createNote(title: string): { id: number } {
    const event = StorageManager.addEvent({
      title: 'Event',
      event_date: '2026-08-27',
    });
    return StorageManager.addNote({
      event_id: event.id,
      title,
      body: 'body',
      created_at: new Date().toISOString(),
    });
  }

  function insertMedia(mediaKey: string, noteId: number | null): void {
    const db = getDatabaseAdapter();
    db.run(
      `INSERT OR REPLACE INTO media_files (media_key, note_id, media_type, mime_type, byte_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [mediaKey, noteId, 'image', 'image/png', 100, Date.now()]
    );
  }

  it('finds media whose note no longer exists as orphans', async () => {
    const note = createNote('Valid note');

    insertMedia('media-valid', note.id);
    insertMedia('media-orphan-deleted', 99999);
    insertMedia('media-orphan-null', null);

    const orphans = SqliteRepository.findOrphanMediaKeys();
    expect(orphans).toContain('media-orphan-deleted');
    expect(orphans).toContain('media-orphan-null');
    expect(orphans).not.toContain('media-valid');
  });

  it('removes an orphan media record', async () => {
    const note = createNote('Valid note');
    insertMedia('media-valid', note.id);
    insertMedia('media-orphan', null);

    SqliteRepository.removeOrphanMediaRecord('media-orphan');

    const remaining = SqliteRepository.findOrphanMediaKeys();
    expect(remaining).not.toContain('media-orphan');
    expect(remaining).not.toContain('media-valid');
    expect(remaining).toEqual([]);
  });

  it('treats media as orphan after its note is deleted', async () => {
    const note = createNote('To be deleted');
    insertMedia('media-orphan-after-delete', note.id);

    StorageManager.deleteNote(note.id);

    const orphans = SqliteRepository.findOrphanMediaKeys();
    expect(orphans).toContain('media-orphan-after-delete');

    SqliteRepository.removeOrphanMediaRecord('media-orphan-after-delete');
    expect(SqliteRepository.findOrphanMediaKeys()).toEqual([]);
  });
});
