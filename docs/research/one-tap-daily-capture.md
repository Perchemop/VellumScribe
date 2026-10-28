# Research note — One-tap daily voice capture

**Status: PROPOSED — awaiting the human gate (guide §2.3, §8.4). Nothing here
may be implemented until the owner approves this note.**

Date drafted: 2026-10-28

## Observed public behaviour

Obsidian's Daily notes core plugin makes a dated note a **one-action**
operation: invoke it and today's note exists, open, ready to write — no
folder choice, no title step (https://help.obsidian.md/Plugins/Daily+notes).
Voicenotes positions voice capture as the fastest possible entry into a
usable note ("The notetaker for your confidential meetings… Turn every
meeting into notes you can trust", https://voicenotes.com/).

## Why it matters here

`docs/inspiration.md` already claims "fast capture over filing" as an
inspiration, and the event → note model serves structure, not speed. There
was previously a quick-mic affordance in the app which was removed during the
UX declutter pass (see `scripts/remove_quick_mic.py`); the honest reading is
that the _placement_ was wrong, not the capability. A dated capture entry —
voice or text, routed to the right event — is the capability worth
re-proposing with proper placement.

## What we would take (capability level)

- A single action, reachable from the home surface, that starts a new
  **today-anchored** capture: it resolves (or creates) the event for today's
  date and begins a voice recording (or a blank note) immediately.
- No modal cascade before capture: metadata can be completed afterwards —
  capture first, file later (the inspiration claim, made real).
- The previous quick-mic removal is respected: this is a redesigned entry
  point with its own acceptance criteria, not a revert.

## What we would NOT take

- Auto-upload, auto-transcribe-without-consent, or any behaviour that
  captures audio without an explicit user action.
- Any change to the event → note data model.

## Acceptance criteria (if approved)

1. One action from the home surface starts a today-anchored recording or
   note in ≤ 2 interactions total.
2. If today's event does not exist it is created silently (title = date);
   if it exists, the capture lands in it.
3. The recording is a normal CAP-004 recording — same persistence,
   provenance and transcription paths.
4. Headless test covers today-event resolution (create/reuse) and the
   capture landing in the correct event; a11y verified for the entry point.

## Sources (public, capability level only)

- https://help.obsidian.md/Plugins/Daily+notes — one-action dated note.
- https://voicenotes.com/ — voice capture as the fastest entry to a note.
