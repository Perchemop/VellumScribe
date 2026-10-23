import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteEngine } from '../sqlite/sqliteEngine';
import { StorageManager } from '../storage';
import { NotebookLMAdapter } from './adapter';

describe('NotebookLMAdapter', () => {
  beforeEach(async () => {
    localStorage.clear();
    await SqliteEngine.resetForTesting();
    await StorageManager.initialize();
  });

  it('computes consistent SHA-256 hash for content', async () => {
    const text1 = 'Meeting notes regarding project roadmap';
    const hash1 = await NotebookLMAdapter.computeHash(text1);
    const hash2 = await NotebookLMAdapter.computeHash(text1);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });

  it('formats notes into NotebookLM markdown format', () => {
    const note = {
      id: 42,
      title: 'Sprint Planning Architecture',
      content: 'We decided on offline-first on-device speech transcription.',
      tags: ['ai', 'offline', 'architecture'],
      created_at: 1700000000000,
      updated_at: 1700000500000,
    };

    const formatted = NotebookLMAdapter.formatNoteForNotebookLM(note);
    expect(formatted).toContain('# Sprint Planning Architecture');
    expect(formatted).toContain('**Source System:** VellumScribe On-Device Knowledge Base');
    expect(formatted).toContain('**Entity Type:** Note');
    expect(formatted).toContain('**Document ID:** 42');
    expect(formatted).toContain('#ai #offline #architecture');
    expect(formatted).toContain('We decided on offline-first on-device speech transcription.');
  });

  it('formats transcripts with timecodes and speaker labels for NotebookLM', () => {
    const transcriptData = {
      noteTitle: 'Executive Sync',
      transcriptionId: 10,
      recordingId: 5,
      engine: 'whisper.cpp',
      modelId: 'whisper-base',
      durationMs: 75000,
      segments: [
        {
          sequence: 1,
          start_ms: 0,
          end_ms: 15000,
          speaker_id: 'spk_1',
          text: 'Good morning everyone.',
        },
        {
          sequence: 2,
          start_ms: 15000,
          end_ms: 45000,
          speaker_id: 'spk_2',
          text: 'Here are the Q3 metrics.',
        },
      ],
      speakers: [
        { speaker_id: 'spk_1', label: 'Speaker 1', name: 'Alice Chen' },
        { speaker_id: 'spk_2', label: 'Speaker 2', name: 'Bob Smith' },
      ],
      summary: 'Discussed Q3 metrics and timeline for launch.',
      actionItems: [{ text: 'Review final slides before Friday', priority: 'high' }],
    };

    const formatted = NotebookLMAdapter.formatTranscriptForNotebookLM(transcriptData);
    expect(formatted).toContain('# Transcript: Executive Sync');
    expect(formatted).toContain('**Provenance:** 100% On-Device Whisper Execution');
    expect(formatted).toContain('## Executive Summary');
    expect(formatted).toContain('## Extracted Action Items');
    expect(formatted).toContain('[HIGH]');
    expect(formatted).toContain('**[00:00] Alice Chen:** Good morning everyone.');
    expect(formatted).toContain('**[00:15] Bob Smith:** Here are the Q3 metrics.');
  });

  it('manages NotebookLM connections and source sync tracking in SQLite', () => {
    const conn = NotebookLMAdapter.saveConnection({
      name: 'Project Research Notebook',
      backend: 'notebooklm-py',
      notebook_id: 'nb_12345',
      notebook_url: 'https://notebooklm.google.com/notebook/nb_12345',
    });

    expect(conn.id).toBeGreaterThan(0);
    expect(conn.name).toBe('Project Research Notebook');

    const list = NotebookLMAdapter.listConnections();
    expect(list.length).toBe(1);
    expect(list[0].notebook_id).toBe('nb_12345');

    // Record source sync
    NotebookLMAdapter.recordSourceSync({
      connectionId: conn.id,
      entityType: 'note',
      entityId: 42,
      contentHash: 'mock_hash_123',
      remoteSourceId: 'src_remote_987',
      status: 'synced',
    });

    const sources = SqliteEngine.query<{ id: number; sync_status?: string; content_hash?: string }>(
      'SELECT * FROM notebooklm_sources WHERE connection_id = ?',
      [conn.id]
    );
    expect(sources.length).toBe(1);
    expect(sources[0].sync_status).toBe('synced');
    expect(sources[0].content_hash).toBe('mock_hash_123');
  });
});
