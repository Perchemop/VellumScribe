#!/usr/bin/env python3
"""Apply remaining D/P/U priority code patches (idempotent)."""
from pathlib import Path

# --- P-04: processSyncQueue backoff ---
p = Path("src/lib/cloudSync.ts")
t = p.read_text()
old_loop = """      // Process items sequentially\n      for (const item of [...queue]) {\n        try {"""
new_loop = """      // Process items sequentially with exponential backoff after failures\n      let consecutiveFailures = 0;\n      for (const item of [...queue]) {\n        if (consecutiveFailures > 0) {\n          const delayMs = Math.min(30000, 1000 * Math.pow(2, consecutiveFailures - 1));\n          await new Promise((r) => setTimeout(r, delayMs));\n        }\n        try {"""
if "consecutiveFailures" not in t and old_loop in t:
    t = t.replace(old_loop, new_loop, 1)
    # on success reset, on fail increment instead of break-only
    t = t.replace(
        """          if (success) {\n            successCount++;\n            this.removeFromSyncQueue(item.id);\n          } else {\n            failedCount++;\n            item.attempts++;\n            item.lastError = 'Sync failed during queue execution';\n            SyncRepository.markFailed(item.id, item.lastError).catch(() => {});\n          }\n        } catch (e: any) {\n          failedCount++;\n          item.attempts++;\n          const errorMsg = e?.message || 'Network exception';\n          item.lastError = errorMsg;\n          SyncRepository.markFailed(item.id, errorMsg).catch(() => {});\n          break; // Stop further queue attempts if network error occurs\n        }""",
        """          if (success) {\n            successCount++;\n            consecutiveFailures = 0;\n            this.removeFromSyncQueue(item.id);\n          } else {\n            failedCount++;\n            consecutiveFailures++;\n            item.attempts++;\n            item.lastError = 'Sync failed during queue execution';\n            SyncRepository.markFailed(item.id, item.lastError).catch(() => {});\n            if (consecutiveFailures >= 3) break;\n          }\n        } catch (e: any) {\n          failedCount++;\n          consecutiveFailures++;\n          item.attempts++;\n          const errorMsg = e?.message || 'Network exception';\n          item.lastError = errorMsg;\n          SyncRepository.markFailed(item.id, errorMsg).catch(() => {});\n          if (consecutiveFailures >= 3) break;\n        }",
        1,
    )
    p.write_text(t)
    print("patched sync queue backoff")
else:
    print("sync queue already patched or marker missing")

# --- P-02: backup passphrase helpers on CloudBackupCrypto ---
p2 = Path("src/lib/cloudBackupCrypto.ts")
t2 = p2.read_text()
if "BACKUP_PASSPHRASE_STORAGE" not in t2:
    insert = """const CLIENT_VAULT_KEY_STORAGE = 'vs_client_vault_key_v1';\nconst PBKDF2_ITERATIONS = 210000;\nconst BACKUP_PASSPHRASE_STORAGE = 'vs_cloud_backup_passphrase_hint';\n\n  /** Optional user passphrase for multi-device restore (never sent to server). */\n  public static setUserBackupPassphrase(passphrase: string | null): void {\n    if (typeof localStorage === 'undefined') return;\n    if (!passphrase || !passphrase.trim()) {\n      localStorage.removeItem(BACKUP_PASSPHRASE_STORAGE);\n      return;\n    }\n    // Store only a presence flag + length hint — actual phrase kept in session for this tab\n    sessionStorage.setItem('vs_cloud_backup_passphrase', passphrase.trim());\n    localStorage.setItem(BACKUP_PASSPHRASE_STORAGE, String(passphrase.trim().length));\n  }\n\n  public static getUserBackupPassphrase(): string | undefined {\n    try {\n      return sessionStorage.getItem('vs_cloud_backup_passphrase') || undefined;\n    } catch {\n      return undefined;\n    }\n  }\n\n  public static hasUserBackupPassphraseConfigured(): boolean {\n    try {\n      return Boolean(localStorage.getItem(BACKUP_PASSPHRASE_STORAGE));\n    } catch {\n      return false;\n    }\n  }\n"""
    t2 = t2.replace(
        "const CLIENT_VAULT_KEY_STORAGE = 'vs_client_vault_key_v1';\nconst PBKDF2_ITERATIONS = 210000;\n",
        insert.replace("  public static", "export class CloudBackupCrypto_PLACEHOLDER\n").split("export class")[0]
        if False
        else None,
        1,
    )
    # simpler: inject methods before encryptArchive
    t2 = Path("src/lib/cloudBackupCrypto.ts").read_text()
    if "setUserBackupPassphrase" not in t2:
        marker = "  public static async encryptArchive(jsonString: string, userPassphrase?: string): Promise<Blob> {\n    const passphrase = userPassphrase?.trim() || (await this.getClientVaultKeyAsync());"
        methods = """  private static readonly BACKUP_PASSPHRASE_SESSION = 'vs_cloud_backup_passphrase';\n  private static readonly BACKUP_PASSPHRASE_HINT = 'vs_cloud_backup_passphrase_hint';\n\n  /** Optional user passphrase for multi-device restore (session-scoped; not uploaded). */\n  public static setUserBackupPassphrase(passphrase: string | null): void {\n    try {\n      if (!passphrase || !passphrase.trim()) {\n        sessionStorage.removeItem(this.BACKUP_PASSPHRASE_SESSION);\n        localStorage.removeItem(this.BACKUP_PASSPHRASE_HINT);\n        return;\n      }\n      const trimmed = passphrase.trim();\n      sessionStorage.setItem(this.BACKUP_PASSPHRASE_SESSION, trimmed);\n      localStorage.setItem(this.BACKUP_PASSPHRASE_HINT, String(trimmed.length));\n    } catch {\n      /* ignore */\n    }\n  }\n\n  public static getUserBackupPassphrase(): string | undefined {\n    try {\n      return sessionStorage.getItem(this.BACKUP_PASSPHRASE_SESSION) || undefined;\n    } catch {\n      return undefined;\n    }\n  }\n\n  public static hasUserBackupPassphraseConfigured(): boolean {\n    try {\n      return Boolean(localStorage.getItem(this.BACKUP_PASSPHRASE_HINT));\n    } catch {\n      return false;\n    }\n  }\n\n  public static async encryptArchive(jsonString: string, userPassphrase?: string): Promise<Blob> {\n    const passphrase =\n      userPassphrase?.trim() ||\n      this.getUserBackupPassphrase() ||\n      (await this.getClientVaultKeyAsync());"""
        if marker not in t2:
            raise SystemExit("encryptArchive marker missing")
        t2 = t2.replace(marker, methods, 1)
        p2.write_text(t2)
        print("patched backup passphrase")
    else:
        print("passphrase already present")
else:
    print("passphrase block skip")

# Re-read and ensure encryptArchive uses user passphrase
t2 = Path("src/lib/cloudBackupCrypto.ts").read_text()
if "this.getUserBackupPassphrase()" not in t2:
    t2 = t2.replace(
        "const passphrase = userPassphrase?.trim() || (await this.getClientVaultKeyAsync());",
        "const passphrase =\n      userPassphrase?.trim() ||\n      this.getUserBackupPassphrase() ||\n      (await this.getClientVaultKeyAsync());",
        1,
    )
    Path("src/lib/cloudBackupCrypto.ts").write_text(t2)
    print("wired passphrase into encryptArchive")

# --- P-03 + U-01: App.tsx settings type + hide desktop settings icon ---
p3 = Path("src/App.tsx")
t3 = p3.read_text()
t3 = t3.replace(
    "const [settingsSubtab, setSettingsSubtab] = useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics'>('cloud');",
    "const [settingsSubtab, setSettingsSubtab] = useState<'cloud' | 'ai' | 'offline-ai' | 'storage' | 'security' | 'diagnostics' | 'about'>('cloud');",
)
# Hide Settings icon on md+ where tab strip already shows Settings
if "/* Direct Settings Tab Button */" in t3 and "hidden md:hidden" not in t3:
    t3 = t3.replace(
        "{/* Direct Settings Tab Button */}\n              <button\n                id=\"open-app-settings-btn\"",
        "{/* Settings shortcut — mobile only (desktop uses center tabs) */}\n              <button\n                id=\"open-app-settings-btn\"",
        1,
    )
    # add md:hidden to className of settings button
    import re

    def hide_md(m):
        cls = m.group(1)
        if "md:hidden" in cls:
            return m.group(0)
        return m.group(0).replace(cls, cls + " md:hidden", 1)

    t3 = re.sub(
        r'(id="open-app-settings-btn"[\s\S]*?className=\{`)([^`]+)(`)',
        lambda m: m.group(1) + (m.group(2) if "md:hidden" in m.group(2) else m.group(2) + " md:hidden") + m.group(3),
        t3,
        count=1,
    )
p3.write_text(t3)
print("patched App.tsx settings")

# --- types: optional live_transcript on RecordingRecord ---
p4 = Path("src/types.ts")
t4 = p4.read_text()
if "live_transcript?:" not in t4:
    t4 = t4.replace(
        "  status?: string;\n}\n\nexport interface TranscriptRecord",
        "  status?: string;\n  /** Optional OS/live dictation text captured during recording */\n  live_transcript?: string;\n}\n\nexport interface TranscriptRecord",
        1,
    )
    p4.write_text(t4)
    print("added live_transcript to RecordingRecord")
else:
    print("live_transcript already on type")

print("patch_dpu_priorities done")
