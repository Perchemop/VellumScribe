# Audit section — SSO / OAuth & App shell

**Date:** 2026-10-07 · **HEAD:** main (post checklist completion)

## CI

- Latest main CI runs **#241–#242**: **success** (typecheck, lint, orphans, tests, build).

## SSO / OAuth findings

### What works in code

| Path                | Behaviour                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CloudConnectModal` | PKCE via `generatePKCE`, `CloudSyncEngine.getAuthUrl`, popup + `postMessage` origin check, native `Browser.open` + `addAppUrlListener` + poll |
| Settings quick SSO  | Popup flow when OAuth env configured; honest error if not                                                                                     |
| `NativeBridge`      | `openInAppBrowser`, `addAppUrlListener`, `addBrowserFinishedListener`                                                                         |
| Server redirect     | App reads `?cloud=connected` / `cloud_error` query and toasts                                                                                 |

### Gap fixed this pass

- **Cold start / background return:** Deep-link listener lived only inside `CloudConnectModal` while loading. If the OS delivered `appUrlOpen` after the modal unmounted (or before open), the account refresh/toast could be missed.
- **Fix:** App-level `NativeBridge.addAppUrlListener` on startup → `fetchConfig` → Settings → Cloud + toast.

### Remaining (device / ops)

- Production **Digital Asset Links** (`assetlinks.json`) for HTTPS App Links.
- Real **GOOGLE_*** / **MICROSOFT_*** env on the host used by the APK.
- End-to-end sign-in on a physical Android device.

Documented in `docs/KNOWN_LIMITATIONS.md` §4.

## App shell findings

| Area              | Assessment                                                                           |
| ----------------- | ------------------------------------------------------------------------------------ |
| Navigation        | Notes / Recent / Archive / Settings; hardware back via `ModalBackStack` + `popstate` |
| FAB create        | Text / checklist / sketch types                                                      |
| Focus mode        | Hides chrome; editor supports Done                                                   |
| Reminders         | Interval watcher + `ReminderService.reconcileReminders` + native schedule            |
| Onboarding        | First-time guide gated by local flag                                                 |
| Note editor entry | `NoteEditor.tsx` re-exports write-first implementation                               |

### Minor polish (non-blocking)

- Header shows both dedicated Settings button and Settings tab label “Settings & AI” — slightly redundant on desktop; acceptable.
- `settingsSubtab` type omits `'offline-ai' \| 'about'` vs SettingsView; runtime still works via cast.

## Privacy / cloud AI

- `PrivacyManager` used in editor summary, OCR modal, recovery sheet, storage dashboard.
- `geminiService` asserts network + consent on direct Google path and proxy OCR.
- Continue ratcheting ESLint warnings (budget 620).

## Device checklist (user)

1. Build REAL Whisper APK → download model → offline transcribe.
2. Configure OAuth secrets → Android SSO round-trip with deep link.
3. Optional: publish `assetlinks.json` for verified App Links.
