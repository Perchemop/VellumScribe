# Attribution

All third-party components and their licences. Verified 2026-10-21 by reading
each installed package's `package.json` licence field and the vendored
upstream licence files.

VellumScribe itself is **MIT** (`LICENSE`), `Copyright (c) 2026 VellumScribe`.

---

## Native vendored components

| Component   | Version / source                    | Licence                                          | Location                                            |
| ----------- | ----------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| whisper.cpp | vendored upstream tree              | MIT — _Copyright (c) 2023–2026 The ggml authors_ | `android/app/src/main/cpp/third_party/whisper.cpp/` |
| ggml        | bundled inside the whisper.cpp tree | MIT (covered by the parent `LICENSE`)            | `.../whisper.cpp/ggml/`                             |

The upstream `LICENSE` file is shipped alongside the tree. No proprietary or
GPL-only component is linked; the whole native inference path remains
redistributable under MIT.

---

## Runtime dependencies

| Package                                                                                                                                         | Licence               |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `@aparajita/capacitor-secure-storage`                                                                                                           | MIT                   |
| `@capacitor-community/sqlite`                                                                                                                   | MIT                   |
| `@capacitor/android`, `/app`, `/browser`, `/camera`, `/cli`, `/clipboard`, `/core`, `/filesystem`, `/haptics`, `/local-notifications`, `/share` | MIT                   |
| `@google/genai`                                                                                                                                 | Apache-2.0            |
| `@tailwindcss/vite`                                                                                                                             | MIT                   |
| `dotenv`                                                                                                                                        | BSD-2-Clause          |
| `express`                                                                                                                                       | MIT                   |
| `react`, `react-dom`                                                                                                                            | MIT                   |
| `react-window`                                                                                                                                  | MIT                   |
| `sql.js`                                                                                                                                        | MIT / Apache-2.0 dual |
| `tailwindcss`                                                                                                                                   | MIT                   |
| `vite`                                                                                                                                          | MIT                   |

## Development dependencies

| Package                                                                                                     | Licence    |
| ----------------------------------------------------------------------------------------------------------- | ---------- |
| `@eslint/js`, `eslint`, `eslint-plugin-jsx-a11y`                                                            | MIT        |
| `@types/express`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/react-window`, `@types/sql.js` | MIT        |
| `@vitejs/plugin-react`                                                                                      | MIT        |
| `autoprefixer`                                                                                              | MIT        |
| `esbuild`                                                                                                   | MIT        |
| `globals`                                                                                                   | MIT        |
| `typescript`                                                                                                | Apache-2.0 |
| `typescript-eslint`                                                                                         | MIT        |
| `vitest`                                                                                                    | MIT        |

_Full list generated from installed `package.json` licence fields — 46 direct
dependencies, all permissively licensed (MIT / ISC / Apache-2.0 /
BSD-2-Clause). No copyleft dependency is present._

---

## Non-code assets

| Asset                                       | Origin                                                                     | Licence            |
| ------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| Brand mark (white "V" + stem + dot)         | Original to this project                                                   | MIT (with the app) |
| Launcher / round / foreground / splash PNGs | Generated from `public/favicon.svg` by `scripts/generate-brand-assets.mjs` | MIT (with the app) |

## Web fonts

Loaded from the Google Fonts CDN (`fonts.googleapis.com` / `fonts.gstatic.com`)
in `index.html`; no font files are vendored in the repository. Each family is
under the **SIL Open Font License 1.1**:

| Family            | Use                               |
| ----------------- | --------------------------------- |
| Plus Jakarta Sans | UI / interface text               |
| Newsreader        | Reading and long-form note text   |
| JetBrains Mono    | Code, transcripts, monospace data |

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

---

## Build-time models and APIs (guide §19.7)

The terms of every model and API used to _build_ this project are recorded here
so the provenance story stays clean. No model output is committed as
copyrightable material; the code is original, written against public standards
and documentation.

| Provider / model                                          | Role in the build                        | Terms                                                                        |
| --------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| OpenCode free models (tier 1)                             | primary coding/agent models              | provider terms; used as tooling, not as shipped material                     |
| NVIDIA free models (tier 2)                               | failover coding/agent models             | provider terms; tooling only                                                 |
| Groq / Google API keys (tier 3)                           | last-resort failover                     | provider terms; tooling only                                                 |
| Google `@google/genai` (Gemini)                           | **runtime** AI provider, BYOK and opt-in | Apache-2.0 SDK; user supplies their own key and accepts the provider's terms |
| Optional cloud providers (Google Drive, OneDrive, WebDAV) | **runtime** encrypted backup, opt-in     | each provider's own terms; user supplies their own account                   |

The runtime AI/cloud entries are user-facing and off by default; the build-time
entries never place vendor material into the repository.

## Maintainers' IP check (guide §19.6)

Whether an employer's IP agreement could claim rights over work related to the
employer's business, or made with employer resources, has **not** been
confirmed. Tracked as an open question in `docs/assumptions-and-questions.md`.
