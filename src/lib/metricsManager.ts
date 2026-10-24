import { AppLogger } from './logger';
import { PrivacyManager } from './privacyManager';

/**
 * Privacy-preserving, opt-in usage metrics for release health.
 *
 * Design principles (guide §23 launch requirements):
 *  - Opt-in only: `metricsEnabled` defaults to `false`; nothing is recorded
 *    until the user explicitly enables metrics in Settings.
 *  - Local-only by default: events are stored in browser storage. Nothing is
 *    transmitted to any server unless the user explicitly chooses to export.
 *  - No user content, no PII, no device identifiers: only anonymous counters,
 *    timestamps, and the app version.
 *
 * Metrics are intended to help the maintainer understand release health (e.g.
 * crash rates, feature adoption) without ever seeing what users write.
 */
export type MetricEvent =
  | 'app_start'
  | 'note_created'
  | 'note_updated'
  | 'note_deleted'
  | 'audio_transcribed'
  | 'ocr_scanned'
  | 'backup_created'
  | 'backup_restored'
  | 'error_caught';

export interface MetricEntry {
  event: MetricEvent;
  timestamp: string; // ISO-8601
  version: string;
  // Optional non-identifying context. Never include note content, filenames,
  // user input, email/name, or device/network identifiers here.
  context?: Record<string, string | number | boolean>;
}

export interface MetricsSnapshot {
  enabled: boolean;
  counts: Record<MetricEvent, number>;
  totalEvents: number;
  firstSeen?: string;
  lastSeen?: string;
  version: string;
  events: MetricEntry[];
}

// Kept in sync with package.json version.
const APP_VERSION = '3.1.0';

const METRICS_STORAGE_KEY = 'vellumscribe_metrics_v1';
const MAX_STORED_EVENTS = 200;

export class MetricsManager {
  private static events: MetricEntry[] = [];
  private static initialized = false;

  private static ensureInitialized(): void {
    if (this.initialized) return;
    try {
      const raw = localStorage.getItem(METRICS_STORAGE_KEY);
      if (raw) {
        this.events = JSON.parse(raw) as MetricEntry[];
      }
    } catch (e) {
      AppLogger.warn('MetricsManager', 'Failed to load metrics, starting fresh', e);
      this.events = [];
    }
    this.initialized = true;
  }

  private static persist(): void {
    try {
      localStorage.setItem(
        METRICS_STORAGE_KEY,
        JSON.stringify(this.events.slice(-MAX_STORED_EVENTS))
      );
    } catch (e) {
      AppLogger.warn('MetricsManager', 'Failed to persist metrics', e);
    }
  }

  /** Metrics are only active when the user has explicitly opted in. */
  public static isEnabled(): boolean {
    return PrivacyManager.isMetricsEnabled();
  }

  /**
   * Record a single privacy-safe metric event. No-op when metrics are disabled.
   */
  public static record(
    event: MetricEvent,
    context?: Record<string, string | number | boolean>
  ): void {
    if (!this.isEnabled()) return;
    this.ensureInitialized();
    this.events.push({
      event,
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      context,
    });
    this.persist();
  }

  /** Aggregate snapshot of all recorded metrics. */
  public static getMetrics(): MetricsSnapshot {
    this.ensureInitialized();
    const counts: Record<MetricEvent, number> = {
      app_start: 0,
      note_created: 0,
      note_updated: 0,
      note_deleted: 0,
      audio_transcribed: 0,
      ocr_scanned: 0,
      backup_created: 0,
      backup_restored: 0,
      error_caught: 0,
    };
    for (const e of this.events) {
      counts[e.event] = (counts[e.event] ?? 0) + 1;
    }
    return {
      enabled: this.isEnabled(),
      counts,
      totalEvents: this.events.length,
      firstSeen: this.events[0]?.timestamp,
      lastSeen: this.events[this.events.length - 1]?.timestamp,
      version: APP_VERSION,
      events: [...this.events],
    };
  }

  /** Opt the user into metrics collection. */
  public static enable(): void {
    PrivacyManager.enableMetrics();
  }

  /** Opt the user out of metrics collection. */
  public static disable(): void {
    PrivacyManager.disableMetrics();
  }

  /** Clear all recorded metrics from memory and storage. */
  public static reset(): void {
    this.events = [];
    try {
      localStorage.removeItem(METRICS_STORAGE_KEY);
    } catch (e) {
      AppLogger.warn('MetricsManager', 'Failed to clear metrics storage', e);
    }
  }
}
