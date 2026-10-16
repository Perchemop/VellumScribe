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
    return 'Large file: downsampling to 16 kHz was skipped, so offline Whisper may not work. Cloud AI or live dictation can still be used.';
  }
  return null;
}
