import { describe, expect, it } from 'vitest';
import { describePreviousRun } from './previousRunNotice';

/**
 * The launch banner is the only channel by which a hard process death (which
 * JS cannot catch) reaches the user, so its classification is behaviour that
 * must be pinned: report an unfinished trail, stay silent on clean ones.
 */
describe('describePreviousRun — interrupted transcription reporting', () => {
  const line = (stamp: string, stage: string, detail = '') =>
    `${stamp} | ${stage}${detail ? ` | ${detail}` : ''}`;

  it('reports an unfinished trail and names the last stage', () => {
    const trail = [
      line('20261028-061500.100', 'JOB_START', 'job=job_7_1 model=whisper-tiny'),
      line('20261028-061500.200', 'AUDIO_FILE_OK', 'size=598016'),
      line('20261028-061500.400', 'MODEL_OK', 'model=whisper-tiny'),
      line('20261028-061500.900', 'ENGINE_INIT_OK'),
      line('20261028-061501.100', 'SEGMENTED', 'chunks=1'),
      line('20261028-061501.300', 'INFER_BEGIN', 'chunk=1/1 samples=292000 threads=4'),
    ].join('\n');

    const report = describePreviousRun(trail);
    expect(report).not.toBeNull();
    expect(report?.endedUnexpectedly).toBe(true);
    expect(report?.lastStage).toBe('INFER_BEGIN');
    expect(report?.summary).toContain('INFER_BEGIN');
    expect(report?.summary).toMatch(/did not lose data/i);
    expect(report?.trail).toBe(trail);
  });

  it('stays silent when the trail ended cleanly', () => {
    const clean = [
      line('20261028-061500.100', 'JOB_START'),
      line('20261028-061501.300', 'INFER_BEGIN', 'chunk=1/1'),
      line('20261028-061503.000', 'INFER_END', 'chunk=1 chars=42'),
      line('20261028-061503.200', 'JOB_COMPLETED', 'chars=42'),
    ].join('\n');
    expect(describePreviousRun(clean)).toBeNull();
  });

  it('stays silent for terminal failure stages (the app reported them itself)', () => {
    for (const marker of [
      'FAIL_AUDIO_MISSING',
      'FAIL_MODEL_MISSING',
      'FAIL_ENGINE_INIT',
      'FAIL_RUNTIME_ERROR',
      'JOB_COMPLETED_NO_SPEECH',
      'OFFLINE_AI_CANCELLED',
    ]) {
      const trail = [
        line('20261028-061500.100', 'JOB_START'),
        line('20261028-061501.000', marker),
      ].join('\n');
      expect(describePreviousRun(trail)).toBeNull();
    }
  });

  it('returns null for absent, empty or whitespace-only trails', () => {
    expect(describePreviousRun(null)).toBeNull();
    expect(describePreviousRun(undefined)).toBeNull();
    expect(describePreviousRun('')).toBeNull();
    expect(describePreviousRun('   \n  \n')).toBeNull();
  });

  it('survives a malformed line without throwing and still reports it', () => {
    const report = describePreviousRun('garbage-without-pipes');
    expect(report?.endedUnexpectedly).toBe(true);
    expect(report?.lastStage).toBe('garbage-without-pipes');
  });
});
