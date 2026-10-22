import React, { useRef } from 'react';
import {
  
  Clock,
  Plus,
  Pin,
  Mic,
  Camera,
  
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  PenTool,
  Bell,
  MapPin,
  Lock} from 'lucide-react';
import { NoteRecord, EventRecord } from '../types';
import { StorageManager } from '../lib/storage';
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
            Distraction-free multimodal notes with markdown writing, interactive checklists, canvas sketching, and Gemini intelligence.
          </p>
        </div>

        {/* Primary Creation Button */}
        <div className="pt-2 flex items-center justify-center">
          <button
            id="create-note-empty-state-btn"
            onClick={() => onCreateNote(undefined, 'text')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-2xl shadow-sm transition-all hover:scale-102 active:scale-98"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Note</span>
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

          <div
            ref={scrollContainerRef}
            className="flex gap-3 overflow-x-auto pb-4 pt-1 snap-x no-scrollbar"
          >
            {recentNotes.map((note) => {
              const event = events.find((e) => e.id === note.event_id);
              const recordings = StorageManager.getRecordingsForNote(note.id);
              const ocrScans = StorageManager.getOcrScansForNote(note.id);
              const isLocked = note.is_locked;

              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className="w-64 shrink-0 p-4 rounded-2xl bg-zinc-50/70 dark:bg-[#121216]/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/60 dark:hover:bg-[#16161c] transition-all cursor-pointer space-y-3 snap-start group relative"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNote(note.id) } }}
                >
                  {note.is_pinned && (
                    <div className="absolute top-3 right-3 text-zinc-400">
                      <Pin className="w-3 h-3 fill-current" />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: event?.color || '#a1a1aa' }}
                    />
                    <span className="text-xs font-medium text-zinc-400 truncate">
                      {event?.title || 'General'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                      {note.title || 'Untitled Note'}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {isLocked ? 'Protected note with PIN security' : note.body || 'No text added...'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs text-zinc-400 font-mono">
                    <div className="flex items-center gap-1.5">
                      {isLocked && <Lock className="w-3 h-3 text-amber-500" />}
                      {note.reminder_at && <Bell className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                      {note.location_name && <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                      {recordings.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Mic className="w-3 h-3" />
                          <span>{recordings.length}</span>
                        </span>
                      )}
                      {ocrScans.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Camera className="w-3 h-3" />
                          <span>{ocrScans.length}</span>
                        </span>
                      )}
                      {note.checklist_items && note.checklist_items.length > 0 && (
                        <span className="flex items-center gap-0.5">
                          <CheckSquare className="w-3 h-3" />
                          <span>{note.checklist_items.filter((c) => c.completed).length}/{note.checklist_items.length}</span>
                        </span>
                      )}
                      {(note.sketch_data || note.sketch_media_key) && <PenTool className="w-3 h-3 text-indigo-500" />}
                    </div>

                    <span>{formatRelativeTime(note.updated_at || note.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer System Status */}
      <div className="max-w-md mx-auto w-full text-center space-y-1">
        <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Local Browser Storage Active</span>
        </div>
        <p className="text-xs text-zinc-400">
          Offline-first architecture with cloud backup support.
        </p>
      </div>
    </div>
  );
};
