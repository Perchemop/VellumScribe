import { TranscriptionRepository } from '../repositories/TranscriptionRepository';
import { RecordingRepository } from '../repositories/RecordingRepository';
import { SearchIndexQueue } from '../lib/SearchIndexQueue';
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
      SearchIndexQueue.enqueue(noteId);
    } catch (err) {
      AppLogger.warn('TranscriptService', 'Could not enqueue note for FTS indexing', err);
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
