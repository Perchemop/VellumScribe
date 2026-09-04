import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportSafetyPipeline } from './importSafety';
import { SqliteEngine } from './sqlite/sqliteEngine';
import { StorageManager } from './storage';

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  await SqliteEngine.resetForTesting();
  await StorageManager.initialize();
});

describe('ImportSafetyPipeline', () => {
  it('rejects completely invalid JSON syntax', () => {
    const res = ImportSafetyPipeline.validateAndPreview('not a json string {{{');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Invalid JSON syntax');
  });

  it('rejects non-object root', () => {
    const res = ImportSafetyPipeline.validateAndPreview('"just a string"');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Root must be an object');
  });

  it('rejects incompatible future schema versions (e.g., v4.0)', () => {
    const futurePayload = JSON.stringify({
      version: '4.2',
      schema: {
        notes: [{ id: 1, title: 'Future Note', body: 'Future content' }],
      },
    });
    const res = ImportSafetyPipeline.validateAndPreview(futurePayload);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Incompatible future schema version');
  });

  it('rejects payloads missing notes collection', () => {
    const emptyPayload = JSON.stringify({
      version: '3.0',
      schema: {
        events: [],
      },
    });
    const res = ImportSafetyPipeline.validateAndPreview(emptyPayload);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Missing notes collection');
  });

  it('accurately parses and previews a valid backup payload', () => {
    const validPayload = JSON.stringify({
      version: '3.0',
      format: 'open_workspace_json_v3',
      schema: {
        events: [{ id: 1, title: 'Work', event_date: '2026-09-01' }],
        notes: [
          { id: 101, event_id: 1, title: 'First Note', body: 'Body 1', created_at: '2026-09-01T00:00:00Z' },
          { id: 102, event_id: 1, title: 'Second Note', body: 'Body 2', created_at: '2026-09-01T00:00:00Z' },
        ],
        recordings: [{ id: 1, note_id: 101, audio_url: 'data:audio/wav;base64,123', duration_ms: 2000, created_at: '2026-09-01T00:00:00Z' }],
        ocr_scans: [],
      },
    });

    const preview = ImportSafetyPipeline.validateAndPreview(validPayload);
    expect(preview.valid).toBe(true);
    expect(preview.counts.notes).toBe(2);
    expect(preview.counts.events).toBe(1);
    expect(preview.counts.recordings).toBe(1);
    expect(preview.counts.ocrScans).toBe(0);
  });

  it('creates a safety backup snapshot and executes transactional import with integrity check', async () => {
    // Add an initial note
    StorageManager.addNote({
      event_id: 1,
      title: 'Initial Note Before Import',
      body: 'Pre-existing content',
      created_at: new Date().toISOString(),
    });
    expect(StorageManager.getNotes().length).toBeGreaterThanOrEqual(1);

    const backupPayload = JSON.stringify({
      version: '3.0',
      schema: {
        events: [{ id: 99, title: 'Imported Category', event_date: '2026-09-03' }],
        notes: [
          { id: 501, event_id: 99, title: 'Restored Note A', body: 'Restored content A', created_at: '2026-09-03T00:00:00Z' },
          { id: 502, event_id: 99, title: 'Restored Note B', body: 'Restored content B', created_at: '2026-09-03T00:00:00Z' },
        ],
      },
    });

    const result = await ImportSafetyPipeline.executeImport(backupPayload);
    expect(result.success).toBe(true);
    expect(result.counts?.notes).toBe(2);

    // Verify notes are stored in SQLite and integrity check passed
    const notes = StorageManager.getNotes();
    const importedNote = notes.find((n) => n.id === 501);
    expect(importedNote).toBeDefined();
    expect(importedNote?.title).toBe('Restored Note A');

    // Verify safety backup was captured
    const safetyBackup = ImportSafetyPipeline.getLastSafetyBackup();
    expect(safetyBackup).not.toBeNull();
    expect(safetyBackup).toContain('Initial Note Before Import');
  });
});
