import { SqliteEngine } from '../lib/sqlite/sqliteEngine';
import {
  TranscriptionEntity,
  TranscriptionSegmentRecord,
  TranscriptionSpeakerRecord,
  TranscriptionDurableStatus,
  OfflineAiErrorCode,
} from '../types';
import { AppLogger } from '../lib/logger';

export class TranscriptionRepository {
  /**
   * Get transcription record by ID
   */
  public static getById(id: number): TranscriptionEntity | null {
    const rows = SqliteEngine.query<any>(
      `SELECT id, recording_id, engine, engine_version, model_id, model_checksum, language,
              status, text, created_at, started_at, completed_at, error_code, error_message
       FROM transcriptions WHERE id = ?`,
      [id]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapTranscription(rows[0]);
  }

  /**
   * Get latest transcription for a recording
   */
  public static getLatestForRecording(recordingId: number): TranscriptionEntity | null {
    const rows = SqliteEngine.query<any>(
      `SELECT id, recording_id, engine, engine_version, model_id, model_checksum, language,
              status, text, created_at, started_at, completed_at, error_code, error_message
       FROM transcriptions WHERE recording_id = ? ORDER BY id DESC LIMIT 1`,
      [recordingId]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapTranscription(rows[0]);
  }

  /**
   * Find existing transcription by recording, engine, and model (idempotency)
   */
  public static findByRecordingAndModel(
    recordingId: number,
    modelId: string
  ): TranscriptionEntity | null {
    const rows = SqliteEngine.query<any>(
      `SELECT id, recording_id, engine, engine_version, model_id, model_checksum, language,
              status, text, created_at, started_at, completed_at, error_code, error_message
       FROM transcriptions WHERE recording_id = ? AND model_id = ? ORDER BY id DESC LIMIT 1`,
      [recordingId, modelId]
    );
    if (!rows || rows.length === 0) return null;
    return this.mapTranscription(rows[0]);
  }

  /**
   * Find incomplete transcription jobs for crash recovery
   */
  public static getIncompleteJobs(): TranscriptionEntity[] {
    const rows = SqliteEngine.query<any>(
      `SELECT id, recording_id, engine, engine_version, model_id, model_checksum, language,
              status, text, created_at, started_at, completed_at, error_code, error_message
       FROM transcriptions 
       WHERE status IN ('QUEUED', 'PREPARING', 'PREPROCESSING', 'TRANSCRIBING', 'MERGING', 'VALIDATING')
       ORDER BY created_at ASC`
    );
    return rows.map((r) => this.mapTranscription(r));
  }

  /**
   * Create or update a transcription job entity
   */
  public static saveTranscription(job: Partial<TranscriptionEntity> & { recording_id: number; model_id: string }): TranscriptionEntity {
    let id = job.id;
    const now = Date.now();
    const createdAt = job.created_at || now;
    const engine = job.engine || 'whisper.cpp';
    const status = job.status || 'QUEUED';

    if (id && id > 0) {
      SqliteEngine.run(
        `UPDATE transcriptions 
         SET engine = ?, engine_version = ?, model_id = ?, model_checksum = ?, language = ?,
             status = ?, text = ?, started_at = ?, completed_at = ?, error_code = ?, error_message = ?
         WHERE id = ?`,
        [
          engine,
          job.engine_version || '1.0.0',
          job.model_id,
          job.model_checksum || null,
          job.language || null,
          status,
          job.text || null,
          job.started_at || null,
          job.completed_at || null,
          job.error_code || null,
          job.error_message || null,
          id,
        ]
      );
    } else {
      SqliteEngine.run(
        `INSERT INTO transcriptions 
         (recording_id, engine, engine_version, model_id, model_checksum, language, status, text, created_at, started_at, completed_at, error_code, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job.recording_id,
          engine,
          job.engine_version || '1.0.0',
          job.model_id,
          job.model_checksum || null,
          job.language || null,
          status,
          job.text || null,
          createdAt,
          job.started_at || null,
          job.completed_at || null,
          job.error_code || null,
          job.error_message || null,
        ]
      );
      id = SqliteEngine.getLastInsertId();
    }

    return {
      id,
      recording_id: job.recording_id,
      engine,
      engine_version: job.engine_version || '1.0.0',
      model_id: job.model_id,
      model_checksum: job.model_checksum,
      language: job.language,
      status,
      text: job.text,
      created_at: createdAt,
      started_at: job.started_at,
      completed_at: job.completed_at,
      error_code: job.error_code,
      error_message: job.error_message,
    };
  }

  /**
   * Update status of transcription
   */
  public static updateStatus(
    id: number,
    status: TranscriptionDurableStatus,
    errorCode?: OfflineAiErrorCode | string,
    errorMessage?: string
  ): void {
    const completedAt = status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' ? Date.now() : null;
    SqliteEngine.run(
      `UPDATE transcriptions 
       SET status = ?, error_code = ?, error_message = ?, completed_at = COALESCE(completed_at, ?) 
       WHERE id = ?`,
      [status, errorCode || null, errorMessage || null, completedAt, id]
    );
  }

  /**
   * Durably commit completed transcription with segments and speakers in a single transaction
   */
  public static commitCompletedTranscription(
    transcriptionId: number,
    fullText: string,
    segments: Array<{ sequence: number; start_ms: number; end_ms: number; speaker_id?: string | null; text: string; confidence?: number | null }>,
    speakers: Array<{ speaker_id: string; label: string; name?: string | null }> = []
  ): void {
    const now = Date.now();
    SqliteEngine.transaction(() => {
      // 1. Update transcription record
      SqliteEngine.run(
        `UPDATE transcriptions 
         SET text = ?, status = 'COMPLETED', completed_at = ?, error_code = NULL, error_message = NULL
         WHERE id = ?`,
        [fullText, now, transcriptionId]
      );

      // 2. Clear any stale segments for this transcription
      SqliteEngine.run('DELETE FROM transcription_segments WHERE transcription_id = ?', [transcriptionId]);

      // 3. Insert validated segments
      for (const seg of segments) {
        SqliteEngine.run(
          `INSERT INTO transcription_segments (transcription_id, sequence, start_ms, end_ms, speaker_id, text, confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            transcriptionId,
            seg.sequence,
            seg.start_ms,
            seg.end_ms,
            seg.speaker_id || null,
            seg.text,
            seg.confidence !== undefined && seg.confidence !== null ? seg.confidence : null,
          ]
        );
      }

      // 4. Insert speakers if any
      SqliteEngine.run('DELETE FROM transcription_speakers WHERE transcription_id = ?', [transcriptionId]);
      for (const spk of speakers) {
        SqliteEngine.run(
          `INSERT INTO transcription_speakers (transcription_id, speaker_id, label, name)
           VALUES (?, ?, ?, ?)`,
          [transcriptionId, spk.speaker_id, spk.label, spk.name || null]
        );
      }
    });

    AppLogger.info('TranscriptionRepository', `Committed transcription #${transcriptionId} with ${segments.length} segments`);
  }

  /**
   * Get all segments for a transcription
   */
  public static getSegments(transcriptionId: number): TranscriptionSegmentRecord[] {
    const rows = SqliteEngine.query<any>(
      `SELECT id, transcription_id, sequence, start_ms, end_ms, speaker_id, text, confidence
       FROM transcription_segments 
       WHERE transcription_id = ? 
       ORDER BY sequence ASC`,
      [transcriptionId]
    );
    return rows.map((r) => ({
      id: r.id,
      transcription_id: r.transcription_id,
      sequence: r.sequence,
      start_ms: r.start_ms,
      end_ms: r.end_ms,
      speaker_id: r.speaker_id || null,
      text: r.text,
      confidence: r.confidence !== null && r.confidence !== undefined ? r.confidence : null,
    }));
  }

  /**
   * Get all speakers for a transcription
   */
  public static getSpeakers(transcriptionId: number): TranscriptionSpeakerRecord[] {
    const rows = SqliteEngine.query<any>(
      `SELECT id, transcription_id, speaker_id, label, name
       FROM transcription_speakers 
       WHERE transcription_id = ? 
       ORDER BY id ASC`,
      [transcriptionId]
    );
    return rows.map((r) => ({
      id: r.id,
      transcription_id: r.transcription_id,
      speaker_id: r.speaker_id,
      label: r.label,
      name: r.name || null,
    }));
  }

  /**
   * Rename a speaker label or assign custom name
   */
  public static updateSpeakerName(transcriptionId: number, speakerId: string, name: string): void {
    SqliteEngine.run(
      `UPDATE transcription_speakers SET name = ? WHERE transcription_id = ? AND speaker_id = ?`,
      [name, transcriptionId, speakerId]
    );
  }

  /**
   * Delete a transcription and its cascading segments/speakers
   */
  public static delete(id: number): void {
    SqliteEngine.transaction(() => {
      SqliteEngine.run('DELETE FROM transcription_jobs WHERE transcription_id = ?', [id]);
      SqliteEngine.run('DELETE FROM transcription_segments WHERE transcription_id = ?', [id]);
      SqliteEngine.run('DELETE FROM transcription_speakers WHERE transcription_id = ?', [id]);
      SqliteEngine.run('DELETE FROM transcriptions WHERE id = ?', [id]);
    });
  }

  /**
   * Durable checkpointing in transcription_jobs table
   */
  public static saveJobCheckpoint(job: {
    id: string;
    transcription_id: number;
    recording_id: number;
    model_id: string;
    status: string;
    current_chunk?: number;
    total_chunks?: number;
    last_error?: string | null;
  }): void {
    const now = Date.now();
    SqliteEngine.run(
      `INSERT INTO transcription_jobs (id, transcription_id, recording_id, model_id, status, current_chunk, total_chunks, last_error, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         current_chunk = excluded.current_chunk,
         total_chunks = excluded.total_chunks,
         last_error = excluded.last_error,
         updated_at = excluded.updated_at`,
      [
        job.id,
        job.transcription_id,
        job.recording_id,
        job.model_id,
        job.status,
        job.current_chunk || 0,
        job.total_chunks || 0,
        job.last_error || null,
        now,
      ]
    );
  }

  public static getJob(jobId: string): any | null {
    const rows = SqliteEngine.query<any>(
      `SELECT id, transcription_id, recording_id, model_id, status, current_chunk, total_chunks, last_error, updated_at
       FROM transcription_jobs WHERE id = ?`,
      [jobId]
    );
    return rows && rows.length > 0 ? rows[0] : null;
  }

  private static mapTranscription(r: any): TranscriptionEntity {
    return {
      id: r.id,
      recording_id: r.recording_id,
      engine: r.engine,
      engine_version: r.engine_version || undefined,
      model_id: r.model_id,
      model_checksum: r.model_checksum || undefined,
      language: r.language || undefined,
      status: r.status as TranscriptionDurableStatus,
      text: r.text || undefined,
      created_at: r.created_at,
      started_at: r.started_at || undefined,
      completed_at: r.completed_at || undefined,
      error_code: r.error_code || undefined,
      error_message: r.error_message || undefined,
    };
  }
}
