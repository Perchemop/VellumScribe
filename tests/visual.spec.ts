import { test, expect, type Page } from '@playwright/test';

/**
 * Visual evidence for the designer agent (guide section 27.12).
 *
 * These are artefacts, not assertions: the job uploads `snapshots/` so a human
 * or the designer can look at the rendered product. Two things are still
 * enforced, because they are real bugs rather than taste:
 *
 *   1. no uncaught exception or console error on load, and
 *   2. the app actually painted something (the root is laid out).
 *
 * Coverage now includes the write-first editor (light and dark), the settings
 * diagnostics tab, the About panel (brand mark), the mobile bottom navigation,
 * the in-app delete confirmation, forced-colours mode, and the theme applied
 * before first paint. Screens without stable selectors are still not captured;
 * add a test when a selector lands rather than guessing at CSS classes.
 */

const OUT = 'snapshots';

/**
 * Playwright needs an absolute URL: this repository has no Playwright config,
 * so there is no `baseURL` to resolve a relative path against. The workflow
 * sets this to the port it booted the bundled server on.
 */
const BASE = process.env.VISUAL_BASE_URL ?? 'http://localhost:4173';

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Two frames: one for the framework to commit, one for fonts/layout to finish.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

test('landing screen at three viewports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  for (const [name, width, height] of [
    ['desktop', 1280, 800],
    ['tablet', 768, 1024],
    ['phone', 390, 844],
    // 320 CSS px is the WCAG 1.4.10 reflow reference width; capturing it gives
    // rendered evidence for the "narrow-viewport reflow" gap in ACCESSIBILITY.md.
    ['narrow', 320, 640],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(BASE);
    await settle(page);
    const shot = `${OUT}/landing-${name}.png`;
    await page.screenshot({ path: shot, fullPage: true });

    // A blank frame proves nothing: the document must have been laid out.
    const box = await page.locator('#root, body').first().boundingBox();
    expect(box?.width ?? 0, `${name} rendered width`).toBeGreaterThan(0);
    expect(box?.height ?? 0, `${name} rendered height`).toBeGreaterThan(0);

    console.log(`captured ${shot} at ${width}x${height}`);
  }

  expect(errors, `the landing screen must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('empty state with no stored data', async ({ page, context }) => {
  // A fresh origin storage is the empty state: no documents, no settings.
  await context.clearCookies();
  await page.goto(BASE);
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Storage can be blocked; the empty state is then whatever the app shows.
    }
  });
  await page.reload();
  await settle(page);
  await page.screenshot({ path: `${OUT}/empty-state.png`, fullPage: true });
  console.log(`captured ${OUT}/empty-state.png`);
});

async function skipFirstRun(page: import('@playwright/test').Page) {
  // The first-run guide modal covers the shell and swallows clicks; mark the
  // onboarding complete before the app boots so tests reach real screens.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vellumscribe_onboarding_completed_v1', 'true');
      localStorage.setItem('vellumscribe_splash_seen_v1', 'true');
    } catch {
      // storage may be blocked; the overlay then has to be dismissed manually
    }
  });
}

test('note editor (write-first) with a fresh note', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await skipFirstRun(page);
  await page.goto(BASE);
  await settle(page);

  // Create a note through the real header control, then capture the editor.
  await page.locator('#header-new-note-dropdown-btn').click();
  await settle(page);
  const editor = page.locator('#note-editor-container');
  await editor.waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/note-editor-desktop.png`, fullPage: false });

  // Narrow layout for the editor shell.
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/note-editor-phone.png`, fullPage: false });

  expect(errors, `editor must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('settings — diagnostics tab (export logs / crash reporting)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await skipFirstRun(page);
  await page.goto(BASE);
  await settle(page);

  // The settings surface is reachable through the centre navigation on desktop.
  await page.locator('#nav-settings-view-btn').click();
  await settle(page);

  // Diagnostics lives behind Advanced mode; switch first (loud failures —
  // a capture of the wrong tab is worse than no capture).
  await page.locator('#settings-mode-advanced').click({ timeout: 10000 });
  const diagTab = page.locator('#subtab-diagnostics-btn');
  await diagTab.click({ timeout: 10000 });
  await page.locator('#panel-diagnostics').waitFor({ state: 'visible', timeout: 10000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/settings-diagnostics.png`, fullPage: true });

  expect(errors, `settings must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('note editor in dark mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await skipFirstRun(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE);
  await settle(page);

  // Dark theme via the real header toggle, then create the note.
  await page.locator('#theme-toggle-btn').click();
  await settle(page);
  await page.locator('#header-new-note-dropdown-btn').click();
  await page.locator('#note-editor-container').waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/note-editor-dark.png`, fullPage: false });

  // The toggle must actually flip the palette (audit S-4): the app root is
  // dark-themed `#0c0c0e` = rgb(12, 12, 14). A light render here means the
  // class-based dark variant regressed.
  const bg = await page.evaluate(
    () => getComputedStyle(document.getElementById('app-root-container') as Element).backgroundColor
  );
  const channels = bg.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  expect(channels[0], `dark theme must apply (got ${bg})`).toBeLessThan(40);

  expect(errors, `dark editor must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('settings — About panel carries the brand mark', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await skipFirstRun(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE);
  await settle(page);

  await page.locator('#nav-settings-view-btn').click();
  await settle(page);
  await page.locator('#subtab-about-btn').click({ timeout: 10000 });
  await page.locator('#panel-about').waitFor({ state: 'visible', timeout: 10000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/settings-about-desktop.png`, fullPage: true });

  // Audit m-2: the panel used to show a plain letter "V" instead of the mark.
  await expect(page.locator('#panel-about svg').first()).toBeVisible();

  // Phone viewport, reached through the bottom navigation (audit m-7 evidence).
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page);
  await page.locator('#bottom-nav-settings-btn').click();
  await page.locator('#panel-about').waitFor({ state: 'visible', timeout: 10000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/settings-about-phone.png`, fullPage: true });

  expect(errors, `settings must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('note delete confirms in-app instead of a blocking dialog', async ({ page }) => {
  const errors: string[] = [];
  const nativeDialogs: string[] = [];
  page.on('dialog', async (d) => {
    nativeDialogs.push(d.type());
    await d.dismiss();
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await skipFirstRun(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE);
  await settle(page);

  await page.locator('#header-new-note-dropdown-btn').click();
  await page.locator('#note-editor-container').waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);

  await page.locator('#note-more-btn').click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  const dialog = page.locator('[role="dialog"]').filter({ hasText: 'Delete this note?' });
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/note-delete-confirm.png`, fullPage: false });

  // Cancel is non-destructive: the editor stays open and the note survives.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#note-editor-container')).toBeVisible();

  expect(nativeDialogs, 'window.confirm must not be used (audit M-3)').toEqual([]);
  expect(errors, `editor must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('forced-colours mode keeps control edges', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await skipFirstRun(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(BASE);
  await settle(page);
  await page.screenshot({ path: `${OUT}/forced-colours-landing.png`, fullPage: true });

  // The forced-colours layer (audit m-6) must give buttons a system-coloured
  // edge; without it the UA drops the Tailwind border and the control vanishes.
  const border = await page.evaluate(() => {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return null;
    const s = getComputedStyle(btn);
    return `${s.borderTopStyle} ${s.borderTopWidth}`;
  });
  expect(border, 'theme toggle must keep a border in forced colours').toBe('solid 1px');
  expect(errors, `landing must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('dense notes list renders at scale (virtualization)', async ({ page }) => {
  // Audit gap 4: hundreds of notes were never rendered. 24 rows crosses the
  // list's virtualization threshold, so this capture is the rendered evidence
  // that dense lists lay out and scroll rather than the code-only inference.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await skipFirstRun(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE);
  await settle(page);

  const title = page.getByLabel('Note title');
  for (let i = 1; i <= 24; i++) {
    await page.locator('#header-new-note-dropdown-btn').click();
    await page.locator('#note-editor-container').waitFor({ state: 'visible', timeout: 15000 });
    await title.fill(`Density check ${i}`);
    await title.blur(); // the title save is debounced, so commit before leaving
    await page.waitForTimeout(450);
    await page.locator('#back-to-notes-btn').click();
    await page.locator('#note-editor-container').waitFor({ state: 'hidden', timeout: 15000 });
  }

  await settle(page);
  await page.screenshot({ path: `${OUT}/notes-list-dense.png`, fullPage: false });

  // The list must actually show several rows (a blank frame proves nothing).
  const rows = page.locator('[data-testid="note-card"], [role="button"]');
  expect(await rows.count(), 'dense list must render rows').toBeGreaterThan(5);
  expect(errors, `dense list must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('stored theme is applied before first paint', async ({ page }) => {
  // Light preference: the inline head script must leave <html> without the
  // dark class and report the light chrome colour (audit m-4).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('omninote_dark_mode_v1', 'false');
    } catch {
      /* storage blocked */
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const light = await page.evaluate(() => {
    const loader = document.getElementById('vellumscribe-init-loader');
    return {
      darkClass: document.documentElement.classList.contains('dark'),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      loaderBg: loader ? getComputedStyle(loader).backgroundColor : null,
    };
  });
  expect(light.darkClass, 'light preference must not set the dark class').toBe(false);
  expect(light.themeColor).toBe('#fafaf9');
  if (light.loaderBg) {
    expect(light.loaderBg, 'the splash must use the light surface').toBe('rgb(250, 250, 249)');
  }
  await page.screenshot({ path: `${OUT}/first-paint-light.png`, fullPage: false });
  await settle(page);

  // Dark preference: the class and the chrome colour flip before paint.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('omninote_dark_mode_v1', 'true');
    } catch {
      /* storage blocked */
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const dark = await page.evaluate(() => ({
    darkClass: document.documentElement.classList.contains('dark'),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }));
  expect(dark.darkClass, 'dark preference must set the dark class').toBe(true);
  expect(dark.themeColor).toBe('#121215');
  await settle(page);
});

test('empty state in dark mode', async ({ page, context }) => {
  await context.clearCookies();
  await page.addInitScript(() => {
    try {
      localStorage.setItem('omninote_dark_mode_v1', 'true');
    } catch {}
    try {
      localStorage.setItem('vellumscribe_onboarding_completed_v1', 'true');
      localStorage.setItem('vellumscribe_splash_seen_v1', 'true');
    } catch {}
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.screenshot({ path: `${OUT}/empty-state-dark.png`, fullPage: true });
  console.log(`captured ${OUT}/empty-state-dark.png`);
});

test('settings — diagnostics tab in dark mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('omninote_dark_mode_v1', 'true');
    } catch {}
    try {
      localStorage.setItem('vellumscribe_onboarding_completed_v1', 'true');
    } catch {}
  });
  await page.goto(BASE);
  await settle(page);

  await page.locator('#nav-settings-view-btn').click();
  await settle(page);
  await page.locator('#settings-mode-advanced').click({ timeout: 10000 });
  await page.locator('#subtab-diagnostics-btn').click({ timeout: 10000 });
  await page.locator('#panel-diagnostics').waitFor({ state: 'visible', timeout: 10000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/settings-diagnostics-dark.png`, fullPage: true });

  expect(errors, `settings must load without errors:\n${errors.join('\n')}`).toEqual([]);
});

test('note editor in dark mode with phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('omninote_dark_mode_v1', 'true');
    } catch {}
    try {
      localStorage.setItem('vellumscribe_onboarding_completed_v1', 'true');
    } catch {}
  });
  await page.goto(BASE);
  await settle(page);

  await page.locator('#header-new-note-dropdown-btn').click();
  await page.locator('#note-editor-container').waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  await page.screenshot({ path: `${OUT}/note-editor-dark-phone.png`, fullPage: false });
  console.log(`captured ${OUT}/note-editor-dark-phone.png`);
});

test('focused state on editor body input', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vellumscribe_onboarding_completed_v1', 'true');
    } catch {}
  });
  await page.goto(BASE);
  await settle(page);

  // Create a note first
  await page.locator('#header-new-note-dropdown-btn').click();
  await page.locator('#note-editor-container').waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);

  // Focus the body textarea (has aria-label="Note body")
  const bodyInput = page.getByLabel('Note body').first();
  await bodyInput.focus();
  await settle(page);
  await page.screenshot({ path: `${OUT}/editor-focus-body.png`, fullPage: false });

  // Check focus ring via getComputedStyle
  const hasFocusRing = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Note body"]');
    if (!el) return false;
    const outline = getComputedStyle(el).outline;
    const boxShadow = getComputedStyle(el).boxShadow;
    return (outline !== 'none' && outline.length > 4) || (boxShadow ?? '').includes('ring');
  });

  expect(errors, `editor must load without errors:\n${errors.join('\n')}`).toEqual([]);
  console.log(
    `captured ${OUT}/editor-focus-body.png`,
    hasFocusRing ? '(focus ring detected)' : '(no focus ring)'
  );
});
