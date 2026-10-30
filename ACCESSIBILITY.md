# Accessibility Statement

VellumScribe is an offline-first note-taking app for Android and the web, and
accessibility is part of its quality bar — notes about your own life must be
usable by the person whose life they are.

## Target standard

**WCAG 2.2, level AA**, applied to the app UI (both the web build and the
Android web-view build, which share one codebase).

## Priorities

1. **Keyboard-first operation** — every interactive element reachable,
   operable, and visible-on-focus by keyboard alone.
2. **Semantics over decoration** — native `button`, `input`, `label`, and
   heading elements everywhere possible; ARIA only where a native element
   genuinely cannot express the behaviour ("no ARIA is better than bad ARIA").
3. **Transcripts and captions** — audio recordings carry transcripts; nothing
   depends on being able to hear a recording to know what is in it.
4. **Contrast and non-colour signalling** — text and icon contrast at AA or
   better; status is never conveyed by colour alone.
5. **Motion restraint** — no flashing, no auto-advancing content, and the OS
   reduced-motion setting is respected where the platform exposes it.

## Known limitations (honest, current)

- The **handwriting OCR capture** relies on the camera; the on-device flow has
  no non-visual alternative today.
- The **sketch canvas** is pointer-driven; it has no non-visual output and no
  keyboard drawing mode. Sketches are additive content, never the only copy of
  information.
- Screen-reader testing has been spot-checked, not systematic; the automated
  gate covers `alt` text and keyboard operability (`jsx-a11y/alt-text` is an
  ESLint **error**, `click-events-have-key-events` a warning-as-zero since
  slice B-6), but manual passes are still on the roadmap (`ROADMAP.md`,
  4.0.0).
- 200%-zoom and narrow-viewport reflow has not been audited end to end. The
  visual-evidence job now captures the landing screen at the WCAG 1.4.10
  reference width (320 CSS px, `tests/visual.spec.ts`) as rendered evidence, but
  nobody has yet walked the wider app at 200% zoom on a device.
- **Forced-colours / Windows High Contrast** now has a `@media (forced-colors:
active)` layer (`src/index.css`) giving form controls and buttons a
  system-coloured edge and an explicit focus outline, with a rendered capture in
  the same visual job. It is verified by emulation and by the border assertion
  in that job, not on a real Windows high-contrast desktop.
- **Permission-denied states** for camera, microphone and location are surfaced
  in-app for location (the editor's location picker explains the denial and
  keeps the picker open); camera and microphone denial copy has not been given
  the same treatment yet.

## How to report an accessibility problem

Open an issue with the **accessibility** template (`.github/ISSUE_TEMPLATE/`
→ "Accessibility issue"), which captures the expected vs actual outcome, the
assistive technology and version, and severity. Accessibility reports are
treated as time-sensitive: they can block use entirely, so they sit on a
separate path from general bugs.

This statement follows public community guidance
(<https://opensource.guide/accessibility-best-practices-for-your-project/>);
the wording is original to this project.
