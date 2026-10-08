# StorageManager recovery (2026-10-08)

## Status

- Full `StorageManager` API restored on `main` (`c18e1e39` and later).
- Android APK **Build #199** succeeded with `whisper_mode=stub` on that commit.
- Runtime crashes from missing methods (`getNotesPage`, `getRecordingsForNote`) are fixed in source; install the latest APK artifact.
- `CloudSettingsPanel` mounted in SettingsView (orphan check).

## Install

1. Open Actions → **Build Android APK** → latest **success** run on `main`.
2. Download `VellumScribe-Android-APKs-stub` (or `-real`).
3. Uninstall the previous app (or clear data), then install the new debug APK.

## Key methods present

- Notes: `getNotesPage`, `updateNoteText`, `duplicateNote`, batch ops
- Media: `getRecordingsForNote`, `getOcrScansForNote`, `addRecording`, `deleteRecording`
- Security: `setNotePinLock`, `removeNotePinLock`, `verifyAndUnlockNote`, `saveUnlockedNote`
- Maintenance: `checkDatabaseIntegrity`, `vacuumDatabase`, `cleanOrphanedMedia`, export/import

## Known follow-ups

- ESLint baseline ~636 warnings (max-warnings=700); ratchet down over time.
- REAL Whisper NDK builds need upstream tree + model assets on device.
- Prefer uninstalling before upgrading after storage schema/API changes.
