#!/usr/bin/env python3
"""Wire ConflictResolverPanel into Settings diagnostics (idempotent)."""
from pathlib import Path

p = Path("src/components/SettingsView.tsx")
text = p.read_text()

if "ConflictResolverPanel" in text:
    print("already patched")
    raise SystemExit(0)

# Ensure DiagnosticsTools import exists, then add ConflictResolverPanel
if "from './settings/DiagnosticsTools'" in text:
    text = text.replace(
        "import { DiagnosticsTools } from './settings/DiagnosticsTools';",
        "import { DiagnosticsTools } from './settings/DiagnosticsTools';\nimport { ConflictResolverPanel } from './settings/ConflictResolverPanel';",
        1,
    )
elif "from './settings/AboutPanel'" in text:
    text = text.replace(
        "import { AboutPanel } from './settings/AboutPanel';",
        "import { AboutPanel } from './settings/AboutPanel';\nimport { DiagnosticsTools } from './settings/DiagnosticsTools';\nimport { ConflictResolverPanel } from './settings/ConflictResolverPanel';",
        1,
    )
else:
    raise SystemExit("import anchor missing")

# Prefer inserting after DiagnosticsTools usage
if "<DiagnosticsTools />" in text:
    text = text.replace(
        "<DiagnosticsTools />",
        "<DiagnosticsTools />\n            <ConflictResolverPanel />",
        1,
    )
else:
    marker = 'id="panel-diagnostics" role="tabpanel"'
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit("diagnostics panel missing")
    # find first > after marker then insert after opening div
    close = text.find(">", idx)
    text = text[: close + 1] + "\n            <ConflictResolverPanel />" + text[close + 1 :]

p.write_text(text)
print("patched ConflictResolverPanel into SettingsView")
