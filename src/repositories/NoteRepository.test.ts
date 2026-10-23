import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteRepository } from './NoteRepository';
import { getDatabaseAdapter } from '../lib/sqlite/databaseAdapter';

describe('NoteRepository item_changes auditing', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    const { SqliteEngine } = await import('../lib/sqlite/sqliteEngine');
    await SqliteEngine.resetForTesting();
    const { StorageManager } = await import('../lib/storage');
    await StorageManager.initialize();
  });

  it('records valid item_changes on create, update, and delete', async () => {
    const db = getDatabaseAdapter();

    // 1. Create note
    const created = await NoteRepository.create({
      title: 'Audit Test Note',
      body: 'Testing item_changes audit logging',
      tags: ['test', 'sync'],
    });
    expect(created).toBeDefined();
    expect(created.id).toBeGreaterThan(0);

    const changesAfterCreate = await db.query<{
      id: string;
      entity_type: string;
      entity_id: string;
      operation: string;
      version: number;
      sync_state: string;
    }>('SELECT * FROM item_changes WHERE entity_type = ? AND entity_id = ?', [
      'note',
      String(created.id),
    ]);

    expect(changesAfterCreate.length).toBe(1);
    expect(changesAfterCreate[0].operation).toBe('create');
    expect(changesAfterCreate[0].version).toBe(1);
    expect(changesAfterCreate[0].sync_state).toBe('pending');

    // 2. Update note
    await NoteRepository.update(created.id, {
      title: 'Updated Audit Test Note',
    });

    const changesAfterUpdate = await db.query<{
      id: string;
      operation: string;
      version: number;
    }>('SELECT * FROM item_changes WHERE entity_type = ? AND entity_id = ? ORDER BY rowid ASC', [
      'note',
      String(created.id),
    ]);

    expect(changesAfterUpdate.length).toBe(2);
    expect(changesAfterUpdate[1].operation).toBe('update');
    expect(changesAfterUpdate[1].version).toBe(2);

    // 3. Delete note
    await NoteRepository.delete(created.id);

    const changesAfterDelete = await db.query<{
      id: string;
      operation: string;
    }>('SELECT * FROM item_changes WHERE entity_type = ? AND entity_id = ? ORDER BY rowid ASC', [
      'note',
      String(created.id),
    ]);

    expect(changesAfterDelete.length).toBe(3);
    expect(changesAfterDelete[2].operation).toBe('delete');
  });
});
