# VellumScribe audit checklist

Track audit findings on `main` (updated after conflict UI + sketch hydration).

## P0 — Correctness / security

- [x] Write-first primary bar + Attach / More
- [x] Modal prop alignment
- [x] Draft recovery + locked-note draft safety
- [x] Locked-note UI gate + `saveUnlockedNote` / `onUnlockSession`
- [x] AI provenance + audio playback strip
- [x] Orphan cleanup (CI orphans gate)
- [x] Google AI consent + network asserts

## P1 — Write-first parity

- [x] Location / reminder
- [x] Voice memos + OCR list
- [x] Sketch binary path (`sketch_media_key` save + hydrate)
- [x] Focus mode + onboarding

## P2 — Settings IA

- [x] Simple / Advanced mode
- [x] DiagnosticsTools (log export + FTS rebuild)
- [x] ConflictResolverPanel (open conflicts + resolve)

## Device / ops (not automatable in CI)

- [ ] Whisper REAL APK + model download smoke on hardware
- [ ] OAuth App Links E2E on Android (Google / Microsoft)
- [ ] Continue ESLint warning cleanup (budget 620; ~615 today)

## Notes

In-repo audit checklist items are complete. Remaining work is hardware/credentials validation and incremental lint hygiene.
