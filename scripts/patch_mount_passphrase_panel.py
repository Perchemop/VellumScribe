#!/usr/bin/env python3
from pathlib import Path
p = Path("src/components/SettingsView.tsx")
t = p.read_text()
if "BackupPassphrasePanel" in t:
    print("already mounted")
    raise SystemExit(0)
# add import after first import block line with CloudConnectModal or similar
if "from './settings/BackupPassphrasePanel'" not in t:
    # insert near other settings imports
    if "from './settings/OfflineAiPanel'" in t:
        t = t.replace(
            "from './settings/OfflineAiPanel'",
            "from './settings/OfflineAiPanel'\nimport { BackupPassphrasePanel } from './settings/BackupPassphrasePanel'",
            1,
        )
    else:
        t = "import { BackupPassphrasePanel } from './settings/BackupPassphrasePanel';\n" + t

# Mount near cloud accounts section - look for common markers
markers = [
    "Encrypted cloud backups",
    "Cloud accounts",
    "id=\"settings-cloud\"",
    "activeTab === 'cloud'",
    "settingsSubtab === 'cloud'",
]
mounted = False
for m in markers:
    if m in t and "<BackupPassphrasePanel" not in t:
        # insert panel after first occurrence of a section open
        idx = t.find(m)
        # find next closing of a div-ish boundary - simpler: insert before marker line
        line_start = t.rfind("\n", 0, idx) + 1
        indent = "              "
        injection = f"{indent}<BackupPassphrasePanel />\n"
        t = t[:line_start] + injection + t[line_start:]
        mounted = True
        break
if not mounted:
    # append near end of file before last export - last resort inside cloud branch
    if "return (" in t and "<BackupPassphrasePanel" not in t:
        t = t.replace(
            "return (",
            "// Backup passphrase panel available for cloud tab consumers\n  const backupPassphrasePanel = <BackupPassphrasePanel />;\n  return (",
            1,
        )
        print("added const - manual place may be needed")
p.write_text(t)
print("SettingsView updated")
