#!/usr/bin/env python3
from pathlib import Path
import re

p = Path('src/components/SettingsView.tsx')
t = p.read_text()

# Fix: button ... </button>\n        )}  leftover from unwrapping advanced-only
t = re.sub(
    r"(id=\"subtab-ai-key-btn\"[\s\S]*?</button>)\s*\)\}",
    r"\1",
    t,
    count=1,
)
t = re.sub(
    r"(id=\"subtab-storage-btn\"[\s\S]*?</button>)\s*\)\}",
    r"\1",
    t,
    count=1,
)

# Shorten AI tab label
t = t.replace(
    '<span>Speech &amp; AI Intelligence</span>',
    '<span>AI</span>',
)
t = t.replace(
    '<span>Speech & AI Intelligence</span>',
    '<span>AI</span>',
)
# Remove decorative green dot next to AI tab if present
t = re.sub(
    r"\s*<span className=\"w-2 h-2 rounded-full bg-emerald-500\" title=\"Offline-First Active\" />",
    '',
    t,
    count=1,
)

p.write_text(t)
print('fixed tabs')
print('stray after ai', bool(re.search(r'subtab-ai-key-btn[\s\S]{0,800}?\)\}', t)))
