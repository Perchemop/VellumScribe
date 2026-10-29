import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricsManager } from './metricsManager';
import { PrivacyManager } from './privacyManager';
import { AiSettingsManager } from './aiSettings';
import { GeminiApiService } from './geminiService';
import { VersionControlManager } from './versionControl';
import { SqliteRepository } from './sqlite/sqliteRepository';
import { CURRENT_APP_VERSION } from './appUpdateManager';
import { StorageManager } from './storage';
import type { NoteRecord } from '../types';

/**
 * Capability coverage for the three capabilities the 2026-10-29 E2E audit
 * classified "partial — missing tests" (CAP-007, CAP-020, CAP-023). Each test
 * names its capability ID; together they move those rows to "met".
 */
describe('CAP-023 — metrics are local-only and exportable (no server dispatch)', () => {
  beforeEach(() => {
    localStorage.clear();
    MetricsManager.reset();
  });

  it('the metrics snapshot carries the app version and no note content', () => {
    MetricsManager.enable();
    MetricsManager.record('note_created');
    MetricsManager.record('note_created');
    MetricsManager.record('audio_transcribed');

    const snapshot = MetricsManager.getMetrics();

    // Version must be kept in sync with the app version (drift fixed 2026-10-29).
    expect(snapshot.version).toBe(CURRENT_APP_VERSION);
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.counts['note_created']).toBe(2);
    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toMatch(/"body"|transcript_text|ocr_text/);
  });

  it('never performs network I/O — the snapshot is the entire "dispatch"', async () => {
    MetricsManager.enable();
    MetricsManager.record('note_created');

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const json = JSON.stringify(MetricsManager.getMetrics());

    expect(json).toContain('"enabled":true');
    expect(json).toContain('"note_created"');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('CAP-007 — version history snapshots persist and prune', () => {
  beforeAll(async () => {
    const { SqliteEngine } = await import('./sqlite/sqliteEngine');
    await SqliteEngine.resetForTesting();
    await StorageManager.initialize();
  });

  function makeNote(title: string, body: string): NoteRecord {
    return SqliteRepository.saveNote({
      title,
      body,
      event_id: null,
    } as never) as unknown as NoteRecord;
  }

  it('saveVersionSnapshot stores a restorable revision with a checksum', async () => {
    const note = makeNote('Revisions note', 'first draft');

    await VersionControlManager.saveVersionSnapshot(note, 'Local User', 'manual checkpoint');

    const versions = VersionControlManager.getVersionsForNote(note.id);
    expect(versions.length).toBe(1);
    expect(versions[0].body).toBe('first draft');
    expect(versions[0].checksum).toMatch(/^[0-9a-f]{16}$/);
  });

  it('pruneOldVersions keeps only the newest N revisions per note', async () => {
    const note = makeNote('Prune note', 'draft');
    for (let i = 1; i <= 7; i++) {
      const edited = { ...note, body: `draft ${i}`, version: i };
      await VersionControlManager.saveVersionSnapshot(edited as NoteRecord);
    }

    const pruned = VersionControlManager.pruneOldVersions(5);

    expect(VersionControlManager.getVersionsForNote(note.id).length).toBeLessThanOrEqual(5);
    expect(pruned).toBeGreaterThanOrEqual(2);
  });
});

describe('CAP-020 — BYOK gate: no key means offline, never a silent network call', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const summaryOptions = {
    format: 'executive' as const,
    eventTitle: 'Gate test',
    currentBody: 'We agreed to ship on Friday. Alice will send the contract.',
    transcripts: ['We agreed to ship on Friday. Alice will send the contract.'],
  };

  it('with no key and private offline mode, the summary is synthesised locally', async () => {
    AiSettingsManager.setGoogleApiKey('');
    PrivacyManager.updateSettings({ privateOfflineMode: true });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await GeminiApiService.generateSummary(summaryOptions);

    expect(result.keyUsed).toBe('local_offline');
    expect(result.source).toBe('offline_rule_engine');
    expect(result.summary).toContain('Executive Summary');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('with a key but no network consent, no request leaves the device', async () => {
    // Force the cloud provider so the BYOK gate itself is exercised.
    AiSettingsManager.updateSettings?.({ primaryLlmProvider: 'google' });
    AiSettingsManager.setGoogleApiKey('AIza-test-only');
    PrivacyManager.updateSettings({ privateOfflineMode: false });
    PrivacyManager.revokeCloudAiConsent();

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await GeminiApiService.generateSummary(summaryOptions).catch((e) => {
      // An honest thrown error is acceptable; a network call is not.
      return { summary: `error: ${String(e?.message || e)}`, keyUsed: undefined, source: 'error' };
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(String(result.summary)).not.toContain('undefined');
    fetchSpy.mockRestore();
  });
});
