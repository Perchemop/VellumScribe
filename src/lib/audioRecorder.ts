import { AudioRecordingManager, RecordedAudioResult, AudioRecordingOptions } from '../services/AudioRecordingManager';

/**
 * Consolidated AudioRecorderManager
 * Aliases the authoritative AudioRecordingManager pipeline to guarantee unified,
 * non-blocking audio capture, resampling, and storage.
 */
export class AudioRecorderManager extends AudioRecordingManager {
  // Inherits all robust methods from AudioRecordingManager
}

export { AudioRecordingManager };
export type { RecordedAudioResult, AudioRecordingOptions };
