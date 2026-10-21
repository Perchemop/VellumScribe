# Attribution

All third-party components and their licences. Verified 2026-10-21 by reading
each installed package's `package.json` licence field and the vendored
upstream licence files.

VellumScribe itself is **MIT** (`LICENSE`), `Copyright (c) 2026 VellumScribe`.

---

## Native vendored components

| Component | Version / source | Licence | Location |
| --- | --- | --- | --- |
| whisper.cpp | vendored upstream tree | MIT — *Copyright (c) 2023–2026 The ggml authors* | `android/app/src/main/cpp/third_party/whisper.cpp/` |
| ggml | bundled inside the whisper.cpp tree | MIT (covered by the parent `LICENSE`) | `.../whisper.cpp/ggml/` |

The upstream `LICENSE` file is shipped alongside the tree. No proprietary or
GPL-only component is linked; the whole native inference path remains
redistributable under MIT.

---

## Runtime dependencies

| Package | Licence |
| --- | --- |
| `@aparajita/capacitor-secure-storage` | MIT |
| `@capacitor-community/sqlite` | MIT |
| `@capacitor/android`, `/app`, `/browser`, `/camera`, `/cli`, `/clipboard`, `/core`, `/filesystem`, `/haptics`, `/local-notifications`, `/share` | MIT |
| `@google/genai` | Apache-2.0 |
| `@tailwindcss/vite` | MIT |
| `dotenv` | BSD-2-Clause |
| `express` | MIT |
| `react`, `react-dom` | MIT |
| `react-window` | MIT |
| `sql.js` | MIT / Apache-2.0 dual |
| `tailwindcss` | MIT |
| `vite` | MIT |

## Development dependencies

| Package | Licence |
| --- | --- |
| `@eslint/js`, `eslint`, `eslint-plugin-jsx-a11y` | MIT |
| `@types/express`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/react-window`, `@types/sql.js` | MIT |
| `@vitejs/plugin-react` | MIT |
| `autoprefixer` | MIT |
| `esbuild` | MIT |
| `globals` | MIT |
| `typescript` | Apache-2.0 |
| `typescript-eslint` | MIT |
| `vitest` | MIT |

*Full list generated from installed `package.json` licence fields — 46 direct
dependencies, all permissively licensed (MIT / ISC / Apache-2.0 /
BSD-2-Clause). No copyleft dependency is present.*

---

## Non-code assets

| Asset | Origin | Licence |
| --- | --- | --- |
| Brand mark (white "V" + stem + dot) | Original to this project | MIT (with the app) |
| Launcher / round / foreground / splash PNGs | Generated from `public/favicon.svg` by `scripts/generate-brand-assets.mjs` | MIT (with the app) |

## Web fonts

Loaded from the Google Fonts CDN (`fonts.googleapis.com` / `fonts.gstatic.com`)
in `index.html`; no font files are vendored in the repository. Each family is
under the **SIL Open Font License 1.1**:

| Family | Use |
| --- | --- |
| Plus Jakarta Sans | UI / interface text |
| Newsreader | Reading and long-form note text |
| JetBrains Mono | Code, transcripts, monospace data |

Note: the CSP in `index.html` already permits `fonts.googleapis.com` for
styles and `fonts.gstatic.com` for font data. Because the fonts are fetched at
runtime, **fully offline first launch falls back to the system font stack** —
the app stays usable, but the brand typefaces need a network fetch once.

---

## Inspiration (not a dependency)

Declared in full, with the clean-room rules, in `docs/inspiration.md`:

- **whisper.cpp / Whisper** — open-source (MIT); used as both a dependency
  and a design reference.
- **Obsidian** — proprietary; **behavioural inspiration only**. Not a
  dependency, and no Obsidian code, asset, icon, layout or string has been
  read or copied.
