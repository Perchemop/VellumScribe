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
 * What is not covered yet: screens behind the app's panels, because there are
 * no stable selectors for them. When those land, add a loop here instead of
 * guessing at CSS classes.
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

test('note editor (write-first) with a fresh note', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
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
  await page.goto(BASE);
  await settle(page);

  // The settings surface is reachable through the centre navigation on desktop.
  await page.locator('#nav-settings-view-btn').click();
  await settle(page);

  // Switch to the Diagnostics tab where Export logs and crash reporting live.
  const diagTab = page.locator('#subtab-diagnostics-btn');
  await diagTab.click({ timeout: 10000 }).catch(() => {
    console.log('diagnostics tab not reachable in this build; capturing settings as-is');
  });
  await page
    .locator('#panel-diagnostics')
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => undefined);
  await settle(page);
  await page.screenshot({ path: `${OUT}/settings-diagnostics.png`, fullPage: true });

  expect(errors, `settings must load without errors:\n${errors.join('\n')}`).toEqual([]);
});
