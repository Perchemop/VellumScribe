declare global {
  interface Window {
    /** Native audio file-picker hook, installed while the audio sheet is open. */
    __vellumScribePickAudio?: () => void;
  }
}

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Lock, FileText } from 'lucide-react';
import { NoteRecord, EventRecord, ChecklistItem, RecordingRecord, OcrScanRecord } from '../types';
import { StorageManager } from '../lib/storage';
import { AudioRecordingManager } from '../services/AudioRecordingManager';
import {
  TranscriptionOrchestrator,
  resolveTranscriptionPolicy,
} from '../services/TranscriptionOrchestrator';
import { MediaRepository } from '../lib/MediaRepository';
import { NotePayloadData } from '../lib/cryptoUtils';
import { describeAudioImport } from '../lib/audioImportNotices';
import { AiProvenanceBadge } from './AiProvenanceBadge';
import { AudioPlayerWidget } from './AudioPlayerWidget';
import { DraftStore, type NoteDraft } from '../lib/DraftStore';
import { SearchIndexQueue } from '../lib/SearchIndexQueue';
import { generatePrefixedId } from '../lib/uuid';
import { NoteEditorChrome } from './NoteEditorChrome';
import { ChecklistEditor } from './ChecklistEditor';
import { AiSettingsManager, type LlmProvider } from '../lib/aiSettings';
import { PrivacyManager } from '../lib/privacyManager';
import { ReminderService } from '../services/ReminderService';
import { ModalLoadingFallback } from './ModalLoadingFallback';
import { ErrorBoundary } from './ErrorBoundary';
import { ModalErrorFallback } from './ModalErrorFallback';
import { asErrorLike } from '../lib/errorLike';
import { AppLogger } from '../lib/logger';

const SketchCanvasModal = lazy(() =>
  import('./SketchCanvasModal').then((m) => ({ default: m.SketchCanvasModal }))
);
const OcrScannerModal = lazy(() =>
  import('./OcrScannerModal').then((m) => ({ default: m.OcrScannerModal }))
);
const AudioRecordingModal = lazy(() =>
  import('./audio/AudioRecordingModal').then((m) => ({ default: m.AudioRecordingModal }))
);
const NoteSecurityModal = lazy(() =>
  import('./NoteSecurityModal').then((m) => ({ default: m.NoteSecurityModal }))
);
const NoteShareModal = lazy(() =>
  import('./NoteShareModal').then((m) => ({ default: m.NoteShareModal }))
);
const NoteRevisionsModal = lazy(() =>
  import('./NoteRevisionsModal').then((m) => ({ default: m.NoteRevisionsModal }))
);
const SettingsModal = lazy(() =>
  import('./SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
const AiStudioKeyModal = lazy(() =>
  import('./AiStudioKeyModal').then((m) => ({ default: m.AiStudioKeyModal }))
);
const AiSummaryModal = lazy(() =>
  import('./AiSummaryModal').then((m) => ({ default: m.AiSummaryModal }))
);
const CloudAiConsentModal = lazy(() =>
  import('./CloudAiConsentModal').then((m) => ({ default: m.CloudAiConsentModal }))
);
const TranscriptionRecoverySheet = lazy(() =>
  import('./audio/TranscriptionRecoverySheet').then((m) => ({
    default: m.TranscriptionRecoverySheet,
  }))
);

const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  google: 'Google Gemini',
  groq: 'Groq',
  offline_rules: 'Offline rules engine',
};

const llmProviderLabel = (provider: LlmProvider): string =>
  LLM_PROVIDER_LABELS[provider] || provider;

interface NoteEditorProps {
  note: NoteRecord;
  events: EventRecord[];
  focusMode?: boolean;
  onToggleFocus?: () => void;
  onNoteUpdated: (updatedNote: NoteRecord) => void;
  onNoteDeleted: (noteId: number) => void;
  onOpenVersions?: () => void;
  onClose?: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  events,
  focusMode = false,
  onToggleFocus,
  onNoteUpdated,
  onNoteDeleted,
  onClose,
}) => {
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody] = useState(note.body || '');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(note.checklist_items || []);
  const [sketchData, setSketchData] = useState<string | undefined>(note.sketch_data);
  const [eventId, setEventId] = useState(note.event_id);
  const [reminderAt, setReminderAt] = useState<string>(note.reminder_at || '');
  const [locationName, setLocationName] = useState<string>(note.location_name || '');
  const [showChecklistSection, setShowChecklistSection] = useState(
    Boolean(note.checklist_items && note.checklist_items.length > 0)
  );
  const [showAttachSheet, setShowAttachSheet] = useState(false);
  const [showMoreActionsSheet, setShowMoreActionsSheet] = useState(false);
  const [showOcrScanner, setShowOcrScanner] = useState(false);
  const [showSketchModal, setShowSketchModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRevisionsModal, setShowRevisionsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [showAudioStudioModal, setShowAudioStudioModal] = useState(false);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);
  const [showCloudAiConsentModal, setShowCloudAiConsentModal] = useState(false);
  const [showRecoverySheet, setShowRecoverySheet] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<(() => void) | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'stored'>('stored');
  const [isUnlockedLocally, setIsUnlockedLocally] = useState(!note.is_locked);
  const [recoveredDraft, setRecoveredDraft] = useState<NoteDraft | null>(null);
  const [recordings, setRecordings] = useState<RecordingRecord[]>(() =>
    StorageManager.getRecordingsForNote(note.id)
  );
  const [ocrScans, setOcrScans] = useState<OcrScanRecord[]>(() =>
    StorageManager.getOcrScansForNote(note.id)
  );
  const [heldPin, setHeldPin] = useState<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);
  const [, setIsImportingAudio] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const pendingTranscriptionErrorRef = useRef<string | null>(null);

  const handleUploadAudioFile = async (file: File) => {
    if (!file) return;
    AppLogger.info('NoteEditor', `Audio import start: ${file.name} (${file.size} bytes)`);
    setIsImportingAudio(true);
    setImportStatus('Importing audio…');
    let importWarning: string | null = null;
    try {
      const mgr = new AudioRecordingManager();
      const result = await mgr.importAudioFile(note.id, file, file.name, (pct, status) => {
        setImportStatus(status || `Importing… ${pct}%`);
      });
      importWarning = describeAudioImport(result);
      refreshRecordings();
      if (result.recording) {
        setImportStatus('Transcribing…');
        const policy = resolveTranscriptionPolicy({
          networkAllowed: PrivacyManager.isNetworkAllowed(),
          hasCloudAiConsent: PrivacyManager.hasCloudAiConsent(),
        });
        try {
          const tr = await TranscriptionOrchestrator.getInstance().orchestrate(
            {
              recordingId: result.recording.id,
              noteId: note.id,
              audioBlob: result.blob,
              mediaKey: result.recording.media_key,
              mimeType: result.mimeType,
              durationSeconds: result.durationSeconds,
            },
            {
              policy,
              onProgress: (p) => setImportStatus(p.status || `Transcribing… ${p.percent}%`),
            }
          );
          if (tr?.transcript) {
            const newBody = body
              ? `${body}

${tr.transcript}`
              : tr.transcript;
            setBody(newBody);
            persistText(title, newBody);
          }
        } catch (_txErr) {
          const txErr = asErrorLike(_txErr);
          setImportStatus(txErr?.message || 'Transcription failed — recording was saved.');
          setRecoveryError(txErr?.message || 'Transcription failed');
          setShowRecoverySheet(true);
        }
      }
      const refreshed = StorageManager.getNoteById(note.id);
      if (refreshed) onNoteUpdated(refreshed);
      refreshRecordings();
      AppLogger.info('NoteEditor', `Audio import done: ${result.recording?.id ?? 'no-rec'}`);
    } catch (_e) {
      const e = asErrorLike(_e);
      setImportStatus(e?.message || 'Could not import audio file');
    } finally {
      setIsImportingAudio(false);
      if (importWarning) {
        // Keep the limitation visible instead of clearing it with the
        // transient progress message.
        setImportStatus(importWarning);
      } else {
        setTimeout(() => setImportStatus(null), 4000);
      }
    }
  };

  useEffect(() => {
    window.__vellumScribePickAudio = () => {
      audioFileInputRef.current?.click();
    };
    return () => {
      try {
        delete window.__vellumScribePickAudio;
      } catch {
        /* ignore */
      }
    };
  }, []);

  const refreshRecordings = () => {
    setRecordings(StorageManager.getRecordingsForNote(note.id));
  };

  const refreshOcrScans = () => {
    setOcrScans(StorageManager.getOcrScansForNote(note.id));
  };

  const applyUnlockedPayload = (payload: NotePayloadData, pin: string) => {
    setHeldPin(pin);
    setIsUnlockedLocally(true);
    if (payload.title !== undefined) setTitle(payload.title || '');
    setBody(payload.body || '');
    if (payload.checklist_items) {
      setChecklistItems(payload.checklist_items);
      setShowChecklistSection(payload.checklist_items.length > 0);
    }
    if (payload.sketch_data !== undefined) setSketchData(payload.sketch_data);
    const meta = payload.protected_metadata;
    if (meta?.location_name) setLocationName(meta.location_name);
    if (meta?.reminder_at) setReminderAt(meta.reminder_at);
  };

  useEffect(() => {
    const newer = DraftStore.findNewerDraft(note.id, note.updated_at || note.created_at);
    setRecoveredDraft(newer);
    setTitle(note.title || '');
    setBody(note.body || '');
    setChecklistItems(note.checklist_items || []);
    setShowChecklistSection(Boolean(note.checklist_items && note.checklist_items.length > 0));
    setEventId(note.event_id);
    setReminderAt(note.reminder_at || '');
    setLocationName(note.location_name || '');
    setSketchData(note.sketch_data);
    setIsUnlockedLocally(!note.is_locked);
    setHeldPin(null);
    setRecordings(StorageManager.getRecordingsForNote(note.id));
    setOcrScans(StorageManager.getOcrScansForNote(note.id));
  }, [
    note.id,
    note.updated_at,
    note.is_locked,
    note.title,
    note.body,
    note.checklist_items,
    note.created_at,
    note.event_id,
    note.location_name,
    note.reminder_at,
    note.sketch_data,
  ]);

  useEffect(() => {
    let cancelled = false;
    const key = note.sketch_media_key;
    if (!key) return;
    if (sketchData && sketchData.startsWith('data:')) return;
    void (async () => {
      try {
        const blob = await MediaRepository.getBinary(key, 'image/png');
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!cancelled && typeof reader.result === 'string') {
            setSketchData(reader.result);
          }
          URL.revokeObjectURL(url);
        };
        reader.readAsDataURL(blob);
      } catch {
        /* keep existing sketchData */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [note.id, note.sketch_media_key, sketchData]);

  useEffect(() => {
    if (focusMode) {
      setShowAttachSheet(false);
      setShowMoreActionsSheet(false);
    }
  }, [focusMode]);

  useEffect(() => {
    // Reset any location notice whenever the picker opens or closes.
    setLocationNotice(null);
  }, [showLocationPicker]);
  const notifyUpdatedDebounced = (updatedNote: NoteRecord) => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => onNoteUpdated(updatedNote), 400);
  };

  const persistText = (nextTitle: string, nextBody: string) => {
    if (note.is_locked && !isUnlockedLocally) {
      setShowSecurityModal(true);
      return;
    }
    setSaveStatus('saving');
    if (!note.is_locked) {
      DraftStore.write({
        noteId: note.id,
        revision: 1,
        title: nextTitle,
        body: nextBody,
        savedAt: Date.now(),
      });
    }

    const finish = (updated: NoteRecord | null | undefined) => {
      if (updated) {
        DraftStore.clear(note.id);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('stored'), 1800);
        notifyUpdatedDebounced(updated);
      } else {
        setSaveStatus('stored');
      }
    };

    if (note.is_locked && heldPin) {
      void StorageManager.saveUnlockedNote(note.id, { title: nextTitle, body: nextBody }, heldPin)
        .then((updated) => {
          SearchIndexQueue.enqueue(note.id);
          finish(updated);
        })
        .catch(() => setSaveStatus('stored'));
      return;
    }

    const updated = StorageManager.updateNoteText(note.id, nextTitle, nextBody, true);
    SearchIndexQueue.enqueue(note.id);
    finish(updated);
  };

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    persistText(title, newBody);
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    persistText(newTitle, body);
  };

  const handleAddChecklistItem = () => {
    if (note.is_locked && !isUnlockedLocally) {
      setShowSecurityModal(true);
      return;
    }
    const newItem: ChecklistItem = { id: generatePrefixedId('chk'), text: '', completed: false };
    const updatedItems = [...checklistItems, newItem];
    setChecklistItems(updatedItems);
    setShowChecklistSection(true);
    const updated = StorageManager.updateNote(note.id, { checklist_items: updatedItems });
    if (updated) onNoteUpdated(updated);
  };

  const handleChecklistChange = (items: ChecklistItem[]) => {
    if (note.is_locked && !isUnlockedLocally) {
      setShowSecurityModal(true);
      return;
    }
    setChecklistItems(items);
    const updated = StorageManager.updateNote(note.id, { checklist_items: items });
    if (updated) onNoteUpdated(updated);
  };

  const handleSetReminder = async (iso: string) => {
    setReminderAt(iso);
    const updated = StorageManager.updateNote(note.id, { reminder_at: iso || undefined });
    if (updated) {
      onNoteUpdated(updated);
      if (iso) await ReminderService.scheduleReminder(updated);
      else await ReminderService.cancelReminder(note.id);
    }
  };

  const handleDetectLocation = () => {
    setLocationNotice(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNotice('This device does not support location, so type a place name instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const locStr = `Lat ${pos.coords.latitude.toFixed(4)}, Lon ${pos.coords.longitude.toFixed(4)}`;
        setLocationName(locStr);
        const updated = StorageManager.updateNote(note.id, {
          location_name: locStr,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        if (updated) onNoteUpdated(updated);
        setShowLocationPicker(false);
      },
      (err: GeolocationPositionError) => {
        if (err.code === 1) {
          setLocationNotice('Your browser blocked location access, so type a place name instead.');
        } else if (err.code === 2) {
          setLocationNotice(
            'Your device could not determine its position, so try again or type a place name.'
          );
        } else if (err.code === 3) {
          setLocationNotice('The location request timed out, so try again or type a place name.');
        } else {
          setLocationNotice('Location could not be determined, so try again or type a place name.');
        }
      }
    );
  };

  const handleOpenAiSummaryModal = () => {
    if (!AiSettingsManager.hasLocalKey()) {
      setShowAiKeyModal(true);
      return;
    }
    if (!PrivacyManager.isNetworkAllowed() || !PrivacyManager.hasCloudAiConsent()) {
      setPendingAiAction(() => () => setShowAiSummaryModal(true));
      setShowCloudAiConsentModal(true);
      return;
    }
    setShowAiSummaryModal(true);
  };

  const applyRecoveredDraft = () => {
    if (!recoveredDraft) return;
    setTitle(recoveredDraft.title);
    setBody(recoveredDraft.body);
    persistText(recoveredDraft.title, recoveredDraft.body);
    setRecoveredDraft(null);
  };

  const discardRecoveredDraft = () => {
    DraftStore.clear(note.id);
    setRecoveredDraft(null);
  };

  const lockedGate = note.is_locked && !isUnlockedLocally;

  return (
    <div
      id="note-editor-container"
      className="h-full flex flex-col bg-white dark:bg-[#0c0c0e] overflow-hidden select-text relative"
    >
      <input
        id="note-audio-file-input"
        ref={audioFileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleUploadAudioFile(f);
        }}
      />
      {importStatus && (
        <div
          role="status"
          className="px-4 py-2 text-xs bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 shrink-0"
        >
          {importStatus}
        </div>
      )}
      {!focusMode && (
        <NoteEditorChrome
          note={note}
          events={events}
          eventId={eventId}
          setEventId={setEventId}
          onNoteUpdated={onNoteUpdated}
          onNoteDeleted={onNoteDeleted}
          onClose={onClose}
          saveStatus={saveStatus}
          showAttachSheet={showAttachSheet}
          setShowAttachSheet={setShowAttachSheet}
          showMoreActionsSheet={showMoreActionsSheet}
          setShowMoreActionsSheet={setShowMoreActionsSheet}
          showChecklistSection={showChecklistSection}
          setShowChecklistSection={setShowChecklistSection}
          handleAddChecklistItem={handleAddChecklistItem}
          sketchData={sketchData}
          reminderAt={reminderAt}
          locationName={locationName}
          focusMode={focusMode}
          onToggleFocus={onToggleFocus}
          setShowAudioStudioModal={setShowAudioStudioModal}
          setShowSketchModal={setShowSketchModal}
          setShowOcrScanner={setShowOcrScanner}
          setShowReminderPicker={setShowReminderPicker}
          setShowLocationPicker={setShowLocationPicker}
          setShowSecurityModal={setShowSecurityModal}
          setShowShareModal={setShowShareModal}
          setShowRevisionsModal={setShowRevisionsModal}
          setShowAiKeyModal={setShowAiKeyModal}
          setShowSettingsModal={setShowSettingsModal}
          handleOpenAiSummaryModal={handleOpenAiSummaryModal}
        />
      )}

      {focusMode && (
        <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-850 flex items-center justify-between shrink-0">
          <button
            type="button"
            className="min-h-[44px] px-3 text-sm text-zinc-600 dark:text-zinc-300"
            onClick={onClose}
            aria-label="Back"
          >
            ← Back
          </button>
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400" aria-live="polite">
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Focus mode'}
          </span>
          <button
            type="button"
            className="min-h-[44px] px-3 text-sm font-medium text-indigo-600 dark:text-indigo-400"
            onClick={() => onToggleFocus?.()}
          >
            Done
          </button>
        </div>
      )}

      {recoveredDraft && !lockedGate && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-2.5 border-b border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0"
        >
          <span className="text-amber-900 dark:text-amber-100">
            Unsaved draft recovered from a previous session.
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              className="px-2.5 py-1 rounded-lg bg-amber-800 text-white dark:bg-amber-200 dark:text-amber-950 font-medium"
              onClick={applyRecoveredDraft}
            >
              Restore
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded-lg text-amber-800 dark:text-amber-200 underline"
              onClick={discardRecoveredDraft}
            >
              Discard
            </button>
          </span>
        </div>
      )}

      {showReminderPicker && !focusMode && (
        <div className="px-4 py-2 border-b border-amber-200/60 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20 flex items-center gap-2 text-xs shrink-0 flex-wrap">
          <span className="font-medium">Reminder</span>
          <input
            type="datetime-local"
            value={reminderAt ? reminderAt.slice(0, 16) : ''}
            onChange={(e) => {
              const v = e.target.value ? new Date(e.target.value).toISOString() : '';
              void handleSetReminder(v);
            }}
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          {reminderAt && (
            <button
              type="button"
              className="text-rose-600 underline"
              onClick={() => void handleSetReminder('')}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="text-zinc-500 underline"
            onClick={() => setShowReminderPicker(false)}
          >
            Done
          </button>
        </div>
      )}

      {showLocationPicker && !focusMode && (
        <div className="px-4 py-2 border-b border-sky-200/60 dark:border-sky-900/40 bg-sky-50/70 dark:bg-sky-950/20 flex items-center gap-2 text-xs shrink-0 flex-wrap">
          <span className="font-medium">Location</span>
          <input
            type="text"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            onBlur={() => {
              const updated = StorageManager.updateNote(note.id, {
                location_name: locationName || undefined,
              });
              if (updated) onNoteUpdated(updated);
            }}
            placeholder="Place name or address"
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 min-w-[12rem] flex-1"
          />
          {locationNotice && (
            <div
              role="alert"
              className="w-full text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-1"
            >
              {locationNotice}
            </div>
          )}
          <button
            type="button"
            className="px-2 py-1 rounded-lg bg-sky-700 text-white dark:bg-sky-300 dark:text-sky-950 font-medium"
            onClick={handleDetectLocation}
          >
            Use GPS
          </button>
          <button
            type="button"
            className="text-zinc-500 underline"
            onClick={() => setShowLocationPicker(false)}
          >
            Done
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {lockedGate ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <Lock className="w-7 h-7 text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                This note is locked
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
                Unlock to view and edit contents. Content stays encrypted until you authenticate.
              </p>
            </div>
            <button
              type="button"
              className="min-h-[44px] px-5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
              onClick={() => setShowSecurityModal(true)}
            >
              Unlock…
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Note title"
                aria-label="Note title"
                className="flex-1 min-w-[12rem] text-xl sm:text-2xl font-bold bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-600 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <AiProvenanceBadge entityType="note" entityId={note.id} className="shrink-0" />
            </div>
            <textarea
              value={body}
              onChange={(e) => handleBodyChange(e.target.value)}
              placeholder="Start writing…"
              aria-label="Note body"
              className="w-full min-h-[40vh] resize-y bg-transparent text-base text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-600 dark:placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed"
            />
            {showChecklistSection && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                <ChecklistEditor items={checklistItems} onChange={handleChecklistChange} />
              </div>
            )}
            {sketchData && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2">
                <img src={sketchData} alt="Sketch" className="max-w-full rounded-lg" />
              </div>
            )}
            {recordings.length > 0 && (
              <div className="space-y-2" aria-label="Voice memos">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                  Voice memos
                </p>
                {recordings.map((rec) => (
                  <AudioPlayerWidget
                    key={rec.id}
                    recording={rec}
                    onDelete={(id) => {
                      void StorageManager.deleteRecording(id);
                      refreshRecordings();
                    }}
                  />
                ))}
              </div>
            )}
            {ocrScans.length > 0 && (
              <div className="space-y-2" aria-label="Document scans">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                  Document scans
                </p>
                <ul className="space-y-1.5">
                  {ocrScans.map((scan) => (
                    <li
                      key={scan.id}
                      className="flex items-start gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-xs"
                    >
                      <FileText className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          Scan #{scan.id}
                        </p>
                        {scan.ocr_text ? (
                          <p className="text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                            {scan.ocr_text}
                          </p>
                        ) : (
                          <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                            No extracted text
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {locationName && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">📍 {locationName}</p>
            )}
          </>
        )}
      </div>

      <Suspense fallback={<ModalLoadingFallback label="Loading…" />}>
        {showSketchModal && !lockedGate && (
          <SketchCanvasModal
            initialDataUrl={sketchData}
            onSave={(dataUrl: string) => {
              setSketchData(dataUrl);
              setShowSketchModal(false);
              void (async () => {
                try {
                  const mediaKey = `${generatePrefixedId('sketch')}.png`;
                  const res = await fetch(dataUrl);
                  const blob = await res.blob();
                  await MediaRepository.putBinary(mediaKey, blob);
                  const updated = StorageManager.updateNote(note.id, {
                    sketch_media_key: mediaKey,
                    sketch_data: undefined,
                  });
                  if (updated) onNoteUpdated(updated);
                } catch {
                  const updated = StorageManager.updateNote(note.id, { sketch_data: dataUrl });
                  if (updated) onNoteUpdated(updated);
                }
              })();
            }}
            onClose={() => setShowSketchModal(false)}
          />
        )}
        {showOcrScanner && !lockedGate && (
          <OcrScannerModal
            noteId={note.id}
            onOcrExtracted={(text, _scanRecord, mode) => {
              const newBody = mode === 'replace' ? text : body ? `${body}\n\n${text}` : text;
              handleBodyChange(newBody);
              refreshOcrScans();
            }}
            onClose={() => {
              setShowOcrScanner(false);
              refreshOcrScans();
            }}
          />
        )}
        {showAudioStudioModal && !lockedGate && (
          <AudioRecordingModal
            isOpen={showAudioStudioModal}
            noteId={note.id}
            onRecordingComplete={(result) => {
              const refreshed = StorageManager.getNoteById(note.id);
              if (refreshed) onNoteUpdated(refreshed);
              refreshRecordings();
              const warning = result ? describeAudioImport(result) : null;
              if (warning) setImportStatus(warning);
            }}
            onTranscriptionUnavailable={(message) => {
              pendingTranscriptionErrorRef.current = message;
            }}
            onClose={() => {
              setShowAudioStudioModal(false);
              const message = pendingTranscriptionErrorRef.current;
              pendingTranscriptionErrorRef.current = null;
              if (message) {
                setRecoveryError(message);
                setShowRecoverySheet(true);
              }
            }}
          />
        )}
        {showRecoverySheet && (
          <TranscriptionRecoverySheet
            isOpen={showRecoverySheet}
            errorText={recoveryError || undefined}
            onClose={() => {
              setShowRecoverySheet(false);
              setRecoveryError(null);
            }}
            recordingId={recordings.length > 0 ? recordings[recordings.length - 1].id : undefined}
            onTranscribeSuccess={(transcript) => {
              if (transcript) {
                const newBody = body
                  ? `${body}

${transcript}`
                  : transcript;
                handleBodyChange(newBody);
              }
              setShowRecoverySheet(false);
            }}
          />
        )}
        {showSecurityModal && (
          <NoteSecurityModal
            note={note}
            onClose={() => setShowSecurityModal(false)}
            onUnlockSession={(payload, pin) => {
              applyUnlockedPayload(payload, pin);
            }}
            onSuccess={(updated) => {
              setIsUnlockedLocally(true);
              onNoteUpdated(updated);
              setShowSecurityModal(false);
            }}
          />
        )}
        {showShareModal && (
          <NoteShareModal
            note={note}
            event={events.find((e) => e.id === eventId)}
            onClose={() => setShowShareModal(false)}
          />
        )}
        {showRevisionsModal && (
          <ErrorBoundary
            fallbackRender={(error, reset) => (
              <ModalErrorFallback
                title="Revisions"
                message={error?.message || 'Failed'}
                onClose={() => {
                  setShowRevisionsModal(false);
                  reset();
                }}
              />
            )}
          >
            <NoteRevisionsModal
              note={note}
              onClose={() => setShowRevisionsModal(false)}
              onRestore={(restored) => {
                setTitle(restored.title || '');
                setBody(restored.body || '');
                onNoteUpdated(restored);
              }}
            />
          </ErrorBoundary>
        )}
        {showSettingsModal && (
          <SettingsModal onClose={() => setShowSettingsModal(false)} onSettingsUpdated={() => {}} />
        )}
        {showAiKeyModal && (
          <AiStudioKeyModal isOpen={showAiKeyModal} onClose={() => setShowAiKeyModal(false)} />
        )}
        {showAiSummaryModal && (
          <AiSummaryModal
            isOpen={showAiSummaryModal}
            note={{ ...note, title, body }}
            onClose={() => setShowAiSummaryModal(false)}
            onApplySummary={(summaryText: string, mode: 'append' | 'prepend' | 'replace') => {
              let newBody: string;
              if (mode === 'replace') newBody = summaryText;
              else if (mode === 'prepend') newBody = `${summaryText}\n\n---\n\n${body}`;
              else newBody = body ? `${body}\n\n${summaryText}` : summaryText;
              handleBodyChange(newBody);
              setShowAiSummaryModal(false);
            }}
          />
        )}
        {showCloudAiConsentModal && (
          <CloudAiConsentModal
            isOpen={showCloudAiConsentModal}
            providerName={llmProviderLabel(AiSettingsManager.getSettings().primaryLlmProvider)}
            operationDescription="Generate an AI summary of this note"
            onConfirm={() => {
              PrivacyManager.grantCloudAiConsent();
              setShowCloudAiConsentModal(false);
              if (pendingAiAction) {
                const action = pendingAiAction;
                setPendingAiAction(null);
                action();
              }
            }}
            onCancel={() => {
              setShowCloudAiConsentModal(false);
              setPendingAiAction(null);
            }}
          />
        )}
      </Suspense>
    </div>
  );
};
