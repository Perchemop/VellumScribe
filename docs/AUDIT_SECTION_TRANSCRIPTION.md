# Audit section — Transcription pipeline

**Scope:** `TranscriptionOrchestrator`, engines, `OfflineAiManager`, recovery UI, capability gating.

## Architecture (as implemented)

```
AudioRecordingModal → RecordingRepository / MediaRepository
        ↓
TranscriptionOrchestrator.orchestrate(policy)
        ├─ AndroidWhisperEngine  (needs inferenceRuntimeReady)
        ├─ WebOfflineEngine      (live dictation / acoustic; no fabricated STT)
        └─ CloudGeminiEngine     (network + consent)
        ↓
TranscriptionRepository (durable job status)
```

### Engine selection (honest)

| Policy | Order |
|--------|--------|
| `offline_only` | Whisper if ready → live-text web offline → **fail closed** |
| `local_first` | Whisper → live-text offline → cloud Gemini |
| `cloud_only` / `cloud_allowed` | Cloud first (when network allowed) |

Placeholder transcripts ("### Audio Recording…", "speech activity detected…") are rejected and treated as engine failure — good honesty gate.

## Findings

### Fixed this pass

1. **CloudGeminiEngine** did not call `assertCloudAiConsent` (only network). Consent is now required before cloud audio STT.
2. **TranscriptionRecoverySheet** loaded audio via `rec.file_path` into `MediaRepository.getBinary` — should prefer **`media_key`**. Fixed with fallback.
3. Recovery sheet now checks **`hasCloudAiConsent`** before cloud path.
4. **OfflineAiManager** capability plugin failure fallback omitted `inferenceRuntimeReady` / `nativeLibraryLoaded` — now explicitly `false` so UI cannot assume REAL runtime.

### Remaining product / device gaps

| Item | Notes |
|------|--------|
| REAL Whisper | Requires NDK REAL build + model download; STUB correctly fails closed |
| Recovery sheet props | Editor often opens sheet without `recordingId` / `audioBlob` — cloud button needs a recording; improve wiring to pass last recording id |
| Live dictation capture | Must pass `liveCapturedText` into orchestrator for true offline web path without Whisper |
| OS SpeechRecognizer | OEM language packs still required (KNOWN_LIMITATIONS) |

### Strengths

- Single orchestrator with policy enum
- Durable job records + crash recovery via checkpoints
- Recovery UI explains stub vs cloud vs live dictation
- Offline structured extraction never invents owners/due dates

## Device smoke checklist

1. STUB APK: offline transcribe → expect clear unavailable message; recovery offers cloud/live dictation.
2. REAL APK + model: offline transcribe short clip → non-empty transcript, status COMPLETED.
3. Privacy offline mode: cloud path blocked.
4. Consent revoked: cloud path blocked with consent error.
