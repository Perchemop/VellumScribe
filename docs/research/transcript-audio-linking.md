# Research note — Transcript ↔ audio deep linking (tap a line, seek the recording)

**Status: APPROVED by the owner 2026-10-28 (human gate, guide §2.3/§8.4;
recorded in DECISIONS.md D-426). Implementation may proceed within the
acceptance criteria below.**

Date drafted: 2026-10-28

## Observed public behaviour

Otter.ai's product surface couples the transcript to the recording: the
transcript is the navigation for the audio — selecting text takes you to that
moment, and generated summaries/insights reference the underlying speech
(https://otter.ai/features — "Lecture transcripts, note organization, insight
extraction, and summaries"; the transcript is presented as a live, navigable
record).

## Why it matters here

VellumScribe stores recordings per note and keeps transcripts, but the two
are not navigably linked: to hear the sentence behind a paragraph the user
scrubs manually. The transcription pipeline already produces time-anchored
data — Whisper emits segment timestamps, and the resumable session API
already works in timed segments — so the capability is mostly wiring plus UI.

## What we would take (capability level)

- Persist segment-level timestamps with a transcript (when the engine
  provides them; honestly absent when it does not).
- In the note view, tapping a transcript segment seeks the audio player to
  that moment; playing from a position highlights nothing silently — the
  link is visual and reversible.

## What we would NOT take

- Any waveform rendering commitment, speaker diarisation, or cloud-assisted
  alignment — none are needed for the core behaviour and each is a scope
  expansion.

## Acceptance criteria (if approved)

1. A transcript produced by an engine that reports timestamps renders as
   tappable segments; tapping seeks playback to the segment start.
2. Transcripts without timestamps render exactly as today (no fake
   tappable segments) — honest degradation.
3. The media player state stays consistent with the note (no orphaned
   playback when the recording is deleted).
4. A headless test covers segment persistence and the seek-resolution
   mapping; UI behaviour is verified in CI screenshots.

## Sources (public, capability level only)

- https://otter.ai/features — transcript-as-navigation product behaviour.
