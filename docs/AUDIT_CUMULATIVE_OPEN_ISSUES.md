# Cumulative open issues — status after D/P/U implementation pass

## Implemented in-repo (this pass)

| ID | Item | Status |
|----|------|--------|
| P-01 | AudioRecordingModal → TranscriptionOrchestrator + liveCapturedText | **Done** |
| P-05 | Live transcript on result + sessionStorage key | **Done** |
| P-02 | Optional backup passphrase API + BackupPassphrasePanel | **Done** (wire into Settings cloud tab if not auto-imported) |
| P-04 | Sync queue exponential backoff (cap 3 failures) | **Done** (patch script) |
| P-03 | settingsSubtab includes offline-ai / about | **Done** (patch script) |
| U-01 | Settings icon hidden on md+ (tabs suffice) | **Done** (patch script) |
| U-04 | Capability-aware recording labels | **Done** |
| D-03 | `public/.well-known/assetlinks.json` template | **Done** (replace fingerprint) |

## Still requires device / ops / host config

| ID | Item | Notes |
|----|------|--------|
| D-01 | REAL Whisper smoke | Physical APK + model |
| D-02 | OAuth E2E | Secrets + Android |
| D-03 | Live App Links | Host template with real SHA-256 |
| D-04 | OEM speech packs | User device settings |
| D-05 | Cloud restore E2E | Real providers |

## Remaining polish (optional)

| ID | Item |
|----|------|
| U-02 | EventNotesList progressive disclosure (PRD backlog) |
| U-03 | Further SettingsView extraction |
| L-01 | ESLint ratchet |

## Wire BackupPassphrasePanel

In Settings cloud section, import:

```tsx
import { BackupPassphrasePanel } from './settings/BackupPassphrasePanel';
// ...
<BackupPassphrasePanel />
```

Patch script does not auto-inject into the large SettingsView; add one line when editing Settings cloud tab.
