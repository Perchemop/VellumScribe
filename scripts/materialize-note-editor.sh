#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
base64 -d "$ROOT/scripts/note-editor-impl.b64.gz" | gunzip > "$ROOT/src/components/NoteEditorImpl.tsx"
echo "Materialized NoteEditorImpl.tsx ($(wc -c < "$ROOT/src/components/NoteEditorImpl.tsx") bytes)"
