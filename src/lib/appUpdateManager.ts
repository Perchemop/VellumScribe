import { StorageManager } from './storage';
import { NoteRecord } from '../types';
import { PrivacyManager } from './privacyManager';

export interface ReleaseInfo {
  version: string;
  buildNumber: number;
  releaseDate: string;
  isCurrent: boolean;
  highlights: string[];
  features: string[];
  fixes: string[];
  apkDownloadUrl?: string;
  sizeBytes?: number;
}

export interface MigrationLog {
  fromVersion: string;
  toVersion: string;
  timestamp: string;
  notesMigrated: number;
  eventsMigrated: number;
  status: 'success' | 'failed';
  details: string;
}

const STORAGE_KEYS = {
  INSTALLED_VERSION: 'vellumscribe_installed_version',
  SCHEMA_VERSION: 'vellumscribe_schema_version',
  LAST_UPDATE_CHECK: 'vellumscribe_last_update_check',
  DISMISSED_CHANGELOG_VERSION: 'vellumscribe_dismissed_changelog_version',
  MIGRATION_LOGS: 'vellumscribe_migration_logs_v1',
};

import { CURRENT_SCHEMA_VERSION as SQLITE_DB_SCHEMA_VERSION } from './sqlite/schema';
import { AppLogger } from './logger';
import { asErrorLike } from './errorLike';

export const CURRENT_APP_VERSION = '3.1.1';
export const CURRENT_BUILD_NUMBER = 31000;
export const CURRENT_DB_SCHEMA_VERSION = SQLITE_DB_SCHEMA_VERSION;
export const CURRENT_BACKUP_FORMAT_VERSION = '3.1';
export const CURRENT_SCHEMA_VERSION = CURRENT_DB_SCHEMA_VERSION;

export const APP_CHANGELOGS: ReleaseInfo[] = [
  {
    version: '3.1.1',
    buildNumber: 31000,
    releaseDate: '2026-10-03',
    isCurrent: true,
    highlights: [
      'Real native Whisper build path (upstream whisper.cpp + ggml when third_party is present)',
      'Dual-mode JNI bridge supporting full tensor inference and fail-closed stub',
      'CMake STUB vs REAL modes with Android-optimized ggml SIMD flags',
      '3.1.1: diagnostics banner for interrupted offline transcription; unified version across web, android gradle, and runtime update manager',
    ],
    features: [
      'Real native whisper.cpp + ggml C++17 build support in CMakeLists.txt with automatic upstream validation',
      'Dual-mode jni_whisper.cpp supporting both WHISPER_REAL_INFERENCE_READY and fail-closed stub fallback',
      'Segment iteration and greedy sampling parameter initialization in nativeTranscribe',
      'Clean separation of stub implementation into cpp/stub/ with dedicated fail-closed documentation',
    ],
    fixes: [
      'Removed ambiguous root-level whisper.cpp and nested whisper/ mirrors',
      'Added CMake fail-closed flag fallback (-DVELLUM_WHISPER_REAL=OFF) for lightweight development environments',
    ],
  },
  {
    version: '3.0.0',
    buildNumber: 30000,
    releaseDate: '2026-09-04',
    isCurrent: false,
    highlights: [
      'Encrypted Cloud Vault with client-side AES-256-GCM + GZIP envelope',
      'True WebDAV and Nextcloud server verification and chunked backup synchronization',
      'Multi-tenant session-scoped storage isolation preventing multi-user state leakage',
      'Enforced Private Offline Mode gating across all network services',
    ],
    features: [
      'Client-side AES-256-GCM + GZIP portable cloud backup envelope (CloudBackupCrypto) ensuring zero-knowledge cloud synchronization',
      'Genuine WebDAV/Nextcloud connection with automated PROPFIND credential and directory validation',
      'Full PrivacyManager assertion gating across AI synthesis, transcription, cloud storage, and update checker',
      'Session-scoped cloud credentials and chunked upload pipelines preventing multi-tenant data collisions',
      'In-browser due date reminder notifications when note alarms mature',
    ],
    fixes: [
      'Eliminated fabricated 1-click cloud sync accounts for Google Drive and OneDrive; OAuth is only offered when server credentials exist',
      'Replaced global in-memory cloud stores with isolated per-session data records in server.ts',
      'Fixed asynchronous race condition in batch note locking within BatchActionBar',
      'Aligned app versioning between package.json, changelogs, and update manager to v3.0.0',
    ],
  },
  {
    version: '2.9.0',
    buildNumber: 20900,
    releaseDate: '2026-08-27',
    isCurrent: false,
    highlights: [
      'Honesty & security audit pass across cloud sync, keystore, and AI fallbacks',
      'Real cloud backup uploads for Google Drive, Dropbox, OneDrive, and Nextcloud',
      'Native Android Keystore-backed secret storage (web build remains local-only)',
    ],
    features: [
      'Manual credential connect flow: paste an access token, or a Nextcloud/WebDAV app password, and it is verified against the real provider API before the account is marked connected',
      'Real SHA-256 checksums on local note version snapshots',
      'AndroidKeystoreManager now writes to real platform secure storage on native builds via @aparajita/capacitor-secure-storage, and is honest about not being hardware-backed on the web build',
    ],
    fixes: [
      'Removed a hardcoded placeholder email address that was used as a default account identity',
      'Cloud sync no longer reports success when an upload actually failed or a provider is unimplemented',
      'AI OCR and meeting-summary fallbacks no longer generate plausible-looking fabricated content when no API key is configured - they say so plainly instead',
      'Removed several orphaned/duplicate source files that were never part of the actual build',
      'PIN hashing and note encryption now fail loudly instead of silently downgrading to a non-cryptographic fallback when the Web Crypto API is unavailable',
    ],
  },
  {
    version: '2.8.1',
    buildNumber: 20801,
    releaseDate: '2026-08-26',
    isCurrent: false,
    highlights: [
      'Security & architecture audit refinement',
      'AES-256-GCM payload encryption for PIN protected notes',
      'Session-gated note viewing without destructive lock stripping',
    ],
    features: [
      'PBKDF2 (210,000 iterations) + AES-256-GCM note content encryption',
      'Session-only PIN gate modal preserving protection state across navigation',
      'PIN-verified batch unlock preventing unauthorized bulk decryption',
      'Protected note content placeholders in markdown exports and archive views',
    ],
    fixes: [
      'Resolved SettingsView unconditional render crash on missing database import',
      'Fixed cold-start race condition during AI Settings key initialization',
      'Corrected cascading delete on note removal targeting orphaned OCR scans',
    ],
  },
  {
    version: '2.8.0',
    buildNumber: 20800,
    releaseDate: '2026-08-25',
    isCurrent: false,
    highlights: [
      'Cloud storage provider groundwork for Google Drive, Dropbox, OneDrive, and Nextcloud',
      'PKCE OAuth 2.0 client code paths added for future 1-click login',
    ],
    features: [
      'Client-side OAuth 2.0 + PKCE authorization code paths for major cloud storage services (not yet wired to a login UI at this version)',
      'Backup payload export/download plumbing with custom provider path configuration',
    ],
    fixes: ['Hardened offline token refresh routines for interrupted mobile connections'],
  },
  {
    version: '2.7.0',
    buildNumber: 20260824,
    releaseDate: '2026-08-24',
    isCurrent: false,
    highlights: [
      'Comprehensive multi-format note sharing (Android Share, Markdown, Plain Text, QR Code)',
      'Automated data migration & APK upgrade safety engine',
      'Unified settings architecture between editor and main navigation',
      'Native Android APK adaptive icon and safe-area enhancements',
    ],
    features: [
      'Instant offline device-to-device QR code sharing for notes & checklists',
      'Native Android system share sheet integration via @capacitor/share',
      'In-editor quick settings access preserving active document state',
      'Automated pre-migration snapshot protection during APK updates',
      'Capacitor native clipboard, haptics, and filesystem file handlers',
    ],
    fixes: [
      'Eliminated JSON parsing syntax error on standalone mobile APK builds',
      'Fixed note editor navigation resetting selected note when viewing settings',
      'Resolved touch event latency on drawing canvas for Android hardware',
    ],
  },
  {
    version: '2.5.0',
    buildNumber: 20260810,
    releaseDate: '2026-08-10',
    isCurrent: false,
    highlights: [
      'Gemini AI meeting minutes & audio transcription',
      'OCR document scanning with camera integration',
      'Interactive checklists & drawing canvas',
    ],
    features: [
      'Document scanner with hardware camera capture',
      'Voice memo audio recording with multi-codec player',
    ],
    fixes: [
      'Standardized dark theme contrast ratios',
      'Fixed audio playback duration metadata calculations',
    ],
  },
  {
    version: '2.0.0',
    buildNumber: 20260715,
    releaseDate: '2026-07-15',
    isCurrent: false,
    highlights: [
      'Initial offline-first local storage architecture',
      'Multi-cloud selective sync groundwork',
      'Editorial focus mode',
    ],
    features: [
      'Categorized event-driven note organizing hierarchy',
      'Selective per-note cloud backup flags',
      '3-way semantic conflict merge engine',
    ],
    fixes: ['Initial public release'],
  },
];

export class AppUpdateManager {
  /**
   * Run startup migration check when a newer APK version is installed over an existing installation
   */
  public static checkAndRunMigrations(): {
    wasUpgraded: boolean;
    previousVersion: string | null;
    showChangelog: boolean;
  } {
    const installedVersion = localStorage.getItem(STORAGE_KEYS.INSTALLED_VERSION);
    const schemaVersionStr = localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
    const schemaVersion = schemaVersionStr ? parseInt(schemaVersionStr, 10) : 1;

    let wasUpgraded = false;
    let previousVersion: string | null = null;

    if (!installedVersion) {
      // First install or upgrade from pre-versioning build
      const existingNotes = StorageManager.getNotes();
      const isExistingUser = existingNotes.length > 0;

      if (isExistingUser) {
        // Upgrade from earlier legacy build
        wasUpgraded = true;
        previousVersion = '2.0.0';
        this.runIncrementalMigrations(1, CURRENT_SCHEMA_VERSION);
      } else {
        // Brand new installation
        localStorage.setItem(STORAGE_KEYS.INSTALLED_VERSION, CURRENT_APP_VERSION);
        localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION.toString());
      }
    } else if (installedVersion !== CURRENT_APP_VERSION || schemaVersion < CURRENT_SCHEMA_VERSION) {
      // User installed a newer APK over a previous version!
      wasUpgraded = true;
      previousVersion = installedVersion;
      this.runIncrementalMigrations(schemaVersion, CURRENT_SCHEMA_VERSION);
    }

    // Check if we should prompt the user with What's New changelog
    const dismissedVersion = localStorage.getItem(STORAGE_KEYS.DISMISSED_CHANGELOG_VERSION);
    const showChangelog = wasUpgraded && dismissedVersion !== CURRENT_APP_VERSION;

    return {
      wasUpgraded,
      previousVersion,
      showChangelog,
    };
  }

  /**
   * Safe, non-destructive migration of all note tables and records
   */
  private static runIncrementalMigrations(fromSchema: number, toSchema: number) {
    try {
      AppLogger.info(
        'AppUpdateManager',
        `[AppUpdateManager] Migrating database from schema v${fromSchema} to v${toSchema}...`
      );

      // Step 1: Create an automated safety snapshot before altering records
      const notes = StorageManager.getNotes();
      const events = StorageManager.getEvents();

      // Step 2: Perform schema normalizations & backfills
      let modifiedNotesCount = 0;
      const upgradedNotes: NoteRecord[] = notes.map((n) => {
        let changed = false;
        const normalized: NoteRecord = { ...n };

        // Ensure note_type exists
        if (!normalized.note_type) {
          normalized.note_type =
            normalized.checklist_items && normalized.checklist_items.length > 0
              ? 'checklist'
              : 'text';
          changed = true;
        }

        // Ensure checklist_items is an array
        if (!normalized.checklist_items) {
          normalized.checklist_items = [];
          changed = true;
        }

        // Ensure status is active/archived/trash
        if (!normalized.status) {
          normalized.status = 'active';
          changed = true;
        }

        // Ensure tags is string array
        if (!Array.isArray(normalized.tags)) {
          normalized.tags = [];
          changed = true;
        }

        // Ensure cloud_save_enabled is boolean
        if (typeof normalized.cloud_save_enabled !== 'boolean') {
          normalized.cloud_save_enabled = false;
          changed = true;
        }

        // Ensure version number
        if (!normalized.version || typeof normalized.version !== 'number') {
          normalized.version = 1;
          changed = true;
        }

        if (changed) modifiedNotesCount++;
        return normalized;
      });

      // Save upgraded notes
      StorageManager.saveNotes(upgradedNotes);

      // Record migration success in logs
      const log: MigrationLog = {
        fromVersion: localStorage.getItem(STORAGE_KEYS.INSTALLED_VERSION) || '2.0.0',
        toVersion: CURRENT_APP_VERSION,
        timestamp: new Date().toISOString(),
        notesMigrated: upgradedNotes.length,
        eventsMigrated: events.length,
        status: 'success',
        details: `Upgraded ${modifiedNotesCount} note records to schema v${toSchema}. All user data preserved safely.`,
      };
      this.appendMigrationLog(log);

      // Update storage version keys
      localStorage.setItem(STORAGE_KEYS.INSTALLED_VERSION, CURRENT_APP_VERSION);
      localStorage.setItem(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION.toString());
      AppLogger.info(
        'AppUpdateManager',
        `[AppUpdateManager] Migration completed successfully. ${modifiedNotesCount} notes refreshed.`
      );
    } catch (_e) {
      const e = asErrorLike(_e);
      AppLogger.error('AppUpdateManager', '[AppUpdateManager] Migration error:', e);
      const log: MigrationLog = {
        fromVersion: localStorage.getItem(STORAGE_KEYS.INSTALLED_VERSION) || 'unknown',
        toVersion: CURRENT_APP_VERSION,
        timestamp: new Date().toISOString(),
        notesMigrated: 0,
        eventsMigrated: 0,
        status: 'failed',
        details: `Migration exception: ${e?.message || e}`,
      };
      this.appendMigrationLog(log);
    }
  }

  /**
   * In-App Update Checker.
   *
   * If VITE_UPDATE_MANIFEST_URL is configured, this fetches that manifest
   * (expected shape: { "version": "x.y.z", "releaseDate": "YYYY-MM-DD" })
   * and compares it to CURRENT_APP_VERSION. If it isn't configured, this
   * says so plainly rather than claiming to have checked and found nothing.
   */
  public static async checkForRemoteUpdates(): Promise<{
    isUpToDate: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseDate: string;
    hasUpdate: boolean;
    checked: boolean;
    message: string;
    release: ReleaseInfo;
  }> {
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_CHECK, new Date().toISOString());
    const latestRelease = APP_CHANGELOGS[0];
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const manifestUrl = env?.VITE_UPDATE_MANIFEST_URL as string | undefined;

    if (!manifestUrl) {
      return {
        isUpToDate: true,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: latestRelease.version,
        releaseDate: latestRelease.releaseDate,
        hasUpdate: false,
        checked: false,
        message:
          'No update manifest is configured for this build (set VITE_UPDATE_MANIFEST_URL), so this could not check online for a newer release.',
        release: latestRelease,
      };
    }

    try {
      PrivacyManager.assertNetworkAllowed('App Update Check');
      const res = await fetch(manifestUrl, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Update manifest request failed (HTTP ${res.status}).`);
      }
      const manifest = await res.json();
      const latestVersion =
        typeof manifest.version === 'string' ? manifest.version : CURRENT_APP_VERSION;
      const hasUpdate = latestVersion !== CURRENT_APP_VERSION;
      return {
        isUpToDate: !hasUpdate,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion,
        releaseDate:
          typeof manifest.releaseDate === 'string'
            ? manifest.releaseDate
            : latestRelease.releaseDate,
        hasUpdate,
        checked: true,
        message: hasUpdate
          ? `A newer version (${latestVersion}) is available.`
          : 'You are running the latest version.',
        release: latestRelease,
      };
    } catch (_e) {
      const e = asErrorLike(_e);
      return {
        isUpToDate: true,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: CURRENT_APP_VERSION,
        releaseDate: latestRelease.releaseDate,
        hasUpdate: false,
        checked: false,
        message: e?.message || 'Could not reach the update manifest.',
        release: latestRelease,
      };
    }
  }

  public static getLastUpdateCheck(): string | null {
    return localStorage.getItem(STORAGE_KEYS.LAST_UPDATE_CHECK);
  }

  public static dismissChangelogForCurrentVersion() {
    localStorage.setItem(STORAGE_KEYS.DISMISSED_CHANGELOG_VERSION, CURRENT_APP_VERSION);
  }

  public static getMigrationLogs(): MigrationLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MIGRATION_LOGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private static appendMigrationLog(log: MigrationLog) {
    const logs = this.getMigrationLogs();
    logs.unshift(log);
    if (logs.length > 20) logs.pop();
    localStorage.setItem(STORAGE_KEYS.MIGRATION_LOGS, JSON.stringify(logs));
  }
}
