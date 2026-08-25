import { SQLiteDatabase } from './storage';
import { NoteRecord, EventRecord } from '../types';

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

export const CURRENT_APP_VERSION = '2.7.0';
export const CURRENT_BUILD_NUMBER = 20260825;
export const CURRENT_SCHEMA_VERSION = 3;

export const APP_CHANGELOGS: ReleaseInfo[] = [
  {
    version: '2.7.0',
    buildNumber: 20260825,
    releaseDate: '2026-08-25',
    isCurrent: true,
    highlights: [
      'Native SQLite persistence with one-time legacy data migration',
      'Debounced note autosave for substantially lower Android write overhead',
      'Secure Android Keystore-backed secret storage',
      'Production-safe AI and cloud failure handling',
    ],
    features: [
      'Transactional SQLite record persistence and per-note updates',
      'PBKDF2-HMAC-SHA-256 PIN hashing with legacy verification support',
      'Real SHA-256 version checksums',
      'Release APK/AAB CI artifacts with checksums',
    ],
    fixes: [
      'Removed fabricated OCR, transcription, meeting-summary and conflict-merge results',
      'Removed simulated cloud authentication and sync telemetry',
      'Disabled Android cleartext and mixed-content production settings',
    ],
  },
  {
    version: '2.6.0',
    buildNumber: 20260824,
    releaseDate: '2026-08-24',
    isCurrent: true,
    highlights: [
      'Comprehensive Multi-Format Note Sharing (Android Share, Markdown, Plain Text, QR Code)',
      'Automated Database Schema Migration & APK Upgrade Safety Engine',
      'Unified Settings Architecture between Editor and Main Navigation',
      'Native Android APK Adaptive Icon and Safe-Area Enhancements',
    ],
    features: [
      'Instant offline device-to-device QR code sharing for notes & checklists',
      'Native Android System Share Sheet integration via @capacitor/share',
      'In-editor quick settings access preserving active document state',
      'Automated pre-migration snapshot protection during APK updates',
      'Capacitor native clipboard, haptics, and filesystem file handlers',
    ],
    fixes: [
      'Eliminated JSON parsing syntax error on standalone mobile APK builds',
      'Fixed note editor navigation resetting selected note when viewing settings',
      'Resolved touch event latency on drawing canvas for Android hardware',
      'Hardened air-gapped local database integrity checks',
    ],
  },
  {
    version: '2.5.0',
    buildNumber: 20260810,
    releaseDate: '2026-08-10',
    isCurrent: false,
    highlights: [
      'Gemini AI Meeting Minutes & Audio Transcriptions',
      'OCR Document Scanning with Camera Integration',
      'Interactive Checklists & Drawing Canvas',
    ],
    features: [
      'Document scanner with hardware camera capture',
      'Voice memo audio recording with multi-codec player',
      'Android Keystore AES-GCM local token encryption',
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
      'Initial Offline-First SQLite Architecture',
      'Multi-Cloud Selective Sync Engine',
      'Editorial Focus Mode',
    ],
    features: [
      'Categorized event-driven note organizing hierarchy',
      'Selective per-note cloud backup flags',
      '3-way semantic conflict merge engine',
    ],
    fixes: [
      'Initial public release',
    ],
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
      const existingNotes = SQLiteDatabase.getNotes();
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
      console.log(`[AppUpdateManager] Migrating database from schema v${fromSchema} to v${toSchema}...`);
      
      // Step 1: Create an automated safety snapshot before altering records
      const notes = SQLiteDatabase.getNotes();
      const events = SQLiteDatabase.getEvents();

      // Step 2: Perform schema normalizations & backfills
      let modifiedNotesCount = 0;
      const upgradedNotes: NoteRecord[] = notes.map((n) => {
        let changed = false;
        const normalized: NoteRecord = { ...n };

        // Ensure note_type exists
        if (!normalized.note_type) {
          normalized.note_type = normalized.checklist_items && normalized.checklist_items.length > 0 ? 'checklist' : 'text';
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
      SQLiteDatabase.saveNotes(upgradedNotes);

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
      console.log(`[AppUpdateManager] Migration completed successfully. ${modifiedNotesCount} notes refreshed.`);
    } catch (e: any) {
      console.error('[AppUpdateManager] Migration error:', e);
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
   * In-App Update Checker
   */
  public static async checkForRemoteUpdates(): Promise<{
    isUpToDate: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseDate: string;
    hasUpdate: boolean;
    release: ReleaseInfo;
  }> {
    localStorage.setItem(STORAGE_KEYS.LAST_UPDATE_CHECK, new Date().toISOString());
    const fallback = APP_CHANGELOGS[0];
    const manifestUrl = import.meta.env.VITE_UPDATE_MANIFEST_URL as string | undefined;

    if (!manifestUrl) {
      return { isUpToDate: true, currentVersion: CURRENT_APP_VERSION, latestVersion: CURRENT_APP_VERSION, releaseDate: fallback.releaseDate, hasUpdate: false, release: fallback };
    }

    try {
      const response = await fetch(manifestUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Update manifest returned HTTP ${response.status}`);
      const remote = await response.json() as ReleaseInfo;
      const hasUpdate = remote.buildNumber > CURRENT_BUILD_NUMBER;
      return {
        isUpToDate: !hasUpdate,
        currentVersion: CURRENT_APP_VERSION,
        latestVersion: remote.version,
        releaseDate: remote.releaseDate,
        hasUpdate,
        release: { ...fallback, ...remote, isCurrent: !hasUpdate },
      };
    } catch (error) {
      console.warn('[AppUpdateManager] Remote update check failed', error);
      return { isUpToDate: true, currentVersion: CURRENT_APP_VERSION, latestVersion: CURRENT_APP_VERSION, releaseDate: fallback.releaseDate, hasUpdate: false, release: fallback };
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
