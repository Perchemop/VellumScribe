import React, { useState, useMemo } from 'react';
import {
  Archive,
  RotateCcw,
  Trash2,
  Search,
  FileText,
  CheckSquare,
  PenTool,
  FolderArchive,
  LayoutGrid,
  List as ListIcon,
} from 'lucide-react';
import { NoteRecord, EventRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { useModalBackHandler } from '../lib/modalBackStack';
import { VirtualizedNotesList } from './VirtualizedNotesList';

interface ArchiveSectionProps {
  notes: NoteRecord[];
  events: EventRecord[];
  onSelectNote: (noteId: number) => void;
  onRefresh: () => void;
}

export const ArchiveSection: React.FC<ArchiveSectionProps> = ({
  notes,
  events,
  onSelectNote,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filter for archived notes only
  const archivedNotes = useMemo(() => {
    return notes.filter((n) => n.status === 'archived');
  }, [notes]);

  // Extract tags from archived notes
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    archivedNotes.forEach((n) => {
      (n.tags || []).forEach((t) => {
        if (t && t.trim()) tagSet.add(t.trim());
      });
    });
    return Array.from(tagSet).sort();
  }, [archivedNotes]);

  // Filtered according to search and tag
  const filteredNotes = useMemo(() => {
    return archivedNotes.filter((n) => {
      if (selectedTag && !(n.tags || []).includes(selectedTag)) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const titleMatch = (n.title || '').toLowerCase().includes(query);
        const bodyMatch = n.body.toLowerCase().includes(query);
        const tagMatch = (n.tags || []).some((t) => t.toLowerCase().includes(query));
        const eventMatch = events
          .find((e) => e.id === n.event_id)
          ?.title.toLowerCase()
          .includes(query);
        return titleMatch || bodyMatch || tagMatch || !!eventMatch;
      }
      return true;
    });
  }, [archivedNotes, selectedTag, searchQuery, events]);

  const [confirmDeleteNote, setConfirmDeleteNote] = useState<{ id: number; title: string } | null>(
    null
  );
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false);

  // Hardware back stack navigation integration
  useModalBackHandler(
    confirmDeleteNote !== null,
    () => setConfirmDeleteNote(null),
    'archive-delete-note'
  );
  useModalBackHandler(confirmRestoreAll, () => setConfirmRestoreAll(false), 'archive-restore-all');

  const handleUnarchive = (noteId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    StorageManager.unarchiveNote(noteId);
    onRefresh();
  };

  const handlePermanentDelete = (noteId: number, title?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmDeleteNote({ id: noteId, title: title || 'Untitled Note' });
  };

  const executePermanentDelete = () => {
    if (confirmDeleteNote) {
      StorageManager.deleteNote(confirmDeleteNote.id);
      setConfirmDeleteNote(null);
      onRefresh();
    }
  };

  const handleUnarchiveAll = () => {
    if (archivedNotes.length === 0) return;
    setConfirmRestoreAll(true);
  };

  const executeRestoreAll = () => {
    archivedNotes.forEach((n) => StorageManager.unarchiveNote(n.id));
    setConfirmRestoreAll(false);
    onRefresh();
  };

  const formatArchivedDate = (isoString?: string) => {
    if (!isoString) return 'Archived';
    try {
      const d = new Date(isoString);
      return `Archived ${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } catch {
      return 'Archived';
    }
  };

  return (
    <div
      id="archive-section-workspace"
      className="h-full overflow-y-auto custom-minimal-scrollbar bg-white dark:bg-[#0c0c0e] p-4 sm:p-8"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80 dark:border-zinc-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Archive className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 font-serif-editorial">
                Archive
              </h2>
              <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold rounded-full">
                {archivedNotes.length}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Archived notes are safely hidden from your main notes and timeline without being
              deleted.
            </p>
          </div>

          {archivedNotes.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  title="Grid view"
                  className={`p-1.5 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-zinc-750 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  title="List view"
                  className={`p-1.5 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-zinc-750 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>

              <button
                id="unarchive-all-btn"
                type="button"
                onClick={handleUnarchiveAll}
                aria-label="Restore all archived notes"
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium rounded-xl border border-zinc-200/80 dark:border-zinc-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore All</span>
              </button>
            </div>
          )}
        </div>

        {/* Search & Tag Filter Bar */}
        {archivedNotes.length > 0 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <input
                id="archive-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search archived notes..."
                className="w-full pl-9 pr-10 py-2 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 dark:placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-zinc-400 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  Clear
                </button>
              )}
            </div>

            {availableTags.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                <button
                  onClick={() => setSelectedTag(null)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    selectedTag === null
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  All Tags
                </button>
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                      selectedTag === tag
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {archivedNotes.length === 0 ? (
          <div className="py-20 text-center space-y-4 max-w-sm mx-auto">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-500 flex items-center justify-center">
              <FolderArchive className="w-7 h-7 stroke-[1.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                No archived notes
              </h3>
              <p className="text-xs text-zinc-600 dark:text-zinc-500 leading-relaxed">
                When you archive notes, they will appear here. Archive completed projects or old
                drafts to keep your primary notes organized and focused.
              </p>
            </div>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-600 dark:text-zinc-400">
            No archived notes match your search.
          </div>
        ) : viewMode === 'list' || filteredNotes.length > 30 ? (
          <div className="min-h-[400px]">
            <VirtualizedNotesList
              notes={filteredNotes}
              itemHeight={136}
              renderNote={(note) => {
                const event = events.find((e) => e.id === note.event_id);
                const previewText = note.body
                  ? note.body
                      .replace(/[#*`_~[\]()-]/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 140)
                  : 'Empty note';

                return (
                  <div
                    key={note.id}
                    id={`archived-note-card-${note.id}`}
                    onClick={() => onSelectNote(note.id)}
                    className="group relative p-3.5 bg-zinc-50/70 hover:bg-white dark:bg-[#121215] dark:hover:bg-[#16161a] border border-zinc-200/70 dark:border-zinc-800/80 rounded-2xl shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-[128px]"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectNote(note.id);
                      }
                    }}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {note.note_type === 'checklist' ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          ) : note.note_type === 'sketch' ? (
                            <PenTool className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" />
                          )}
                          <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                            {note.title || 'Untitled Note'}
                          </h4>
                        </div>

                        {event && (
                          <span className="shrink-0 px-2 py-0.5 text-[11px] font-medium rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                            {event.title}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {previewText}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-850 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        {formatArchivedDate(note.archived_at || note.updated_at)}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleUnarchive(note.id, e)}
                          aria-label="Restore to active notes"
                          title="Restore to active notes"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-2xs transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 text-zinc-500" />
                          <span>Restore</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handlePermanentDelete(note.id, note.title, e)}
                          aria-label="Delete note permanently"
                          title="Delete permanently"
                          className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          </div>
        ) : (
          /* Grid of Archived Notes */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredNotes.map((note) => {
              const event = events.find((e) => e.id === note.event_id);
              const previewText = note.body
                ? note.body
                    .replace(/[#*`_~[\]()-]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 140)
                : 'Empty note';

              return (
                <div
                  key={note.id}
                  id={`archived-note-card-${note.id}`}
                  onClick={() => onSelectNote(note.id)}
                  className="group relative p-4 bg-zinc-50/70 hover:bg-white dark:bg-[#121215] dark:hover:bg-[#16161a] border border-zinc-200/70 dark:border-zinc-800/80 rounded-2xl shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectNote(note.id);
                    }
                  }}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {note.note_type === 'checklist' ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : note.note_type === 'sketch' ? (
                          <PenTool className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 shrink-0" />
                        )}
                        <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {note.title || 'Untitled Note'}
                        </h4>
                      </div>

                      {/* Folder / Event tag */}
                      {event && (
                        <span className="shrink-0 px-2 py-0.5 text-xs font-medium rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {event.title}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                      {previewText}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-850 flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {formatArchivedDate(note.archived_at || note.updated_at)}
                    </span>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleUnarchive(note.id, e)}
                        aria-label="Restore to active notes"
                        title="Restore to active notes"
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-2xs transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Restore</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handlePermanentDelete(note.id, note.title, e)}
                        aria-label="Delete note permanently"
                        title="Delete permanently"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Single Archived Note Confirm Modal */}
      {confirmDeleteNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs select-none animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-[#16161a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Permanently Delete Note?
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 truncate">
                  &ldquo;{confirmDeleteNote.title}&rdquo; will be deleted permanently.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setConfirmDeleteNote(null)}
                className="px-4 py-2.5 min-h-[44px] text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executePermanentDelete}
                className="px-4 py-2.5 min-h-[44px] text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore All Confirm Modal */}
      {confirmRestoreAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs select-none animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-[#16161a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Restore All Notes?
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                  Move all {archivedNotes.length} archived notes back to your active notes list.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setConfirmRestoreAll(false)}
                className="px-4 py-2.5 min-h-[44px] text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRestoreAll}
                className="px-4 py-2.5 min-h-[44px] text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-2xs transition-colors"
              >
                Restore All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
