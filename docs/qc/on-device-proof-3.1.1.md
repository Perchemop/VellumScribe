# On-device proof checklist — v3.1.1

Owner-executed on a physical Android device (unblocks A-3 and R-3/C-5).
Every step records what to note down; "Works / Broken (+ banner text)" per
item is enough. Two builds are used, both **v3.1.1**, both signed:

> **2026-11-01 update (INFER_BEGIN crash fix):** the native Whisper path was
> fixed — `flash_attn` forced off for CPU builds, correct auto-language
> parameters, C++ exceptions caught at the JNI boundary, a native signal
> handler writing `NATIVE_CRASH | signal=… addr=…` plus a backtrace into this
> breadcrumb file, and a memory headroom gate. Re-run Part 2 and Part 3 with a
> **newly built** APK. Build that carries the fix: Actions →
> _Build & Package Android APK (real)_ → run `41258088806` → artifact
> `VellumScribe-Android-APKs-real` (`versionName=3.1.1 versionCode=30101
signed=true`, so it installs in place over the current copy). If the app
> still closes, the banner will now name the exact failing stage **and** the
> native signal/frames. A `FAIL_LOW_MEMORY` breadcrumb means the device
> genuinely lacked RAM — the message tells the user to free memory, it is not a
> silent failure.

| Build    | Where                       | File                                                 | Size     | Purpose                                               |
| -------- | --------------------------- | ---------------------------------------------------- | -------- | ----------------------------------------------------- |
| **REAL** | Actions → run `40853385643` | `VellumScribe-Android-APKs-real` → `app-release.apk` | ~76.5 MB | full app incl. native Whisper                         |
| **STUB** | Actions → run `40853370865` | `VellumScribe-Android-APKs-stub` → `app-release.apk` | ~15.2 MB | identical, native engine removed (crash differential) |

Download: GitHub → **VellumScribe → Actions** → open the run → **Artifacts** →
download → unzip → install the APK inside.

---

## Part 1 — Update-in-place proof (A-3)

Your installed copy already counts as the "old version". Do NOT uninstall first.

1. Open **Android Settings → Apps → VellumScribe** and note the version
   (should already read 3.1.1; if it reads 3.1.0 that is even better — write
   down which).
2. Create one short note with text you will recognise. Leave the app.
3. Install the **REAL** `app-release.apk` (v3.1.1) over the installed copy —
   tap the downloaded APK and confirm the install prompt.
4. Open the app.
   - **Pass (A-3):** the app opens, your note from step 2 is still there, no
     reinstall/uninstall was needed. Note: _updated in place, data kept._
   - **Fail:** Android refuses ("App not installed") or the note is gone.
     Note the exact message.
5. Check **Settings & AI → About & Guide** (or Android app info): the version
   must read **3.1.1**.

## Part 2 — On-device native Whisper (R-3 / C-5)

Still on the **REAL** build.

1. Open (or create) a note → tap the **record** control → speak for ~20
   seconds ("testing one two three, offline transcription check") → stop.
2. Tap **Transcribe** (or the transcription action on the recording).
3. Watch the progress card, then the transcript.
   - **Pass (R-3):** real words from your sentence appear in the transcript,
     with the engine badge showing the on-device engine. Note the badge text.
   - **Fail:** an error message appears — copy it; or the app closes (note
     whether a banner appears on the next launch — that banner is the new
     self-reporting diagnostics).
4. Also try the **live dictation** path while recording (if offered) and note
   whether words appear live.

## Part 3 — The upload-audio crash differential (STUB build)

This is the decisive test for the crash you reported.

1. Install the **STUB** `app-release.apk` (15 MB) **over** the real one — same
   signature, so it installs in place and keeps your data.
2. Confirm the version is still 3.1.1 (it is — the difference is invisible
   except through behaviour).
3. Repeat the exact original repro: **new note → upload audio → the same
   584 KB `.wav`**.
   - **If it no longer closes:** the crash was the native Whisper engine.
     Report "stub works" — I will then fix or gate the native path.
   - **If it still closes:** note that, and relaunch the app — an amber banner
     naming the exact failed stage appears; tap **Copy diagnostics** and send
     me that text (or screenshot the expanded details).
4. Either way, **Settings & AI → Advanced → Architecture & Logs → Export logs
   (JSON)** and send the file — it contains the full picture for both builds.

## Part 4 — Reinstall the REAL build afterwards

So you end on the full-featured app: install the **REAL** `app-release.apk`
again over the stub (it keeps your data) and confirm your notes/recordings are
still present.

---

## Reporting template (fill and send back)

```text
1. Update-in-place: Works / Broken — previous version was ___ ; note kept: Y/N
2. Version after update: 3.1.1 (Y/N)
3. Native transcription: Works / Error (message: ___) / App closed
4. Engine badge text (if visible): ___
5. Live dictation: Works / Broken / not offered
6. STUB build, same .wav: Works / App closed
7. Banner on relaunch (if any): text or "none"
8. Export logs sent: Y/N
```
