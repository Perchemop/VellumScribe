#!/usr/bin/env python3
"""Pass latest note recording id into TranscriptionRecoverySheet (idempotent)."""
from pathlib import Path

p = Path("src/components/NoteEditorWriteFirst.tsx")
text = p.read_text()

if "recordingId={recordings[0]?.id" in text or "recordingId={recordings[recordings.length" in text:
    print("already patched")
    raise SystemExit(0)

old = """        {showRecoverySheet && (
          <TranscriptionRecoverySheet
            isOpen={showRecoverySheet}
            onClose={() => setShowRecoverySheet(false)}
          />
        )}"""

new = """        {showRecoverySheet && (
          <TranscriptionRecoverySheet
            isOpen={showRecoverySheet}
            onClose={() => setShowRecoverySheet(false)}
            recordingId={recordings.length > 0 ? recordings[recordings.length - 1].id : undefined}
            onTranscribeSuccess={(transcript) => {
              if (transcript) {
                const newBody = body ? `${body}\n\n${transcript}` : transcript;
                handleBodyChange(newBody);
              }
              setShowRecoverySheet(false);
            }}
          />
        )}"""

if old not in text:
    raise SystemExit("recovery sheet marker missing in NoteEditorWriteFirst")
p.write_text(text.replace(old, new, 1))
print("patched recovery recordingId wiring")
