import { TranscriptionRepository } from '../repositories/TranscriptionRepository';
import { RecordingRepository } from '../repositories/RecordingRepository';
import { SqliteEngine } from '../lib/sqlite/sqliteEngine';
import { SqliteRepository } from '../lib/sqlite/sqliteRepository';
import {
  TranscriptionEntity,
  TranscriptionSegmentRecord,
  TranscriptionSpeakerRecord,
} from '../types';
import { AppLogger } from '../lib/logger';

export interface FullTranscriptView {
  transcription: TranscriptionEntity;
  segments: TranscriptionSegmentRecord[];
  speakers: TranscriptionSpeakerRecord[];
  formattedDuration: string;
}

export class TranscriptService {
  /**
   * Get complete transcript view with segments and speakers
   */
  public static getFullTranscriptForRecording(recordingId: number): FullTranscriptView | null {
    const transcription = TranscriptionRepository.getLatestForRecording(recordingId);
    if (!transcription) return null;

    const segments = TranscriptionRepository.getSegments(transcription.id);
    const speakers = TranscriptionRepository.getSpeakers(transcription.id);

    const recording = RecordingRepository.getById(recordingId);
    const durationSec = recording?.duration_seconds || 0;
    const formattedDuration = this.formatTimeMs(durationSec * 1000);

    return {
      transcription,
      segments,
      speakers,
      formattedDuration,
    };
  }

  /**
   * Get active segment at current playback millisecond
   */
  public static getActiveSegment(
    segments: TranscriptionSegmentRecord[],
    currentPlaybackMs: number
  ): TranscriptionSegmentRecord | null {
    if (!segments || segments.length === 0) return null;
    return (
      segments.find((s) => currentPlaybackMs >= s.start_ms && currentPlaybackMs < s.end_ms) || null
    );
  }

  /**
   * Rename a speaker across a transcription
   */
  public static renameSpeaker(transcriptionId: number, speakerId: string, customName: string): void {
    TranscriptionRepository.updateSpeakerName(transcriptionId, speakerId, customName.trim());
  }

  /**
   * Index transcript text into SQLite FTS (Full-Text Search)
   */
  public static indexTranscriptInFts(noteId: number, transcriptText: string): void {
    if (!noteId || !transcriptText) return;
    try {
      const note = SqliteRepository.getNoteById(noteId);
      if (note && !note.is_locked) {
        const chkText = (note.checklist_items || []).map((c) => c.text).join(' ');
        const tagText = (note.tags || []).join(' ');
        const ocrRows = SqliteEngine.query<{ ocr_text: string }>(
          'SELECT ocr_text FROM ocr_scans WHERE note_id = ?',
          [noteId]
        );
        const allOcr = ocrRows.map((o) => o.ocr_text).join(' ');
        const combinedBody = `${note.body || ''}\n\n[Transcript]:\n${transcriptText}`;

        SqliteEngine.run('DELETE FROM notes_fts WHERE note_id = ?;', [noteId]);
        SqliteEngine.run(
          'INSERT INTO notes_fts (note_id, title, body, checklist_text, ocr_text, tags) VALUES (?, ?, ?, ?, ?, ?);',
          [noteId, note.title || '', combinedBody, chkText, allOcr, tagText]
        );
      }
    } catch (err) {
      AppLogger.warn('TranscriptService', 'Could not refresh FTS index for transcript', err);
    }
  }

  /**
   * Format milliseconds into mm:ss or hh:mm:ss
   */
  public static formatTimeMs(ms: number): string {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
