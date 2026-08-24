import React, { useRef } from 'react';
import {
  FileText,
  Clock,
  Plus,
  Pin,
  Mic,
  Camera,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  PenTool,
  Bell,
  MapPin,
  Lock,
} from 'lucide-react';
import { NoteRecord, EventRecord } from '../types';
import { SQLiteDatabase } from '../lib/storage';
import { AppLogo } from './AppLogo';

interface RecentNotesSectionProps {
  notes: NoteRecord[];
  events: EventRecord[];
  onSelectNote: (noteId: number) => void;
  onCreateNote: (eventId?: number, type?: 'text' | 'checklist' | 'sketch') => void;
}

export const RecentNotesSection: React.FC<RecentNotesSectionProps> = ({
  notes,
  events,
  onSelectNote,
  onCreateNote,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Active notes only for recents
  const activeNotes = notes.filter((n) => !n.status || n.status === 'active');

  const recentNotes = [...activeNotes]
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime()
    )
    .slice(0, 8);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 280;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      id="recent-notes-workspace"
      className="h-full flex flex-col justify-between overflow-y-auto px-6 py-10 md:px-16 space-y-10 bg-white dark:bg-[#0c0c0e] select-none"
    >
      {/* Central Quiet Creation Hub */}
      <div className="max-w-md mx-auto w-full text-center space-y-4 pt-4">
        <div className="flex justify-center">
          <AppLogo size="lg" showText={false} />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 font-serif-editorial">
            VellumScribe Studio
          </h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
            Distraction-free multimodal workspace with markdown writing, interactive checklists, canvas sketching, and Gemini intelligence.
          </p>
        </div>

        {/* 3 Quick Creation Buttons */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            id="create-note-empty-state-btn"
            onClick={() => onCreateNote(undefined, 'text')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs transition-opacity"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Text Note</span>
          </button>

          <button
            onClick={() => onCreateNote(undefined, 'checklist')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold rounded-xl border border-zinc-200/80 dark:border-zinc-700 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>To-Do List</span>
          </button>

          <button
            onClick={() => onCreateNote(undefined, 'sketch')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-semibold rounded-xl border border-zinc-200/80 dark:border-zinc-700 transition-colors"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Sketch Canvas</span>
          </button>
        </div>
      </div>

      {/* Recent Notes Stream */}
      {recentNotes.length > 0 && (
        <div id="recent-notes-section" className="w-full max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>Recent activity</span>
            </div>

            {recentNotes.length > 2 && (
              <div className="flex items-center gap-1">
                <button
                  id="scroll-recent-left-btn"
                  onClick={() => handleScroll('left')}
                  title="Scroll left"
                  className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  id="scroll-recent-right-btn"
                  onClick={() => handleScroll('right')}
                  title="Scroll right"
                  className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Cards */}
          <div
            ref={scrollContainerRef}
            id="recent-notes-scroll-container"
            className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory no-scrollbar"
          >
            {recentNotes.map((note) => {
              const parentEvent = events.find((e) => e.id === note.event_id);
              const recordings = SQLiteDatabase.getRecordingsForNote(note.id);
              const ocrScans = SQLiteDatabase.getOcrScansForNote(note.id);
              const isChecklist = note.note_type === 'checklist';
              const isSketch = note.note_type === 'sketch';
              const cleanPreview = note.body
                .replace(/^#+\s+/gm, '')
                .replace(/[*_`~[\]]/g, '')
                .replace(/\n+/g, ' ')
                .trim();

              return (
                <div
                  key={note.id}
                  id={`recent-note-card-${note.id}`}
                  onClick={() => onSelectNote(note.id)}
                  className="w-64 min-w-[240px] max-w-[260px] h-44 snap-start p-4 bg-zinc-50/70 dark:bg-[#121215] border border-zinc-200/70 dark:border-zinc-800/70 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-xl cursor-pointer transition-all flex flex-col justify-between group"
                  style={{
                    borderTop: note.color ? `3px solid ${note.color}` : undefined,
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5 text-[10px] text-zinc-400">
                      <span className="truncate max-w-[120px] font-medium">
                        {parentEvent?.title || 'General'}
                      </span>
                      <div className="flex items-center gap-1">
                        {note.is_locked && <Lock className="w-3 h-3 text-amber-500" />}
                        {note.is_pinned && (
                          <Pin className="w-3 h-3 text-zinc-700 dark:text-zinc-300 fill-current shrink-0" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 mb-1">
                      {isChecklist && <CheckSquare className="w-3 h-3 text-zinc-400 shrink-0" />}
                      {isSketch && <PenTool className="w-3 h-3 text-amber-500 shrink-0" />}
                      <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white transition-colors truncate">
                        {note.title || 'Untitled'}
                      </h4>
                    </div>

                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mt-1 font-normal">
                      {note.is_locked
                        ? '•••••••• Protected Note'
                        : isChecklist
                        ? `${(note.checklist_items || []).filter((i) => i.completed).length} of ${(note.checklist_items || []).length} items done`
                        : cleanPreview || 'Empty note...'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-zinc-200/50 dark:border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span>{formatRelativeTime(note.updated_at || note.created_at)}</span>
                      {note.reminder_at && <Bell className="w-2.5 h-2.5 text-amber-500" />}
                      {note.location_name && <MapPin className="w-2.5 h-2.5 text-emerald-500" />}
                      {recordings.length > 0 && (
                        <span className="flex items-center gap-0.5 text-zinc-600 dark:text-zinc-400">
                          <Mic className="w-2.5 h-2.5" />
                          {recordings.length}
                        </span>
                      )}
                      {ocrScans.length > 0 && (
                        <span className="flex items-center gap-0.5 text-zinc-600 dark:text-zinc-400">
                          <Camera className="w-2.5 h-2.5" />
                          {ocrScans.length}
                        </span>
                      )}
                    </div>

                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtle Bottom Footer */}
      <div className="text-center text-[10px] text-zinc-400 font-mono">
        <span>VellumScribe Offline-First Storage Active</span>
      </div>
    </div>
  );
};
