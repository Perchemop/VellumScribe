#!/usr/bin/env python3
from pathlib import Path
import re

p = Path('src/components/NoteEditorChrome.tsx')
c = p.read_text()
# Remove the entire quick mic button including the comment above it
pattern = re.compile(
    r'\s*/\* Quick Voice memo[^\*]*\*/\s*<button\b[^>]*id="note-voice-quick-btn"[\s\S]*?</button>',
    re.MULTILINE,
)
c2, n = pattern.subn('', c, count=1)
if n == 0:
    # Fallback: remove by id only
    pattern2 = re.compile(
        r'\s*<button\b[^>]*id="note-voice-quick-btn"[\s\S]*?</button>',
        re.MULTILINE,
    )
    c2, n = pattern2.subn('', c, count=1)
print('removed', n)
if n:
    p.write_text(c2)
assert 'note-voice-quick-btn' not in p.read_text()
print('ok')
