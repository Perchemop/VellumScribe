import React from 'react';
import { CURRENT_APP_VERSION } from '../lib/appUpdateManager';

interface VersionFootprintProps {
  onOpen: () => void;
}

/**
 * The subtle bottom-right version footprint (guide §12.1 suite standard).
 *
 * A small, muted text button that shows the running version; clicking it opens
 * the standard Release Notes popup. Its *chrome* is deliberately quiet — no
 * background, no shadow, 10px type — while its *hit area* is expanded past the
 * glyphs so it still meets the ≥ 24×24 CSS px minimum (WCAG 2.5.8 / guide
 * II.30). It remains a real, labelled, keyboard-reachable button.
 *
 * On mobile it shares the bottom-right corner with two other fixed affordances,
 * both `md:hidden` (so desktop is free of them), and must clear both:
 *  - the mobile bottom navigation bar is `min-h-14` — 3.5rem = 56 px tall — so
 *    the chip must sit above its top edge (and `safe-area-pb` can only raise
 *    that edge, never lower it);
 *  - the create-note FAB (`src/App.tsx`) is `fixed bottom-20 right-4`: a 56 px
 *    (`w-14 h-14`) circle spanning 80–136 px from the bottom and 16–72 px from
 *    the right, painted at `z-30` (above the chip's `z-20`).
 *
 * Chosen offsets — `bottom-16` (4rem = 64 px) + `right-2`, with `after:-inset-2`
 * expanding the hit area by 8 px per side:
 *  - visible chip: 10px type / `leading-none` / `py-0.5` ⇒ ≈14 px tall, ⇒ spans
 *    64–78 px from the bottom, i.e. 2 px *below* the FAB's 80 px edge — no
 *    visual overlap sliver;
 *  - hit area: 56–86 px tall (≈64 px wide) ⇒ ≥ 24×24 px. Its bottom edge lands
 *    exactly on the nav's 56 px top edge, and its top 6 px (80–86 px) sits
 *    under the FAB, which wins the pointer there — leaving a clear 24 px of
 *    vertical target. Do not shrink the padding without re-running this
 *    arithmetic: it is what keeps the target at, not below, the minimum.
 *  - desktop: `md:bottom-2` tucks it into the corner, where neither the FAB nor
 *    the bottom nav exists.
 *  - `z-20` stays under the FAB (`z-30`) and the popup (`z-50`), and the chip is
 *    never full-width, so it cannot block scrolling or other controls.
 */
export const VersionFootprint: React.FC<VersionFootprintProps> = ({ onOpen }) => {
  const label = `Version ${CURRENT_APP_VERSION} — release notes`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      className="fixed right-2 bottom-16 md:bottom-2 z-20 px-1.5 py-0.5 rounded-md text-[10px] leading-none font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/70 transition-colors after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      v{CURRENT_APP_VERSION}
    </button>
  );
};
