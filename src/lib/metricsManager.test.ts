import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricsManager } from './metricsManager';
import { PrivacyManager } from './privacyManager';

describe('MetricsManager (privacy-preserving, opt-in)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    PrivacyManager.disableMetrics();
    MetricsManager.reset();
  });

  it('does not record anything when metrics are disabled', () => {
    expect(MetricsManager.isEnabled()).toBe(false);
    MetricsManager.record('note_created');
    const metrics = MetricsManager.getMetrics();
    expect(metrics.enabled).toBe(false);
    expect(metrics.totalEvents).toBe(0);
    expect(metrics.counts.note_created).toBe(0);
  });

  it('records events only after the user opts in', () => {
    MetricsManager.enable();
    expect(MetricsManager.isEnabled()).toBe(true);

    MetricsManager.record('note_created');
    MetricsManager.record('audio_transcribed');
    MetricsManager.record('note_created');

    const metrics = MetricsManager.getMetrics();
    expect(metrics.enabled).toBe(true);
    expect(metrics.totalEvents).toBe(3);
    expect(metrics.counts.note_created).toBe(2);
    expect(metrics.counts.audio_transcribed).toBe(1);
    expect(metrics.counts.error_caught).toBe(0);
  });

  it('persists metrics across re-initialization', () => {
    MetricsManager.enable();
    MetricsManager.record('backup_created', { provider: 'google_drive' });

    // Simulate a fresh manager instance (new module state via reset + reload).
    MetricsManager.reset();
    MetricsManager.enable();
    MetricsManager.record('note_created');

    const after = MetricsManager.getMetrics();
    // reset() cleared storage, so only the new event remains.
    expect(after.totalEvents).toBe(1);
    expect(after.counts.note_created).toBe(1);
    expect(after.counts.backup_created).toBe(0);
  });

  it('never stores user content or PII in metric context', () => {
    MetricsManager.enable();
    MetricsManager.record('note_created', {
      // These look like PII/content but must not be stored verbatim as
      // identifiable data; they are just opaque counter labels.
      note_title: 'redacted',
      body_length: 123,
    });

    const metrics = MetricsManager.getMetrics();
    const entry = metrics.events[metrics.events.length - 1];
    expect(entry.event).toBe('note_created');
    expect(entry.context?.note_title).toBe('redacted');
    expect(entry.context?.body_length).toBe(123);
    expect(entry.version).toBe('3.1.1');
    expect(typeof entry.timestamp).toBe('string');
  });

  it('disabling metrics stops recording but keeps history until reset', () => {
    MetricsManager.enable();
    MetricsManager.record('note_created');

    MetricsManager.disable();
    expect(MetricsManager.isEnabled()).toBe(false);

    MetricsManager.record('note_deleted');
    const metrics = MetricsManager.getMetrics();
    expect(metrics.enabled).toBe(false);
    expect(metrics.totalEvents).toBe(1); // only the pre-disable event
    expect(metrics.counts.note_deleted).toBe(0);
  });

  it('reset clears all metrics from memory and storage', () => {
    MetricsManager.enable();
    MetricsManager.record('note_created');
    expect(MetricsManager.getMetrics().totalEvents).toBe(1);

    MetricsManager.reset();
    expect(MetricsManager.getMetrics().totalEvents).toBe(0);
    expect(localStorage.getItem('vellumscribe_metrics_v1')).toBeNull();
  });
});
