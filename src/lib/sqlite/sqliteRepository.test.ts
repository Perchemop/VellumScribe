import { beforeEach, describe, expect, it, vi } from 'vitest';

let SqliteRepository: typeof import('./sqliteRepository').SqliteRepository;
let getDatabaseAdapter: typeof import('./databaseAdapter').getDatabaseAdapter;
let StorageManager: typeof import('../storage').StorageManager;

describe('Orphan media repair at cold start (R-1.5)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    const { SqliteEngine: SE } = await import('./sqliteEngine');
    await SE.resetForTesting();
    ({ SqliteRepository } = await import('./sqliteRepository'));
    ({ getDatabaseAdapter } = await import('./databaseAdapter'));
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
    // The 99999 parent note deliberately does not exist: this row simulates legacy corruption so
    // the orphan-repair path has something to find. sql.js >= 1.15.2 actually enforces the FK
    // pragma (<= 1.14 silently reset it in export()), so suspend enforcement for the dangling
    // insert only and restore enforcement immediately after the window.
    const adapter = getDatabaseAdapter();
    adapter.run('PRAGMA foreign_keys = OFF;');
    try {
      insertMedia('media-orphan-deleted', 99999);
    } finally {
      adapter.run('PRAGMA foreign_keys = ON;');
    }
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

  it('upserts an event whose explicit id is not in the database (backup restore)', async () => {
    // A backup dump carries explicit ids for rows the (fresh or partial) database
    // does not have yet. saveEvent used to treat "has id" as "row exists", match
    // 0 rows with its UPDATE and silently drop the event.
    SqliteRepository.saveEvent({
      id: 4242,
      title: 'Imported event',
      event_date: '2026-11-14',
    });

    const rows = await SqliteRepository.queryAsync<{ id: number; title: string }>(
      'SELECT id, title FROM events WHERE id = 4242'
    );
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Imported event');
  });

  it('saves a note referencing an imported event id with foreign keys enforced', async () => {
    SqliteRepository.saveEvent({
      id: 4242,
      title: 'Imported event',
      event_date: '2026-11-14',
    });

    // The parent now exists under its explicit id, so no pragma window is needed:
    // the note insert must satisfy notes.event_id -> events(id) under enforcement.
    const note = StorageManager.addNote({
      event_id: 4242,
      title: 'Note under imported event',
      body: 'body',
      created_at: new Date().toISOString(),
    });

    const stored = SqliteRepository.getNoteById(note.id);
    expect(stored?.event_id).toBe(4242);
    expect(stored?.title).toBe('Note under imported event');
  });

  it('updates an event that already exists without duplicating it', async () => {
    const created = SqliteRepository.saveEvent({
      id: 0,
      title: 'Original title',
      event_date: '2026-11-14',
    });
    expect(created.id).toBeGreaterThan(0);

    SqliteRepository.saveEvent({ ...created, title: 'Renamed event' });

    const rows = await SqliteRepository.queryAsync<{ id: number; title: string }>(
      'SELECT id, title FROM events WHERE id = ?',
      [created.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('Renamed event');
  });
});
