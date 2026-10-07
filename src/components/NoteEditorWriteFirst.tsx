import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { NoteRecord, EventRecord, ChecklistItem } from '../types';
import { StorageManager } from '../lib/storage';
import { DraftStore } from '../lib/DraftStore';
import { SearchIndexQueue } from '../lib/SearchIndexQueue';
import { generatePrefixedId } from '../lib/uuid';
import { NoteEditorChrome } from './NoteEditorChrome';
import { ChecklistEditor } from './ChecklistEditor';
import { AiSettingsManager, type LlmProvider } from '../lib/aiSettings';
import { PrivacyManager } from '../lib/privacyManager';
import { ModalLoadingFallback } from './ModalLoadingFallback';
import { ErrorBoundary } from './ErrorBoundary';
import { ModalErrorFallback } from './ModalErrorFallback';

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

const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  google: 'Google Gemini',
  groq: 'Groq',
  ollama: 'Ollama (self-hosted endpoint)',
  offline_rules: 'Offline rules engine',
};

const llmProviderLabel = (provider: LlmProvider): string => LLM_PROVIDER_LABELS[provider] || provider;

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
  const [showAudioStudioModal, setShowAudioStudioModal] = useState(false);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);
  const [showCloudAiConsentModal, setShowCloudAiConsentModal] = useState(false);
  const [pendingAiAction, setPendingAiAction] = useState<(() => void) | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'stored'>('stored');
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setTitle(note.title || '');
    setBody(note.body || '');
    setChecklistItems(note.checklist_items || []);
    setShowChecklistSection(Boolean(note.checklist_items && note.checklist_items.length > 0));
    setEventId(note.event_id);
    setReminderAt(note.reminder_at || '');
    setLocationName(note.location_name || '');
    setSketchData(note.sketch_data);
  }, [note.id, note.updated_at]);

  const notifyUpdatedDebounced = (updatedNote: NoteRecord) => {
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => onNoteUpdated(updatedNote), 400);
  };

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    setSaveStatus('saving');
    DraftStore.write({ noteId: note.id, revision: 1, title, body: newBody, savedAt: Date.now() });
    const updated = StorageManager.updateNoteText(note.id, title, newBody, true);
    SearchIndexQueue.enqueue(note.id);
    if (updated) {
      DraftStore.clear(note.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('stored'), 1800);
      notifyUpdatedDebounced(updated);
    }
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setSaveStatus('saving');
    DraftStore.write({ noteId: note.id, revision: 1, title: newTitle, body, savedAt: Date.now() });
    const updated = StorageManager.updateNoteText(note.id, newTitle, body, true);
    SearchIndexQueue.enqueue(note.id);
    if (updated) {
      DraftStore.clear(note.id);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('stored'), 1800);
      notifyUpdatedDebounced(updated);
    }
  };

  const handleAddChecklistItem = () => {
    const newItem: ChecklistItem = { id: generatePrefixedId('chk'), text: '', completed: false };
    const updatedItems = [...checklistItems, newItem];
    setChecklistItems(updatedItems);
    setShowChecklistSection(true);
    const updated = StorageManager.updateNote(note.id, { checklist_items: updatedItems });
    if (updated) onNoteUpdated(updated);
  };

  const handleChecklistChange = (items: ChecklistItem[]) => {
    setChecklistItems(items);
    const updated = StorageManager.updateNote(note.id, { checklist_items: items });
    if (updated) onNoteUpdated(updated);
  };

  const handleOpenAiSummaryModal = () => {
    if (!AiSettingsManager.hasLocalKey()) {
      setShowAiKeyModal(true);
      return;
    }
    if (!PrivacyManager.isNetworkAllowed()) {
      setPendingAiAction(() => () => setShowAiSummaryModal(true));
      setShowCloudAiConsentModal(true);
      return;
    }
    setShowAiSummaryModal(true);
  };

  return (
    <div id="note-editor-container" className="h-full flex flex-col bg-white dark:bg-[#0c0c0e] overflow-hidden select-text relative">
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

      {showReminderPicker && (
        <div className="px-4 py-2 border-b border-amber-200/60 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/20 flex items-center gap-2 text-xs shrink-0">
          <span className="font-medium">Reminder</span>
          <input
            type="datetime-local"
            value={reminderAt ? reminderAt.slice(0, 16) : ''}
            onChange={(e) => {
              const v = e.target.value ? new Date(e.target.value).toISOString() : '';
              setReminderAt(v);
              const updated = StorageManager.updateNote(note.id, { reminder_at: v || undefined });
              if (updated) onNoteUpdated(updated);
            }}
            className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          <button type="button" className="text-zinc-500 underline" onClick={() => setShowReminderPicker(false)}>
            Done
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title"
          aria-label="Note title"
          className="w-full text-xl sm:text-2xl font-bold bg-transparent text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="Start writing…"
          aria-label="Note body"
          className="w-full min-h-[40vh] resize-y bg-transparent text-base text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none leading-relaxed"
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
      </div>

      <Suspense fallback={<ModalLoadingFallback label="Loading…" />}>
        {showSketchModal && (
          <SketchCanvasModal
            initialDataUrl={sketchData}
            onSave={(dataUrl: string) => {
              setSketchData(dataUrl);
              setShowSketchModal(false);
              const updated = StorageManager.updateNote(note.id, { sketch_data: dataUrl });
              if (updated) onNoteUpdated(updated);
            }}
            onClose={() => setShowSketchModal(false)}
          />
        )}
        {showOcrScanner && (
          <OcrScannerModal
            noteId={note.id}
            onOcrExtracted={(text, _scanRecord, mode) => {
              // The OCR scan record itself is persisted by the scanner; apply the
              // extracted text to the note body using the mode the user picked.
              const newBody = mode === 'replace' ? text : body ? `${body}\n\n${text}` : text;
              handleBodyChange(newBody);
            }}
            onClose={() => setShowOcrScanner(false)}
          />
        )}
        {showAudioStudioModal && (
          <AudioRecordingModal
            isOpen={showAudioStudioModal}
            noteId={note.id}
            onRecordingComplete={() => {
              // The memo and its transcript are written to storage by
              // AudioRecordingManager / OfflineAiManager, so re-read the note to
              // surface the new recording and transcript in the editor.
              const refreshed = StorageManager.getNoteById(note.id);
              if (refreshed) onNoteUpdated(refreshed);
            }}
            onClose={() => setShowAudioStudioModal(false)}
          />
        )}
        {showSecurityModal && (
          <NoteSecurityModal note={note} onClose={() => setShowSecurityModal(false)} onSuccess={onNoteUpdated} />
        )}
        {showShareModal && (
          <NoteShareModal note={note} event={events.find((e) => e.id === eventId)} onClose={() => setShowShareModal(false)} />
        )}
        {showRevisionsModal && (
          <ErrorBoundary fallbackRender={(error, reset) => (
            <ModalErrorFallback title="Revisions" message={error?.message || 'Failed'} onClose={() => { setShowRevisionsModal(false); reset(); }} />
          )}>
            <NoteRevisionsModal note={note} onClose={() => setShowRevisionsModal(false)} onRestore={(restored) => { setTitle(restored.title || ''); setBody(restored.body || ''); onNoteUpdated(restored); }} />
          </ErrorBoundary>
        )}
        {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} onSettingsUpdated={() => {}} />}
        {showAiKeyModal && <AiStudioKeyModal isOpen={showAiKeyModal} onClose={() => setShowAiKeyModal(false)} />}
        {showAiSummaryModal && (
          <AiSummaryModal
            isOpen={showAiSummaryModal}
            note={{ ...note, title, body }}
            onClose={() => setShowAiSummaryModal(false)}
            onApplySummary={(summaryText: string, mode: 'append' | 'prepend' | 'replace') => {
              let newBody = body;
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
              setShowCloudAiConsentModal(false);
              if (pendingAiAction) {
                const action = pendingAiAction;
                setPendingAiAction(null);
                action();
              }
            }}
            onCancel={() => { setShowCloudAiConsentModal(false); setPendingAiAction(null); }}
          />
        )}
      </Suspense>
    </div>
  );
};
