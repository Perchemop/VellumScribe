import React, { useState } from 'react';
import { GitMerge, X, Check, Archive, ArrowDownUp } from 'lucide-react';
import { NoteRecord } from '../types';
import { StorageManager } from '../lib/storage';

interface MergeNotesModalProps {
  notes: NoteRecord[];
  initialSelectedIds?: number[];
  onMerged: (mergedNote: NoteRecord) => void;
  onClose: () => void;
}

export const MergeNotesModal: React.FC<MergeNotesModalProps> = ({
  notes,
  initialSelectedIds = [],
  onMerged,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<number[]>(
    initialSelectedIds.length > 0 ? initialSelectedIds : []
  );
  const [mergedTitle, setMergedTitle] = useState(() => {
    if (initialSelectedIds.length > 0) {
      const selectedNames = notes
        .filter((n) => initialSelectedIds.includes(n.id))
        .map((n) => n.title || 'Untitled')
        .slice(0, 3)
        .join(' & ');
      return `Merged: ${selectedNames}`;
    }
    return 'Consolidated Synthesis Notes';
  });
  const [archiveOriginals, setArchiveOriginals] = useState(false);

  const toggleSelect = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleMerge = () => {
    if (selectedIds.length < 2) return;
    const merged = StorageManager.mergeNotes(selectedIds, mergedTitle.trim());
    if (merged) {
      if (archiveOriginals) {
        StorageManager.batchArchiveNotes(selectedIds);
      }
      onMerged(merged);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/60 backdrop-blur-xs select-none">
      <div className="w-full sm:max-w-lg bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                Merge Notes
              </h3>
              <p className="text-[11px] text-zinc-500">Combine selected notes into a single document</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-zinc-500 block mb-1">
            New Consolidated Title
          </label>
          <input
            type="text"
            value={mergedTitle}
            onChange={(e) => setMergedTitle(e.target.value)}
            placeholder="e.g. Synthesis: Meeting Notes & Action Items"
            className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-zinc-400"
          />
        </div>

        {/* Notes Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-zinc-500">
              Select notes to combine ({selectedIds.length} chosen)
            </span>
            <button
              onClick={() => setSelectedIds(notes.map((n) => n.id))}
              className="text-[10px] text-zinc-600 dark:text-zinc-400 hover:underline"
            >
              Select All
            </button>
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto custom-minimal-scrollbar border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl p-2 bg-zinc-50/50 dark:bg-zinc-950/50">
            {notes.map((note) => {
              const isSelected = selectedIds.includes(note.id);
              return (
                <div
                  key={note.id}
                  onClick={() => toggleSelect(note.id)}
                  className={`p-2.5 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-white dark:bg-zinc-900 border border-zinc-900 dark:border-zinc-100 shadow-2xs'
                      : 'hover:bg-zinc-200/50 dark:hover:bg-zinc-850 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 ${
                        isSelected
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                          : 'border border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {note.title || 'Untitled'}
                    </span>
                  </div>

                  <span className="text-[10px] text-zinc-400 shrink-0">
                    {new Date(note.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Options */}
        <div className="pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-700 dark:text-zinc-300 select-none">
            <input
              type="checkbox"
              checked={archiveOriginals}
              onChange={(e) => setArchiveOriginals(e.target.checked)}
              className="rounded text-zinc-900 focus:ring-0"
            />
            <span>Archive original individual notes after merging</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <span className="text-xs text-zinc-400">
            {selectedIds.length >= 2 ? 'Ready to merge' : 'Select at least 2 notes'}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleMerge}
              disabled={selectedIds.length < 2}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-xs transition-opacity disabled:opacity-40"
            >
              Merge {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
