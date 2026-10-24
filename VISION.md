# Vision

VellumScribe exists so that **nobody has to trade their privacy for a good
notes app**.

## The problem

Most note apps make you choose: a private local tool that is ugly and
feature-poor, or a polished cloud product that reads everything you write.
Meetings, interviews, medical notes, ideas at 2am — that material belongs to
the person who wrote it, not to a platform.

## What VellumScribe is

An offline-first, event-organised notebook: notes hang under the events of
your life (a meeting, a lecture, an interview), with audio recording,
on-device transcription, handwriting OCR, checklists, sketches, and versioned
revision history — all stored locally in SQLite on your device. Cloud backup
and BYOK AI providers exist but are **off by default** and consent-gated.

## What it is not (and will not become)

- **Not** a real-time collaboration platform, multi-user tool, or team wiki —
  out of scope for this major version (`docs/scope.md`).
- **Not** an open-ended AI chat assistant.
- **Not** a service that uploads your notes anywhere without you asking it to,
  each time, explicitly.
- **Not** a copy of any commercial product. Inspiration is behavioural only;
  every design, model, and interaction is original (`docs/design/brand.md`).

## The bar we hold ourselves to

- **No fake success states.** A feature says "unavailable" or fails loudly —
  it never fabricates a plausible result (see `AUDIT.md` for the project's
  history with this).
- **No data loss.** Writes are durable, versioned, and reversible; deletes are
  recoverable through the trash.
- **No silent network.** Anything that touches the network is opt-in and
  visible.
- **Evidence over claims.** `ROADMAP.md` readiness percentages move only on
  verified CI and tested behaviour.

This vision is the constitution for scope arguments: a proposed feature that
moves VellumScribe toward "private, honest, local notes" is welcome; one that
moves it away — however shiny — is not (`GOVERNANCE.md`).
