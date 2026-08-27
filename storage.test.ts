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
  ({ StorageManager } = await import('./storage'));
});

function makeEvent(overrides: Partial<Omit<EventRecord, 'id'>> = {}): Omit<EventRecord, 'id'> {
  return {
    title: 'Team Sync',
    event_date: '2026-08-27',
    ...overrides,
  };
}

function makeNote(eventId: number, overrides: Partial<Omit<NoteRecord, 'id'>> = {}): Omit<NoteRecord, 'id'> {
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

  it('cascades deleting an event to its notes', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id));
    StorageManager.deleteEvent(event.id);
    expect(StorageManager.getEvents()).toHaveLength(0);
    expect(StorageManager.getNoteById(note.id)).toBeUndefined();
  });
});

describe('StorageManager notes', () => {
  it('adds a note with sensible defaults', () => {
    const event = StorageManager.addEvent(makeEvent());
    const note = StorageManager.addNote(makeNote(event.id, { body: 'Hello world' }));
    expect(note.status).toBe('active');
    expect(note.note_type).toBe('text');
    expect(note.cloud_save_enabled).toBe(false);
    expect(note.body).toBe('Hello world');
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

    vi.resetModules();
    const reloaded = (await import('./storage')).StorageManager;
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

    const wrongAttempt = await StorageManager.verifyAndUnlockNote(StorageManager.getNoteById(note.id)!, '0000');
    expect(wrongAttempt.success).toBe(false);

    const rightAttempt = await StorageManager.verifyAndUnlockNote(StorageManager.getNoteById(note.id)!, '1234');
    expect(rightAttempt.success).toBe(true);
    expect(rightAttempt.payload?.body).toBe('Top secret plans');
  });
});
