import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventRecord, NoteRecord } from '../types';

// StorageManager keeps an in-memory cache in module-level static fields
// (see storage.ts), so each test gets a fresh module instance via
// resetModules() + a dynamic re-import, rather than relying on
// localStorage.clear() alone (which wouldn't reset the cache).
let StorageManager: typeof import('./storage').StorageManager;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  const { SqliteEngine } = await import('./sqlite/sqliteEngine');
  await SqliteEngine.resetForTesting();
  ({ StorageManager } = await import('./storage'));
  await StorageManager.initialize();
});

function makeEvent(overrides: Partial<Omit<EventRecord, 'id'>> = {}): Omit<EventRecord, 'id'> {
  return {
    title: 'Team Sync',
    event_date: '2026-08-27',
    ...overrides,
  };
}

function makeNote(
  eventId: number,
  overrides: Partial<Omit<NoteRecord, 'id'>> = {}
): Omit<NoteRecord, 'id'> {
  return {
    event_id: eventId,
    body: 'Some note content',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('StorageManager events', () => {
  it('starts with no events', () => {
    expect(StorageManager.getEvents()).toEqual([]);
  });

  it('adds an event and assigns an incrementing id', () => {
    const first = StorageManager.addEvent(makeEvent({ title: 'First' }));
    const second = StorageManager.addEvent(makeEvent({ title: 'Second' }));
    expect(first.id).not.toBe(second.id);
    expect(StorageManager.getEvents()).toHaveLength(2);
  });

  it('updates an existing event', () => {
    const event = StorageManager.addEvent(makeEvent({ title: 'Original' }));
    const updated = StorageManager.updateEvent(event.id, { title: 'Renamed' });
    expect(updated?.title).toBe('Renamed');
    expect(StorageManager.getEvents().find((e) => e.id === event.id)?.title).toBe('Renamed');
  });

  it('preserves notes by moving them to General when an event is deleted', () => {
    const event = StorageManager.addEvent(makeEvent({ title: 'Work Projects' }));
    const note = StorageManager.addNote(makeNote(event.id, { body: 'Important project note' }));

    StorageManager.deleteEvent(event.id);

    // The original event should be deleted
    expect(StorageManager.getEvents().find((e) => e.id === event.id)).toBeUndefined();

    // The note MUST be preserved, not deleted, and remapped to General
    const preservedNote = StorageManager.getNoteById(note.id);
    expect(preservedNote).toBeDefined();
    expect(preservedNote?.body).toBe('Important project note');

    const generalEvent = StorageManager.getEvents().find(
      (e) => e.title.toLowerCase() === 'general'
    );
    expect(generalEvent).toBeDefined();
    expect(preservedNote?.event_id).toBe(generalEvent?.id);
  });
});

describe('StorageManager notes', () => {
  it('adds a note with sensible defaults', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id, { body: 'Hello world' }));
    expect(note.status).toBe('active');
    expect(note.note_type).toBe('text');
    expect(note.body).toBe('Hello world');
  });

  it('updates an existing note and returns the updated record, or null if not found', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(
      makeNote(event.id, { title: 'Initial Title', body: 'Initial Body' })
    );

    const updated = StorageManager.updateNote(note.id, { title: 'Updated Title' });
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.body).toBe('Initial Body');

    const fetched = StorageManager.getNoteById(note.id);
    expect(fetched?.title).toBe('Updated Title');

    const nonExistent = StorageManager.updateNote(999999, { title: 'Ghost' });
    expect(nonExistent).toBeNull();
  });

  it('detects sync conflicts when expectedVersion does not match, and records conflict', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id, { title: 'Versioned Note' }));
    expect(note.version).toBe(1);

    // Update with correct expectedVersion succeeds and bumps to version 2
    const firstUpdate = StorageManager.updateNote(note.id, { title: 'Version 2' }, 1);
    expect(firstUpdate).not.toBeNull();
    expect(firstUpdate?.version).toBe(2);

    // Stale update with expectedVersion 1 fails due to conflict
    const staleUpdate = StorageManager.updateNote(note.id, { title: 'Stale Attempt' }, 1);
    expect(staleUpdate).toBeNull();

    // Verify conflict is logged in sync_conflicts
    const conflicts = StorageManager.getSyncConflicts('open');
    expect(conflicts.length).toBeGreaterThan(0);
    const conflict = conflicts.find((c) => c.entity_id === String(note.id));
    expect(conflict).toBeDefined();
    expect(conflict?.local_version_id).toBe('2');
    expect(conflict?.remote_version_id).toBe('1');

    // Resolve conflict
    if (conflict) {
      StorageManager.resolveSyncConflict(conflict.id);
      const remaining = StorageManager.getSyncConflicts('open');
      expect(remaining.find((c) => c.id === conflict.id)).toBeUndefined();
    }
  });

  it('records and restores note revisions', async () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(
      makeNote(event.id, { title: 'Revision 1 Title', body: 'Revision 1 Body' })
    );

    // Update note to create a second version
    StorageManager.updateNote(note.id, { title: 'Revision 2 Title', body: 'Revision 2 Body' });

    // Save a revision record
    const revId = `rev_${note.id}_test`;
    const rev = {
      id: revId,
      note_id: note.id,
      version_number: 1,
      title: 'Revision 1 Title',
      body: 'Revision 1 Body',
      created_at: Date.now() - 1000,
      reason: 'Initial revision',
      source: 'Test',
      content_hash: 'hash123',
    };
    const { SqliteRepository } = await import('./sqlite/sqliteRepository');
    SqliteRepository.saveNoteRevision(rev);

    const revisions = StorageManager.getNoteRevisions(note.id);
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions[0].title).toBe('Revision 1 Title');

    // Now restore
    const restored = StorageManager.restoreNoteRevision(note.id, revId);
    expect(restored).not.toBeNull();
    expect(restored?.title).toBe('Revision 1 Title');
    expect(restored?.body).toBe('Revision 1 Body');

    // Add extra revisions to test pruning
    const countBefore = StorageManager.getNoteRevisions(note.id).length;
    for (let i = 0; i < 5; i++) {
      SqliteRepository.saveNoteRevision({
        id: `rev_${note.id}_extra_${i}`,
        note_id: note.id,
        version_number: 10 + i,
        title: `Revision ${i}`,
        body: `Body ${i}`,
        created_at: Date.now() + i + 10,
        reason: `Auto ${i}`,
        source: 'Test',
        content_hash: `hash${i}`,
      });
    }
    const totalCount = countBefore + 5;
    expect(StorageManager.getNoteRevisions(note.id).length).toBe(totalCount);
    const prunedCount = SqliteRepository.pruneNoteRevisions(3);
    expect(prunedCount).toBe(totalCount - 3);
    expect(StorageManager.getNoteRevisions(note.id).length).toBe(3);
  });

  it('archive / unarchive round-trips status', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id));
    StorageManager.archiveNote(note.id);
    expect(StorageManager.getNoteById(note.id)?.status).toBe('archived');
    StorageManager.unarchiveNote(note.id);
    expect(StorageManager.getNoteById(note.id)?.status).toBe('active');
  });

  it('trash / restore round-trips status', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id));
    StorageManager.trashNote(note.id);
    expect(StorageManager.getTrashNotes()).toHaveLength(1);
    StorageManager.restoreNote(note.id);
    expect(StorageManager.getActiveNotes()).toHaveLength(1);
  });

  it('deletes a note permanently', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id));
    expect(StorageManager.deleteNote(note.id)).toBe(true);
    expect(StorageManager.getNoteById(note.id)).toBeUndefined();
  });

  it('persists notes across a fresh module load (simulating a page reload)', async () => {
    const event = StorageManager.addEvent(makeEvent());
    StorageManager.addNote(makeNote(event.id, { body: 'Survives reload' }));

    const { SqliteEngine } = await import('./sqlite/sqliteEngine');
    await SqliteEngine.flushToStorage();

    vi.resetModules();
    const reloaded = (await import('./storage')).StorageManager;
    await reloaded.initialize();
    expect(reloaded.getNotes()).toHaveLength(1);
    expect(reloaded.getNotes()[0].body).toBe('Survives reload');
  });
});

describe('StorageManager PIN lock', () => {
  it('locks and unlocks a note with the correct PIN, and rejects the wrong one', async () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id, { body: 'Top secret plans' }));

    const locked = await StorageManager.setNotePinLock(note.id, '1234');
    expect(locked?.is_locked).toBe(true);
    // Plaintext body should not remain in the stored record once locked.
    expect(StorageManager.getNoteById(note.id)?.body).not.toContain('Top secret plans');

    const wrongAttempt = await StorageManager.verifyAndUnlockNote(
      StorageManager.getNoteById(note.id)!,
      '0000'
    );
    expect(wrongAttempt.success).toBe(false);

    const rightAttempt = await StorageManager.verifyAndUnlockNote(
      StorageManager.getNoteById(note.id)!,
      '1234'
    );
    expect(rightAttempt.success).toBe(true);
    expect(rightAttempt.payload?.body).toBe('Top secret plans');
  });
});

describe('StorageManager note operations & batch processing', () => {
  it('duplicates an existing note with Copy title and resets pinned status', () => {
    const event = StorageManager.addEvent(makeEvent());
    const original = StorageManager.addNote(
      makeNote(event.id, { title: 'Project Roadmap', body: 'Milestones 1 to 4', is_pinned: true })
    );

    const duplicated = StorageManager.duplicateNote(original.id);
    expect(duplicated).toBeDefined();
    expect(duplicated?.id).not.toBe(original.id);
    expect(duplicated?.title).toBe('Project Roadmap (Copy)');
    expect(duplicated?.body).toBe('Milestones 1 to 4');
    expect(duplicated?.is_pinned).toBe(false);
    expect(StorageManager.getActiveNotes()).toHaveLength(2);
  });

  it('toggles pinned status of a note', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id, { is_pinned: false }));

    const pinned = StorageManager.togglePinNote(note.id);
    expect(pinned?.is_pinned).toBe(true);

    const unpinned = StorageManager.togglePinNote(note.id);
    expect(unpinned?.is_pinned).toBe(false);
  });

  it('performs bulk archiving across selected notes', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note1 = StorageManager.addNote(makeNote(event.id, { title: 'Note 1' }));
    const note2 = StorageManager.addNote(makeNote(event.id, { title: 'Note 2' }));
    const note3 = StorageManager.addNote(makeNote(event.id, { title: 'Note 3' }));

    const count = StorageManager.bulkArchiveNotes([note1.id, note2.id]);
    expect(count).toBe(2);

    expect(StorageManager.getActiveNotes()).toHaveLength(1);
    expect(StorageManager.getArchivedNotes()).toHaveLength(2);
    expect(StorageManager.getNoteById(note1.id)?.status).toBe('archived');
    expect(StorageManager.getNoteById(note3.id)?.status).toBe('active');
  });

  it('performs bulk deletion atomically across selected notes', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note1 = StorageManager.addNote(makeNote(event.id, { title: 'Note A' }));
    const note2 = StorageManager.addNote(makeNote(event.id, { title: 'Note B' }));
    const note3 = StorageManager.addNote(makeNote(event.id, { title: 'Note C' }));

    const count = StorageManager.bulkDeleteNotes([note1.id, note3.id]);
    expect(count).toBe(2);

    expect(StorageManager.getNoteById(note1.id)).toBeUndefined();
    expect(StorageManager.getNoteById(note2.id)).toBeDefined();
    expect(StorageManager.getNoteById(note3.id)).toBeUndefined();
  });

  it('runs SQLite VACUUM compaction and returns size metrics', async () => {
    const event = StorageManager.addEvent(makeEvent());
    for (let i = 0; i < 5; i++) {
      StorageManager.addNote(
        makeNote(event.id, { title: `Note ${i}`, body: 'Content '.repeat(100) })
      );
    }
    const res = await StorageManager.vacuumDatabase();
    expect(res).toBeDefined();
    expect(res.originalSizeBytes).toBeGreaterThan(0);
    expect(res.compactedSizeBytes).toBeGreaterThan(0);
    expect(typeof res.bytesReclaimed).toBe('number');
  });

  it('getNotes() returns notes beyond the initial page size', async () => {
    const event = StorageManager.addEvent(makeEvent({ title: 'Pagination Test' }));
    for (let i = 0; i < 75; i++) {
      StorageManager.addNote(makeNote(event.id, { title: `Note ${i}`, body: `Content ${i}` }));
    }
    // Simulate a fresh session load
    StorageManager.refreshCaches();
    expect(StorageManager.getNotes().length).toBeGreaterThanOrEqual(75);
  });
});

describe('CloudSyncEngine offline sync queue', () => {
  it('enqueues, retrieves, and clears sync requests', async () => {
    const { CloudSyncEngine } = await import('./cloudSync');
    CloudSyncEngine.clearSyncQueue();
    expect(CloudSyncEngine.getSyncQueue()).toEqual([]);

    const item = CloudSyncEngine.enqueueSync(['google_drive'], 'Network offline test');
    expect(item).toBeDefined();
    expect(item.providers).toContain('google_drive');

    const queue = CloudSyncEngine.getSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(item.id);

    CloudSyncEngine.removeFromSyncQueue(item.id);
    expect(CloudSyncEngine.getSyncQueue()).toHaveLength(0);

    CloudSyncEngine.enqueueSync(['webdav'], 'Second test');
    expect(CloudSyncEngine.getSyncQueue()).toHaveLength(1);
    CloudSyncEngine.clearSyncQueue();
    expect(CloudSyncEngine.getSyncQueue()).toHaveLength(0);
  });
});
