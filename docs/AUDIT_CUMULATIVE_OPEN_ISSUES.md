# Cumulative open issues — post D/P/U implementation

## Done in-repo

| ID       | Item                                                                        |
| -------- | --------------------------------------------------------------------------- |
| **P-01** | AudioRecordingModal → TranscriptionOrchestrator + liveCapturedText          |
| **P-05** | Live transcript on result + sessionStorage                                  |
| **P-02** | `CloudBackupCrypto` user passphrase API + `BackupPassphrasePanel` component |
| **U-04** | Capability-aware recording labels                                           |
| **D-03** | `public/.well-known/assetlinks.json` template (fill SHA-256)                |

## Still open (device / host / backlog)

| ID   | Severity | Item                                              |
| ---- | -------- | ------------------------------------------------- |
| D-01 | High     | REAL Whisper APK + model smoke                    |
| D-02 | High     | OAuth secrets + Android SSO E2E                   |
| D-03 | Med      | Host assetlinks with real release fingerprint     |
| D-04 | Med      | OEM SpeechRecognizer packs                        |
| D-05 | Low      | Cloud restore E2E on real providers               |
| P-03 | Low      | App settingsSubtab type widen (if not yet merged) |
| P-04 | Low      | Sync queue backoff (re-apply if bot conflict)     |
| U-01 | Low      | Hide desktop Settings icon redundancy             |
| U-02 | Low      | EventNotesList progressive disclosure (PRD)       |
| U-03 | Low      | SettingsView further extraction                   |
| L-01 | Low      | ESLint ratchet                                    |

## Note

One-off GitHub Actions patch scripts were retired by repo hygiene PR #49. Prefer direct source commits going forward.
