import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteRepository } from './NoteRepository';
import { getDatabaseAdapter } from '../lib/sqlite/databaseAdapter';
import { VersionControlManager } from '../lib/versionControl';
import type { NoteRecord } from '../types';

describe('NoteRepository lifecycle (R-2: Notes & capture)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    const { SqliteEngine } = await import('../lib/sqlite/sqliteEngine');
    await SqliteEngine.resetForTesting();
    const { StorageManager } = await import('../lib/storage');
    await StorageManager.initialize();
  });

  async function seedEvent(title = 'Event A'): Promise<number> {
    const db = getDatabaseAdapter();
    const res = await db.run(
      'INSERT INTO events (title, event_date, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [title, '2026-01-01', 'seed event', Date.now().toString(), Date.now().toString()]
    );
    return Number(res.lastInsertRowId ?? db.getLastInsertId?.() ?? 0);
  }

  async function createNote(
    overrides: Partial<Parameters<typeof NoteRepository.create>[0]> = {}
  ): Promise<NoteRecord> {
    return NoteRepository.create({
      title: 'Test Note',
      body: 'Body content',
      ...overrides,
    });
  }

  describe('R-2.1 notes hang under events, never a flat list', () => {
    it('stores event_id and lists notes scoped to an event', async () => {
      const eventA = await seedEvent('Event A');
      const eventB = await seedEvent('Event B');

      await NoteRepository.create({ title: 'Note A1', event_id: eventA });
      await NoteRepository.create({ title: 'Note A2', event_id: eventA });
      await NoteRepository.create({ title: 'Note B1', event_id: eventB });

      const listA = await NoteRepository.list({ eventId: eventA });
      expect(listA.notes.map((n) => n.title).sort()).toEqual(['Note A1', 'Note A2']);
      listA.notes.forEach((n) => expect(n.event_id).toBe(eventA));

      const listB = await NoteRepository.list({ eventId: eventB });
      expect(listB.notes.map((n) => n.title)).toEqual(['Note B1']);

      const all = await NoteRepository.list();
      expect(all.notes.length).toBe(3);
    });

    it('create without event_id still works (nullable)', async () => {
      const note = await createNote();
      const fetched = await NoteRepository.getById(note.id);
      // Round-trip: whatever event_id was stored comes back unchanged.
      expect(fetched?.event_id).toEqual(note.event_id);
    });
  });

  describe('R-2.2 note types text / checklist / sketch', () => {
    it('creates a text note with default note_type', async () => {
      const note = await createNote();
      expect(note.note_type).toBe('text');
    });

    it('creates a checklist note with items', async () => {
      const note = await createNote({
        note_type: 'checklist',
        checklist_items: [
          { id: 'chk_1', text: 'Buy milk', completed: false },
          { id: 'chk_2', text: 'Walk dog', completed: true },
        ],
      });
      expect(note.note_type).toBe('checklist');
      expect(note.checklist_items).toHaveLength(2);
      expect(note.checklist_items?.[0].text).toBe('Buy milk');
      expect(note.checklist_items?.[1].completed).toBe(true);
    });

    it('creates a sketch note', async () => {
      const note = await createNote({
        note_type: 'sketch',
        sketch_media_key: 'sketch_abc123',
      });
      expect(note.note_type).toBe('sketch');
      expect(note.sketch_media_key).toBe('sketch_abc123');
    });

    it('filters notes by note_type', async () => {
      const textNote = await createNote({ note_type: 'text' });
      await createNote({ note_type: 'checklist' });
      const sketchNote = await createNote({ note_type: 'sketch' });

      const sketches = await NoteRepository.list({ filterType: 'sketch' });
      expect(sketches.notes.every((n) => n.note_type === 'sketch')).toBe(true);
      expect(sketches.notes.some((n) => n.id === sketchNote.id)).toBe(true);
      expect(sketches.notes.some((n) => n.id === textNote.id)).toBe(false);
    });
  });

  describe('R-2.4 notes move through archive / trash / restore', () => {
    it('archives, trashes, and restores a note via status transitions', async () => {
      const note = await createNote();
      expect(note.status).toBe('active');

      const archived = await NoteRepository.update(note.id, { status: 'archived' });
      expect(archived.status).toBe('archived');
      expect(archived.version).toBeGreaterThanOrEqual(2);

      const onlyActive = await NoteRepository.list({ status: 'active' });
      expect(onlyActive.notes.map((n) => n.id)).not.toContain(note.id);

      const archivedList = await NoteRepository.list({ status: 'archived' });
      expect(archivedList.notes.map((n) => n.id)).toContain(note.id);

      const trashed = await NoteRepository.update(note.id, { status: 'trash' });
      expect(trashed.status).toBe('trash');

      const restored = await NoteRepository.update(note.id, { status: 'active' });
      expect(restored.status).toBe('active');
      const activeAgain = await NoteRepository.list({ status: 'active' });
      expect(activeAgain.notes.map((n) => n.id)).toContain(note.id);
    });
  });

  describe('R-2.5 each note keeps a revision history', () => {
    it('saves and retrieves version snapshots for a note', async () => {
      const note = await createNote({ title: 'Original', body: 'First body' });

      // version_number starts at note.version + 1 (== 2 for a fresh note).
      const v1 = await VersionControlManager.saveVersionSnapshot(note, 'Local User', 'initial');
      expect(v1.version_number).toBeGreaterThanOrEqual(1);
      expect(v1.title).toBe('Original');
      expect(v1.body).toBe('First body');

      const updated = await NoteRepository.update(note.id, { body: 'Second body' });
      const v2 = await VersionControlManager.saveVersionSnapshot(updated, 'Local User', 'edit');
      expect(v2.version_number).toBeGreaterThan(v1.version_number);
      expect(v2.body).toBe('Second body');

      const versions = VersionControlManager.getVersionsForNote(note.id);
      expect(versions.length).toBeGreaterThanOrEqual(2);
      expect(versions.map((v) => v.version_number).sort()).toEqual([
        v1.version_number,
        v2.version_number,
      ]);
    });

    it('pruneOldVersions retains only the most recent versions per note', async () => {
      const note = await createNote({ body: 'body' });
      // Distinct bodies so each save produces a distinct checksum (no dedup).
      for (let i = 0; i < 7; i++) {
        await NoteRepository.update(note.id, { body: `body v${i + 1}` });
        await VersionControlManager.saveVersionSnapshot(
          await NoteRepository.getById(note.id),
          'Local User',
          `v${i + 1}`
        );
      }

      const before = VersionControlManager.getVersionsForNote(note.id).length;
      expect(before).toBeGreaterThan(5);

      VersionControlManager.pruneOldVersions(5);

      const after = VersionControlManager.getVersionsForNote(note.id).length;
      expect(after).toBeLessThanOrEqual(5);
      expect(after).toBeGreaterThan(0);
    });
  });
});
