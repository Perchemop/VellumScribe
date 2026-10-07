#!/usr/bin/env python3
"""Idempotent D/P/U residual patches."""
from pathlib import Path
import re

# P-04 sync backoff
p = Path("src/lib/cloudSync.ts")
t = p.read_text()
if "consecutiveFailures" not in t:
    t = t.replace(
        "// Process items sequentially\n      for (const item of [...queue]) {\n        try {",
        "// Process items sequentially with exponential backoff after failures\n      let consecutiveFailures = 0;\n      for (const item of [...queue]) {\n        if (consecutiveFailures > 0) {\n          const delayMs = Math.min(30000, 1000 * Math.pow(2, consecutiveFailures - 1));\n          await new Promise((r) => setTimeout(r, delayMs));\n        }\n        try {",
        1,
    )
    t = t.replace(
        "if (success) {\n            successCount++;\n            this.removeFromSyncQueue(item.id);\n          } else {\n            failedCount++;\n            item.attempts++;\n            item.lastError = 'Sync failed during queue execution';\n            SyncRepository.markFailed(item.id, item.lastError).catch(() => {});\n          }\n        } catch (e: any) {\n          failedCount++;\n          item.attempts++;\n          const errorMsg = e?.message || 'Network exception';\n          item.lastError = errorMsg;\n          SyncRepository.markFailed(item.id, errorMsg).catch(() => {});\n          break; // Stop further queue attempts if network error occurs\n        }",
        "if (success) {\n            successCount++;\n            consecutiveFailures = 0;\n            this.removeFromSyncQueue(item.id);\n          } else {\n            failedCount++;\n            consecutiveFailures++;\n            item.attempts++;\n            item.lastError = 'Sync failed during queue execution';\n            SyncRepository.markFailed(item.id, item.lastError).catch(() => {});\n            if (consecutiveFailures >= 3) break;\n          }\n        } catch (e: any) {\n          failedCount++;\n          consecutiveFailures++;\n          item.attempts++;\n          const errorMsg = e?.message || 'Network exception';\n          item.lastError = errorMsg;\n          SyncRepository.markFailed(item.id, errorMsg).catch(() => {});\n          if (consecutiveFailures >= 3) break;\n        }",
        1,
    )
    p.write_text(t)
    print("OK sync backoff")
else:
    print("skip sync")

# P-02 passphrase on CloudBackupCrypto - inject methods before encryptArchive
p2 = Path("src/lib/cloudBackupCrypto.ts")
t2 = p2.read_text()
if "setUserBackupPassphrase" not in t2:
    methods = '''
  private static readonly BACKUP_PASSPHRASE_SESSION = 'vs_cloud_backup_passphrase';
  private static readonly BACKUP_PASSPHRASE_HINT = 'vs_cloud_backup_passphrase_hint';

  /** Optional user passphrase for multi-device restore (session-scoped; not uploaded). */
  public static setUserBackupPassphrase(passphrase: string | null): void {
    try {
      if (!passphrase || !passphrase.trim()) {
        sessionStorage.removeItem(this.BACKUP_PASSPHRASE_SESSION);
        localStorage.removeItem(this.BACKUP_PASSPHRASE_HINT);
        return;
      }
      const trimmed = passphrase.trim();
      sessionStorage.setItem(this.BACKUP_PASSPHRASE_SESSION, trimmed);
      localStorage.setItem(this.BACKUP_PASSPHRASE_HINT, String(trimmed.length));
    } catch {
      /* ignore */
    }
  }

  public static getUserBackupPassphrase(): string | undefined {
    try {
      return sessionStorage.getItem(this.BACKUP_PASSPHRASE_SESSION) || undefined;
    } catch {
      return undefined;
    }
  }

  public static hasUserBackupPassphraseConfigured(): boolean {
    try {
      return Boolean(localStorage.getItem(this.BACKUP_PASSPHRASE_HINT));
    } catch {
      return false;
    }
  }

'''
    t2 = t2.replace(
        "  /**\n   * Compresses with GZIP and encrypts with AES-256-GCM.",
        methods + "  /**\n   * Compresses with GZIP and encrypts with AES-256-GCM.",
        1,
    )
    t2 = t2.replace(
        "const passphrase = userPassphrase?.trim() || (await this.getClientVaultKeyAsync());",
        "const passphrase =\n      userPassphrase?.trim() ||\n      this.getUserBackupPassphrase() ||\n      (await this.getClientVaultKeyAsync());",
        1,  # only encrypt path first
    )
    # decrypt should also try user passphrase
    t2 = t2.replace(
        "const passphrase = userPassphrase?.trim() || (await this.getClientVaultKeyAsync());\n    const key = await this.deriveKey(passphrase, envelope.salt);",
        "const passphrase =\n      userPassphrase?.trim() ||\n      this.getUserBackupPassphrase() ||\n      (await this.getClientVaultKeyAsync());\n    const key = await this.deriveKey(passphrase, envelope.salt);",
        1,
    )
    p2.write_text(t2)
    print("OK passphrase")
else:
    print("skip passphrase")

# P-03 App settings type
p3 = Path("src/App.tsx")
t3 = p3.read_text()
old_type = "useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics'>('cloud')"
new_type = "useState<'cloud' | 'ai' | 'offline-ai' | 'storage' | 'security' | 'diagnostics' | 'about'>('cloud')"
if old_type in t3:
    t3 = t3.replace(old_type, new_type)
    print("OK settings type")
elif "offline-ai" in t3:
    print("skip type")
else:
    print("WARN type marker missing")

# U-01 hide settings btn on md+
if 'id="open-app-settings-btn"' in t3 and "md:hidden" not in t3[t3.find('id="open-app-settings-btn"'):t3.find('id="open-app-settings-btn"')+400]:
    t3 = re.sub(
        r'(id="open-app-settings-btn"[\s\S]{0,350}?className=\{`)([^`]+)(`)',
        lambda m: m.group(1) + m.group(2) + (" md:hidden" if "md:hidden" not in m.group(2) else "") + m.group(3),
        t3,
        count=1,
    )
    print("OK hide settings md")
else:
    print("skip hide settings")

p3.write_text(t3)

# live_transcript on RecordingRecord
p4 = Path("src/types.ts")
t4 = p4.read_text()
if "live_transcript?:" not in t4:
    t4 = t4.replace(
        "  status?: string;\n}\n\nexport interface TranscriptRecord",
        "  status?: string;\n  /** Optional OS/live dictation text captured during recording */\n  live_transcript?: string;\n}\n\nexport interface TranscriptRecord",
        1,
    )
    p4.write_text(t4)
    print("OK live_transcript type")
else:
    print("skip type live")

print("ALL DONE")
