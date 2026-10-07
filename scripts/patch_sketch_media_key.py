#!/usr/bin/env python3
"""Persist sketches via MediaRepository + sketch_media_key in NoteEditorWriteFirst."""
from pathlib import Path

p = Path("src/components/NoteEditorWriteFirst.tsx")
text = p.read_text()

if "sketch_media_key" in text and "MediaRepository" in text:
    print("already patched")
    raise SystemExit(0)

if "import { MediaRepository }" not in text:
    old_imp = "import { StorageManager } from '../lib/storage';"
    new_imp = "import { StorageManager } from '../lib/storage';\nimport { MediaRepository } from '../lib/MediaRepository';"
    if old_imp not in text:
        raise SystemExit("import missing")
    text = text.replace(old_imp, new_imp, 1)

old = """        {showSketchModal && !lockedGate && (
          <SketchCanvasModal
            initialDataUrl={sketchData}
            onSave={(dataUrl: string) => {
              setSketchData(dataUrl);
              setShowSketchModal(false);
              const updated = StorageManager.updateNote(note.id, { sketch_data: dataUrl });
              if (updated) onNoteUpdated(updated);
            }}
            onClose={() => setShowSketchModal(false)}
          />
        )}"""

new = """        {showSketchModal && !lockedGate && (
          <SketchCanvasModal
            initialDataUrl={sketchData}
            onSave={(dataUrl: string) => {
              setSketchData(dataUrl);
              setShowSketchModal(false);
              void (async () => {
                try {
                  const mediaKey = `${generatePrefixedId('sketch')}.png`;
                  const res = await fetch(dataUrl);
                  const blob = await res.blob();
                  await MediaRepository.putBinary(mediaKey, blob);
                  const updated = StorageManager.updateNote(note.id, {
                    sketch_media_key: mediaKey,
                    sketch_data: undefined,
                  });
                  if (updated) onNoteUpdated(updated);
                } catch {
                  const updated = StorageManager.updateNote(note.id, { sketch_data: dataUrl });
                  if (updated) onNoteUpdated(updated);
                }
              })();
            }}
            onClose={() => setShowSketchModal(false)}
          />
        )}"""

if old not in text:
    raise SystemExit("sketch onSave marker missing")
p.write_text(text.replace(old, new, 1))
print("patched sketch media key")
