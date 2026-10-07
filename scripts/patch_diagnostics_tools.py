#!/usr/bin/env python3
"""Inject DiagnosticsTools into SettingsView diagnostics panel (idempotent)."""
from pathlib import Path

p = Path("src/components/SettingsView.tsx")
text = p.read_text()

if "DiagnosticsTools" in text:
    print("already patched")
    raise SystemExit(0)

# Import
imp_old = "import { AboutPanel } from './settings/AboutPanel';"
imp_new = "import { AboutPanel } from './settings/AboutPanel';\nimport { DiagnosticsTools } from './settings/DiagnosticsTools';"
if imp_old not in text:
    raise SystemExit("import marker missing")
text = text.replace(imp_old, imp_new, 1)

# Insert at start of diagnostics panel body
marker = '''        {activeTab === 'diagnostics' && (
          <div id="panel-diagnostics" role="tabpanel" aria-labelledby="subtab-diagnostics-btn" className="max-w-4xl mx-auto space-y-5">
            {/* Android Mobile Platform & Performance Guidance Card */}'''

insert = '''        {activeTab === 'diagnostics' && (
          <div id="panel-diagnostics" role="tabpanel" aria-labelledby="subtab-diagnostics-btn" className="max-w-4xl mx-auto space-y-5">
            <DiagnosticsTools />
            {/* Android Mobile Platform & Performance Guidance Card */}'''

if marker not in text:
    raise SystemExit("diagnostics panel marker missing")
text = text.replace(marker, insert, 1)
p.write_text(text)
print("patched SettingsView diagnostics")
