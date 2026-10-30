import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  CheckSquare,
  Mic,
  PenTool,
  Camera,
  Upload,
  Pin,
  Bell,
  MapPin,
  Lock,
  Unlock,
  Share2,
  Clock,
  Copy,
  Trash2,
  Sparkles,
  Settings,
  Eye,
} from 'lucide-react';
import { EventRecord, NoteRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { useModalBackHandler } from '../lib/modalBackStack';
import { useDialogFocusTrap } from '../lib/dialogFocus';

export type SaveStatus = 'saving' | 'saved' | 'stored';

export interface NoteEditorChromeProps {
  note: NoteRecord;
  events: EventRecord[];
  eventId: number;
  setEventId: (id: number) => void;
  onNoteUpdated: (n: NoteRecord) => void;
  onNoteDeleted: (id: number) => void;
  onClose?: () => void;
  saveStatus: SaveStatus;
  showAttachSheet: boolean;
  setShowAttachSheet: (v: boolean | ((p: boolean) => boolean)) => void;
  showMoreActionsSheet: boolean;
  setShowMoreActionsSheet: (v: boolean | ((p: boolean) => boolean)) => void;
  showChecklistSection: boolean;
  setShowChecklistSection: (v: boolean | ((p: boolean) => boolean)) => void;
  handleAddChecklistItem: () => void;
  sketchData?: string;
  reminderAt: string;
  locationName: string;
  focusMode?: boolean;
  onToggleFocus?: () => void;
  setShowAudioStudioModal: (v: boolean) => void;
  setShowSketchModal: (v: boolean) => void;
  setShowOcrScanner: (v: boolean) => void;
  setShowReminderPicker: (v: boolean) => void;
  setShowLocationPicker: (v: boolean) => void;
  setShowSecurityModal: (v: boolean) => void;
  setShowShareModal: (v: boolean) => void;
  setShowRevisionsModal: (v: boolean) => void;
  setShowAiKeyModal: (v: boolean) => void;
  setShowSettingsModal: (v: boolean) => void;
  handleOpenAiSummaryModal: () => void;
}

export const NoteEditorChrome: React.FC<NoteEditorChromeProps> = (props) => {
  const {
    note,
    events,
    eventId,
    setEventId,
    onNoteUpdated,
    onNoteDeleted,
    onClose,
    saveStatus,
    showAttachSheet,
    setShowAttachSheet,
    showMoreActionsSheet,
    setShowMoreActionsSheet,
    showChecklistSection,
    setShowChecklistSection,
    handleAddChecklistItem,
    sketchData,
    reminderAt: _reminderAt,
    locationName: _locationName,
    focusMode,
    onToggleFocus,
    setShowAudioStudioModal,
    setShowSketchModal,
    setShowOcrScanner,
    setShowReminderPicker,
    setShowLocationPicker,
    setShowSecurityModal,
    setShowShareModal,
    setShowRevisionsModal,
    setShowSettingsModal,
    handleOpenAiSummaryModal,
  } = props;

  const safeEvents: EventRecord[] = Array.isArray(events) ? events : [];

  // In-app confirmation for note delete (design audit M-3). A blocking
  // window.confirm is inconsistent with every other destructive action in the
  // app and is jarring inside the Android WebView.
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Escape closes whichever editor overlay is open, even when keyboard focus
  // never left the trigger button (design audit M-4). Android back is handled
  // by the shared modal back stack.
  useEffect(() => {
    if (!showAttachSheet && !showMoreActionsSheet && !confirmDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirmDelete) setConfirmDelete(false);
      else if (showAttachSheet) setShowAttachSheet(false);
      else setShowMoreActionsSheet(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showAttachSheet,
    showMoreActionsSheet,
    confirmDelete,
    setShowAttachSheet,
    setShowMoreActionsSheet,
  ]);

  useModalBackHandler(confirmDelete, () => setConfirmDelete(false), 'note-delete-confirm');

  // Contain focus in the delete confirmation, the same way the app's other
  // dialogs do (design audit M-4).
  const confirmDialogRef = useDialogFocusTrap<HTMLDivElement>(confirmDelete);

  return (
    <>
      <div className="px-3 sm:px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-850 flex items-center justify-between gap-2 shrink-0 bg-white/90 dark:bg-[#0c0c0e]/90 backdrop-blur-xs safe-area-pt">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {onClose && (
            <button
              id="back-to-notes-btn"
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <select
            value={eventId}
            onChange={(e) => {
              const eid = Number(e.target.value);
              setEventId(eid);
              const updated = StorageManager.updateNote(note.id, { event_id: eid });
              if (updated) onNoteUpdated(updated);
            }}
            aria-label="Event"
            className="bg-transparent text-zinc-600 dark:text-zinc-300 text-xs font-medium focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg cursor-pointer max-w-[36vw] sm:max-w-[200px] truncate min-h-[44px]"
          >
            {safeEvents.length === 0 ? (
              <option value={eventId} className="bg-white dark:bg-zinc-900">
                General
              </option>
            ) : (
              safeEvents.map((ev) => (
                <option
                  key={ev.id}
                  value={ev.id}
                  className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                >
                  {ev.title}
                </option>
              ))
            )}
          </select>
          {note.is_locked && (
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="Locked" />
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <span
            className={`px-2 text-[11px] font-medium tabular-nums ${
              saveStatus === 'saving'
                ? 'text-amber-600 dark:text-amber-400'
                : saveStatus === 'saved'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-zinc-600 dark:text-zinc-500'
            }`}
            aria-live="polite"
          >
            {saveStatus === 'saving' ? '…' : saveStatus === 'saved' ? 'Saved' : ''}
          </span>
          <button
            type="button"
            id="note-attach-btn"
            aria-label="Add"
            aria-expanded={showAttachSheet}
            onClick={() => {
              setShowMoreActionsSheet(false);
              setShowAttachSheet((p) => !p);
            }}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              showAttachSheet
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            id="note-more-btn"
            aria-label="More"
            aria-expanded={showMoreActionsSheet}
            onClick={() => {
              setShowAttachSheet(false);
              setShowMoreActionsSheet((p) => !p);
            }}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              showMoreActionsSheet
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showAttachSheet && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50"
            aria-label="Close"
            onClick={() => setShowAttachSheet(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowAttachSheet(false);
            }}
            className="fixed inset-x-0 bottom-0 z-50 sm:absolute sm:inset-x-auto sm:right-3 sm:bottom-auto sm:top-[3.25rem] sm:w-72 rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl max-h-[70vh] overflow-y-auto safe-area-pb"
          >
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>
            <div className="py-1 pb-6 sm:pb-2">
              {[
                {
                  id: 'checklist',
                  icon: CheckSquare,
                  label: 'Checklist',
                  onClick: () => {
                    setShowAttachSheet(false);
                    if (!showChecklistSection) handleAddChecklistItem();
                    else setShowChecklistSection(true);
                  },
                },
                {
                  id: 'record',
                  icon: Mic,
                  label: 'Record voice',
                  onClick: () => {
                    setShowAttachSheet(false);
                    setShowAudioStudioModal(true);
                  },
                },
                {
                  id: 'upload',
                  icon: Upload,
                  label: 'Upload audio',
                  onClick: () => {
                    setShowAttachSheet(false);
                    try {
                      window.__vellumScribePickAudio?.();
                    } catch {
                      /* ignore */
                    }
                  },
                },
                {
                  id: 'sketch',
                  icon: PenTool,
                  label: 'Sketch',
                  badge: sketchData ? 'Added' : undefined,
                  onClick: () => {
                    setShowAttachSheet(false);
                    setShowSketchModal(true);
                  },
                },
                {
                  id: 'scan',
                  icon: Camera,
                  label: 'Scan',
                  onClick: () => {
                    setShowAttachSheet(false);
                    setShowOcrScanner(true);
                  },
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  id={item.id === 'upload' ? 'note-upload-audio-btn' : undefined}
                  className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left text-sm min-h-[48px]"
                  onClick={item.onClick}
                >
                  <item.icon className="w-5 h-5 text-zinc-500" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {showMoreActionsSheet && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50"
            aria-label="Close"
            onClick={() => setShowMoreActionsSheet(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowMoreActionsSheet(false);
            }}
            className="fixed inset-x-0 bottom-0 z-50 sm:absolute sm:inset-x-auto sm:right-3 sm:bottom-auto sm:top-[3.25rem] sm:w-80 rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl max-h-[75vh] overflow-y-auto safe-area-pb"
          >
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>
            <div className="py-1 pb-8 sm:pb-2 text-sm">
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Note
              </p>
              {onToggleFocus && (
                <button
                  type="button"
                  className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                  onClick={() => {
                    setShowMoreActionsSheet(false);
                    onToggleFocus();
                  }}
                >
                  <Eye className="w-5 h-5 text-zinc-500" />
                  <span>{focusMode ? 'Exit focus' : 'Focus'}</span>
                </button>
              )}
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  const u = StorageManager.togglePinNote(note.id);
                  if (u) onNoteUpdated(u);
                }}
              >
                <Pin className={`w-5 h-5 text-zinc-500 ${note.is_pinned ? 'fill-current' : ''}`} />
                <span>{note.is_pinned ? 'Unpin' : 'Pin'}</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowReminderPicker(true);
                }}
              >
                <Bell className="w-5 h-5 text-zinc-500" />
                <span>Reminder</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowLocationPicker(true);
                }}
              >
                <MapPin className="w-5 h-5 text-zinc-500" />
                <span>Location</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowSecurityModal(true);
                }}
              >
                {note.is_locked ? (
                  <Lock className="w-5 h-5 text-amber-600" />
                ) : (
                  <Unlock className="w-5 h-5 text-zinc-500" />
                )}
                <span>{note.is_locked ? 'Unlock…' : 'Lock'}</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowShareModal(true);
                }}
              >
                <Share2 className="w-5 h-5 text-zinc-500" />
                <span>Share</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowRevisionsModal(true);
                }}
              >
                <Clock className="w-5 h-5 text-zinc-500" />
                <span>History</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  const d = StorageManager.duplicateNote(note.id);
                  if (d) onNoteUpdated(d);
                }}
              >
                <Copy className="w-5 h-5 text-zinc-500" />
                <span>Duplicate</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left text-rose-600 dark:text-rose-400 min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setConfirmDelete(true);
                }}
              >
                <Trash2 className="w-5 h-5" />
                <span>Delete</span>
              </button>

              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2 mx-4" />
              <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                App
              </p>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  handleOpenAiSummaryModal();
                }}
              >
                <Sparkles className="w-5 h-5 text-zinc-500" />
                <span>Summarize</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowSettingsModal(true);
                }}
              >
                <Settings className="w-5 h-5 text-zinc-500" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs select-none animate-fade-in">
          <div
            ref={confirmDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-delete-confirm-title"
            aria-describedby="note-delete-confirm-desc"
            className="w-full max-w-sm bg-white dark:bg-[#16161a] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="note-delete-confirm-title"
                  className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Delete this note?
                </h3>
                <p
                  id="note-delete-confirm-desc"
                  className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5"
                >
                  This removes the note from this device. This cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2.5 min-h-[44px] text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  onNoteDeleted(note.id);
                }}
                className="px-4 py-2.5 min-h-[44px] text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                Delete note
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
