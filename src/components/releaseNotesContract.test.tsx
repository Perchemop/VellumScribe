// @vitest-environment jsdom
//
// This file parses the server-rendered markup (see `visibleText`) so that
// assertions read *visible text* instead of raw HTML. Parsing needs a DOM,
// while the repository's default vitest environment is `node`
// (vitest.config.ts), so the override is scoped to this file. The suite runs on
// Node 22 in CI, which is the runtime the jsdom environment requires.

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReleaseNotesModal } from './ReleaseNotesModal';
import { VersionFootprint } from './VersionFootprint';

/**
 * Contract tests for the suite-standard Release Notes popup and the bottom-right
 * version footprint (guide §12.1).
 *
 * Rendered to static markup with react-dom/server, then parsed so the copy can
 * be asserted as visible text. The metrics and token-ledger modules are mocked
 * so the popup's copy is pinned deterministically, including the honest
 * "usage recording is off" branch when metrics are disabled.
 */

vi.mock('../lib/metricsManager', () => ({
  MetricsManager: {
    isEnabled: () => false,
    getMetrics: () => ({
      enabled: false,
      counts: {},
      totalEvents: 0,
      version: '3.2.0',
      events: [],
    }),
  },
}));

vi.mock('../lib/tokenLedger', () => ({
  TOKEN_LEDGER: {
    total_tokens_since_start: 20948427,
    release_tokens: 1234,
    release_version: '3.2.0',
  },
  TOKEN_LEDGER_AVAILABLE: true,
  formatTokens: (value: number) => value.toLocaleString('en-US'),
}));

/**
 * The visible text of a server-rendered markup string.
 *
 * `react-dom/server` separates adjacent text nodes with an empty HTML comment,
 * so asserting on the raw markup string would need markup surgery — the
 * incomplete-sanitisation pattern CodeQL rejects
 * (`js/incomplete-multi-character-sanitization`). Parsing instead of sanitising
 * removes the problem at its source: comments are simply not part of
 * `textContent`, and no string is ever rewritten.
 */
function visibleText(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  return doc.body.textContent ?? '';
}

describe('ReleaseNotesModal — release-notes contract', () => {
  const markup = renderToStaticMarkup(<ReleaseNotesModal onClose={() => {}} />);
  const text = visibleText(markup);

  it('names the popup as a modal dialog and shows the current version + build', () => {
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="release-notes-title"');
    expect(markup).toContain('id="release-notes-title"');
    expect(text).toContain('VellumScribe v3.2.1');
    expect(text).toContain('Build #32000');
  });

  it('renders the version history with at least one historical version', () => {
    expect(text).toContain('Version history');
    expect(text).toContain('Version 3.2.1');
    expect(text).toContain('Version 3.1.1');
    expect(text).toContain('Version 3.0.0');
    expect(text).toContain('Active build');
  });

  it('renders the token-metrics section with the ledger figures', () => {
    expect(text).toContain('Token metrics');
    expect(text).toContain('Total tokens since start');
    expect(text).toContain('20,948,427');
    expect(text).toContain('v3.2.1');
  });

  it('renders the update button label for the idle footer', () => {
    expect(text).toContain('Check for updates');
  });

  it('is honest about disabled metrics: says recording is off, never shows zeros', () => {
    expect(text).toContain('Usage recording is off');
    expect(text).toContain('opt-in');
    expect(text).toContain('this device');
    // The disabled section must not render usage counters (e.g. "3 events").
    expect(text).not.toMatch(/\d+ events?/);
  });

  it('offers a close control with an accessible name', () => {
    expect(markup).toContain('aria-label="Close"');
  });
});

describe('VersionFootprint — bottom-right version affordance', () => {
  const markup = renderToStaticMarkup(<VersionFootprint onOpen={() => {}} />);
  const text = visibleText(markup);

  it('renders an accessible name containing the running version', () => {
    expect(markup).toContain('aria-label="Version 3.2.1 — release notes"');
    expect(text).toContain('v3.2.1');
  });

  it('is a real button that stays fixed at the bottom-right and out of the flow', () => {
    expect(markup).toContain('type="button"');
    expect(markup).toContain('fixed');
    expect(markup).toContain('bottom-16');
    expect(markup).toContain('md:bottom-2');
    expect(markup).toContain('right-2');
  });

  it('keeps a ≥ 24×24 CSS px hit area despite the subtle 10px chrome', () => {
    // The visible chip is ~14px tall (10px type, `leading-none`, `py-0.5`), so
    // the padding alone is below the WCAG 2.5.8 minimum. `after:-inset-2` grows
    // the tappable box by 8px per side. If a future edit drops the padding or the
    // expansion, this test must fail — the target cannot silently regress to 14px.
    expect(markup).toContain('after:absolute');
    expect(markup).toContain('after:-inset-2');
    // react-dom/server HTML-escapes the quotes (`after:content-[&#x27;&#x27;]`),
    // so assert on the class prefix that still marks the pseudo-element as
    // content-bearing — without it the expanded `after` box would not render.
    expect(markup).toContain('after:content-[');
    expect(markup).toContain('py-0.5');
  });

  it('sits clear of both the create-note FAB arc and the mobile bottom nav', () => {
    // bottom-16 = 64px: the visible chip spans 64–78px, clearing the FAB's
    // bottom edge (bottom-20 = 80px), while the expanded hit area's 56px bottom
    // edge lands exactly on the nav's top edge (min-h-14 = 56px).
    expect(markup).toContain('bottom-16');
    expect(markup).not.toContain('bottom-[4.5rem]');
  });
});
