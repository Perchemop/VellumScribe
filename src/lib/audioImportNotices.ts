/**
 * Copy shown when recording/imported audio could not be fully prepared for
 * on-device transcription. This keeps the 30-minute resample cap and the
 * downsample size limit visible instead of failing silently.
 */
export interface AudioImportOutcome {
  /** True when resampling capped the audio to {@link MAX_RESAMPLE_SECONDS}. */
  wasTruncated?: boolean;
  /** True when the file exceeded the downsample limit and the source was kept. */
  wasConversionSkipped?: boolean;
  /** Why conversion was skipped: size limit, or too long to decode safely. */
  conversionSkipReason?: 'too_large' | 'too_long' | 'unprobeable';
}

/**
 * Return a single, user-facing warning for an import outcome, or `null` when
 * the audio was fully prepared. Truncation takes precedence because it is the
 * more common and more impactful limitation.
 */
export function describeAudioImport(result: AudioImportOutcome): string | null {
  if (result.wasTruncated) {
    return 'Audio was longer than 30 minutes — only the first 30 minutes were used for transcription.';
  }
  if (result.wasConversionSkipped) {
    if (result.conversionSkipReason === 'too_long') {
      return 'Recording is longer than 10 minutes, so it was kept in its original format instead of being converted on-device (converting very long audio can run out of memory). Offline Whisper may need the shorter, converted form — use cloud AI or the resumable session for long recordings.';
    }
    return 'Large file: downsampling to 16 kHz was skipped, so offline Whisper may not work. Cloud AI or live dictation can still be used.';
  }
  return null;
}
