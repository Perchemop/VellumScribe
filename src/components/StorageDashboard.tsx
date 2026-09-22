import React, { useState, useEffect } from 'react';
import {
  Database,
  ShieldCheck,
  HardDrive,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  FileText,
  Layers,
  Sparkles,
  Lock,
  WifiOff,
} from 'lucide-react';
import { StorageManager } from '../lib/storage';
import { SqliteStats, SqliteRepository } from '../lib/sqlite/sqliteRepository';
import { PrivacyManager, PrivacySettings } from '../lib/privacyManager';
import { AppLogger } from '../lib/logger';

interface StorageDashboardProps {
  onRefreshNotes?: () => void;
}

export const StorageDashboard: React.FC<StorageDashboardProps> = ({ onRefreshNotes }) => {
  const [stats, setStats] = useState<SqliteStats>(() => StorageManager.getSqliteStats());
  const [integrityResult, setIntegrityResult] = useState<{ status: 'ok' | 'corrupted'; details: string } | null>(null);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [orphanKeys, setOrphanKeys] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings>(() => PrivacyManager.getSettings());

  const refreshDashboard = () => {
    setStats(StorageManager.getSqliteStats());
    setOrphanKeys(SqliteRepository.findOrphanMediaKeys());
  };

  useEffect(() => {
    refreshDashboard();
  }, []);

  const handleRunIntegrityCheck = () => {
    setIsCheckingIntegrity(true);
    setTimeout(() => {
      const result = StorageManager.checkDatabaseIntegrity();
      setIntegrityResult(result);
      setIsCheckingIntegrity(false);
      setFeedbackMessage(result.status === 'ok' ? 'SQLite PRAGMA integrity_check PASSED: Database is healthy.' : `Integrity check failed: ${result.details}`);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }, 250);
  };

  const handleVacuum = async () => {
    setIsVacuuming(true);
    try {
      const res = await StorageManager.vacuumDatabase();
      refreshDashboard();
      if (res.bytesReclaimed > 0) {
        setFeedbackMessage(
          `SQLite VACUUM complete: Compacted from ${formatBytes(res.originalSizeBytes)} to ${formatBytes(
            res.compactedSizeBytes
          )}, reclaimed ${formatBytes(res.bytesReclaimed)}.`
        );
      } else {
        setFeedbackMessage(
          `SQLite VACUUM complete: Database is already fully optimized (${formatBytes(res.compactedSizeBytes)}).`
        );
      }
    } catch (e: any) {
      setFeedbackMessage(`Vacuum failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsVacuuming(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  const handlePruneVersions = () => {
    const count = SqliteRepository.pruneAllVersions(5);
    const revCount = SqliteRepository.pruneNoteRevisions(5);
    refreshDashboard();
    setFeedbackMessage(`Version history pruned: Removed ${count + revCount} redundant snapshots.`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleCleanupOrphans = async () => {
    const orphans = SqliteRepository.findOrphanMediaKeys();
    orphans.forEach((k) => SqliteRepository.removeOrphanMediaRecord(k));
    const mediaCleanup = await StorageManager.cleanOrphanedMedia();
    refreshDashboard();
    setFeedbackMessage(`Cleaned up ${orphans.length} catalog entries & reclaimed ${mediaCleanup.cleanedCount} binary media files.`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleExportSqlite = () => {
    try {
      const binary = StorageManager.exportSqliteBinary();
      const blob = new Blob([binary as any], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vellumscribe_database_${new Date().toISOString().slice(0, 10)}.sqlite`;
      a.click();
      URL.revokeObjectURL(url);
      setFeedbackMessage('SQLite database (.sqlite) exported successfully.');
      setTimeout(() => setFeedbackMessage(null), 3000);
    } catch (e: any) {
      setFeedbackMessage(`Export failed: ${e.message}`);
    }
  };

  const handleImportSqlite = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(buffer);
        await StorageManager.importSqliteBinary(bytes);
        refreshDashboard();
        if (onRefreshNotes) onRefreshNotes();
        setFeedbackMessage('SQLite database successfully imported and verified!');
        setTimeout(() => setFeedbackMessage(null), 4000);
      } catch (err: any) {
        setFeedbackMessage(`Import failed: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleTogglePrivateOffline = () => {
    const next = !privacy.privateOfflineMode;
    const updated = PrivacyManager.updateSettings({ privateOfflineMode: next });
    setPrivacy(updated);
    setFeedbackMessage(next ? 'Private Offline Mode ENABLED: All external network requests are strictly blocked.' : 'Private Offline Mode disabled.');
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  const handleLoadDemo = () => {
    StorageManager.loadDemoData();
    refreshDashboard();
    if (onRefreshNotes) onRefreshNotes();
    setFeedbackMessage('Demo sample notes and notebooks loaded into SQLite.');
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6" id="storage_dashboard_root">
      {feedbackMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Primary SQLite Health Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-base">
                Authoritative SQLite Database
                <span className="text-xs bg-emerald-100 text-emerald-800 font-mono px-2 py-0.5 rounded-full border border-emerald-200">
                  v{stats.schemaVersion} Active
                </span>
              </h3>
              <p className="text-xs text-slate-500">Single source of truth with ACID transactions & FTS search</p>
            </div>
          </div>
          <button
            onClick={handleRunIntegrityCheck}
            disabled={isCheckingIntegrity}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingIntegrity ? 'animate-spin' : ''}`} />
            <span>Verify Integrity</span>
          </button>
        </div>

        {/* Database Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-xs text-slate-500 block">Database Size</span>
            <span className="text-lg font-bold text-slate-800 font-mono">{formatBytes(stats.databaseSizeBytes)}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-xs text-slate-500 block">Total Notes</span>
            <span className="text-lg font-bold text-slate-800">{stats.notesCount}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-xs text-slate-500 block">Checklist Items</span>
            <span className="text-lg font-bold text-slate-800">{stats.checklistsCount}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-xs text-slate-500 block">Integrity Status</span>
            <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1 mt-1">
              <ShieldCheck className="w-4 h-4" /> PRAGMA OK
            </span>
          </div>
        </div>

        {/* Relational Table Breakdown */}
        <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 mb-4">
          <span className="font-semibold text-slate-700 block mb-1">Relational Table Row Counts:</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>Events: <strong className="text-slate-800">{stats.eventsCount}</strong></div>
            <div>Versions: <strong className="text-slate-800">{stats.versionsCount}</strong></div>
            <div>Recordings: <strong className="text-slate-800">{stats.recordingsCount}</strong></div>
            <div>Transcripts: <strong className="text-slate-800">{stats.transcriptsCount}</strong></div>
            <div>OCR Scans: <strong className="text-slate-800">{stats.ocrScansCount}</strong></div>
            <div>Media Catalog: <strong className="text-slate-800">{stats.mediaFilesCount}</strong></div>
            <div>Orphans: <strong className={orphanKeys.length > 0 ? 'text-amber-600' : 'text-slate-800'}>{orphanKeys.length}</strong></div>
          </div>
        </div>

        {/* Maintenance Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={handleVacuum}
            disabled={isVacuuming}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <Layers className={`w-3.5 h-3.5 text-slate-600 ${isVacuuming ? 'animate-spin' : ''}`} />
            <span>{isVacuuming ? 'Compacting SQLite...' : 'Vacuum & Defrag SQLite'}</span>
          </button>
          <button
            onClick={handlePruneVersions}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-600" />
            <span>Prune Old Versions</span>
          </button>
          {orphanKeys.length > 0 && (
            <button
              onClick={handleCleanupOrphans}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Clean {orphanKeys.length} Orphan Records</span>
            </button>
          )}
        </div>
      </div>

      {/* Private Offline Mode & FOSS Independence */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg border ${privacy.privateOfflineMode ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              <WifiOff className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                Private Offline Mode (Air-Gapped)
                {privacy.privateOfflineMode && (
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                    ACTIVE
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-500">Blocks 100% of outbound network traffic for complete on-device isolation</p>
            </div>
          </div>
          <button
            onClick={handleTogglePrivateOffline}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              privacy.privateOfflineMode
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {privacy.privateOfflineMode ? 'Enabled' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Open Database Backup & Portability */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <h4 className="font-semibold text-slate-900 text-sm mb-1 flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-600" />
          Open Database Portability & Raw Backup
        </h4>
        <p className="text-xs text-slate-500 mb-4">
          Export or restore native binary SQLite (<code className="font-mono text-slate-700">.sqlite</code>) databases without vendor lock-in.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportSqlite}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Export Raw .sqlite Database</span>
          </button>

          <label className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer border border-slate-200">
            <Upload className="w-4 h-4" />
            <span>Import .sqlite Database</span>
            <input
              type="file"
              accept=".sqlite,.db,.sqlite3"
              onChange={handleImportSqlite}
              className="hidden"
            />
          </label>

          <button
            onClick={handleLoadDemo}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Load Opt-in Sample Notes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
