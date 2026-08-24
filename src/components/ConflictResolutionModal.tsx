import React, { useState } from 'react';
import {
  GitMerge,
  Sparkles,
  CheckCircle2,
  Clock,
  History,
  X,
  FileText,
  RotateCcw,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { ConflictLog, ConflictStrategy, DocumentVersion } from '../types';
import { CloudSyncEngine } from '../lib/cloudSync';
import { SQLiteDatabase } from '../lib/storage';
import { GeminiApiService } from '../lib/geminiService';

interface ConflictResolutionModalProps {
  conflict?: ConflictLog | null;
  onResolved: (updatedBody: string) => void;
  onClose: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflict: initialConflict,
  onResolved,
  onClose,
}) => {
  const [conflicts, setConflicts] = useState<ConflictLog[]>(() => CloudSyncEngine.getConflicts());
  const [selectedConflict, setSelectedConflict] = useState<ConflictLog | null>(
    initialConflict || (conflicts.length > 0 ? conflicts[0] : null)
  );

  const [activeStrategy, setActiveStrategy] = useState<ConflictStrategy>(
    CloudSyncEngine.getDefaultStrategy()
  );

  const [isMerging, setIsMerging] = useState(false);
  const [mergedDraft, setMergedDraft] = useState<string>('');
  const [noteVersions, setNoteVersions] = useState<DocumentVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);

  React.useEffect(() => {
    if (selectedConflict) {
      const versions = CloudSyncEngine.getVersionsForNote(selectedConflict.document_id);
      setNoteVersions(versions);
      if (versions.length > 0) {
        setSelectedVersion(versions[0]);
      }
      setMergedDraft(selectedConflict.resolved_content || selectedConflict.local_content);
    }
  }, [selectedConflict]);

  const handleSelectConflict = (c: ConflictLog) => {
    setSelectedConflict(c);
  };

  const handleRunStrategy = async (strategy: ConflictStrategy) => {
    if (!selectedConflict) return;
    setIsMerging(true);

    let resolved = '';
    try {
      if (strategy === 'last_write_wins' || strategy === 'remote_priority') {
        resolved = selectedConflict.remote_content;
      } else if (strategy === 'local_priority') {
        resolved = selectedConflict.local_content;
      } else if (strategy === 'gemini_intelligent_merge') {
        const res = await GeminiApiService.intelligent3WayMerge(
          selectedConflict.base_content || '',
          selectedConflict.local_content,
          selectedConflict.remote_content,
          selectedConflict.document_title
        );
        resolved = res.mergedContent;
      } else {
        resolved = `### ${selectedConflict.document_title}\n\n#### Local Changes:\n${selectedConflict.local_content}\n\n#### Cloud Changes:\n${selectedConflict.remote_content}`;
      }

      setMergedDraft(resolved);
      setActiveStrategy(strategy);
    } catch (e) {
      console.error(e);
      setMergedDraft(selectedConflict.local_content);
    } finally {
      setIsMerging(false);
    }
  };

  const handleCommitResolution = () => {
    if (!selectedConflict || !mergedDraft) return;

    const note = SQLiteDatabase.getNoteById(selectedConflict.document_id);
    if (note) {
      CloudSyncEngine.saveVersionSnapshot(
        note,
        'Saved Version',
        'Updated from version manager'
      );
      SQLiteDatabase.updateNote(selectedConflict.document_id, {
        body: mergedDraft,
      });
    }

    CloudSyncEngine.updateConflict(selectedConflict.id, {
      status: 'resolved',
      resolved_content: mergedDraft,
      resolution_strategy: activeStrategy,
      resolved_by: activeStrategy === 'gemini_intelligent_merge' ? 'gemini_ai' : 'user_manual',
    });

    setConflicts(CloudSyncEngine.getConflicts());
    onResolved(mergedDraft);
    onClose();
  };

  const handleRollbackToVersion = (version: DocumentVersion) => {
    if (!selectedConflict) return;
    if (window.confirm(`Restore this saved version from ${new Date(version.created_at).toLocaleTimeString()}?`)) {
      SQLiteDatabase.updateNote(selectedConflict.document_id, { body: version.body });
      setMergedDraft(version.body);
      onResolved(version.body);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-xs">
      <div
        id="conflict-resolution-modal"
        className="w-full max-w-4xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Version History & Cloud Changes
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Review recent edits and resolve differences between devices
              </p>
            </div>
          </div>
          <button
            id="close-conflict-modal-btn"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Left Sidebar: Conflict Events & Versions */}
          <div className="md:col-span-4 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/60 dark:bg-zinc-950/40 overflow-y-auto p-4 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                Sync Updates
              </h3>
              <div className="space-y-2">
                {conflicts.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConflict(c)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedConflict?.id === c.id
                        ? 'border-zinc-900 dark:border-zinc-100 bg-white dark:bg-zinc-800/80 shadow-2xs'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px]">
                        {c.document_title}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          c.status === 'resolved'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {c.status === 'resolved' ? 'Synced' : 'Review Needed'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Version History List */}
            {noteVersions.length > 0 && (
              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                  Saved Snapshots ({noteVersions.length})
                </h3>
                <div className="space-y-1.5">
                  {noteVersions.map((v) => (
                    <div
                      key={v.id}
                      className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 block text-[11px]">
                          v{v.version_number} - {v.change_summary}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRollbackToVersion(v)}
                        className="px-2 py-1 text-[11px] border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Main Panel: Side by Side Diff & Smart Resolution */}
          <div className="md:col-span-8 flex flex-col h-full bg-white dark:bg-zinc-900 overflow-hidden">
            {selectedConflict ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Resolution Strategy Buttons */}
                <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/20 space-y-2">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                    Choose merge method:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleRunStrategy('gemini_intelligent_merge')}
                      disabled={isMerging}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeStrategy === 'gemini_intelligent_merge'
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                          : 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {isMerging ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      )}
                      Smart Merge
                    </button>

                    <button
                      onClick={() => handleRunStrategy('local_priority')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        activeStrategy === 'local_priority'
                          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      Keep This Device
                    </button>

                    <button
                      onClick={() => handleRunStrategy('remote_priority')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        activeStrategy === 'remote_priority'
                          ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      Keep Cloud Version
                    </button>
                  </div>
                </div>

                {/* Diff Preview Grid */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                        This Device
                      </span>
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono max-h-48 overflow-y-auto">
                        <pre className="whitespace-pre-wrap">{selectedConflict.local_content}</pre>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                        Cloud Backup
                      </span>
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono max-h-48 overflow-y-auto">
                        <pre className="whitespace-pre-wrap">{selectedConflict.remote_content}</pre>
                      </div>
                    </div>
                  </div>

                  {/* Editable Result Draft */}
                  <div className="space-y-1.5 pt-2">
                    <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                      Result to Save
                    </span>
                    <textarea
                      value={mergedDraft}
                      onChange={(e) => setMergedDraft(e.target.value)}
                      className="w-full h-40 p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-mono leading-relaxed text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Footer Save */}
                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2 bg-zinc-50/40 dark:bg-zinc-950/20">
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCommitResolution}
                    className="px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-2xs"
                  >
                    Save & Update Note
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-zinc-400 flex flex-col items-center justify-center h-full">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  All notes are up to date
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  No differences between device and cloud backup.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
