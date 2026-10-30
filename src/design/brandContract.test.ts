import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for the 2026-10-28 design-audit fixes (polish slice).
 *
 * These are static contracts over the repository's own files, so they run in
 * the plain node environment: no DOM, no network, no filesystem writes.
 *
 *  - m-1: the brand mark geometry has a single source. The web icons are
 *    generated copies — per scripts/generate-brand-assets.mjs: "Web icons are
 *    copies of the canonical SVGs, not hand-maintained duplicates: the mark
 *    geometry lives only in assets/brand/ (design audit m-1)" — and
 *    index.html must reference /favicon.svg for the first-paint splash
 *    instead of inlining the path data.
 *  - m-4: the theme is applied before first paint. The inline bootstrap in
 *    index.html must stay in lockstep with src/context/AppContext.tsx: the
 *    same localStorage key, the same `.dark` class on <html>, and the same
 *    light/dark chrome colours (#fafaf9 / #121215).
 *  - M-3: no UI source may open a blocking browser confirm dialog.
 */

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Canonical SVG -> generated web copy, as written by scripts/generate-brand-assets.mjs. */
const CANONICAL_TO_GENERATED: Array<[string, string]> = [
  ['assets/brand/vellumscribe-mark.svg', 'public/favicon.svg'],
  ['assets/brand/vellumscribe-mark-maskable.svg', 'public/maskable.svg'],
];

/** The key AppContext persists dark mode under and the bootstrap must read. */
const DARK_MODE_KEY = 'omninote_dark_mode_v1';

function readRepoFile(...segments: string[]): string {
  return readFileSync(path.join(REPO_ROOT, ...segments), 'utf8');
}

function listFilesWithExtension(dir: string, extension: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      found.push(...listFilesWithExtension(absolute, extension));
    } else if (entry.endsWith(extension)) {
      found.push(absolute);
    }
  }
  return found;
}

describe('m-1 — the brand mark geometry has a single source', () => {
  it('public web icons are byte-identical copies of the canonical assets/brand SVGs', () => {
    // scripts/generate-brand-assets.mjs: "Web icons are copies of the canonical
    // SVGs, not hand-maintained duplicates: the mark geometry lives only in
    // assets/brand/ (design audit m-1)." A hand-edited public/ copy drifts
    // silently, so the bytes must match exactly.
    for (const [canonical, generated] of CANONICAL_TO_GENERATED) {
      const canonicalBytes = readFileSync(path.join(REPO_ROOT, canonical));
      const generatedBytes = readFileSync(path.join(REPO_ROOT, generated));
      expect(
        generatedBytes.equals(canonicalBytes),
        `${generated} must be a byte-identical copy of ${canonical} — regenerate with \`npm run assets:brand\` instead of editing it`
      ).toBe(true);
    }
  });

  it('index.html no longer inlines the mark geometry (splash loads /favicon.svg)', () => {
    const indexHtml = readRepoFile('index.html');

    expect(
      indexHtml.includes('M4.5 4.5L12 19.5L19.5 4.5'),
      'index.html must not inline the V-arms path data (m-1: the geometry lives only in assets/brand)'
    ).toBe(false);

    // Match the loader's markup occurrence: the id also appears as a CSS
    // selector in the first-paint <style> block, so anchor on the element.
    const loaderStart = indexHtml.indexOf('<div id="vellumscribe-init-loader"');
    expect(
      loaderStart,
      'index.html must keep the #vellumscribe-init-loader first-paint splash'
    ).toBeGreaterThan(-1);
    const loaderBlock = indexHtml.slice(loaderStart, loaderStart + 300);
    expect(
      loaderBlock.includes('/favicon.svg'),
      'the first-paint splash must reference /favicon.svg (the generated copy of the canonical mark)'
    ).toBe(true);

    expect(
      indexHtml.includes('href="/favicon.svg"'),
      'index.html must keep the /favicon.svg icon link'
    ).toBe(true);
  });
});

describe('m-4 — the theme is applied before first paint and stays in lockstep', () => {
  it('the index.html bootstrap reads the same localStorage key AppContext persists to', () => {
    const indexHtml = readRepoFile('index.html');
    const keyMatch = /localStorage\.getItem\('([^']+)'\)/.exec(indexHtml);

    expect(
      keyMatch,
      'the inline theme bootstrap in index.html must read the dark-mode key from localStorage'
    ).not.toBeNull();
    expect(
      keyMatch?.[1] ?? '',
      'the bootstrap key must equal the key AppContext persists dark mode under'
    ).toBe(DARK_MODE_KEY);

    const appContext = readRepoFile('src', 'context', 'AppContext.tsx');
    expect(
      appContext.includes(`localStorage.setItem('${DARK_MODE_KEY}',`),
      `AppContext must persist dark mode under '${DARK_MODE_KEY}' — the key the bootstrap reads`
    ).toBe(true);
  });

  it('the bootstrap toggles the .dark class on document.documentElement', () => {
    const indexHtml = readRepoFile('index.html');
    expect(
      indexHtml.includes("document.documentElement.classList.add('dark')"),
      "index.html must add the 'dark' class to document.documentElement, as AppContext does"
    ).toBe(true);
  });

  it('index.html and AppContext agree on the light/dark chrome colours', () => {
    const indexHtml = readRepoFile('index.html');
    const appContext = readRepoFile('src', 'context', 'AppContext.tsx');
    for (const colour of ['#fafaf9', '#121215']) {
      expect(
        indexHtml.includes(colour),
        `index.html must declare the chrome colour ${colour} for first paint`
      ).toBe(true);
      expect(
        appContext.includes(colour),
        `AppContext must apply the theme-color meta with ${colour}, as the bootstrap does`
      ).toBe(true);
    }
  });
});

describe('M-3 — no UI source opens a blocking browser confirm dialog', () => {
  it('no src/**/*.tsx file calls confirm, bare or on window', () => {
    const uiSources = listFilesWithExtension(path.join(REPO_ROOT, 'src'), '.tsx');
    expect(
      uiSources.length,
      'sanity check: the walker must find the src/**/*.tsx UI sources'
    ).toBeGreaterThan(10);

    // The call form is matched with a trailing parenthesis so comments that
    // merely mention the blocking dialog (BatchActionBar.tsx and
    // EventNotesList.tsx explain that in-app modals avoid iframe confirm
    // blocks) do not count. `confirm(` also catches the bare-global form that
    // used to live in OfflineAiPanel.tsx.
    const offenders = uiSources
      .filter((file) => /\bconfirm\(/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(
      offenders,
      `blocking browser confirm call(s) found (audit M-3): ${offenders.join(', ') || 'none'}`
    ).toEqual([]);
  });
});
