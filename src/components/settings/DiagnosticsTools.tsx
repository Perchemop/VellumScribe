import React, { useState } from 'react';
import { Download, RefreshCw, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { AppLogger } from '../../lib/logger';
import { SearchIndexQueue } from '../../lib/SearchIndexQueue';

/**
 * Diagnostics actions for Settings → Advanced → Diagnostics:
 * - Export in-memory logs (already redacted by AppLogger)
 * - Rebuild SQLite FTS search index
 */
export const DiagnosticsTools: React.FC = () => {
  const [ftsStatus, setFtsStatus] = useState<string | null>(null);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const handleExportLogs = () => {
    try {
      const json = AppLogger.exportLogsAsJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vellumscribe-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      AppLogger.info('Diagnostics', 'Exported application logs');
    } catch (e) {
      AppLogger.error('Diagnostics', 'Failed to export logs', e);
    }
  };

  const handleRebuildFts = async () => {
    setIsRebuilding(true);
    setFtsStatus(null);
    try {
      const { indexedCount } = await SearchIndexQueue.rebuildFullIndex();
      setFtsStatus(`Rebuilt search index for ${indexedCount} note(s).`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFtsStatus(`Rebuild failed: ${msg}`);
    } finally {
      setIsRebuilding(false);
    }
  };

  return (
    <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Diagnostics tools</h3>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Export recent in-app logs (secrets are redacted) or rebuild the full-text search index if search results look stale.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExportLogs}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 min-h-[44px]"
        >
          <Download className="w-3.5 h-3.5" />
          Export logs (JSON)
        </button>
        <button
          type="button"
          disabled={isRebuilding}
          onClick={() => void handleRebuildFts()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 min-h-[44px] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
          {isRebuilding ? 'Rebuilding…' : 'Rebuild search index'}
        </button>
      </div>
      {ftsStatus && (
        <p
          role="status"
          className="text-xs flex items-start gap-1.5 text-zinc-600 dark:text-zinc-300"
        >
          {ftsStatus.startsWith('Rebuild failed') ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          )}
          {ftsStatus}
        </p>
      )}
    </div>
  );
};
