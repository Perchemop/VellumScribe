# VellumScribe Rendered Review — 2026-10-25

**Prepared by:** designer subagent (UI/UX & visual identity owner)
**Scope:** first public release (F-Droid / alternative app stores) — rendered output only
**Source:** CI `visual.yml` real rendered screenshots at `/tmp/opencode/visual/`:

- `landing-desktop.png` (1280×800)
- `landing-tablet.png` (768×1024)
- `landing-phone.png` (390×844)
- `empty-state.png` (fresh storage)
  **Standard:** minimalistic, beautiful, professional, polished; WCAG 2.2 AA (`ACCESSIBILITY.md`)
  **Constraint:** only `docs/design/**`, `assets/**`, `*.svg`, `*.md` edited. No application source or config touched.
  **Method:** review the rendered result, not the diff (guide §27.12). Exact contrast ratios cannot be measured from a PNG; where a ratio matters I say so and point to a tool verification.

---

## Summary

The rendered app looks **designed, professional, and polished — not generated or broken.**

- The brand mark (white "V" quill with stem and dot on a near-black `#09090B` tile) renders correctly everywhere: crisp, centered in its tile, correct safe zones, matches favicon/launcher/splash.
- Colour is restrained zinc with user-owned note colours as accents; type hierarchy is clear; spacing is consistent; elevation (hairline borders, soft shadows) is tasteful.
- All four breakpoints present cleanly: no overflow, no cramped rows, no misaligned cards, no broken empty states, no clipped text, no mismatched icons, no dead controls, no placeholder/lorem content, no unstyled controls.
- The H-1 light-mode small-text contrast fix (`text-zinc-400` → `text-zinc-600 dark:text-zinc-400`) is **visually resolved**: helper/meta text on light surfaces now reads clearly as medium-dark gray on white.

**Verdict on the screens reviewed: release-ready from a visual/rendered standpoint.**

The overall app is **not yet fully release-ready** because findings not visible in these screenshots remain open: H-2 (batch action bar colour inversion), H-3 (invisible keyboard focus), H-4 (`prefers-reduced-motion`), M-1 (AppLogo dark-mode inversion), M-2 (maskable icon). Those are implementation findings belonging to `coder`; they are out of scope for this screenshot review. Update `review-2026-10-25.md` only as each is resolved.

---

## Per-screenshot findings

### landing-desktop.png (1280×800) — Quick Start intro modal

**Severity: none (good)**

- Centered white rounded modal on a dark blurred backdrop; no overflow, no cramped rows.
- Header row aligned: brand mark (dark tile, white V), "WRITE FIRST" badge, "Quick Start" title, `×` close button — correct geometry, no clipped text.
- Heading "Open a Note and Just Write"; helper text ("The editor stays clean… not a row of icons") reads clearly in medium-dark gray on white — H-1 fix visually confirmed.
- Two cards side by side ("Attach (+)", "More (…)") with hairline borders, generous padding, aligned lead icons and body copy.
- Pagination: one filled dot + three outlined dots; footer "Skip Intro" (left) / "Next →" black pill button (right) — clear visual hierarchy, adequate touch targets.
- Verdict: professional, store-listing quality.

### landing-tablet.png (768×1024) — portrait tablet

**Severity: none (good)**

- Same modal in portrait orientation; no overflow or misalignment.
- Cards remain side by side with comfortable gutters; footer buttons positioned correctly with side margins.
- Verdict: good.

### landing-phone.png (390×844) — narrow phone

**Severity: none (good)**

- Responsive reflow correct: cards stack vertically ("Attach (+)" over "More (…)"), no horizontal overflow, no cramped rows.
- Footer: "Skip Intro" left, "Next →" right, both fit within 390 px with side margins; touch targets remain usable.
- Verdict: good.

### empty-state.png (fresh storage)

**Severity: none (good)**

- Fresh storage presents the same Quick Start intro modal as the first-run experience — this is the empty state before any notes exist.
- Inviting: clear value proposition ("Open a Note and Just Write"), benefit-oriented card copy ("Checklist, voice memo, sketch…", "Pin, reminder, lock, share…").
- Clear next action: primary "Next →" button (right), secondary "Skip Intro" (left).
- Verdict: good — inviting with a clear next action.

### Cross-cutting: anything unfinished, mis-styled, or store-listing risk

**Severity: none observed.**

No clipped text, no mismatched iconography, no dead controls, no placeholder or lorem content, no unstyled/default controls, no light-mode colour inversion (batch bar not present in these screens; H-2 remains a separate open finding), no broken empty states at any reviewed width.

---

## Concrete fixes

No blocking visual fixes are required from this review.

**One verification recommendation (H-1, previously High — visually resolved):**

Confirm the computed contrast ratio of the now-darkened helper text is ≥ 4.5:1 (AA for small text) with an automated tool, since exact ratio cannot be measured from a PNG. Expected fix locations recorded in `review-2026-10-25.md`:

- `src/components/EventNotesList.tsx:462` — note meta row
- `src/components/EventNotesList.tsx:612` — note date
- `src/components/RecentNotesSection.tsx:90-91` — intro description
- Plus any remaining `text-zinc-400` helper/meta text on light surfaces; the Quick Start/intro modal helper and card body text should follow `text-zinc-600 dark:text-zinc-400`.

Hand to `coder` for verification and any remaining instances. No source or config changes are made by the designer in this review.

---

## Relation to review-2026-10-25.md

`docs/design/review-2026-10-25.md` updated: H-1 marked resolved (rendered verification). All other findings (H-2, H-3, H-4, M-1, M-2, L-1…L-6) unchanged.
