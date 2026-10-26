import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineAiManager } from './OfflineAiManager';
import { TranscriptionRepository } from '../repositories/TranscriptionRepository';
import { getDatabaseAdapter } from '../lib/sqlite/databaseAdapter';

describe('OfflineAiManager crash recovery (R-3.6)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    const { SqliteEngine: SE } = await import('../lib/sqlite/sqliteEngine');
    await SE.resetForTesting();
    const { StorageManager: SM } = await import('../lib/storage');
    await SM.initialize();
  });

  async function insertIncompleteJob(
    overrides: Partial<{
      id: number;
      recording_id: number;
      engine: string;
      engine_version?: string;
      model_id: string;
      status: 'QUEUED' | 'PROCESSING';
      language?: string;
    }> = {}
  ): Promise<number> {
    const db = getDatabaseAdapter();
    const id = overrides.id ?? Date.now();
    await db.run(
      `INSERT INTO transcriptions (
        id, recording_id, engine, engine_version, model_id, model_checksum, language,
        status, text, created_at, started_at, completed_at, error_code, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        overrides.recording_id ?? 1,
        overrides.engine ?? 'whisper.cpp',
        overrides.engine_version ?? '1.0.0',
        overrides.model_id ?? 'whisper-tiny',
        null,
        overrides.language ?? 'auto',
        overrides.status ?? 'PROCESSING',
        null,
        Date.now(),
        Date.now(),
        null,
        null,
        null,
      ]
    );
    return id;
  }

  async function insertCheckpoint(
    jobId: number | string,
    chunkIndex: number,
    transcriptText: string,
    status: 'completed' | 'pending' = 'completed'
  ): Promise<void> {
    const db = getDatabaseAdapter();
    await db.run(
      `INSERT INTO transcription_chunk_checkpoints (
        job_id, chunk_index, start_ms, end_ms, status, transcript_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(jobId), chunkIndex, 0, 1000, status, transcriptText, Date.now(), Date.now()]
    );
  }

  it('recovers a partial transcript from completed chunk checkpoints after a crash', async () => {
    const jobId = await insertIncompleteJob({
      recording_id: 7,
      status: 'PROCESSING',
    });
    await insertCheckpoint(jobId, 0, 'Meeting kickoff at 10am');
    await insertCheckpoint(jobId, 1, 'SQLite migration discussed');

    const recovered = await OfflineAiManager.getInstance().recoverInterruptedJobs();
    expect(recovered).toBeGreaterThanOrEqual(1);

    const transcription = TranscriptionRepository.getById(jobId);
    expect(transcription).toBeDefined();
    expect(transcription?.status).toBe('COMPLETED');
    expect(transcription?.text).toContain('Meeting kickoff at 10am');
    expect(transcription?.text).toContain('SQLite migration discussed');
  });

  it('skips jobs that have only pending (incomplete) checkpoints', async () => {
    const jobId = await insertIncompleteJob({ status: 'PROCESSING' });
    await insertCheckpoint(jobId, 0, 'partial', 'pending');

    const recovered = await OfflineAiManager.getInstance().recoverInterruptedJobs();
    expect(recovered).toBeGreaterThanOrEqual(1);

    const transcription = TranscriptionRepository.getById(jobId);
    expect(transcription).toBeDefined();
    expect(transcription?.status).toBe('FAILED');
    expect(transcription?.error_code).toBe('OFFLINE_AI_UNKNOWN');
  });

  it('marks jobs without any checkpoints as FAILED with a clear message', async () => {
    const jobId = await insertIncompleteJob({ status: 'QUEUED' });

    const recovered = await OfflineAiManager.getInstance().recoverInterruptedJobs();
    expect(recovered).toBeGreaterThanOrEqual(1);

    const transcription = TranscriptionRepository.getById(jobId);
    expect(transcription).toBeDefined();
    expect(transcription?.status).toBe('FAILED');
    expect(transcription?.error_message).toContain('Interrupted by system process termination');
  });

  it('returns 0 when there are no incomplete jobs', async () => {
    const recovered = await OfflineAiManager.getInstance().recoverInterruptedJobs();
    expect(recovered).toBe(0);
  });

  // Off-device (web) there is no native trail API; recovery must work as before.
  it('recovery still succeeds when the native breadcrumb API is absent', async () => {
    const recovered = await OfflineAiManager.getInstance().recoverInterruptedJobs();
    expect(recovered).toBe(0);
    void OfflineAiManager.getInstance().readNativeCrashTrail();
  });
});
