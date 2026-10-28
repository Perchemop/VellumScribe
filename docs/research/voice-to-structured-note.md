# Research note — Voice-ramble → structured note (post-transcription clean-up)

**Status: PROPOSED — awaiting the human gate (guide §2.3, §8.4). Nothing here
may be implemented until the owner approves this note.**

Date drafted: 2026-10-28

## Observed public behaviour

AudioPen markets a single core loop: "Go from fuzzy thought to clear text" —
the user speaks freely, the product rewrites the rambling transcript into
polished, structured text (title, summary, lists), optionally in a chosen
style, and keeps the user's words editable afterwards
(https://audiopen.ai/). Otter.ai describes the same family of value on the
meeting side: "note organization, insight extraction, and summaries"
(https://otter.ai/features).

## Why it matters here

VellumScribe already transcribes (on-device Whisper, live dictation) and
already has an offline rule engine plus consent-gated cloud AI with
provenance badges. The missing step is the _rewrite pass_: today a raw
transcript lands as-is in the note body, and the user must edit it into shape
by hand.

## What we would take (capability level)

- A **post-transcription clean-up action**: one tap rewrites the transcript
  into a structured draft (title suggestion, short summary, action items)
  **in addition to** — never instead of — the raw transcript.
- Bounded and provenance-labelled: the rewrite records which engine produced
  it, exactly like transcription provenance today.
- Provider-agnostic: offline rules first; cloud (user key, consent-gated) as
  an opt-in upgrade. Same policy rails as existing AI actions.

## What we would NOT take

- Any always-on cloud processing, background upload of audio, or training on
  user content (the anti-pattern Voicenotes markets _against_, and which this
  product's privacy stance already forbids).
- Any chat-style free-form AI surface (explicitly out of scope, docs/scope.md).

## Acceptance criteria (if approved)

1. The clean-up action is available on any completed transcription and is
   clearly labelled with engine + provenance.
2. The raw transcript remains intact and retrievable after the rewrite.
3. With no cloud consent and no cloud key, the action either runs offline or
   says exactly why it cannot — never silently degrades.
4. A headless workflow test covers: transcript in → structured draft out →
   raw preserved → provenance recorded.

## Sources (public, capability level only)

- https://audiopen.ai/ — product page describing the voice→polished-text loop.
- https://otter.ai/features — note organization / summaries / insight
  extraction as a transcription-product capability.
