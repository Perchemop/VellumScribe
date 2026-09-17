import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  Mic,
  Camera,
  Eye,
  Edit3,
  Loader2,
  ArrowLeft,
  PenTool,
  CheckSquare,
  Bell,
  MapPin,
  Lock,
  Unlock,
  Clock,
  X,
  Share2,
  Settings,
  Plus,
  Trash2,
  Key,
  HardDrive,
  Pin,
  Copy,
  RotateCcw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { NoteRecord, EventRecord, RecordingRecord, TranscriptRecord, OcrScanRecord, ChecklistItem } from '../types';
import { StorageManager } from '../lib/storage';
import { VersionControlManager } from '../lib/versionControl';
import { GeminiApiService } from '../lib/geminiService';
import { AudioRecorderPlayer } from './AudioRecorderPlayer';
import { AudioPlayerWidget } from './AudioPlayerWidget';
import { OcrScannerModal } from './OcrScannerModal';
import { ChecklistEditor } from './ChecklistEditor';
import { SketchCanvasModal } from './SketchCanvasModal';
import { NoteSecurityModal } from './NoteSecurityModal';
import { NoteShareModal } from './NoteShareModal';
import { SettingsModal } from './SettingsModal';
import { AiSummaryModal } from './AiSummaryModal';
import { AiStudioKeyModal } from './AiStudioKeyModal';
import { AiSettingsManager } from '../lib/aiSettings';
import { UnlockSessionManager } from '../lib/UnlockSessionManager';
import { MediaRepository, SecureMediaRepository } from '../lib/MediaRepository';
import { NativeBridge } from '../lib/nativeBridge';
import { DraftStore, NoteDraft } from '../lib/DraftStore';
import { SearchIndexQueue } from '../lib/SearchIndexQueue';
import { ReminderService } from '../services/ReminderService';

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
  onOpenVersions,
  onClose,
}) => {
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody] = useState(note.body || '');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(note.checklist_items || []);
  const [sketchData, setSketchData] = useState<string | undefined>(note.sketch_data);
  const [eventId, setEventId] = useState(note.event_id);
  const [tags, setTags] = useState<string[]>(note.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [reminderAt, setReminderAt] = useState<string>(note.reminder_at || '');
  const [locationName, setLocationName] = useState<string>(note.location_name || '');

  // Independent Sections Visibility
  const [showChecklistSection, setShowChecklistSection] = useState(
    Boolean(note.checklist_items && note.checklist_items.length > 0)
  );
  
  // Modals & Popovers
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showOcrScanner, setShowOcrScanner] = useState(false);
  const [showSketchModal, setShowSketchModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'stored'>('stored');

  // Unlocking protected note in current session
  const [isUnlockedLocally, setIsUnlockedLocally] = useState(!note.is_locked);
  const [activePin, setActivePin] = useState<string | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<NoteDraft | null>(null);

  // Attached recordings & scans from local StorageManager
  const [recordings, setRecordings] = useState<RecordingRecord[]>(() =>
    StorageManager.getRecordingsForNote(note.id)
  );
  const [ocrScans, setOcrScans] = useState<OcrScanRecord[]>(() =>
    StorageManager.getOcrScansForNote(note.id)
  );

  useEffect(() => {
    // Check for crash recovery draft newer than saved database version
    const newerDraft = DraftStore.findNewerDraft(note.id, note.updated_at || note.created_at);
    if (newerDraft) {
      setRecoveredDraft(newerDraft);
    } else {
      setRecoveredDraft(null);
    }

    setTitle(note.title || '');
    setBody(note.body || '');
    setChecklistItems(note.checklist_items || []);
    setShowChecklistSection(Boolean(note.checklist_items && note.checklist_items.length > 0));
    setEventId(note.event_id);
    setTags(note.tags || []);
    setReminderAt(note.reminder_at || '');
    setLocationName(note.location_name || '');
    setIsUnlockedLocally(!note.is_locked);
    if (!note.is_locked) {
      setActivePin(null);
    }
    setRecordings(StorageManager.getRecordingsForNote(note.id));
    setOcrScans(StorageManager.getOcrScansForNote(note.id));

    // Resolve sketch media key if present
    let objectUrl: string | undefined;
    if (note.sketch_media_key) {
      const sessionKey = UnlockSessionManager.getSessionKey(note.id);
      const resolveSketch = async () => {
        let blob: Blob | null = null;
        if (sessionKey) {
          blob = await SecureMediaRepository.getEncryptedWithKey(note.sketch_media_key!, sessionKey);
        } else {
          blob = await MediaRepository.getBinary(note.sketch_media_key!);
        }
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setSketchData(objectUrl);
        } else {
          setSketchData(note.sketch_data);
        }
      };
      resolveSketch();
    } else {
      setSketchData(note.sketch_data);
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [note.id, note.sketch_media_key, note.sketch_data, note.is_locked]);

  // Word count & reading stats
  const stats = useMemo(() => {
    const text = (body || '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readTimeMinutes };
  }, [body]);

  const debounceTimerRef = useRef<number | null>(null);

  const notifyUpdatedDebounced = (updatedNote: NoteRecord) => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      onNoteUpdated(updatedNote);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    setSaveStatus('saving');
    // Volatile draft save for crash recovery
    DraftStore.write({ noteId: note.id, revision: 1, title, body: newBody, savedAt: Date.now() });

    if (note.is_locked && activePin) {
      StorageManager.saveUnlockedNote(note.id, { body: newBody }, activePin).then((updated) => {
        if (updated) {
          DraftStore.clear(note.id);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('stored'), 1800);
          notifyUpdatedDebounced(updated);
        }
      });
    } else {
      // High-performance field-specific update with skipFts: true to prevent UI stutter
      const updated = StorageManager.updateNoteText(note.id, title, newBody, true);
      // Background search index queue handles FTS asynchronously
      SearchIndexQueue.enqueue(note.id);
      if (updated) {
        DraftStore.clear(note.id);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('stored'), 1800);
        notifyUpdatedDebounced(updated);
      }
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

  const handleChecklistChange = (items: ChecklistItem[]) => {
    setChecklistItems(items);
    setSaveStatus('saving');
    if (note.is_locked && activePin) {
      StorageManager.saveUnlockedNote(note.id, { checklist_items: items }, activePin).then((updated) => {
        if (updated) {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('stored'), 1800);
          onNoteUpdated(updated);
        }
      });
    } else {
      const updated = StorageManager.updateNote(note.id, { checklist_items: items });
      if (updated) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('stored'), 1800);
        onNoteUpdated(updated);
      }
    }
  };

  const handleAddChecklistItem = () => {
    const newItem: ChecklistItem = {
      id: `chk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: '',
      completed: false,
    };
    const updatedItems = [...checklistItems, newItem];
    setChecklistItems(updatedItems);
    setShowChecklistSection(true);
    if (note.is_locked && activePin) {
      StorageManager.saveUnlockedNote(note.id, { checklist_items: updatedItems }, activePin).then((updated) => {
        if (updated) onNoteUpdated(updated);
      });
    } else {
      const updated = StorageManager.updateNote(note.id, { checklist_items: updatedItems });
      if (updated) onNoteUpdated(updated);
    }
  };

  const handleRemoveChecklistSection = () => {
    setChecklistItems([]);
    setShowChecklistSection(false);
    if (note.is_locked && activePin) {
      StorageManager.saveUnlockedNote(note.id, { checklist_items: [] }, activePin).then((updated) => {
        if (updated) onNoteUpdated(updated);
      });
    } else {
      const updated = StorageManager.updateNote(note.id, { checklist_items: [] });
      if (updated) onNoteUpdated(updated);
    }
  };

  const handleSketchSaved = async (dataUrl: string) => {
    setSketchData(dataUrl);
    const mediaKey = `sketch_${note.id}_${Date.now()}.png`;

    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      const sessionKey = UnlockSessionManager.getSessionKey(note.id);
      if (sessionKey) {
        await SecureMediaRepository.putEncryptedWithKey(mediaKey, blob, sessionKey);
      } else {
        await MediaRepository.putBinary(mediaKey, blob);
      }

      if (note.is_locked && activePin) {
        StorageManager.saveUnlockedNote(note.id, { sketch_media_key: mediaKey, sketch_data: undefined }, activePin).then((updated) => {
          if (updated) {
            onNoteUpdated(updated);
            VersionControlManager.saveVersionSnapshot(updated, 'Sketch Editor', 'Updated handwritten sketch canvas');
          }
        });
      } else {
        const updated = StorageManager.updateNote(note.id, {
          sketch_media_key: mediaKey,
          sketch_data: undefined,
        });
        if (updated) {
          onNoteUpdated(updated);
          VersionControlManager.saveVersionSnapshot(updated, 'Sketch Editor', 'Updated handwritten sketch canvas');
        }
      }
    } catch (e) {
      console.warn('Failed to save sketch binary', e);
    }
    setShowSketchModal(false);
  };

  const handleRemoveSketch = () => {
    setSketchData(undefined);
    if (note.sketch_media_key) {
      MediaRepository.deleteBinary(note.sketch_media_key).catch(e => console.warn(e));
    }
    if (note.is_locked && activePin) {
      StorageManager.saveUnlockedNote(note.id, { sketch_data: undefined, sketch_media_key: undefined }, activePin).then((updated) => {
        if (updated) onNoteUpdated(updated);
      });
    } else {
      const updated = StorageManager.updateNote(note.id, {
        sketch_data: undefined,
        sketch_media_key: undefined,
      });
      if (updated) onNoteUpdated(updated);
    }
  };

  const handleSetReminder = async (datetime: string) => {
    setReminderAt(datetime);
    const updated = StorageManager.updateNote(note.id, { reminder_at: datetime || undefined });
    if (updated) {
      onNoteUpdated(updated);
      if (datetime) {
        await ReminderService.scheduleReminder(updated);
      } else {
        await ReminderService.cancelReminder(note.id);
      }
    }
    setShowReminderPicker(false);
  };

  const handleDetectLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
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
        () => {
          const fallback = 'Current Device Location';
          setLocationName(fallback);
          const updated = StorageManager.updateNote(note.id, { location_name: fallback });
          if (updated) onNoteUpdated(updated);
          setShowLocationPicker(false);
        }
      );
    }
  };

  const handleSaveLocationCustom = (val: string) => {
    setLocationName(val);
    const updated = StorageManager.updateNote(note.id, { location_name: val || undefined });
    if (updated) onNoteUpdated(updated);
    setShowLocationPicker(false);
  };

  const handleApplyAiSummary = (summaryText: string, mode: 'append' | 'prepend' | 'replace') => {
    let newBody = body;
    if (mode === 'replace') {
      newBody = summaryText;
    } else if (mode === 'prepend') {
      newBody = `${summaryText}\n\n---\n\n${body}`;
    } else {
      newBody = body ? `${body}\n\n${summaryText}` : summaryText;
    }
    setBody(newBody);
    const updated = StorageManager.updateNote(note.id, { body: newBody });
    if (updated) {
      VersionControlManager.saveVersionSnapshot(updated, 'Gemini AI', 'Applied AI Summary synthesis');
      onNoteUpdated(updated);
    }
    setAiNotice('AI Summary successfully applied to note!');
    setTimeout(() => setAiNotice(null), 4000);
  };

  // Quick One-Click AI Summarization / Meeting Minutes with Google Gemini API
  const handleGenerateMeetingMinutes = async () => {
    setIsGeneratingMinutes(true);
    setAiNotice(null);
    try {
      const transcripts = StorageManager.getTranscripts();
      const noteRecIds = recordings.map((r) => r.id);
      const noteTranscripts = transcripts
        .filter((t) => noteRecIds.includes(t.recording_id))
        .map((t) => t.transcript_text)
        .join('\n\n');

      const checklistSummary = checklistItems && checklistItems.length > 0
        ? `\n\nChecklist Items:\n` + checklistItems.map((c) => `- [${c.completed ? 'x' : ' '}] ${c.text}`).join('\n')
        : '';

      const fullContext = `${body}${checklistSummary}`;
      const parentEvent = events.find((e) => e.id === eventId);

      const res = await GeminiApiService.generateMeetingMinutes(
        noteTranscripts || fullContext,
        fullContext,
        parentEvent?.title || title || 'Meeting Notes'
      );

      const newBody = `${body}${res.meetingMinutes}`;
      setBody(newBody);
      const updated = StorageManager.updateNote(note.id, { body: newBody });
      if (updated) {
        VersionControlManager.saveVersionSnapshot(updated, 'Gemini AI', `Appended AI summary (${res.source || 'Gemini 3.7 Flash'})`);
        onNoteUpdated(updated);
      }
      setAiNotice('AI Summary successfully generated and appended!');
      setTimeout(() => setAiNotice(null), 4000);
    } catch (e: any) {
      console.error('Failed to generate AI meeting summary:', e);
      const errMsg = e?.message || 'Failed to generate AI meeting summary.';
      if (errMsg.includes('quota') || errMsg.includes('key') || errMsg.includes('resource_exhausted')) {
        setAiNotice(`AI Quota: Please add your free Google AI Studio key to continue unlimited summaries.`);
        setShowAiKeyModal(true);
      } else {
        setAiNotice(`AI Summary: ${errMsg}`);
      }
      setTimeout(() => setAiNotice(null), 6000);
    } finally {
      setIsGeneratingMinutes(false);
    }
  };

  const handleRecordingSaved = (_rec: RecordingRecord, transcript?: TranscriptRecord) => {
    setRecordings(StorageManager.getRecordingsForNote(note.id));
    if (transcript) {
      const newBody = `${body}\n\n> **Voice Transcript (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}):**\n> "${transcript.transcript_text}"`;
      setBody(newBody);
      const updated = StorageManager.updateNote(note.id, { body: newBody });
      if (updated) onNoteUpdated(updated);
    }
    setShowAudioRecorder(false);
  };

  const handleOcrExtracted = (extractedText: string, _scanRecord: OcrScanRecord, mode: 'append' | 'replace') => {
    setOcrScans(StorageManager.getOcrScansForNote(note.id));
    let newBody = body;
    if (mode === 'replace') {
      newBody = `# ${title || 'Handwritten OCR Scan'}\n\n${extractedText}`;
    } else {
      newBody = `${body}\n\n### Handwritten OCR Scan (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}):\n${extractedText}`;
    }
    setBody(newBody);
    const updated = StorageManager.updateNote(note.id, { body: newBody });
    if (updated) onNoteUpdated(updated);
    setShowOcrScanner(false);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const updated = [...tags, newTagInput.trim()];
      setTags(updated);
      setNewTagInput('');
      const updatedNote = StorageManager.updateNote(note.id, { tags: updated });
      if (updatedNote) onNoteUpdated(updatedNote);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove);
    setTags(updated);
    const updatedNote = StorageManager.updateNote(note.id, { tags: updated });
    if (updatedNote) onNoteUpdated(updatedNote);
  };

  // If note is locked and user hasn't entered PIN in this session
  if (note.is_locked && !isUnlockedLocally) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 bg-white dark:bg-[#0c0c0e] text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {note.lock_mode === 'private' ? '🔒 Private Encrypted Note' : (note.title || 'Protected Note')}
          </h3>
          <p className="text-xs text-zinc-400">
            This note is encrypted at rest. Enter your {note.security_type === 'passphrase' ? 'passphrase' : 'PIN'} to unlock this active session.
          </p>
        </div>
        <button
          onClick={() => setShowSecurityModal(true)}
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs transition-opacity"
        >
          {note.security_type === 'passphrase' ? 'Enter Passphrase to Unlock' : 'Enter PIN to Unlock'}
        </button>

        {showSecurityModal && (
          <NoteSecurityModal
            note={note}
            mode="gate"
            onUnlockSession={(payload, pin) => {
              setActivePin(pin);
              if (payload.title) setTitle(payload.title);
              if (payload.tags) setTags(payload.tags);
              setBody(payload.body || '');
              setChecklistItems(payload.checklist_items || []);
              setShowChecklistSection(Boolean(payload.checklist_items && payload.checklist_items.length > 0));
              setSketchData(payload.sketch_data);
              setIsUnlockedLocally(true);
            }}
            onSuccess={(updated) => {
              setIsUnlockedLocally(true);
              onNoteUpdated(updated);
            }}
            onClose={() => setShowSecurityModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      id="note-editor-container"
      className="h-full flex flex-col bg-white dark:bg-[#0c0c0e] overflow-hidden select-text relative"
    >
      {/* Top Editorial Control Strip - Cleaned & Simplified */}
      <div className="px-3 sm:px-6 py-2.5 border-b border-zinc-100 dark:border-zinc-850 flex items-center justify-between gap-2 shrink-0 bg-white/80 dark:bg-[#0c0c0e]/80 backdrop-blur-xs overflow-x-auto no-scrollbar">
        {/* Left: Navigation & Category Tag */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onClose && (
            <button
              id="back-to-notes-btn"
              onClick={onClose}
              aria-label="Back to Notes list"
              className="p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
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
            className="bg-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-medium focus:outline-hidden cursor-pointer max-w-[140px] truncate"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                {ev.title}
              </option>
            ))}
          </select>
        </div>

        {/* Right: Independent Tooling & Creation Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Add / Toggle Independent Checklist */}
          <button
            id="toggle-checklist-btn"
            aria-label={showChecklistSection ? 'Checklist Active' : 'Add Checklist to Note'}
            onClick={() => {
              if (!showChecklistSection) {
                handleAddChecklistItem();
              } else {
                setShowChecklistSection((prev) => !prev);
              }
            }}
            title={showChecklistSection ? 'Checklist Active' : 'Add Checklist to Note'}
            className={`flex items-center justify-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showChecklistSection
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Checklist</span>
          </button>

          {/* Add / Edit Independent Sketch Drawing */}
          <button
            id="toggle-sketch-btn"
            aria-label={sketchData ? 'Edit Handwritten Sketch' : 'Add Sketch Canvas to Note'}
            onClick={() => setShowSketchModal(true)}
            title={sketchData ? 'Edit Handwritten Sketch' : 'Add Sketch Canvas to Note'}
            className={`flex items-center justify-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sketchData
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sketch</span>
          </button>

          {/* AI Summarization & Synthesis */}
          <button
            id="open-ai-summary-btn"
            aria-label="Generate AI Summary with Google Gemini"
            onClick={() => setShowAiSummaryModal(true)}
            title="Generate AI Summary with Google Gemini (Executive, Action Items, Outline)"
            className="flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 rounded-lg text-xs font-semibold transition-colors shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Summary</span>
          </button>

          {/* Quick AI Studio Key Authenticator */}
          <button
            id="ai-studio-key-btn"
            aria-label={AiSettingsManager.hasLocalKey() ? `AI Studio Key Configured (${AiSettingsManager.getMaskedKey()})` : 'Add Free Google AI Studio API Key'}
            onClick={() => setShowAiKeyModal(true)}
            title={AiSettingsManager.hasLocalKey() ? `AI Studio Key Configured (${AiSettingsManager.getMaskedKey()})` : 'Add Free Google AI Studio API Key'}
            className={`flex items-center justify-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              AiSettingsManager.hasLocalKey()
                ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{AiSettingsManager.hasLocalKey() ? 'Key Active' : 'Add Key'}</span>
          </button>

          {/* Voice Memo Recording */}
          <button
            id="open-audio-recorder-btn"
            aria-label="Record Voice Memo"
            onClick={() => setShowAudioRecorder((prev) => !prev)}
            title="Record Voice Memo"
            className={`flex items-center justify-center gap-1 min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showAudioRecorder
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Voice</span>
          </button>

          {/* OCR Document Scan */}
          <button
            id="open-ocr-scanner-btn"
            aria-label="OCR Scan Document"
            onClick={() => setShowOcrScanner(true)}
            title="OCR Scan Document"
            className="flex items-center justify-center min-h-[38px] min-w-[38px] p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

          {/* Reminder button */}
          <button
            aria-label={reminderAt ? `Reminder: ${new Date(reminderAt).toLocaleString()}` : 'Set Note Reminder'}
            onClick={() => setShowReminderPicker((p) => !p)}
            title={reminderAt ? `Reminder: ${new Date(reminderAt).toLocaleString()}` : 'Set Note Reminder'}
            className={`flex items-center justify-center min-h-[38px] min-w-[38px] p-2 rounded-lg transition-colors ${
              reminderAt
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
          </button>

          {/* Geotag Location */}
          <button
            aria-label={locationName ? `Location: ${locationName}` : 'Add Location / Geotag'}
            onClick={() => setShowLocationPicker((p) => !p)}
            title={locationName ? `Location: ${locationName}` : 'Add Location / Geotag'}
            className={`flex items-center justify-center min-h-[38px] min-w-[38px] p-2 rounded-lg transition-colors ${
              locationName
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>

          {/* PIN Security Lock */}
          <button
            aria-label={note.is_locked ? 'Manage PIN Security' : 'Protect Note with PIN'}
            onClick={() => setShowSecurityModal(true)}
            title={note.is_locked ? 'Manage PIN Security' : 'Protect Note with PIN'}
            className={`flex items-center justify-center min-h-[38px] min-w-[38px] p-2 rounded-lg transition-colors ${
              note.is_locked
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850'
            }`}
          >
            {note.is_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>

          {/* Markdown View / Edit Toggle */}
          <button
            aria-label={viewMode === 'preview' ? 'Switch to Markdown Edit Mode' : 'Switch to Markdown Preview'}
            onClick={() => setViewMode(viewMode === 'preview' ? 'edit' : 'preview')}
            title={viewMode === 'preview' ? 'Switch to Markdown Edit Mode' : 'Switch to Markdown Preview'}
            className="flex items-center justify-center min-h-[38px] min-w-[38px] p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg transition-colors"
          >
            {viewMode === 'preview' ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>

          {/* Toggle Pin */}
          <button
            id="note-editor-pin-btn"
            aria-label={note.is_pinned ? 'Unpin Note' : 'Pin Note'}
            onClick={() => {
              const updated = StorageManager.togglePinNote(note.id);
              if (updated) onNoteUpdated(updated);
            }}
            title={note.is_pinned ? 'Unpin Note' : 'Pin Note to Top'}
            className={`flex items-center justify-center min-h-[38px] min-w-[38px] p-2 rounded-lg transition-colors ${
              note.is_pinned
                ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 font-semibold'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'fill-current' : ''}`} />
          </button>

          {/* Duplicate Note */}
          <button
            id="note-editor-duplicate-btn"
            aria-label="Duplicate Note"
            onClick={() => {
              const dup = StorageManager.duplicateNote(note.id);
              if (dup) onNoteUpdated(dup);
            }}
            title="Duplicate Note"
            className="flex items-center justify-center min-h-[38px] min-w-[38px] p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {/* Share & Export */}
          <button
            id="note-editor-share-btn"
            aria-label="Share & Export Note"
            onClick={() => setShowShareModal(true)}
            title="Share & Export Note"
            className="flex items-center justify-center min-h-[38px] min-w-[38px] p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          {/* App & AI Settings */}
          <button
            id="note-editor-settings-btn"
            aria-label="Settings & Google AI Studio API Key"
            onClick={() => setShowSettingsModal(true)}
            title="Settings & Google AI Studio API Key"
            className="flex items-center justify-center min-h-[38px] min-w-[38px] p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* AI Notification Banner */}
      {aiNotice && (
        <div className="px-6 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200/60 dark:border-indigo-900/40 text-indigo-900 dark:text-indigo-200 text-xs flex items-center justify-between animate-fade-in shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{aiNotice}</span>
          </div>
          <button onClick={() => setAiNotice(null)} className="p-1 text-indigo-400 hover:text-indigo-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reminder Picker Popover */}
      {showReminderPicker && (
        <div className="px-6 py-3 bg-amber-50/70 dark:bg-amber-950/20 border-b border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between gap-3 text-xs animate-fade-in shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Due Date & Reminder:</span>
            <input
              type="datetime-local"
              value={reminderAt ? reminderAt.slice(0, 16) : ''}
              onChange={(e) => handleSetReminder(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">(notifies in-app and via browser alert when due)</span>
          </div>
          <div className="flex items-center gap-2">
            {reminderAt && (
              <button
                onClick={() => handleSetReminder('')}
                className="text-xs text-rose-600 hover:underline"
              >
                Clear reminder
              </button>
            )}
            <button
              onClick={() => setShowReminderPicker(false)}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Location Picker Popover */}
      {showLocationPicker && (
        <div className="px-6 py-3 bg-emerald-50/70 dark:bg-emerald-950/20 border-b border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between gap-3 text-xs animate-fade-in shrink-0">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <input
              type="text"
              placeholder="Enter location / place name..."
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveLocationCustom(locationName);
              }}
              className="flex-1 px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs"
            />
            <button
              onClick={handleDetectLocation}
              className="px-2.5 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold rounded-lg text-xs shrink-0"
            >
              Use GPS
            </button>
          </div>
          <div className="flex items-center gap-2">
            {locationName && (
              <button
                onClick={() => handleSaveLocationCustom('')}
                className="text-xs text-rose-600 hover:underline"
              >
                Remove
              </button>
            )}
            <button
              onClick={() => setShowLocationPicker(false)}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Voice Memo Recording Studio */}
      {showAudioRecorder && (
        <div className="px-4 sm:px-12 py-3 border-b border-zinc-100 dark:border-zinc-850 bg-zinc-50/50 dark:bg-[#121215]/50 animate-fade-in shrink-0">
          <div className="max-w-3xl mx-auto">
            <AudioRecorderPlayer
              noteId={note.id}
              onRecordingSaved={handleRecordingSaved}
              onClose={() => setShowAudioRecorder(false)}
            />
          </div>
        </div>
      )}

      {/* Attached Media Strip (Audio Player / Scans / Location / Reminder Badges) */}
      {(recordings.length > 0 || ocrScans.length > 0 || reminderAt || locationName) && (
        <div className="px-4 sm:px-12 py-2.5 border-b border-zinc-100 dark:border-zinc-850 bg-[#fafaf9]/40 dark:bg-[#101014]/40 shrink-0">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Metadata Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {reminderAt && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-medium border border-amber-200 dark:border-amber-800">
                  <Bell className="w-3 h-3" />
                  <span>Reminder: {new Date(reminderAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              )}

              {locationName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                  <MapPin className="w-3 h-3" />
                  <span>{locationName}</span>
                </span>
              )}
            </div>

            {/* Audio Recordings */}
            {recordings.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold block">
                  Audio Memos ({recordings.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {recordings.map((rec) => (
                    <AudioPlayerWidget
                      key={rec.id}
                      recording={rec}
                      onDelete={(id) => {
                        StorageManager.deleteRecording(id);
                        setRecordings(StorageManager.getRecordingsForNote(note.id));
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* OCR Scans */}
            {ocrScans.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mr-1">
                  Scans:
                </span>
                {ocrScans.map((scan) => (
                  <span
                    key={scan.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 font-mono"
                  >
                    Scan #{scan.id}
                    <button
                      onClick={() => {
                        StorageManager.deleteOcrScan(scan.id);
                        setOcrScans(StorageManager.getOcrScansForNote(note.id));
                      }}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-100 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Unified Note Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-12 sm:py-8 custom-minimal-scrollbar">
        <div className="max-w-3xl mx-auto w-full space-y-6">
          {/* Crash Recovery Banner */}
          {recoveredDraft && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs animate-fade-in">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  Recovered unsaved edits from {new Date(recoveredDraft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTitle(recoveredDraft.title);
                    setBody(recoveredDraft.body);
                    StorageManager.updateNoteText(note.id, recoveredDraft.title, recoveredDraft.body);
                    DraftStore.clear(note.id);
                    setRecoveredDraft(null);
                  }}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl text-xs shadow-2xs transition-colors"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    DraftStore.clear(note.id);
                    setRecoveredDraft(null);
                  }}
                  className="px-2.5 py-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-medium"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* Note Title Input */}
          <input
            id="note-title-input"
            type="text"
            placeholder="Untitled"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full bg-transparent text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 placeholder-zinc-300 dark:placeholder-zinc-700 focus:outline-hidden font-sans"
          />

          {/* Tags bar */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 text-xs font-medium"
              >
                #{t}
                <button
                  onClick={() => handleRemoveTag(t)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="+ tag"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="text-xs bg-transparent text-zinc-500 placeholder-zinc-400 focus:outline-hidden px-1 py-0.5 w-16"
            />
          </div>

          {/* 1. Independent Embedded Sketch Canvas (If added or existing) */}
          {sketchData && (
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 relative overflow-hidden group space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <PenTool className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Handwritten Sketch
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSketchModal(true)}
                    className="px-2.5 py-1 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-medium transition-colors"
                  >
                    Edit Sketch
                  </button>
                  <button
                    onClick={handleRemoveSketch}
                    title="Remove sketch from note"
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center p-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
                <img
                  src={sketchData}
                  alt="Handwritten sketch"
                  referrerPolicy="no-referrer"
                  className="max-h-[300px] object-contain rounded-lg"
                />
              </div>
            </div>
          )}

          {/* 2. Independent Embedded Checklist (If active) */}
          {showChecklistSection && (
            <div className="p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                    Checklist ({checklistItems.filter((c) => c.completed).length}/{checklistItems.length})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddChecklistItem}
                    className="px-2 py-0.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-750 text-xs font-medium rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Add Task
                  </button>
                  <button
                    onClick={handleRemoveChecklistSection}
                    title="Hide / clear checklist"
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <ChecklistEditor
                items={checklistItems}
                onChange={handleChecklistChange}
              />
            </div>
          )}

          {/* 3. Core Markdown Text Writing & AI Synthesis Body */}
          <div className="space-y-2">
            {viewMode === 'edit' ? (
              <textarea
                id="note-body-markdown-editor"
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Capture thoughts, notes, transcripts, or generate AI summaries..."
                className="w-full min-h-[360px] bg-transparent text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-relaxed resize-none focus:outline-hidden border-none p-0 font-sans"
              />
            ) : (
              <div className="prose-minimal text-sm sm:text-base leading-relaxed font-sans min-h-[360px]">
                <ReactMarkdown
                  urlTransform={(url) => {
                    const clean = url.trim().toLowerCase();
                    if (clean.startsWith('javascript:') || clean.startsWith('vbscript:') || clean.startsWith('data:text/html')) {
                      return '';
                    }
                    return url;
                  }}
                  components={{
                    a: ({ node, ...props }) => (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                      />
                    ),
                  }}
                >
                  {body || '_No content written yet._'}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quiet Status Bar */}
      <div className="px-4 sm:px-6 py-2 border-t border-zinc-100 dark:border-zinc-850 bg-white/80 dark:bg-[#0c0c0e]/80 flex items-center justify-between text-xs text-zinc-400 font-mono shrink-0">
        <div className="flex items-center gap-3">
          <span>{stats.words} words</span>
          <span>·</span>
          <span>{stats.readTimeMinutes} min read</span>
          {saveStatus === 'saving' && (
            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-sans">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-sans">
              <CheckSquare className="w-3 h-3" />
              Saved on device
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div
            id="storage-status-indicator"
            className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-sans"
            title="All notes and media remain private and stored directly on this device"
          >
            <HardDrive className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Stored on this device</span>
          </div>

          <button
            onClick={onOpenVersions}
            className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            v{note.version || 1}
          </button>
        </div>
      </div>

      {/* AI Summary Studio Modal */}
      {showAiSummaryModal && (
        <AiSummaryModal
          isOpen={showAiSummaryModal}
          note={note}
          transcripts={StorageManager.getTranscripts().filter(t => recordings.some(r => r.id === t.recording_id))}
          ocrScans={ocrScans}
          eventTitle={events.find((e) => e.id === eventId)?.title}
          onApplySummary={handleApplyAiSummary}
          onClose={() => setShowAiSummaryModal(false)}
        />
      )}

      {/* Google AI Studio Free Key Authentication Modal */}
      {showAiKeyModal && (
        <AiStudioKeyModal
          isOpen={showAiKeyModal}
          onClose={() => setShowAiKeyModal(false)}
          onSuccess={() => {
            setAiNotice('Google AI Studio API key verified and saved successfully!');
            setTimeout(() => setAiNotice(null), 3500);
          }}
        />
      )}

      {/* Sketch Canvas Modal */}
      {showSketchModal && (
        <SketchCanvasModal
          initialDataUrl={sketchData}
          onSave={handleSketchSaved}
          onClose={() => setShowSketchModal(false)}
        />
      )}

      {/* Note Security Lock Modal */}
      {showSecurityModal && (
        <NoteSecurityModal
          note={note}
          mode={note.is_locked ? 'manage' : 'set'}
          currentPayload={{
            body,
            checklist_items: checklistItems,
            sketch_data: sketchData,
          }}
          onSuccess={(updated) => {
            if (!updated.is_locked) {
              setActivePin(null);
            }
            setIsUnlockedLocally(true);
            onNoteUpdated(updated);
          }}
          onClose={() => setShowSecurityModal(false)}
        />
      )}

      {/* OCR Scanner Modal */}
      {showOcrScanner && (
        <OcrScannerModal
          noteId={note.id}
          onOcrExtracted={handleOcrExtracted}
          onClose={() => setShowOcrScanner(false)}
        />
      )}

      {/* Note Share & Export Modal */}
      {showShareModal && (
        <NoteShareModal
          note={note}
          event={events.find((e) => e.id === eventId)}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* In-Editor Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onSettingsUpdated={() => {
            // Settings updated
          }}
        />
      )}
    </div>
  );
};
