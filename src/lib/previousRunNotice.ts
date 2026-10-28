/**
 * Turns the native transcription breadcrumb trail (written on-device before
 * every processing stage) into a human answer to "what happened last time?".
 *
 * The trail is cleared when a job starts and terminated by a terminal marker
 * when it ends. A trail that exists but has no terminal marker means the
 * process died mid-job — which cannot be caught in JS, so this is the only way
 * the user ever sees it. Pure functions only: the caller supplies the text, so
 * this is testable headlessly (no native bridge, no display).
 */

const TERMINAL_MARKERS = [
  'JOB_COMPLETED',
  'JOB_COMPLETED_NO_SPEECH',
  'FAIL_AUDIO_MISSING',
  'FAIL_MODEL_MISSING',
  'FAIL_ENGINE_INIT',
  'FAIL_RUNTIME_ERROR',
  'OFFLINE_AI_CANCELLED',
];

export interface PreviousRunReport {
  /** True when the trail shows a job that never reached a terminal stage. */
  endedUnexpectedly: boolean;
  /** The last stage recorded before the trail stopped. */
  lastStage: string | null;
  /** The whole trail, for the copy button. */
  trail: string;
  /** One plain-language sentence a non-developer can act on. */
  summary: string;
}

/**
 * Classify a breadcrumb trail. Returns null when there is nothing to report
 * (no trail at all, or a cleanly finished one).
 */
export function describePreviousRun(rawTrail: string | null | undefined): PreviousRunReport | null {
  const trail = (rawTrail || '').trim();
  if (!trail) return null;

  const lines = trail
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const lastLine = lines[lines.length - 1];
  const finished = TERMINAL_MARKERS.some((m) => lastLine.includes(m));
  if (finished) return null;

  // trail lines look like: "20261028-061500.123 | STAGE | detail"
  const stageParts = lastLine.split('|').map((p) => p.trim());
  const lastStage = stageParts[1] || lastLine;

  return {
    endedUnexpectedly: true,
    lastStage,
    trail,
    summary:
      `The previous session stopped during offline transcription, at the stage "${lastStage}". ` +
      `The recording and everything already transcribed are kept — the app did not lose data. ` +
      `Copy the details below into your report so the exact step is known.`,
  };
}
