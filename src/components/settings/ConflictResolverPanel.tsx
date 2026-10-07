import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, GitMerge, RefreshCw } from 'lucide-react';
import { SyncConflictRecord } from '../../types';
import { StorageManager } from '../../lib/storage';
import { AppLogger } from '../../lib/logger';

function previewPayload(raw: string, max = 280): string {
  if (!raw) return '(empty)';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const title = typeof parsed.title === 'string' ? parsed.title : undefined;
    const body = typeof parsed.body === 'string' ? parsed.body : undefined;
    const version = parsed.version;
    const parts: string[] = [];
    if (title) parts.push(`Title: ${title}`);
    if (body) parts.push(body.length > 160 ? `${body.slice(0, 160)}…` : body);
    if (version !== undefined) parts.push(`v${String(version)}`);
    if (parts.length) return parts.join('\n');
  } catch {
    /* fall through */
  }
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

/**
 * Lists open optimistic-concurrency conflicts and lets the user keep local data
 * or dismiss the conflict record. Local data is already authoritative after a
 * failed expectedVersion write; "Keep local" marks the conflict resolved.
 */
export const ConflictResolverPanel: React.FC = () => {
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      setConflicts(StorageManager.getSyncConflicts('open') || []);
    } catch (e) {
      AppLogger.warn('ConflictResolver', 'Failed to load conflicts', e);
      setConflicts([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resolve = (id: string) => {
    setBusyId(id);
    try {
      StorageManager.resolveSyncConflict(id);
      AppLogger.info('ConflictResolver', `Resolved conflict ${id}`);
      refresh();
    } catch (e) {
      AppLogger.error('ConflictResolver', `Failed to resolve ${id}`, e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Sync conflicts</h3>
          {conflicts.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {conflicts.length} open
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 min-h-[44px] px-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Conflicts appear when a note was edited with a stale version (optimistic concurrency).
        Your local copy remains the current data; resolve dismisses the warning, or review payloads below.
      </p>

      {conflicts.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl px-3 py-2.5">
          <Check className="w-4 h-4 shrink-0" />
          No open conflicts.
        </div>
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {c.entity_type} · id {c.entity_id}
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Local v{c.local_version_id} vs expected/remote v{c.remote_version_id}
                    {c.detected_at
                      ? ` · ${new Date(c.detected_at).toLocaleString()}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-2">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Local</p>
                  <pre className="whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400 font-sans">
                    {previewPayload(c.local_payload)}
                  </pre>
                </div>
                <div className="rounded-lg bg-white/80 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-2">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Stale / remote</p>
                  <pre className="whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400 font-sans">
                    {previewPayload(c.remote_payload)}
                  </pre>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => resolve(c.id)}
                  className="min-h-[44px] px-3 rounded-xl text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
                >
                  Keep local & resolve
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
