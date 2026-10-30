import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandMarkGlyph } from './BrandMarkGlyph';

/**
 * Contract tests for the canonical brand mark component (design audit m-1).
 *
 * BrandMarkGlyph is the single source of the mark's geometry in the app
 * bundle; the canonical file is assets/brand/vellumscribe-mark.svg (whose
 * contents are copied verbatim into public/favicon.svg by
 * scripts/generate-brand-assets.mjs). The component is rendered to static
 * markup with react-dom/server — no DOM needed in the node test environment.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Canonical geometry, identical in the component and the canonical SVG. */
const V_ARMS_D = 'M4.5 4.5L12 19.5L19.5 4.5';
const STEM_D = 'M12 19.5V11';
const DOT_R = '1.75';

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('BrandMarkGlyph — canonical brand mark (design audit m-1)', () => {
  it('renders the canonical geometry exactly once on a 24x24 viewBox', () => {
    const markup = renderToStaticMarkup(<BrandMarkGlyph />);

    expect(
      countOccurrences(markup, `d="${V_ARMS_D}"`),
      'the V-arms path must be emitted exactly once'
    ).toBe(1);
    expect(
      countOccurrences(markup, `d="${STEM_D}"`),
      'the stem path must be emitted exactly once'
    ).toBe(1);
    expect(countOccurrences(markup, `r="${DOT_R}"`), 'the dot radius must be emitted once').toBe(1);
    expect(
      countOccurrences(markup, 'viewBox="0 0 24 24"'),
      'the mark must use the canonical 24x24 viewBox'
    ).toBe(1);
  });

  it('is decorative without a title prop: aria-hidden and no title element', () => {
    const markup = renderToStaticMarkup(<BrandMarkGlyph />);

    expect(markup, 'a decorative mark must set aria-hidden="true"').toContain('aria-hidden="true"');
    expect(markup, 'a decorative mark must not render a title element').not.toContain('<title');
    expect(markup, 'a decorative mark must not claim role="img"').not.toContain('role="img"');
  });

  it('is labelled with a title prop: role="img" and a named title, never aria-hidden', () => {
    const markup = renderToStaticMarkup(<BrandMarkGlyph title="VellumScribe" />);

    expect(markup, 'a labelled mark must set role="img"').toContain('role="img"');
    expect(markup, 'a labelled mark must expose its name via a title element').toContain(
      '<title>VellumScribe</title>'
    );
    expect(markup, 'a labelled mark must not be aria-hidden').not.toContain('aria-hidden');
  });

  it('inherits colour via currentColor with no hard-coded ink fill', () => {
    const markup = renderToStaticMarkup(<BrandMarkGlyph />);

    expect(markup, 'the strokes must use currentColor').toContain('stroke="currentColor"');
    expect(markup, 'the dot fill must use currentColor').toContain('fill="currentColor"');
    expect(markup, 'the mark must not hard-code the light ink #ffffff').not.toContain('#ffffff');
    expect(markup, 'the mark must not hard-code the dark tile ink #09090b').not.toContain(
      '#09090b'
    );
  });

  it('the size prop sets both width and height attributes', () => {
    const sized = renderToStaticMarkup(<BrandMarkGlyph size={42} />);
    expect(sized, 'the size prop must drive the width attribute').toContain('width="42"');
    expect(sized, 'the size prop must drive the height attribute').toContain('height="42"');

    const defaulted = renderToStaticMarkup(<BrandMarkGlyph />);
    expect(defaulted).toContain('width="18"');
    expect(defaulted).toContain('height="18"');
  });

  it('matches the <g> path data in assets/brand/vellumscribe-mark.svg (m-1 drift guard)', () => {
    const canonical = readFileSync(
      path.join(REPO_ROOT, 'assets', 'brand', 'vellumscribe-mark.svg'),
      'utf8'
    );
    const groupStart = canonical.indexOf('<g transform=');
    const groupEnd = canonical.indexOf('</g>', groupStart);
    expect(
      groupStart > -1 && groupEnd > groupStart,
      'the canonical brand SVG must contain its scaled <g> geometry group'
    ).toBe(true);
    const group = canonical.slice(groupStart, groupEnd);

    const markup = renderToStaticMarkup(<BrandMarkGlyph />);
    for (const d of [V_ARMS_D, STEM_D]) {
      expect(group, `the canonical SVG <g> must define d="${d}"`).toContain(`d="${d}"`);
      expect(markup, `BrandMarkGlyph must define the same d="${d}"`).toContain(`d="${d}"`);
    }
  });
});
