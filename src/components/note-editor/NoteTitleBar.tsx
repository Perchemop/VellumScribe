import React from 'react';
import { ArrowLeft, Clock, Share2, Shield, Trash2, Eye, Lock, Unlock } from 'lucide-react';
import { EventRecord } from '../../types';

interface NoteTitleBarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  eventId: number;
  onEventChange: (newEventId: number) => void;
  events: EventRecord[];
  isLocked: boolean;
  isUnlockedInSession: boolean;
  focusMode: boolean;
  onToggleFocus?: () => void;
  onOpenVersions?: () => void;
  onOpenShare?: () => void;
  onOpenSecurity?: () => void;
  onDeleteNote?: () => void;
  onClose?: () => void;
}

export const NoteTitleBar: React.FC<NoteTitleBarProps> = ({
  title,
  onTitleChange,
  eventId,
  onEventChange,
  events,
  isLocked,
  isUnlockedInSession,
  focusMode,
  onToggleFocus,
  onOpenVersions,
  onOpenShare,
  onOpenSecurity,
  onDeleteNote,
  onClose,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition shrink-0"
            aria-label="Back to notes list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Note title..."
            className="w-full text-lg sm:text-xl font-bold bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
            aria-label="Note title"
          />

          <div className="flex items-center gap-2 mt-1">
            <select
              value={eventId}
              onChange={(e) => onEventChange(parseInt(e.target.value, 10))}
              className="text-xs bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-lg px-2 py-0.5 text-zinc-700 dark:text-zinc-300 focus:outline-none"
              aria-label="Event category"
            >
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title}
                </option>
              ))}
            </select>

            {isLocked && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  isUnlockedInSession
                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                }`}
              >
                {isUnlockedInSession ? (
                  <Unlock className="w-3 h-3" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {isUnlockedInSession ? 'Unlocked (Session)' : 'Locked (AES-256)'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
        {onToggleFocus && (
          <button
            onClick={onToggleFocus}
            className={`p-2 rounded-xl text-xs transition flex items-center gap-1.5 ${
              focusMode
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
            }`}
            title={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            aria-label="Toggle focus mode"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}

        {onOpenVersions && (
          <button
            onClick={onOpenVersions}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition"
            title="Version History & Revisions"
            aria-label="Version history"
          >
            <Clock className="w-4 h-4" />
          </button>
        )}

        {onOpenShare && (
          <button
            onClick={onOpenShare}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition"
            title="Share & Export Note"
            aria-label="Share note"
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}

        {onOpenSecurity && (
          <button
            onClick={onOpenSecurity}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition"
            title="Security & Lock Settings"
            aria-label="Security settings"
          >
            <Shield className="w-4 h-4" />
          </button>
        )}

        {onDeleteNote && (
          <button
            onClick={onDeleteNote}
            className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition"
            title="Delete note"
            aria-label="Delete note"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
