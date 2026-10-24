import React, { useState, useEffect, useCallback } from 'react';
import { History, X, RotateCcw, Clock, Check, PlusCircle } from 'lucide-react';
import { NoteRecord, NoteRevisionRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { VersionControlManager } from '../lib/versionControl';
import { useModalBackHandler } from '../lib/modalBackStack';

interface NoteRevisionsModalProps {
  note: NoteRecord;
  onClose: () => void;
  onRestore: (restoredNote: NoteRecord) => void;
}

export const NoteRevisionsModal: React.FC<NoteRevisionsModalProps> = ({
  note,
  onClose,
  onRestore,
}) => {
  useModalBackHandler(true, onClose, 'note-revisions-modal');

  const [revisions, setRevisions] = useState<NoteRevisionRecord[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadRevisions = useCallback(() => {
    const list = StorageManager.getNoteRevisions(note.id);
    setRevisions(list);
    if (list.length > 0 && !selectedRevisionId) {
      setSelectedRevisionId(list[0].id);
    }
  }, [note.id, selectedRevisionId]);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  const handleSaveCurrentSnapshot = async () => {
    setIsSavingSnapshot(true);
    try {
      await VersionControlManager.saveVersionSnapshot(
        note,
        'Manual Checkpoint',
        'User triggered snapshot checkpoint'
      );
      loadRevisions();
      setSuccessMessage('Current snapshot saved as a revision checkpoint.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleRestore = (rev: NoteRevisionRecord) => {
    setRestoringId(rev.id);
    try {
      const restored = StorageManager.restoreNoteRevision(note.id, rev.id);
      if (restored) {
        setSuccessMessage(`Successfully restored to revision #${rev.version_number}.`);
        loadRevisions();
        onRestore(restored);
        setTimeout(() => {
          onClose();
        }, 800);
      }
    } finally {
      setRestoringId(null);
    }
  };

  const selectedRevision = revisions.find((r) => r.id === selectedRevisionId);

  return (
    <div
      id="note-revisions-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        id="note-revisions-modal-card"
        className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden text-zinc-900 dark:text-zinc-100"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Revision History
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[280px] sm:max-w-md">
                {note.title || 'Untitled Note'} &middot; {revisions.length} revision
                {revisions.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="revisions-create-snapshot-btn"
              onClick={handleSaveCurrentSnapshot}
              disabled={isSavingSnapshot}
              aria-label="Save snapshot of note now"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors disabled:opacity-50"
              title="Save snapshot of note now"
            >
              <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Save Snapshot</span>
            </button>
            <button
              id="revisions-modal-close-btn"
              onClick={onClose}
              aria-label="Close revision history"
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div className="px-5 py-2 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Body Layout */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
          {/* Revisions List (Left) */}
          <div className="md:col-span-5 overflow-y-auto p-3 space-y-2 max-h-[35vh] md:max-h-[55vh]">
            {revisions.length === 0 ? (
              <div className="text-center py-8 px-4 text-zinc-600 dark:text-zinc-500">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-medium">No revisions recorded yet</p>
                <p className="text-[11px] mt-1 text-zinc-600 dark:text-zinc-500">
                  Revisions are recorded automatically when editing or via AI synthesis.
                </p>
              </div>
            ) : (
              revisions.map((rev) => {
                const isSelected = rev.id === selectedRevisionId;
                const formattedDate = new Date(rev.created_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <button
                    key={rev.id}
                    id={`revision-item-${rev.id}`}
                    onClick={() => setSelectedRevisionId(rev.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-200 shadow-2xs'
                        : 'border-zinc-200/70 dark:border-zinc-800/70 hover:bg-zinc-50 dark:hover:bg-zinc-850/60 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        v{rev.version_number}
                      </span>
                      <span className="text-[10px] text-zinc-600 dark:text-zinc-500">
                        {formattedDate}
                      </span>
                    </div>
                    <div className="text-xs font-medium truncate mb-0.5">
                      {rev.title || 'Untitled'}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-600 dark:text-zinc-500">
                      <span className="truncate max-w-[130px]">{rev.reason || 'Snapshot'}</span>
                      <span>{rev.source || 'Local'}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Revision Preview (Right) */}
          <div className="md:col-span-7 flex flex-col p-4 overflow-y-auto max-h-[40vh] md:max-h-[55vh]">
            {selectedRevision ? (
              <div className="flex flex-col h-full space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-850 pb-2">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Revision #{selectedRevision.version_number}
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {new Date(selectedRevision.created_at).toLocaleString()} &middot;{' '}
                      {selectedRevision.source || 'Local'}
                    </p>
                  </div>
                  <button
                    id={`restore-revision-btn-${selectedRevision.id}`}
                    onClick={() => handleRestore(selectedRevision)}
                    disabled={restoringId === selectedRevision.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>
                      {restoringId === selectedRevision.id
                        ? 'Restoring...'
                        : 'Restore This Version'}
                    </span>
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-500 uppercase tracking-wider">
                    Title
                  </div>
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {selectedRevision.title || '(Empty title)'}
                  </div>
                </div>

                <div className="flex-1 space-y-1">
                  <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-500 uppercase tracking-wider">
                    Content
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-mono p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-100 dark:border-zinc-850/80 max-h-[220px] overflow-y-auto leading-relaxed">
                    {selectedRevision.body || '(Empty content)'}
                  </div>
                </div>

                {selectedRevision.content_hash && (
                  <div className="text-[10px] text-zinc-600 dark:text-zinc-500 flex items-center gap-1 pt-1">
                    <span>Checksum:</span>
                    <code className="font-mono bg-zinc-100 dark:bg-zinc-850 px-1 py-0.5 rounded text-[10px]">
                      {selectedRevision.content_hash}
                    </code>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-zinc-600 dark:text-zinc-400 p-6 text-center">
                Select a revision from the list to preview and restore its contents.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-850 bg-zinc-50/50 dark:bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>Restoring creates a new revision without destroying history.</span>
          <button
            id="revisions-footer-close-btn"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
