import React, { useState, useEffect } from 'react';
import { HardDrive, Database, RefreshCw, CheckCircle2, AlertCircle, Download, Upload, ShieldCheck, Zap } from 'lucide-react';
import { StorageManager } from '../../lib/storage';
import { SqliteStats } from '../../lib/sqlite/sqliteRepository';
import { AppLogger } from '../../lib/logger';

interface StoragePanelProps {
  onRefreshNotes?: () => void;
}

export const StoragePanel: React.FC<StoragePanelProps> = ({ onRefreshNotes }) => {
  const [stats, setStats] = useState<SqliteStats | null>(null);
  const [lastDurableSave, setLastDurableSave] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMetrics = () => {
    try {
      const s = StorageManager.getSqliteStats();
      setStats(s);
      const lds = StorageManager.getLastDurableSaveTime();
      setLastDurableSave(lds);
    } catch (e) {
      AppLogger.warn('StoragePanel', 'Failed to read SQLite stats', e);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const handleVacuum = async () => {
    setIsVacuuming(true);
    setMessage(null);
    try {
      const result = await StorageManager.vacuumDatabase();
      loadMetrics();
      setMessage({
        type: 'success',
        text: `Database compacted! Reclaimed ${(result.bytesReclaimed / 1024).toFixed(1)} KB.`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Vacuum failed' });
    } finally {
      setIsVacuuming(false);
    }
  };

  const handleCheckIntegrity = async () => {
    setMessage(null);
    try {
      const res = await StorageManager.checkDatabaseIntegrity();
      const isOk = res.status === 'ok';
      setIntegrityStatus(isOk ? 'OK: Database passed PRAGMA integrity_check.' : `Issue: ${res.details}`);
      setMessage({
        type: isOk ? 'success' : 'error',
        text: isOk ? 'SQLite PRAGMA integrity check verified: 100% healthy.' : `Integrity issue: ${res.details}`,
      });
    } catch {
      setMessage({ type: 'error', text: 'Integrity check error' });
    }
  };

  const handleExportDatabase = () => {
    try {
      const binary = StorageManager.exportSqliteBinary();
      const blob = new Blob([binary as any], {
        type: 'application/x-sqlite3',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vellumscribe_backup_${new Date().toISOString().slice(0, 10)}.sqlite`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Exported raw SQLite binary database.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: 'Failed to export SQLite database.' });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return 'Never (initial session)';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' on ' + date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-200/80 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
                SQLite Relational Persistence
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  v12 Schema
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Authoritative local database with full-text search indices, media asset tracking, and durable chunk checkpointing.
              </p>
            </div>
          </div>
          <button
            onClick={loadMetrics}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 transition"
            title="Refresh metrics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Durability status pill */}
        <div className="mt-4 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Last durable SQLite save:</span>
            <span className="font-mono text-emerald-400 font-medium">{formatTimestamp(lastDurableSave)}</span>
          </div>
          <button
            onClick={async () => {
              await StorageManager.flush();
              loadMetrics();
              setMessage({ type: 'success', text: 'Forced SQLite WAL checkpoint and durability flush.' });
            }}
            className="px-2.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-medium transition"
          >
            Flush Now
          </button>
        </div>

        {/* Storage Telemetry Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-500 block">Database Size</span>
            <span className="font-mono text-zinc-200 font-medium">{formatBytes(stats?.databaseSizeBytes || 0)}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Total Notes</span>
            <span className="font-mono text-zinc-200 font-medium">{stats?.notesCount || 0}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Recordings</span>
            <span className="font-mono text-zinc-200 font-medium">{stats?.recordingsCount || 0}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">SQLite Integrity</span>
            <span className="font-mono text-zinc-200 font-medium capitalize">{stats?.integrityStatus || 'OK'}</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Maintenance Controls */}
      <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-200/80 dark:border-zinc-800 space-y-4">
        <h4 className="text-sm font-medium text-zinc-200">Database Operations & Compaction</h4>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleVacuum}
            disabled={isVacuuming}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVacuuming ? 'animate-spin' : ''}`} />
            Run SQLite VACUUM
          </button>

          <button
            onClick={handleCheckIntegrity}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition flex items-center gap-2"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Verify PRAGMA Integrity
          </button>

          <button
            onClick={handleExportDatabase}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Export SQLite Binary
          </button>
        </div>
      </div>
    </div>
  );
};
