# Brand & Visual Identity

VellumScribe's marks are **original works**. Nothing here is derived from a
commercial product's icon, layout, or trade dress (guide §2.2, §10, §27.5).
See `ATTRIBUTION.md` for the licences of every asset.

## Meaning

The name fuses **vellum** — the durable writing surface that survives its
author — with **scribe** — the act of capturing thought. The product promise is
exactly that: notes that outlive the session that wrote them, organised around
the events they belong to.

## Mark

- **A white "V" with a stem and a dot** on a near-black rounded tile: the V is
  the initial, the descending stem turns it into a quill nib, and the dot reads
  as both a full stop and the nib's breather hole.
- **Palette:** near-black tile `#09090b` (matches the app background), mark
  white `#ffffff`. Accents inside the app reuse the note-colour set
  (`emerald`, `amber`, `rose`, `sky`, `violet`) — colour belongs to the user's
  content, not to the brand.
- **Shape language:** rounded `2xl` corners on surfaces, 1px hairline borders,
  restrained elevation. Information density is preferred over decoration.
- **Type:** Plus Jakarta Sans for UI, Newsreader for reading, JetBrains Mono
  for data (code, transcripts). One idea per screen.

## Assets

- **Canonical source:** `assets/brand/vellumscribe-mark.svg` — the single source
  of truth for the logo geometry.
- **Web/app copy:** `public/favicon.svg` (same geometry).
- **Platform rasters:** Android launcher, adaptive-icon foreground and splash
  PNGs are generated from the mark by `scripts/generate-brand-assets.mjs`
  (`npm run assets:brand`).
- **Licence:** MIT, with the application. Recorded in `ATTRIBUTION.md`. Web
  fonts are SIL OFL 1.1 (see `ATTRIBUTION.md`).
- Never reproduce a competitor's icon, glyph, or logo at any size.

## Ownership

The `designer` subagent owns this file and every asset it describes, and
reviews the **rendered** result of every user-visible slice (guide §27). Logic
changes are handed back to `coder`; the designer does not rewrite application
logic.

## Voice

Short, concrete, honest. Error messages say what failed and what the user can
do next; never claim a feature works that is not wired up (guide §9,
`CONTRIBUTING.md`).
