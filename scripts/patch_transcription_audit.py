#!/usr/bin/env python3
"""Apply transcription pipeline audit fixes (idempotent)."""
from pathlib import Path

# --- CloudGeminiEngine consent ---
p = Path("src/services/TranscriptionOrchestrator.ts")
text = p.read_text()
old = """    PrivacyManager.assertNetworkAllowed('Cloud Gemini Audio Transcription');

    let audioBlob = input.audioBlob;"""
new = """    PrivacyManager.assertNetworkAllowed('Cloud Gemini Audio Transcription');
    PrivacyManager.assertCloudAiConsent('Cloud Gemini Audio Transcription');

    let audioBlob = input.audioBlob;"""
if "assertCloudAiConsent('Cloud Gemini Audio Transcription')" not in text:
    if old not in text:
        raise SystemExit("orchestrator marker missing")
    text = text.replace(old, new, 1)
    p.write_text(text)
    print("patched CloudGeminiEngine consent")
else:
    print("orchestrator consent already present")

# --- OfflineAiManager capability honesty ---
p2 = Path("src/services/OfflineAiManager.ts")
t2 = p2.read_text()
old_caps = """      return {
        availableRamMb: null,
        cpuCores: null,
        architecture: null,
        androidApiLevel: null,
        availableStorageMb: null,
        batteryLevel: null,
        isCharging: null,
        recommendedModelId: 'whisper-base',
        isNativeEngineAvailable: false,
      };"""
new_caps = """      return {
        availableRamMb: null,
        cpuCores: null,
        architecture: null,
        androidApiLevel: null,
        availableStorageMb: null,
        batteryLevel: null,
        isCharging: null,
        recommendedModelId: 'whisper-base',
        isNativeEngineAvailable: false,
        nativeLibraryLoaded: false,
        inferenceRuntimeReady: false,
      };"""
if "inferenceRuntimeReady: false" not in t2:
    if old_caps not in t2:
        raise SystemExit("caps marker missing")
    t2 = t2.replace(old_caps, new_caps, 1)
    p2.write_text(t2)
    print("patched OfflineAiManager capability fallback")
else:
    print("caps already honest")

# --- Recovery sheet media_key + consent ---
p3 = Path("src/components/audio/TranscriptionRecoverySheet.tsx")
t3 = p3.read_text()
old_rec = """      if (!PrivacyManager.isNetworkAllowed()) {
        throw new Error('Network permission is blocked by Privacy Mode. Allow network in Settings to use Cloud AI.');
      }

      let targetBlob = audioBlob;
      if (!targetBlob && recordingId) {
        const rec = await RecordingRepository.getByIdAsync(recordingId);
        if (rec) {
          const { MediaRepository } = await import('../../lib/MediaRepository');
          targetBlob = (await MediaRepository.getBinary(rec.file_path)) || undefined;
        }
      }"""
new_rec = """      if (!PrivacyManager.isNetworkAllowed()) {
        throw new Error('Network permission is blocked by Privacy Mode. Allow network in Settings to use Cloud AI.');
      }
      if (!PrivacyManager.hasCloudAiConsent()) {
        throw new Error('Cloud AI consent is required. Grant consent in Settings → Privacy, or when prompted before cloud features.');
      }

      let targetBlob = audioBlob;
      if (!targetBlob && recordingId) {
        const rec = await RecordingRepository.getByIdAsync(recordingId);
        if (rec) {
          const { MediaRepository } = await import('../../lib/MediaRepository');
          const key = rec.media_key || rec.file_path;
          if (key) {
            targetBlob = (await MediaRepository.getBinary(key)) || undefined;
          }
        }
      }"""
if "hasCloudAiConsent()" not in t3 or "media_key || rec.file_path" not in t3:
    if old_rec not in t3:
        raise SystemExit("recovery marker missing")
    t3 = t3.replace(old_rec, new_rec, 1)
    p3.write_text(t3)
    print("patched TranscriptionRecoverySheet")
else:
    print("recovery already patched")

print("done")
