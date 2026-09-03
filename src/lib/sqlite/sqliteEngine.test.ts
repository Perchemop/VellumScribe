import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteEngine } from './sqliteEngine';
import { SqliteRepository } from './sqliteRepository';
import { CURRENT_SCHEMA_VERSION } from './schema';
import { StorageManager } from '../storage';
import { PrivacyManager } from '../privacyManager';

describe('SQLite Engine & Repository', () => {
  beforeEach(async () => {
    localStorage.clear();
    await SqliteEngine.resetForTesting();
    await StorageManager.initialize();
  });

  it('runs schema migrations and reports current schema version', () => {
    const stats = StorageManager.getSqliteStats();
    expect(stats.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(stats.databaseSizeBytes).toBeGreaterThan(0);
  });

  it('passes PRAGMA integrity_check on clean database', () => {
    const integrity = StorageManager.checkDatabaseIntegrity();
    expect(integrity.status).toBe('ok');
    expect(integrity.details).toBe('ok');
  });

  it('stores and retrieves relational notes with checklist items and version snapshots', () => {
    const event = StorageManager.addEvent({
      title: 'Sprint Planning',
      event_date: '2026-09-01',
    });

    const note = StorageManager.addNote({
      event_id: event.id,
      title: 'Action Items',
      body: 'Review audit requirements',
      note_type: 'checklist',
      created_at: new Date().toISOString(),
      checklist_items: [
        { id: '1', text: 'Item 1', completed: false },
        { id: '2', text: 'Item 2', completed: true },
      ],
    });

    const retrieved = StorageManager.getNoteById(note.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.checklist_items).toHaveLength(2);
    expect(retrieved?.checklist_items?.[1].completed).toBe(true);

    // Save version snapshot
    SqliteRepository.saveNoteVersion({
      id: `ver_${note.id}_1`,
      note_id: note.id,
      version_number: 1,
      title: note.title,
      body: note.body,
      author: 'User',
      change_summary: 'Initial revision',
      created_at: new Date().toISOString(),
    });

    const versions = SqliteRepository.getNoteVersions(note.id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].note_id).toBe(note.id);
  });

  it('performs SQLite-backed full-text and field search', () => {
    const event = StorageManager.addEvent({ title: 'Research', event_date: '2026-09-01' });
    StorageManager.addNote({
      event_id: event.id,
      title: 'Quantum Computing Notes',
      body: 'Entanglement and superposition mechanics in qubits',
      created_at: new Date().toISOString(),
    });
    StorageManager.addNote({
      event_id: event.id,
      title: 'Grocery List',
      body: 'Apples, oranges, and tea',
      created_at: new Date().toISOString(),
    });

    const results = StorageManager.searchNotes({ query: 'superposition' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Quantum Computing Notes');
  });

  it('supports raw .sqlite export and import roundtrip', async () => {
    const event = StorageManager.addEvent({ title: 'Export Test', event_date: '2026-09-01' });
    StorageManager.addNote({
      event_id: event.id,
      title: 'Persisted Note',
      body: 'This note must survive binary export and import',
      created_at: new Date().toISOString(),
    });

    const binary = StorageManager.exportSqliteBinary();
    expect(binary.byteLength).toBeGreaterThan(0);

    // Clear DB
    await SqliteEngine.resetForTesting();
    StorageManager.refreshCaches();
    expect(StorageManager.getNotes()).toHaveLength(0);

    // Import binary
    await StorageManager.importSqliteBinary(binary);
    StorageManager.refreshCaches();
    expect(StorageManager.getNotes()).toHaveLength(1);
    expect(StorageManager.getNotes()[0].title).toBe('Persisted Note');
  });

  it('enforces Private Offline Mode network blocking', () => {
    PrivacyManager.updateSettings({ privateOfflineMode: true });
    expect(() => {
      PrivacyManager.assertNetworkAllowed('Testing network call');
    }).toThrow(/Private Offline Mode is enabled/);

    PrivacyManager.updateSettings({ privateOfflineMode: false });
    expect(() => {
      PrivacyManager.assertNetworkAllowed('Testing network call');
    }).not.toThrow();
  });
});
