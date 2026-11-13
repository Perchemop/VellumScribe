import { describe, expect, it } from 'vitest';
import {
  RELEASES_PAGE_URL,
  TOKEN_NOT_MEASURED,
  describeMetricsSection,
  describeTokenMetrics,
  resolveReleaseHref,
  resolveUpdateAction,
  summariseUsageByVersion,
  usageVersionLabel,
  type UpdateCheckResultLike,
  type UsageEventLike,
} from './releaseNotes';

/**
 * The Release Notes popup is the suite-standard surface for version history,
 * per-release usage, token metrics and the update action. Its helpers decide
 * what the user is told, so the honest-copy branches and the safe-link
 * fallback are behaviour that must be pinned.
 */

function checkResult(overrides: Partial<UpdateCheckResultLike> = {}): UpdateCheckResultLike {
  return {
    isUpToDate: true,
    latestVersion: '3.1.1',
    releaseDate: '2026-10-03',
    hasUpdate: false,
    checked: true,
    message: 'You are running the latest version.',
    release: null,
    ...overrides,
  };
}

describe('summariseUsageByVersion — per-release usage grouping', () => {
  it('returns an empty array when there are no events', () => {
    expect(summariseUsageByVersion([])).toEqual([]);
  });

  it('groups a single version and counts each event name', () => {
    const groups = summariseUsageByVersion([
      { event: 'note_created', version: '3.1.1', timestamp: '2026-10-03T10:00:00Z' },
      { event: 'note_created', version: '3.1.1', timestamp: '2026-10-03T10:05:00Z' },
      { event: 'audio_transcribed', version: '3.1.1', timestamp: '2026-10-03T10:06:00Z' },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].version).toBe('3.1.1');
    expect(groups[0].total).toBe(3);
    expect(groups[0].byEvent).toEqual({ note_created: 2, audio_transcribed: 1 });
  });

  it('buckets blank and missing versions as "unknown", last, never as a version', () => {
    const groups = summariseUsageByVersion([
      { event: 'app_start', version: '   ', timestamp: '2026-10-03T11:00:00Z' },
      { event: 'app_start', timestamp: '2026-10-03T11:01:00Z' },
      { event: 'note_created', version: '3.0.0', timestamp: '2026-09-04T09:00:00Z' },
    ]);

    expect(groups.map((g) => g.version)).toEqual(['3.0.0', 'unknown']);
    const unknown = groups[1];
    expect(unknown.total).toBe(2);
    expect(usageVersionLabel(unknown.version)).toBe('Version not recorded');
    expect(usageVersionLabel(unknown.version)).not.toContain('unknown');
    expect(usageVersionLabel('3.0.0')).toBe('Version 3.0.0');
  });

  it('orders versions newest-first by latest timestamp, then by version number', () => {
    const groups = summariseUsageByVersion([
      // No timestamps at all → falls back to a numeric-aware version ordering.
      { event: 'app_start', version: '2.9.0' },
      { event: 'app_start', version: '3.1.1' },
      { event: 'app_start', version: '2.10.0' },
    ]);

    expect(groups.map((g) => g.version)).toEqual(['3.1.1', '2.10.0', '2.9.0']);
  });

  it('prefers the most recent timestamp over the version number', () => {
    const groups = summariseUsageByVersion([
      { event: 'app_start', version: '2.0.0', timestamp: '2026-11-01T00:00:00Z' },
      { event: 'app_start', version: '3.1.1', timestamp: '2026-01-01T00:00:00Z' },
    ]);

    expect(groups.map((g) => g.version)).toEqual(['2.0.0', '3.1.1']);
  });

  it('is defensive about blank event names and hostile input', () => {
    // Runtime storage can be malformed despite the compile-time shape.
    const malformed = [
      { event: '', version: '3.1.1' },
      { event: '  ', version: '3.1.1' },
      { event: undefined, version: '3.1.1' },
      { event: null, version: '3.1.1', timestamp: 42 },
    ] as unknown as UsageEventLike[];

    const groups = summariseUsageByVersion(malformed);

    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(4);
    expect(groups[0].byEvent).toEqual({ unknown: 4 });
  });
});

describe('resolveReleaseHref — safe update links', () => {
  it('keeps a well-formed https link, already in normalised form', () => {
    expect(resolveReleaseHref('https://example.com/app.apk')).toBe('https://example.com/app.apk');
  });

  it('always falls back to the canonical releases page for unsafe links', () => {
    for (const candidate of [
      'http://example.com/app.apk',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      '/relative/path.apk',
      '//evil.example', // protocol-relative — no scheme, so not an absolute https URL
      'https:', // scheme only, no authority
      'https://', // empty authority
      'not a url',
      '',
      '   ',
      undefined,
      null,
    ]) {
      expect(resolveReleaseHref(candidate)).toBe(RELEASES_PAGE_URL);
    }
  });

  it('returns the normalised href, never the raw candidate', () => {
    // The popup opens the normalised URL, so that exact string is what must be
    // pinned. Each case below parses as https but differs from its `href`.
    expect(resolveReleaseHref('HTTPS://EXAMPLE.COM/')).toBe('https://example.com/');
    expect(resolveReleaseHref('https://example.com')).toBe('https://example.com/');
    expect(resolveReleaseHref('https:\\/\\/evil')).toBe('https://evil/');
    expect(resolveReleaseHref('https://evil.example:443/x')).toBe('https://evil.example/x');
    expect(resolveReleaseHref('  https://example.com/app.apk  ')).toBe(
      'https://example.com/app.apk'
    );
  });

  it('preserves the fragment of a valid https link', () => {
    expect(resolveReleaseHref('https://example.com/app.apk#release-3-2-0')).toBe(
      'https://example.com/app.apk#release-3-2-0'
    );
  });

  it('accepts a username-bearing https link as-is (documented decision)', () => {
    // `https://user@host/` is still an https URL and cannot execute script, so
    // the safe-link rule accepts it unchanged. Rejecting or stripping the
    // userinfo would add behaviour with no security gain; the URL API keeps it
    // in `href`, and this test records that choice deliberately.
    expect(resolveReleaseHref('https://user@evil.example/')).toBe('https://user@evil.example/');
  });

  it('the canonical releases page is itself a safe https link', () => {
    expect(RELEASES_PAGE_URL.startsWith('https://')).toBe(true);
    expect(resolveReleaseHref(RELEASES_PAGE_URL)).toBe(RELEASES_PAGE_URL);
  });

  it('trims surrounding whitespace around a safe link', () => {
    expect(resolveReleaseHref('  https://example.com/app.apk  ')).toBe(
      'https://example.com/app.apk'
    );
  });
});

describe('resolveUpdateAction — footer state machine', () => {
  it('reports checking while no result is available', () => {
    expect(resolveUpdateAction(null)).toEqual({ kind: 'checking' });
    expect(resolveUpdateAction(undefined)).toEqual({ kind: 'checking' });
  });

  it('reports an error when the check threw', () => {
    expect(resolveUpdateAction(null, 'Network unreachable')).toEqual({
      kind: 'error',
      message: 'Network unreachable',
    });
    // A blank error message is not an error — it stays in the checking state.
    expect(resolveUpdateAction(null, '   ')).toEqual({ kind: 'checking' });
  });

  it('reports unavailable when the check could not run', () => {
    expect(
      resolveUpdateAction(
        checkResult({ checked: false, message: 'No update manifest is configured for this build.' })
      )
    ).toEqual({
      kind: 'unavailable',
      message: 'No update manifest is configured for this build.',
    });
  });

  it('reports up-to-date when the check ran and found nothing newer', () => {
    expect(resolveUpdateAction(checkResult())).toEqual({ kind: 'up-to-date', version: '3.1.1' });
  });

  it('reports an available update with a safe https link', () => {
    expect(
      resolveUpdateAction(
        checkResult({
          hasUpdate: true,
          isUpToDate: false,
          latestVersion: '3.2.0',
          releaseDate: '2026-11-01',
          release: { apkDownloadUrl: 'https://example.com/vellum-3.2.0.apk' },
        })
      )
    ).toEqual({
      kind: 'available',
      version: '3.2.0',
      releaseDate: '2026-11-01',
      href: 'https://example.com/vellum-3.2.0.apk',
    });
  });

  it('falls back to the releases page when the offered link is unsafe', () => {
    const action = resolveUpdateAction(
      checkResult({
        hasUpdate: true,
        isUpToDate: false,
        latestVersion: '3.2.0',
        release: { apkDownloadUrl: 'javascript:alert(1)' },
      })
    );

    expect(action).toEqual({
      kind: 'available',
      version: '3.2.0',
      releaseDate: '2026-10-03',
      href: RELEASES_PAGE_URL,
    });
  });
});

describe('describeMetricsSection — honest opt-in copy', () => {
  it('says recording is off, local-only and opt-in when metrics are disabled', () => {
    const copy = describeMetricsSection(false, []);
    expect(copy.kind).toBe('disabled');
    expect(copy.showsCounts).toBe(false);
    expect(copy.body.toLowerCase()).toContain('opt-in');
    expect(copy.body.toLowerCase()).toContain('this device');
  });

  it('does not present zeros as usage data when metrics are disabled', () => {
    // Even if stale groups are passed in, a disabled section must not show counts.
    const copy = describeMetricsSection(false, [
      { version: '3.1.1', total: 0, byEvent: { note_created: 0 } },
    ]);
    expect(copy.showsCounts).toBe(false);
    expect(copy.kind).toBe('disabled');
  });

  it('says there is no recorded usage yet when enabled but empty', () => {
    const copy = describeMetricsSection(true, []);
    expect(copy.kind).toBe('empty');
    expect(copy.showsCounts).toBe(false);
    expect(copy.heading).toBe('No usage recorded yet');
  });

  it('permits real counters only when there is real usage', () => {
    const copy = describeMetricsSection(true, [
      { version: '3.1.1', total: 3, byEvent: { note_created: 3 } },
    ]);
    expect(copy.kind).toBe('recorded');
    expect(copy.showsCounts).toBe(true);
  });
});

describe('describeTokenMetrics — figures or the honest "not recorded" wording', () => {
  const formatter = (value: number) => value.toLocaleString('en-US');

  it('withholds figures and says so plainly when the ledger is unavailable', () => {
    const view = describeTokenMetrics(
      false,
      { total_tokens_since_start: 10, release_tokens: 5, release_version: '3.1.1' },
      formatter
    );
    expect(view.available).toBe(false);
    expect(view.total).toBeNull();
    expect(view.release).toBeNull();
    expect(view.releaseVersion).toBeNull();
    expect(view.note).toBe('Token figures are not recorded in this build.');
  });

  it('withholds figures when the ledger object is missing', () => {
    const view = describeTokenMetrics(true, null, formatter);
    expect(view.available).toBe(false);
    expect(view.total).toBeNull();
  });

  it('formats the ledger figures when they are recorded', () => {
    const view = describeTokenMetrics(
      true,
      { total_tokens_since_start: 20948427, release_tokens: 1234, release_version: '3.1.1' },
      formatter
    );
    expect(view.available).toBe(true);
    expect(view.total).toBe('20,948,427');
    expect(view.release).toBe('1,234');
    expect(view.releaseVersion).toBe('3.1.1');
  });

  it('renders an unmeasured zero as "not measured", never as a measurement', () => {
    const view = describeTokenMetrics(
      true,
      { total_tokens_since_start: 0, release_tokens: 0, release_version: '3.1.1' },
      formatter
    );
    expect(view.available).toBe(true);
    expect(view.total).toBe(TOKEN_NOT_MEASURED);
    expect(view.release).toBe(TOKEN_NOT_MEASURED);
    expect(view.total).not.toBe('0');
  });
});
