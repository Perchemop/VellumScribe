import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineAiManager } from './OfflineAiManager';
import { TranscriptService } from './TranscriptService';
import { TranscriptionEntity, TranscriptionSegmentRecord } from '../types';

/**
 * Research notes (human-gated, approved 2026-10-28, DECISIONS.md D-426):
 *  - "voice-to-structured-note": transcript in → structured draft out,
 *    raw preserved, honest empty-state.
 *  - "transcript-audio-linking": playback time → active segment mapping.
 * Both are acceptance criteria, not implementation details: these tests are
 * the named proof required by the PR checklist (§M.3/K.14).
 */

function makeTranscription(overrides: Partial<TranscriptionEntity> = {}): TranscriptionEntity {
  return {
    id: 42,
    recording_id: 7,
    engine: 'whisper.cpp',
    engine_version: '1.5.4',
    model_id: 'whisper-tiny',
    language: 'en',
    status: 'COMPLETED',
    text: '',
    created_at: Date.now(),
    ...overrides,
  } as TranscriptionEntity;
}

function makeSegment(
  id: number,
  startMs: number,
  endMs: number,
  text: string
): TranscriptionSegmentRecord {
  return {
    id,
    transcription_id: 42,
    sequence: id,
    start_ms: startMs,
    end_ms: endMs,
    speaker_id: null,
    text,
  } as TranscriptionSegmentRecord;
}

describe('voice-to-structured-note — generateStructuredAiExtraction (D-426 approved)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('turns a transcript into a structured draft with summary and detected action items', () => {
    const t = makeTranscription({
      text:
        'We reviewed the quarterly numbers and revenue is up. ' +
        'Alice will send the contract by Friday. ' +
        'We agreed to move the launch to March. ' +
        'There is a risk that the vendor misses the deadline. ' +
        'Please review the pricing page before the call.',
    });

    const out = OfflineAiManager.getInstance().generateStructuredAiExtraction(t, 5);

    expect(typeof out.summary).toBe('string');
    expect(out.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(out.actionItems)).toBe(true);
    expect(Array.isArray(out.decisions)).toBe(true);
    expect(Array.isArray(out.risks)).toBe(true);
    // Keyword-based action detection must surface the imperative sentences.
    const flat = out.actionItems.map((a) => (typeof a === 'string' ? a : a.text)).join(' ');
    expect(flat.toLowerCase()).toContain('send');
  });

  it('preserves the raw transcript — the extraction is read-only (raw-preserved criterion)', () => {
    const text = 'Alice will send the contract. We agreed to launch in March.';
    const t = makeTranscription({ text });

    OfflineAiManager.getInstance().generateStructuredAiExtraction(t, 2);

    // The input entity is untouched: the raw transcript remains exactly as it
    // was, in the object and (by purity) in the repository behind it.
    expect(t.text).toBe(text);
    expect(t.status).toBe('COMPLETED');
  });

  it('degrades honestly on empty input instead of inventing content', () => {
    const out = OfflineAiManager.getInstance().generateStructuredAiExtraction(
      makeTranscription({ text: '' }),
      0
    );
    expect(out.summary).toMatch(/no transcript text/i);
    expect(out.actionItems).toEqual([]);
  });

  it('never references a segment index beyond the provided segment count', () => {
    const t = makeTranscription({
      text:
        'We agreed to the plan. Bob will prepare the report. ' +
        'The risk is the timeline. Contact Alice about pricing. ' +
        'Follow up next week. Schedule the review.',
    });
    const out = OfflineAiManager.getInstance().generateStructuredAiExtraction(t, 3);
    for (const item of [...out.decisions, ...out.risks, ...out.entities]) {
      for (const seg of item.sourceSegments) {
        expect(seg).toBeLessThanOrEqual(3);
        expect(seg).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('transcript-audio-linking — getActiveSegment seek mapping (D-426 approved)', () => {
  const segments: TranscriptionSegmentRecord[] = [
    makeSegment(1, 0, 2000, 'first'),
    makeSegment(2, 2000, 4000, 'second'),
    makeSegment(3, 4000, 6000, 'third'),
  ];

  it('maps playback time to the segment covering it', () => {
    expect(TranscriptService.getActiveSegment(segments, 0)?.id).toBe(1);
    expect(TranscriptService.getActiveSegment(segments, 1999)?.id).toBe(1);
    expect(TranscriptService.getActiveSegment(segments, 2000)?.id).toBe(2);
    expect(TranscriptService.getActiveSegment(segments, 5999)?.id).toBe(3);
  });

  it('returns null outside the covered range and for empty input (honest degradation)', () => {
    expect(TranscriptService.getActiveSegment(segments, 6000)).toBeNull();
    expect(TranscriptService.getActiveSegment(segments, 10000)).toBeNull();
    expect(TranscriptService.getActiveSegment([], 1000)).toBeNull();
  });

  it('maps seconds-based seek requests back onto segment starts without drift', () => {
    // The viewer seeks to seg.start_ms / 1000; the player reports back
    // currentTime in seconds. Round-tripping a segment start must land on the
    // same segment, never the previous one.
    for (const seg of segments) {
      const seekSec = seg.start_ms / 1000;
      const active = TranscriptService.getActiveSegment(segments, seekSec * 1000);
      expect(active?.id).toBe(seg.id);
    }
  });
});
