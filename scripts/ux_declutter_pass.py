#!/usr/bin/env python3
"""UX declutter: offline-first transcription defaults + trim verbose UI strings."""
from pathlib import Path
import re


def patch_orchestrator():
    p = Path('src/services/TranscriptionOrchestrator.ts')
    t = p.read_text()
    # Default policy: offline_only (Whisper / live dictation) before cloud
    t = t.replace(
        "const policy: TranscriptionPolicy = options.policy || 'local_first';",
        "const policy: TranscriptionPolicy = options.policy || 'offline_only';",
    )
    p.write_text(t)
    print('orchestrator: default offline_only')


def patch_audio_modal():
    p = Path('src/components/audio/AudioRecordingModal.tsx')
    t = p.read_text()
    t = t.replace(
        "? 'On-device Whisper ready'\n              : 'Live dictation + offline fallback (Whisper runtime not ready)'",
        "? 'On-device'\n              : 'Microphone only'",
    )
    t = t.replace(
        "setEngineLabel('Live dictation + offline fallback');",
        "setEngineLabel('Microphone');",
    )
    t = t.replace(
        "const policy = PrivacyManager.isNetworkAllowed() ? 'local_first' : 'offline_only';",
        "const policy = 'offline_only';",
    )
    t = t.replace('Record Audio Memo', 'Recording')
    t = t.replace('Stop & Transcribe', 'Stop')
    t = t.replace('Live dictation (device speech recognizer)', 'Live')
    p.write_text(t)
    print('audio modal simplified')


def patch_editor_policy():
    p = Path('src/components/NoteEditorWriteFirst.tsx')
    if not p.exists():
        return
    t = p.read_text()
    t = t.replace(
        "const policy = PrivacyManager.isNetworkAllowed() ? 'local_first' : 'offline_only';",
        "const policy = 'offline_only';",
    )
    p.write_text(t)
    print('editor upload policy offline_only')


def patch_audio_player():
    p = Path('src/components/AudioPlayerWidget.tsx')
    t = p.read_text()
    # Remove verbose Offline AI badge block in header meta line
    t = re.sub(
        r"\s*<span className=\"flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium\">\s*<WifiOff className=\"w-3 h-3\" /> Offline AI\s*</span>",
        '',
        t,
        count=1,
    )
    t = t.replace(
        "title={fullTranscript ? 'Re-transcribe recording offline' : 'Transcribe recording locally'}",
        "title={fullTranscript ? 'Re-transcribe' : 'Transcribe'}",
    )
    t = t.replace(
        "{isTranscribing ? 'Transcribing...' : fullTranscript ? 'Re-transcribe' : 'Transcribe'}",
        "{isTranscribing ? '…' : fullTranscript ? 'Retry' : 'Transcribe'}",
    )
    p.write_text(t)
    print('audio player declutter')


def patch_chrome_menu():
    p = Path('src/components/NoteEditorChrome.tsx')
    t = p.read_text()
    # Shorten noisy section labels
    t = t.replace('>Share & history<', '>Share<')
    t = t.replace('>Security & unlock…<', '>Unlock…<')
    t = t.replace('>Lock note…<', '>Lock<')
    t = t.replace('>Share & export<', '>Share<')
    t = t.replace('>Version history<', '>History<')
    t = t.replace('>App settings<', '>Settings<')
    t = t.replace('>Google AI key<', '>AI key<')
    t = t.replace('>AI summary<', '>Summarize<')
    t = t.replace('>Exit focus mode<', '>Exit focus<')
    t = t.replace('>Voice memo / recording<', '>Record voice<')
    t = t.replace('>Upload audio to transcribe<', '>Upload audio<')
    t = t.replace('>Scan document<', '>Scan<')
    # Drop the "Advanced" section header line noise if present
    t = re.sub(
        r"\s*<p className=\"px-4 pt-1 pb-1 text-\[11px\] font-semibold uppercase tracking-wide text-zinc-400\">\s*Advanced\s*</p>",
        '',
        t,
        count=1,
    )
    p.write_text(t)
    print('chrome labels shortened')


def main():
    patch_orchestrator()
    patch_audio_modal()
    patch_editor_policy()
    patch_audio_player()
    patch_chrome_menu()
    print('ux declutter done')


if __name__ == '__main__':
    main()
