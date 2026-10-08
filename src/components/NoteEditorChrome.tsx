import React from 'react';
import {
  ArrowLeft,
  Plus,
  MoreVertical,
  CheckSquare,
  Mic,
  PenTool,
  Camera,
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
  Key,
  Settings,
  Eye,
} from 'lucide-react';
import { EventRecord, NoteRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { AiSettingsManager } from '../lib/aiSettings';

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
    reminderAt,
    locationName,
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
    setShowAiKeyModal,
    setShowSettingsModal,
    handleOpenAiSummaryModal,
  } = props;

  const safeEvents: EventRecord[] = Array.isArray(events) ? events : [];

  return (
    <>
      <div className="px-3 sm:px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-850 flex items-center justify-between gap-2 shrink-0 bg-white/90 dark:bg-[#0c0c0e]/90 backdrop-blur-xs">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {onClose && (
            <button
              id="back-to-notes-btn"
              type="button"
              onClick={onClose}
              aria-label="Back to Notes list"
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
            className="bg-transparent text-zinc-600 dark:text-zinc-300 text-xs font-medium focus:outline-hidden cursor-pointer max-w-[36vw] sm:max-w-[200px] truncate min-h-[44px]"
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
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300 shrink-0"
              title="Locked note"
            >
              <Lock className="w-3 h-3" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <span
            className={`px-2 text-[11px] font-medium tabular-nums ${
              saveStatus === 'saving'
                ? 'text-amber-600 dark:text-amber-400'
                : saveStatus === 'saved'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-zinc-400 dark:text-zinc-500'
            }`}
            aria-live="polite"
          >
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''}
          </span>
          {/* Quick Voice memo — always visible so users do not miss attach sheet */}
          <button
            type="button"
            id="note-voice-quick-btn"
            aria-label="Record voice memo"
            title="Voice memo"
            onClick={() => {
              setShowMoreActionsSheet(false);
              setShowAttachSheet(false);
              setShowAudioStudioModal(true);
            }}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            type="button"
            id="note-attach-btn"
            aria-label="Add to note"
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
            aria-label="More note options"
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
            aria-label="Close add menu"
            onClick={() => setShowAttachSheet(false)}
          />
          <div
            role="dialog"
            aria-label="Add to note"
            className="fixed inset-x-0 bottom-0 z-50 sm:absolute sm:inset-x-auto sm:right-3 sm:bottom-auto sm:top-[3.25rem] sm:w-72 rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl max-h-[70vh] overflow-y-auto safe-area-pb"
          >
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>
            <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Add to note
            </p>
            <div className="py-1 pb-6 sm:pb-2">
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left text-sm min-h-[48px]"
                onClick={() => {
                  setShowAttachSheet(false);
                  if (!showChecklistSection) handleAddChecklistItem();
                  else setShowChecklistSection(true);
                }}
              >
                <CheckSquare className="w-5 h-5 text-zinc-500" />
                <span>Checklist</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left text-sm min-h-[48px]"
                onClick={() => {
                  setShowAttachSheet(false);
                  setShowAudioStudioModal(true);
                }}
              >
                <Mic className="w-5 h-5 text-zinc-500" />
                <span>Voice memo / recording</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left text-sm min-h-[48px]"
                onClick={() => {
                  setShowAttachSheet(false);
                  setShowSketchModal(true);
                }}
              >
                <PenTool className="w-5 h-5 text-zinc-500" />
                <span>Sketch</span>
                {sketchData && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    Added
                  </span>
                )}
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left text-sm min-h-[48px]"
                onClick={() => {
                  setShowAttachSheet(false);
                  setShowOcrScanner(true);
                }}
              >
                <Camera className="w-5 h-5 text-zinc-500" />
                <span>Scan document</span>
              </button>
            </div>
          </div>
        </>
      )}

      {showMoreActionsSheet && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50"
            aria-label="Close more menu"
            onClick={() => setShowMoreActionsSheet(false)}
          />
          <div
            role="dialog"
            aria-label="More note options"
            className="fixed inset-x-0 bottom-0 z-50 sm:absolute sm:inset-x-auto sm:right-3 sm:bottom-auto sm:top-[3.25rem] sm:w-80 rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl max-h-[75vh] overflow-y-auto safe-area-pb"
          >
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>
            <div className="py-1 pb-8 sm:pb-2 text-sm">
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Organize
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
                  <span>{focusMode ? 'Exit focus mode' : 'Focus mode'}</span>
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
                <span>{note.is_pinned ? 'Unpin' : 'Pin note'}</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowReminderPicker(true);
                }}
              >
                <Bell className="w-5 h-5 text-amber-500" />
                <span>{reminderAt ? 'Edit reminder' : 'Set reminder'}</span>
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
                <span>{locationName ? 'Edit location' : 'Add location'}</span>
              </button>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Privacy
              </p>
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
                <span>{note.is_locked ? 'Security & unlock…' : 'Lock note…'}</span>
              </button>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Share & history
              </p>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowShareModal(true);
                }}
              >
                <Share2 className="w-5 h-5 text-zinc-500" />
                <span>Share & export</span>
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
                <span>Version history</span>
              </button>
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Note
              </p>
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
                  if (window.confirm('Delete this note? This cannot be undone.')) onNoteDeleted(note.id);
                }}
              >
                <Trash2 className="w-5 h-5" />
                <span>Delete</span>
              </button>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2 mx-4" />
              <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Advanced
              </p>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  handleOpenAiSummaryModal();
                }}
              >
                <Sparkles className="w-5 h-5 text-indigo-500" />
                <span>AI summary</span>
              </button>
              <button
                type="button"
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-left min-h-[48px]"
                onClick={() => {
                  setShowMoreActionsSheet(false);
                  setShowAiKeyModal(true);
                }}
              >
                <span className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-zinc-500" />
                  <span>Google AI key</span>
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    AiSettingsManager.hasLocalKey()
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {AiSettingsManager.hasLocalKey() ? 'Active' : 'Missing'}
                </span>
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
                <span>App settings</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};
