#!/usr/bin/env python3
"""Register global OAuth deep-link listener in App.tsx (idempotent)."""
from pathlib import Path

p = Path("src/App.tsx")
text = p.read_text()

if "addAppUrlListener" in text:
    print("already patched")
    raise SystemExit(0)

marker = "    // Native OS & Web reminder reconciliation\n    ReminderService.reconcileReminders(notes).catch((e) => console.warn('Reminder reconciliation', e));\n  }, []);"

insert = """    // Native OS & Web reminder reconciliation\n    ReminderService.reconcileReminders(notes).catch((e) => console.warn('Reminder reconciliation', e));\n  }, []);\n\n  // Global OAuth / App Link return path (cold start & background)\n  // CloudConnectModal also listens while open; this covers returns when modal is not mounted.\n  useEffect(() => {\n    const cleanup = NativeBridge.addAppUrlListener((url) => {\n      const lower = (url || '').toLowerCase();\n      const looksLikeOauth =\n        lower.includes('oauth') ||\n        lower.includes('cloud') ||\n        lower.includes('code=') ||\n        lower.includes('vellumscribe://') ||\n        lower.includes('com.vellumscribe.app://');\n      if (!looksLikeOauth) return;\n      CloudSyncEngine.fetchConfig()\n        .then(() => {\n          setActiveView('settings');\n          setSettingsSubtab('cloud');\n          showToast('Cloud account connected successfully.');\n        })\n        .catch(() => {\n          showToast('Returned from cloud sign-in. Open Settings → Cloud to verify.');\n        });\n    });\n    return cleanup;\n  }, [showToast]);"""

if marker not in text:
    raise SystemExit("marker not found")
text = text.replace(marker, insert, 1)
p.write_text(text)
print("patched App.tsx OAuth deep-link listener")
