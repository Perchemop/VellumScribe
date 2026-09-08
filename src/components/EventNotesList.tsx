import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  FileText,
  Mic,
  Camera,
  Pin,
  X,
  Cloud,
  CheckSquare,
  PenTool,
  Bell,
  Archive,
  Trash2,
  Lock,
  MapPin,
  GitMerge,
  RotateCcw,
  LayoutGrid,
  List,
  CheckCircle2,
  Circle,
  MoreHorizontal,
  FolderPlus,
  Share2,
  Copy,
} from 'lucide-react';
import { EventRecord, NoteRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { BatchActionBar } from './BatchActionBar';
import { NoteShareModal } from './NoteShareModal';
import { useModalBackHandler } from '../lib/modalBackStack';

interface EventNotesListProps {
  events: EventRecord[];
  notes: NoteRecord[];
  selectedEventId: number | null;
  selectedNoteId: number | null;
  onSelectEvent: (eventId: number) => void;
  onSelectNote: (noteId: number) => void;
  onCreateEvent: (event: Omit<EventRecord, 'id'>) => void;
  onCreateNote: (eventId: number, type?: 'text' | 'checklist' | 'sketch') => void;
  onDeleteEvent: (eventId: number) => void;
  onDeleteNote: (noteId: number) => void;
  onRefresh: () => void;
}

type NoteTabFilter = 'all' | 'checklist' | 'sketch' | 'reminders' | 'archived' | 'trash';
type SortOption = 'updated' | 'created' | 'title' | 'reminder';

export const EventNotesList: React.FC<EventNotesListProps> = ({
  events,
  notes,
  selectedEventId,
  selectedNoteId,
  onSelectEvent,
  onSelectNote,
  onCreateEvent,
  onCreateNote,
  onDeleteEvent,
  onDeleteNote,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NoteTabFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [viewLayout, setViewLayout] = useState<'list' | 'grid'>('list');
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventCategory, setNewEventCategory] = useState<EventRecord['category']>('meeting');
  const [newEventColor, setNewEventColor] = useState('#3b82f6');

  // Debounce search query input (180ms) to avoid stuttering on large note collections
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 180);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Pre-aggregate counts for recordings and OCR scans to avoid N+1 scans in note render loops
  const recordingsCountMap = useMemo(() => {
    const map = new Map<number, number>();
    try {
      const all = StorageManager.getRecordings();
      for (const r of all) {
        if (r.note_id) {
          map.set(r.note_id, (map.get(r.note_id) || 0) + 1);
        }
      }
    } catch {}
    return map;
  }, [notes]);

  const ocrScansCountMap = useMemo(() => {
    const map = new Map<number, number>();
    try {
      const all = StorageManager.getOcrScans();
      for (const s of all) {
        if (s.note_id) {
          map.set(s.note_id, (map.get(s.note_id) || 0) + 1);
        }
      }
    } catch {}
    return map;
  }, [notes]);

  // Batch Selection State
  const [selectedNoteIds, setSelectedNoteIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [shareNoteTarget, setShareNoteTarget] = useState<NoteRecord | null>(null);

  // Hook up Android hardware & gesture back handling for modals in this component
  useModalBackHandler(showNewEventModal, () => setShowNewEventModal(false), 'new-event-modal');
  useModalBackHandler(!!shareNoteTarget, () => setShareNoteTarget(null), 'share-note-modal');

  // Extract all unique tags across notes
  const allAvailableTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((n) => {
      (n.tags || []).forEach((t) => {
        if (t && t.trim()) tagSet.add(t.trim());
      });
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter notes according to tab, category, tag, and search
  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        // Tab filtering
        if (activeTab === 'archived') {
          if (n.status !== 'archived') return false;
        } else if (activeTab === 'trash') {
          if (n.status !== 'trash') return false;
        } else {
          // All active views exclude archived and trashed items
          if (n.status === 'archived' || n.status === 'trash') return false;

          if (activeTab === 'checklist' && n.note_type !== 'checklist') return false;
          if (activeTab === 'sketch' && n.note_type !== 'sketch') return false;
          if (activeTab === 'reminders' && !n.reminder_at) return false;
        }

        // Category filter
        if (selectedEventId && selectedEventId !== 0 && n.event_id !== selectedEventId) {
          return false;
        }

        // Tag filter
        if (selectedTag && !(n.tags || []).includes(selectedTag)) {
          return false;
        }

        // Search query filter (using debounced query)
        if (debouncedQuery.trim()) {
          const query = debouncedQuery.toLowerCase().trim();
          const bodyMatch = n.body.toLowerCase().includes(query);
          const titleMatch = (n.title || '').toLowerCase().includes(query);
          const locMatch = (n.location_name || '').toLowerCase().includes(query);
          const tagMatch = (n.tags || []).some((t) => t.toLowerCase().includes(query));
          const checklistMatch = (n.checklist_items || []).some((item) =>
            item.text.toLowerCase().includes(query)
          );
          const eventMatch = events
            .find((e) => e.id === n.event_id)
            ?.title.toLowerCase()
            .includes(query);
          return bodyMatch || titleMatch || locMatch || tagMatch || checklistMatch || !!eventMatch;
        }

        return true;
      })
      .sort((a, b) => {
        // Pinned notes stick to top unless in trash
        if (activeTab !== 'trash') {
          if (a.is_pinned && !b.is_pinned) return -1;
          if (!a.is_pinned && b.is_pinned) return 1;
        }

        if (sortBy === 'title') {
          return (a.title || '').localeCompare(b.title || '');
        }
        if (sortBy === 'created') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortBy === 'reminder') {
          if (!a.reminder_at) return 1;
          if (!b.reminder_at) return -1;
          return new Date(a.reminder_at).getTime() - new Date(b.reminder_at).getTime();
        }
        // Default: updated
        const timeA = new Date(a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.updated_at || b.created_at).getTime();
        return timeB - timeA;
      });
  }, [notes, activeTab, selectedEventId, selectedTag, debouncedQuery, sortBy, events]);

  // Batch Selection Handlers
  const handleToggleNoteSelect = (noteId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedNoteIds((prev) => {
      const exists = prev.includes(noteId);
      const next = exists ? prev.filter((id) => id !== noteId) : [...prev, noteId];
      if (next.length === 0 && !isSelectionMode) {
        setIsSelectionMode(false);
      } else if (next.length > 0) {
        setIsSelectionMode(true);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedNoteIds(filteredNotes.map((n) => n.id));
    setIsSelectionMode(true);
  };

  const handleDeselectAll = () => {
    setSelectedNoteIds([]);
  };

  const handleClearSelection = () => {
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  };

  const handleCreateCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;
    onCreateEvent({
      title: newEventTitle.trim(),
      event_date: new Date().toISOString().slice(0, 10),
      category: newEventCategory,
      color: newEventColor,
    });
    setNewEventTitle('');
    setShowNewEventModal(false);
  };

  // In-app confirm state (avoids iframe window.confirm blocks)
  const [confirmEmptyTrashModal, setConfirmEmptyTrashModal] = useState(false);
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<number | null>(null);
  useModalBackHandler(confirmEmptyTrashModal, () => setConfirmEmptyTrashModal(false), 'confirm-empty-trash-modal');
  useModalBackHandler(confirmDeleteNoteId !== null, () => setConfirmDeleteNoteId(null), 'confirm-delete-note-modal');

  const handleEmptyTrash = () => {
    setConfirmEmptyTrashModal(true);
  };

  const executeEmptyTrash = () => {
    const trashNotes = notes.filter((n) => n.status === 'trash');
    const wasSelectedInTrash = selectedNoteId && trashNotes.some((n) => n.id === selectedNoteId);
    StorageManager.emptyTrash();
    if (wasSelectedInTrash) {
      onSelectNote(0);
    }
    setConfirmEmptyTrashModal(false);
    onRefresh();
  };

  const handleRestoreNote = (e: React.MouseEvent, noteId: number) => {
    e.stopPropagation();
    StorageManager.restoreNote(noteId);
    onRefresh();
  };

  const handlePermanentDelete = (e: React.MouseEvent, noteId: number) => {
    e.stopPropagation();
    setConfirmDeleteNoteId(noteId);
  };

  const executePermanentDeleteNote = () => {
    if (confirmDeleteNoteId !== null) {
      onDeleteNote(confirmDeleteNoteId);
      setConfirmDeleteNoteId(null);
      onRefresh();
    }
  };

  const handleUnarchiveNote = (e: React.MouseEvent, noteId: number) => {
    e.stopPropagation();
    StorageManager.unarchiveNote(noteId);
    onRefresh();
  };

  return (
    <div
      id="event-notes-explorer"
      className="h-full flex flex-col bg-[#fafaf9] dark:bg-[#0e0e11] select-none relative overflow-hidden"
    >
      {/* Android Material Contextual Action Bar (CAB) when selecting notes */}
      {selectedNoteIds.length > 0 && (
        <BatchActionBar
          selectedNoteIds={selectedNoteIds}
          allNotes={filteredNotes}
          events={events}
          activeTab={activeTab}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onRefresh={() => {
            onRefresh();
            setSelectedNoteIds([]);
            setIsSelectionMode(false);
          }}
        />
      )}

      {/* Search & Top Action Bar (hidden when CAB is active to prevent clutter) */}
      {selectedNoteIds.length === 0 && (
        <div className="p-3 pb-1.5 shrink-0">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                id="note-search-input"
                type="text"
                placeholder="Search notes, checklists, locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#16161a] border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  title="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Select Mode Button for Mobile */}
            <button
              id="batch-select-mode-toggle-btn"
              type="button"
              onClick={() => {
                setIsSelectionMode((p) => !p);
                if (isSelectionMode) setSelectedNoteIds([]);
              }}
              aria-label={isSelectionMode ? 'Cancel Selection' : 'Select Notes'}
              title={isSelectionMode ? 'Cancel Selection' : 'Select Notes'}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-xs font-semibold border transition-all ${
                isSelectionMode
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent shadow-xs'
                  : 'bg-white dark:bg-[#16161a] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {isSelectionMode ? (
                <X className="w-4 h-4" />
              ) : (
                <CheckSquare className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Omni-Notes Core Mode Tabs (Pills) */}
      <div className="px-3 py-1 shrink-0">
        <div className="grid grid-cols-6 gap-1 text-xs font-medium bg-zinc-100 dark:bg-[#141418] rounded-xl p-1 border border-zinc-200/60 dark:border-zinc-800/60">
          <button
            onClick={() => setActiveTab('all')}
            title="All Notes"
            aria-label="All Notes"
            className={`min-h-[38px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            title="Checklists & To-Dos"
            aria-label="Checklists"
            className={`min-h-[38px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'checklist'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveTab('sketch')}
            title="Sketches & Drawings"
            aria-label="Sketches"
            className={`min-h-[38px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'sketch'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveTab('reminders')}
            title="Reminders & Alarms"
            aria-label="Reminders"
            className={`min-h-[38px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'reminders'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveTab('archived')}
            title="Archive"
            aria-label="Archive"
            className={`min-h-[38px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'archived'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveTab('trash')}
            title="Trash / Recycle Bin"
            aria-label="Trash"
            className={`min-h-[38px] py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all ${
              activeTab === 'trash'
                ? 'bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 font-semibold shadow-2xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Category Pills Strip */}
      <div className="px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <button
          id="category-all-notes-btn"
          onClick={() => onSelectEvent(0)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
            selectedEventId === 0 || selectedEventId === null
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-2xs'
              : 'bg-white/80 dark:bg-[#16161a] border border-zinc-200/60 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
          }`}
        >
          All Categories
        </button>

        {events.map((ev) => (
          <button
            key={ev.id}
            id={`category-btn-${ev.id}`}
            onClick={() => onSelectEvent(ev.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-all ${
              selectedEventId === ev.id
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-2xs'
                : 'bg-white/80 dark:bg-[#16161a] border border-zinc-200/60 dark:border-zinc-800/60 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
            }`}
          >
            {ev.color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: ev.color }}
              />
            )}
            <span className="truncate max-w-[120px]">{ev.title}</span>
          </button>
        ))}

        <button
          onClick={() => setShowNewEventModal(true)}
          title="New Category"
          className="p-1.5 bg-white/80 dark:bg-[#16161a] border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tag Filter Strip */}
      {allAvailableTags.length > 0 && (
        <div className="px-3 py-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            id="tag-filter-all"
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
              selectedTag === null
                ? 'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-semibold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            All tags
          </button>

          {allAvailableTags.map((tag) => {
            const isTagActive = selectedTag === tag;
            return (
              <button
                key={tag}
                id={`tag-filter-${tag.toLowerCase()}`}
                onClick={() => setSelectedTag(isTagActive ? null : tag)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
                  isTagActive
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold'
                    : 'bg-white/60 dark:bg-[#16161a] border border-zinc-200/60 dark:border-zinc-800/60 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* List Header & Sorting / Quick Actions */}
      <div className="px-3.5 py-2 flex items-center justify-between text-zinc-400 text-xs font-medium border-t border-zinc-200/60 dark:border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-2">
          <span>
            {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-transparent text-zinc-600 dark:text-zinc-300 text-xs font-medium focus:outline-hidden cursor-pointer"
          >
            <option value="updated">Recent</option>
            <option value="created">Created</option>
            <option value="title">Title A-Z</option>
            <option value="reminder">Reminder</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* List vs Grid Layout Toggle */}
          <button
            onClick={() => setViewLayout((p) => (p === 'list' ? 'grid' : 'list'))}
            title={viewLayout === 'list' ? 'Switch to Grid View' : 'Switch to List View'}
            className="p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md"
          >
            {viewLayout === 'list' ? <LayoutGrid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
          </button>

          {activeTab === 'trash' ? (
            filteredNotes.length > 0 && (
              <button
                onClick={handleEmptyTrash}
                className="text-rose-600 dark:text-rose-400 hover:underline font-semibold"
              >
                Empty Trash
              </button>
            )
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                id="create-new-note-btn"
                onClick={() => onCreateNote(selectedEventId || (events[0]?.id ?? 1), 'text')}
                className="flex items-center gap-1 text-zinc-900 dark:text-zinc-100 font-semibold hover:opacity-75 transition-opacity"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notes List / Grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-6 custom-minimal-scrollbar">
        {filteredNotes.length > 0 ? (
          <div
            className={
              viewLayout === 'grid'
                ? 'grid grid-cols-2 gap-2.5'
                : 'space-y-2'
            }
          >
            {filteredNotes.map((note) => {
              const isSelectedInBatch = selectedNoteIds.includes(note.id);
              const isActiveEditor = selectedNoteId === note.id;
              const recordingsCount = recordingsCountMap.get(note.id) || 0;
              const ocrScansCount = ocrScansCountMap.get(note.id) || 0;
              const isChecklist = note.note_type === 'checklist';
              const isSketch = note.note_type === 'sketch';
              const completedItems = (note.checklist_items || []).filter((i) => i.completed).length;
              const totalItems = (note.checklist_items || []).length;
              const isPrivateLocked = note.is_locked && note.lock_mode === 'private';
              const displayTitle = isPrivateLocked ? '🔒 Locked Note' : (note.title || 'Untitled Note');
              const displayBody = isPrivateLocked
                ? 'Private content'
                : note.is_locked
                ? '•••••••• Protected Note Content'
                : note.body.replace(/[#*`_]/g, '').slice(0, 120);

              return (
                <div
                  key={note.id}
                  id={`note-item-${note.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Note: ${displayTitle}`}
                  onClick={(e) => {
                    if (isSelectionMode || selectedNoteIds.length > 0) {
                      handleToggleNoteSelect(note.id, e);
                    } else {
                      onSelectNote(note.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isSelectionMode || selectedNoteIds.length > 0) {
                        handleToggleNoteSelect(note.id);
                      } else {
                        onSelectNote(note.id);
                      }
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleToggleNoteSelect(note.id, e);
                  }}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-zinc-400 ${
                    isSelectedInBatch
                      ? 'bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-900 dark:border-zinc-100 shadow-md ring-1 ring-zinc-400'
                      : isActiveEditor
                      ? 'bg-white dark:bg-[#16161a] border border-zinc-300 dark:border-zinc-700 shadow-xs'
                      : 'bg-white/70 dark:bg-[#141418] hover:bg-white dark:hover:bg-[#18181e] border border-zinc-200/70 dark:border-zinc-800/70 shadow-2xs'
                  }`}
                >
                  {/* Selection Checkbox (always visible when in selection mode, or on card hover) */}
                  {(isSelectionMode || selectedNoteIds.length > 0) && (
                    <div
                      role="checkbox"
                      tabIndex={0}
                      aria-checked={isSelectedInBatch}
                      aria-label={`Select note ${displayTitle}`}
                      onClick={(e) => handleToggleNoteSelect(note.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleToggleNoteSelect(note.id);
                        }
                      }}
                      className="absolute top-3 right-3 z-10 p-1 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      {isSelectedInBatch ? (
                        <CheckCircle2 className="w-5 h-5 text-zinc-900 dark:text-zinc-100 fill-zinc-900 dark:fill-zinc-100 text-white" />
                      ) : (
                        <Circle className="w-5 h-5 text-zinc-400 hover:text-zinc-700" />
                      )}
                    </div>
                  )}

                  {/* Title & Status Icons */}
                  <div className={`flex items-start justify-between gap-2 mb-1.5 ${(isSelectionMode || selectedNoteIds.length > 0) ? 'pr-6' : ''}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      {note.color && !isPrivateLocked && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: note.color }}
                          title="Color Tag"
                        />
                      )}
                      {isChecklist && <CheckSquare className="w-4 h-4 text-zinc-500 shrink-0" />}
                      {isSketch && <PenTool className="w-4 h-4 text-amber-500 shrink-0" />}
                      {note.is_locked && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <h4
                        className={`text-xs truncate ${
                          isActiveEditor || isSelectedInBatch
                            ? 'font-semibold text-zinc-950 dark:text-zinc-50'
                            : 'font-medium text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        {displayTitle}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {note.is_pinned && (
                        <Pin className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300 fill-current" />
                      )}
                    </div>
                  </div>

                  {/* Body or Checklist summary */}
                  {isChecklist && totalItems > 0 && !note.is_locked ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2.5">
                      <span>{completedItems} of {totalItems} items checked</span>
                      <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all"
                          style={{ width: `${(completedItems / totalItems) * 100}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className={`text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mb-2.5 font-normal ${viewLayout === 'grid' ? 'line-clamp-3' : 'line-clamp-2'}`}>
                      {displayBody}
                    </p>
                  )}

                  {/* Subdued Metadata & Badges */}
                  <div className="flex items-center justify-between text-xs text-zinc-400 pt-1.5 border-t border-zinc-100/80 dark:border-zinc-850">
                    <div className="flex flex-wrap items-center gap-2">
                      {!isPrivateLocked && note.reminder_at && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                          <Bell className="w-3 h-3" />
                          <span>{new Date(note.reminder_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                        </span>
                      )}

                      {!isPrivateLocked && note.location_name && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[70px]">{note.location_name}</span>
                        </span>
                      )}

                      {recordingsCount > 0 && (
                        <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400" title={`${recordingsCount} audio recordings`}>
                          <Mic className="w-3 h-3" />
                          {recordingsCount}
                        </span>
                      )}

                      {ocrScansCount > 0 && (
                        <span className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400" title={`${ocrScansCount} scanned documents`}>
                          <Camera className="w-3 h-3" />
                          {ocrScansCount}
                        </span>
                      )}

                      {(note.sketch_data || note.sketch_media_key) && (
                        <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400" title="Contains sketch drawing">
                          <PenTool className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    {/* Right side actions for Trash / Archive / Date */}
                    <div className="flex items-center gap-1">
                      {activeTab === 'trash' && (
                        <>
                          <button
                            onClick={(e) => handleRestoreNote(e, note.id)}
                            title="Restore Note"
                            aria-label="Restore Note"
                            className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 p-1 rounded-lg transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handlePermanentDelete(e, note.id)}
                            title="Delete Permanently"
                            aria-label="Delete Permanently"
                            className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-rose-600 p-1 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {activeTab === 'archived' && (
                        <button
                          onClick={(e) => handleUnarchiveNote(e, note.id)}
                          title="Restore Note (Unarchive)"
                          aria-label="Restore Note (Unarchive)"
                          className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-50 p-1 rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {activeTab !== 'trash' && activeTab !== 'archived' && (
                        <>
                          <button
                            id={`quick-pin-btn-${note.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              StorageManager.togglePinNote(note.id);
                              onRefresh();
                            }}
                            title={note.is_pinned ? 'Unpin Note' : 'Pin Note to Top'}
                            aria-label={note.is_pinned ? 'Unpin Note' : 'Pin Note to Top'}
                            className={`min-h-[32px] min-w-[32px] flex items-center justify-center p-1 rounded-lg transition-colors ${
                              note.is_pinned
                                ? 'text-zinc-900 dark:text-zinc-100'
                                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'fill-current' : ''}`} />
                          </button>
                          <button
                            id={`quick-duplicate-btn-${note.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const dup = StorageManager.duplicateNote(note.id);
                              if (dup) {
                                onSelectNote(dup.id);
                                onRefresh();
                              }
                            }}
                            title="Duplicate Note"
                            aria-label="Duplicate Note"
                            className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`quick-share-btn-${note.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareNoteTarget(note);
                            }}
                            title="Share & Export Note"
                            aria-label="Share & Export Note"
                            className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              StorageManager.archiveNote(note.id);
                              if (selectedNoteId === note.id) {
                                onSelectNote(0);
                              }
                              onRefresh();
                            }}
                            title="Archive Note (Hide from active notes)"
                            aria-label="Archive Note (Hide from active notes)"
                            className="min-h-[32px] min-w-[32px] flex items-center justify-center text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      <span className="text-zinc-400 dark:text-zinc-500 pl-1">
                        {new Date(note.updated_at || note.created_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-10 text-center text-zinc-400 space-y-2">
            <FileText className="w-7 h-7 mx-auto mb-1 opacity-40 stroke-[1.2]" />
            <p className="text-xs font-normal">
              {activeTab === 'trash'
                ? 'Trash is empty.'
                : activeTab === 'archived'
                ? 'No archived notes.'
                : activeTab === 'checklist'
                ? 'No checklist notes.'
                : activeTab === 'sketch'
                ? 'No sketch notes.'
                : activeTab === 'reminders'
                ? 'No active reminders.'
                : 'No notes found.'}
            </p>
          </div>
        )}
      </div>

      {/* New Category Modal */}
      {showNewEventModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewEventModal(false);
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-zinc-950/40 backdrop-blur-xs"
        >
          <div className="w-full sm:max-w-sm bg-white dark:bg-[#16161a] border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl p-5 shadow-xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                New Category
              </h3>
              <button
                type="button"
                onClick={() => setShowNewEventModal(false)}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCategorySubmit} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Work, Ideas, Tasks"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1">
                  Tag Color
                </label>
                <div className="flex items-center gap-2">
                  {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewEventColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        newEventColor === color ? 'scale-125 ring-2 ring-zinc-400' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewEventModal(false)}
                  className="px-3.5 py-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Empty Trash Modal */}
      {confirmEmptyTrashModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmEmptyTrashModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs select-none animate-fade-in"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#16161a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Empty Trash?</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Permanently delete all notes in Trash? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setConfirmEmptyTrashModal(false)}
                className="px-4 py-2.5 min-h-[44px] text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeEmptyTrash}
                className="px-4 py-2.5 min-h-[44px] text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                Empty Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Note Modal */}
      {confirmDeleteNoteId !== null && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteNoteId(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs select-none animate-fade-in"
        >
          <div className="w-full max-w-sm bg-white dark:bg-[#16161a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Permanently Delete Note?</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  This note and its recordings, transcripts, and OCR scans will be removed permanently.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setConfirmDeleteNoteId(null)}
                className="px-4 py-2.5 min-h-[44px] text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executePermanentDeleteNote}
                className="px-4 py-2.5 min-h-[44px] text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Note Share Modal */}
      {shareNoteTarget && (
        <NoteShareModal
          note={shareNoteTarget}
          event={events.find((e) => e.id === shareNoteTarget.event_id)}
          onClose={() => setShareNoteTarget(null)}
        />
      )}
    </div>
  );
};
