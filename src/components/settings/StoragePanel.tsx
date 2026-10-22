import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, CheckCircle2, AlertCircle, Download, ShieldCheck } from 'lucide-react';
import { StorageManager } from '../../lib/storage';
import { SqliteStats } from '../../lib/sqlite/sqliteRepository';
import { AppLogger } from '../../lib/logger';
import { asErrorLike } from '../../lib/errorLike';

interface StoragePanelProps {
  onRefreshNotes?: () => void;
}

export const StoragePanel: React.FC<StoragePanelProps> = ({ onRefreshNotes: _onRefreshNotes }) => {
  const [stats, setStats] = useState<SqliteStats | null>(null);
  const [lastDurableSave, setLastDurableSave] = useState<number | null>(null);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadMetrics = () => {
    try {
      setStats(StorageManager.getSqliteStats());
      setLastDurableSave(StorageManager.getLastDurableSaveTime());
    } catch (e) {
      AppLogger.warn('StoragePanel', 'Failed to read storage stats', e);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Local storage</div>
              <p className="text-xs text-zinc-500">Notes and media stay on this device.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadMetrics}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-zinc-200/80 dark:border-zinc-800 text-xs">
          <div>
            <span className="text-zinc-500 block">Size</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{formatBytes(stats?.databaseSizeBytes || 0)}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Notes</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{stats?.notesCount || 0}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Recordings</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{stats?.recordingsCount || 0}</span>
          </div>
          <div>
            <span className="text-zinc-500 block">Last save</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{formatTimestamp(lastDurableSave)}</span>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            setIsVacuuming(true);
            setMessage(null);
            try {
              const result = await StorageManager.vacuumDatabase();
              loadMetrics();
              setMessage({
                type: 'success',
                text: `Compacted · reclaimed ${(result.bytesReclaimed / 1024).toFixed(0)} KB`,
              });
            } catch (_err) {
              const err = asErrorLike(_err);
              setMessage({ type: 'error', text: err.message || 'Compact failed' });
            } finally {
              setIsVacuuming(false);
            }
          }}
          disabled={isVacuuming}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isVacuuming ? 'animate-spin' : ''}`} />
          Compact
        </button>

        <button
          type="button"
          onClick={async () => {
            setMessage(null);
            try {
              const res = await StorageManager.checkDatabaseIntegrity();
              const ok = res.status === 'ok';
              setMessage({
                type: ok ? 'success' : 'error',
                text: ok ? 'Storage looks healthy' : res.details || 'Integrity issue',
              });
            } catch {
              setMessage({ type: 'error', text: 'Check failed' });
            }
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Check
        </button>

        <button
          type="button"
          onClick={() => {
            try {
              const binary = StorageManager.exportSqliteBinary();
              const blob = new Blob([binary as any], { type: 'application/x-sqlite3' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `vellumscribe_${new Date().toISOString().slice(0, 10)}.sqlite`;
              a.click();
              URL.revokeObjectURL(url);
              setMessage({ type: 'success', text: 'Backup exported' });
            } catch {
              setMessage({ type: 'error', text: 'Export failed' });
            }
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>

        <button
          type="button"
          onClick={async () => {
            await StorageManager.flush();
            loadMetrics();
            setMessage({ type: 'success', text: 'Saved' });
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
        >
          Save now
        </button>
      </div>
    </div>
  );
};
