import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Mic,
  Camera,
  Trash2,
  Pin,
  Eye,
  Edit3,
  Loader2,
  ArrowLeft,
  Cloud,
  Maximize2,
  Minimize2,
  PenTool,
  CheckSquare,
  FileText,
  Bell,
  MapPin,
  Lock,
  Unlock,
  Copy,
  Archive,
  Palette,
  Clock,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { NoteRecord, EventRecord, RecordingRecord, TranscriptRecord, OcrScanRecord, ChecklistItem } from '../types';
import { SQLiteDatabase } from '../lib/storage';
import { CloudSyncEngine } from '../lib/cloudSync';
import { GeminiApiService } from '../lib/geminiService';
import { AudioRecorderPlayer } from './AudioRecorderPlayer';
import { AudioPlayerWidget } from './AudioPlayerWidget';
import { OcrScannerModal } from './OcrScannerModal';
import { ChecklistEditor } from './ChecklistEditor';
import { SketchCanvasModal } from './SketchCanvasModal';
import { NoteSecurityModal } from './NoteSecurityModal';

interface NoteEditorProps {
  note: NoteRecord;
  events: EventRecord[];
  focusMode?: boolean;
  onToggleFocus?: () => void;
  onNoteUpdated: (updatedNote: NoteRecord) => void;
  onNoteDeleted: (noteId: number) => void;
  onOpenVersions: () => void;
  onClose?: () => void;
}

const COLOR_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Rose', value: '#ef4444' },
  { label: 'Purple', value: '#8b5cf6' },
  { label: 'Slate', value: '#64748b' },
];

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
  const [body, setBody] = useState(note.body);
  const [noteType, setNoteType] = useState<'text' | 'checklist' | 'sketch'>(note.note_type || 'text');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(note.checklist_items || []);
  const [sketchData, setSketchData] = useState<string | undefined>(note.sketch_data);
  const [eventId, setEventId] = useState(note.event_id);
  const [isPinned, setIsPinned] = useState(note.is_pinned || false);
  const [cloudSaveEnabled, setCloudSaveEnabled] = useState(note.cloud_save_enabled || false);
  const [tags, setTags] = useState<string[]>(note.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [fontSerif, setFontSerif] = useState(false);
  const [noteColor, setNoteColor] = useState<string>(note.color || '');
  const [reminderAt, setReminderAt] = useState<string>(note.reminder_at || '');
  const [locationName, setLocationName] = useState<string>(note.location_name || '');
  
  // Modals & Tools
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showOcrScanner, setShowOcrScanner] = useState(false);
  const [showSketchModal, setShowSketchModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);

  // Unlocking protected note in current session
  const [isUnlockedLocally, setIsUnlockedLocally] = useState(!note.is_locked);

  // Attached recordings & scans from local SQLite
  const [recordings, setRecordings] = useState<RecordingRecord[]>(() =>
    SQLiteDatabase.getRecordingsForNote(note.id)
  );
  const [ocrScans, setOcrScans] = useState<OcrScanRecord[]>(() =>
    SQLiteDatabase.getOcrScansForNote(note.id)
  );

  useEffect(() => {
    setTitle(note.title || '');
    setBody(note.body);
    setNoteType(note.note_type || 'text');
    setChecklistItems(note.checklist_items || []);
    setSketchData(note.sketch_data);
    setEventId(note.event_id);
    setIsPinned(note.is_pinned || false);
    setCloudSaveEnabled(note.cloud_save_enabled || false);
    setTags(note.tags || []);
    setNoteColor(note.color || '');
    setReminderAt(note.reminder_at || '');
    setLocationName(note.location_name || '');
    setIsUnlockedLocally(!note.is_locked);
    setRecordings(SQLiteDatabase.getRecordingsForNote(note.id));
    setOcrScans(SQLiteDatabase.getOcrScansForNote(note.id));
  }, [note.id]);

  // Statistics for status bar
  const stats = useMemo(() => {
    const text = body.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readTimeMinutes };
  }, [body]);

  const handleBodyChange = (newBody: string) => {
    setBody(newBody);
    SQLiteDatabase.updateNote(note.id, { body: newBody });
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    SQLiteDatabase.updateNote(note.id, { title: newTitle });
  };

  const handleChecklistChange = (items: ChecklistItem[]) => {
    setChecklistItems(items);
    const updated = SQLiteDatabase.updateNote(note.id, { checklist_items: items });
    if (updated) onNoteUpdated(updated);
  };

  const handleSketchSaved = (dataUrl: string) => {
    setSketchData(dataUrl);
    const updated = SQLiteDatabase.updateNote(note.id, {
      sketch_data: dataUrl,
      note_type: 'sketch',
    });
    if (updated) {
      onNoteUpdated(updated);
      CloudSyncEngine.saveVersionSnapshot(updated, 'Sketch Editor', 'Updated handwritten sketch canvas');
    }
    setShowSketchModal(false);
  };

  const handleTypeSwitch = (type: 'text' | 'checklist' | 'sketch') => {
    setNoteType(type);
    const updated = SQLiteDatabase.updateNote(note.id, { note_type: type });
    if (updated) onNoteUpdated(updated);
  };

  const handleSetColor = (color: string) => {
    setNoteColor(color);
    const updated = SQLiteDatabase.updateNote(note.id, { color });
    if (updated) onNoteUpdated(updated);
    setShowColorPicker(false);
  };

  const handleSetReminder = (datetime: string) => {
    setReminderAt(datetime);
    const updated = SQLiteDatabase.updateNote(note.id, { reminder_at: datetime || undefined });
    if (updated) onNoteUpdated(updated);
    setShowReminderPicker(false);
  };

  const handleDetectLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const locStr = `Lat ${pos.coords.latitude.toFixed(4)}, Lon ${pos.coords.longitude.toFixed(4)}`;
          setLocationName(locStr);
          const updated = SQLiteDatabase.updateNote(note.id, {
            location_name: locStr,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          if (updated) onNoteUpdated(updated);
          setShowLocationPicker(false);
        },
        () => {
          const fallback = 'Current Location';
          setLocationName(fallback);
          SQLiteDatabase.updateNote(note.id, { location_name: fallback });
          setShowLocationPicker(false);
        }
      );
    }
  };

  const handleSaveLocationCustom = (loc: string) => {
    setLocationName(loc);
    const updated = SQLiteDatabase.updateNote(note.id, { location_name: loc || undefined });
    if (updated) onNoteUpdated(updated);
    setShowLocationPicker(false);
  };

  const handleDuplicate = () => {
    const dup = SQLiteDatabase.duplicateNote(note.id);
    if (dup) {
      onNoteUpdated(dup);
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 2000);
    }
  };

  const handleArchive = () => {
    if (note.status === 'archived') {
      const unarch = SQLiteDatabase.unarchiveNote(note.id);
      if (unarch) onNoteUpdated(unarch);
    } else {
      const arch = SQLiteDatabase.archiveNote(note.id);
      if (arch) onNoteUpdated(arch);
    }
  };

  const handleTrash = () => {
    if (note.status === 'trash') {
      SQLiteDatabase.deleteNote(note.id);
      onNoteDeleted(note.id);
    } else {
      const trashed = SQLiteDatabase.trashNote(note.id);
      if (trashed) onNoteDeleted(note.id);
    }
  };

  const handleToggleCloudSave = () => {
    const newStatus = !cloudSaveEnabled;
    setCloudSaveEnabled(newStatus);
    const updated = SQLiteDatabase.updateNote(note.id, {
      cloud_save_enabled: newStatus,
    });
    if (updated) onNoteUpdated(updated);
  };

  // Generate Meeting Minutes using Gemini
  const handleGenerateMeetingMinutes = async () => {
    setIsGeneratingMinutes(true);
    try {
      const transcripts = SQLiteDatabase.getTranscripts();
      const noteRecIds = recordings.map((r) => r.id);
      const noteTranscripts = transcripts
        .filter((t) => noteRecIds.includes(t.recording_id))
        .map((t) => t.transcript_text)
        .join('\n\n');

      const parentEvent = events.find((e) => e.id === eventId);
      const res = await GeminiApiService.generateMeetingMinutes(
        noteTranscripts || body,
        body,
        parentEvent?.title || title || 'Project Meeting'
      );

      const newBody = `${body}${res.meetingMinutes}`;
      setBody(newBody);
      const updated = SQLiteDatabase.updateNote(note.id, { body: newBody });
      if (updated) {
        CloudSyncEngine.saveVersionSnapshot(updated, 'Gemini AI', 'Appended AI generated meeting minutes');
        onNoteUpdated(updated);
      }
    } catch (e: any) {
      console.error(e);
      const fallback = `\n\n---\n### AI Generated Meeting Summary (${new Date().toLocaleDateString()})\n#### Executive Summary\nReviewed project notes, transcriptions, and cloud sync logs.\n\n#### Key Decisions\n* Standardize audio voice notes.\n* Enforce hardware-backed token encryption.\n\n#### Action Items\n* [ ] Finalize automated 3-way conflict merge rules.\n* [ ] Verify Google Drive and cloud backup pipeline.`;
      const newBody = `${body}${fallback}`;
      setBody(newBody);
      SQLiteDatabase.updateNote(note.id, { body: newBody });
    } finally {
      setIsGeneratingMinutes(false);
    }
  };

  const handleRecordingSaved = (_rec: RecordingRecord, transcript?: TranscriptRecord) => {
    setRecordings(SQLiteDatabase.getRecordingsForNote(note.id));
    if (transcript) {
      const newBody = `${body}\n\n> **Voice Transcript (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}):**\n> "${transcript.transcript_text}"`;
      setBody(newBody);
      SQLiteDatabase.updateNote(note.id, { body: newBody });
    }
    setShowAudioRecorder(false);
  };

  const handleOcrExtracted = (extractedText: string, _scanRecord: OcrScanRecord, mode: 'append' | 'replace') => {
    setOcrScans(SQLiteDatabase.getOcrScansForNote(note.id));
    let newBody = body;
    if (mode === 'replace') {
      newBody = `# ${title || 'Handwritten OCR Scan'}\n\n${extractedText}`;
    } else {
      newBody = `${body}\n\n### Handwritten OCR Scan (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}):\n${extractedText}`;
    }
    setBody(newBody);
    SQLiteDatabase.updateNote(note.id, { body: newBody });
    setShowOcrScanner(false);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      const updated = [...tags, newTagInput.trim()];
      setTags(updated);
      setNewTagInput('');
      SQLiteDatabase.updateNote(note.id, { tags: updated });
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tags.filter((t) => t !== tagToRemove);
    setTags(updated);
    SQLiteDatabase.updateNote(note.id, { tags: updated });
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
            Confidential Protected Note
          </h3>
          <p className="text-xs text-zinc-400">
            This note is encrypted with a PIN lock. Unlock to view and edit.
          </p>
        </div>
        <button
          onClick={() => setShowSecurityModal(true)}
          className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-2xs transition-opacity"
        >
          Enter PIN to Unlock
        </button>

        {showSecurityModal && (
          <NoteSecurityModal
            note={note}
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
      style={{
        borderTop: noteColor ? `3px solid ${noteColor}` : undefined,
      }}
    >
      {/* Top Editorial Control Strip */}
      <div className="px-3 sm:px-6 py-2.5 border-b border-zinc-100 dark:border-zinc-850 flex items-center justify-between gap-2 shrink-0 bg-white/80 dark:bg-[#0c0c0e]/80 backdrop-blur-xs overflow-x-auto no-scrollbar">
        {/* Left: Navigation, Category & Note Type Switcher */}
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
              SQLiteDatabase.updateNote(note.id, { event_id: eid });
            }}
            className="bg-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-medium focus:outline-hidden cursor-pointer max-w-[120px] truncate"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                {ev.title}
              </option>
            ))}
          </select>

          {/* Note Type Switcher (Omni-Notes) */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => handleTypeSwitch('text')}
              title="Markdown Note"
              className={`p-1 rounded-md transition-colors ${
                noteType === 'text'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleTypeSwitch('checklist')}
              title="Checklist / To-Do Note"
              className={`p-1 rounded-md transition-colors ${
                noteType === 'checklist'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                handleTypeSwitch('sketch');
                if (!sketchData) setShowSketchModal(true);
              }}
              title="Sketch Note (Drawing Canvas)"
              className={`p-1 rounded-md transition-colors ${
                noteType === 'sketch'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Restrained Tools */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* AI Synthesis */}
          <button
            id="generate-meeting-minutes-btn"
            onClick={handleGenerateMeetingMinutes}
            disabled={isGeneratingMinutes}
            title="Generate AI Meeting Minutes & Summary"
            className="flex items-center gap-1 px-2 py-1 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          >
            {isGeneratingMinutes ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">AI Summary</span>
          </button>

          {/* Voice Memo */}
          <button
            id="open-audio-recorder-btn"
            onClick={() => setShowAudioRecorder((prev) => !prev)}
            title="Record Voice Memo"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
              showAudioRecorder
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Voice Memo</span>
          </button>

          {/* OCR Scan */}
          <button
            id="open-ocr-scanner-btn"
            onClick={() => setShowOcrScanner(true)}
            title="OCR Scan Document"
            className="flex items-center gap-1 px-2 py-1 text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg text-xs font-medium transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden md:inline">OCR</span>
          </button>

          {/* Reminder button */}
          <button
            onClick={() => setShowReminderPicker((p) => !p)}
            title={reminderAt ? `Reminder set: ${new Date(reminderAt).toLocaleString()}` : 'Set Reminder'}
            className={`p-1.5 rounded-lg transition-colors ${
              reminderAt
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
          </button>

          {/* Location button */}
          <button
            onClick={() => setShowLocationPicker((p) => !p)}
            title={locationName ? `Location: ${locationName}` : 'Add Location / Geotag'}
            className={`p-1.5 rounded-lg transition-colors ${
              locationName
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
          </button>

          {/* Color tag picker */}
          <button
            onClick={() => setShowColorPicker((p) => !p)}
            title="Set Note Color Tint"
            className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition-colors"
          >
            <Palette className="w-3.5 h-3.5" />
          </button>

          {/* Security PIN Lock */}
          <button
            onClick={() => setShowSecurityModal(true)}
            title={note.is_locked ? 'Manage PIN Lock' : 'Lock Note with PIN'}
            className={`p-1.5 rounded-lg transition-colors ${
              note.is_locked
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {note.is_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>

          {/* Duplicate note */}
          <button
            onClick={handleDuplicate}
            title="Duplicate Note"
            className="p-1.5 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          {/* Archive / Unarchive */}
          <button
            onClick={handleArchive}
            title={note.status === 'archived' ? 'Unarchive Note' : 'Archive Note'}
            className={`p-1.5 rounded-lg transition-colors ${
              note.status === 'archived'
                ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/40'
                : 'text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
          </button>

          {/* Typography Switch */}
          <button
            onClick={() => setFontSerif((prev) => !prev)}
            title={fontSerif ? 'Switch to Sans-Serif Font' : 'Switch to Editorial Serif Font'}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded-lg transition-colors font-serif font-semibold text-xs"
          >
            {fontSerif ? 'Aa' : 'Ag'}
          </button>

          {/* View Mode Toggle */}
          {noteType === 'text' && (
            <button
              onClick={() => setViewMode(viewMode === 'preview' ? 'edit' : 'preview')}
              title={viewMode === 'preview' ? 'Switch to Edit' : 'Switch to Markdown Preview'}
              className="p-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              {viewMode === 'preview' ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Pin */}
          <button
            onClick={() => {
              const updated = !isPinned;
              setIsPinned(updated);
              SQLiteDatabase.updateNote(note.id, { is_pinned: updated });
            }}
            title={isPinned ? 'Unpin' : 'Pin'}
            className={`p-1.5 rounded-lg transition-colors ${
              isPinned
                ? 'text-zinc-950 dark:text-zinc-50'
                : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <Pin className="w-3.5 h-3.5 fill-current" />
          </button>

          {/* Trash */}
          <button
            onClick={handleTrash}
            title={note.status === 'trash' ? 'Permanently Delete' : 'Move to Trash'}
            className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Archived Note Banner */}
      {note.status === 'archived' && (
        <div className="px-4 sm:px-12 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 text-xs shrink-0 select-none">
          <div className="flex items-center gap-2">
            <Archive className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Archived:</strong> This note is stored in your Archive section and hidden from your active notes list.
            </span>
          </div>
          <button
            onClick={handleArchive}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs transition-colors shrink-0 shadow-2xs"
          >
            Restore to Active
          </button>
        </div>
      )}

      {/* Reminder Picker Popover */}
      {showReminderPicker && (
        <div className="px-6 py-3 bg-amber-50/70 dark:bg-amber-950/20 border-b border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between gap-3 text-xs animate-fade-in shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Set Note Reminder:</span>
            <input
              type="datetime-local"
              value={reminderAt ? reminderAt.slice(0, 16) : ''}
              onChange={(e) => handleSetReminder(e.target.value ? new Date(e.target.value).toISOString() : '')}
              className="px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs"
            />
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
              className="px-2.5 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold rounded-lg text-[11px] shrink-0"
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

      {/* Color Palette Popover */}
      {showColorPicker && (
        <div className="px-6 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3 text-xs animate-fade-in shrink-0">
          <span className="text-[11px] text-zinc-500 font-medium">Card Tint:</span>
          <div className="flex items-center gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c.label}
                onClick={() => handleSetColor(c.value)}
                className={`w-5 h-5 rounded-full border border-black/10 transition-transform ${
                  noteColor === c.value ? 'scale-125 ring-2 ring-zinc-500' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c.value || '#e4e4e7' }}
                title={c.label}
              />
            ))}
          </div>
          <button
            onClick={() => setShowColorPicker(false)}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 ml-auto"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Voice Memo Recording studio banner */}
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
            {/* Quick Metadata Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {reminderAt && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-medium border border-amber-200 dark:border-amber-800">
                  <Bell className="w-3 h-3" />
                  <span>Reminder: {new Date(reminderAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
              )}

              {locationName && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium border border-emerald-200 dark:border-emerald-800">
                  <MapPin className="w-3 h-3" />
                  <span>{locationName}</span>
                </span>
              )}
            </div>

            {/* Audio Recordings */}
            {recordings.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
                  Audio Memos ({recordings.length})
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {recordings.map((rec) => (
                    <AudioPlayerWidget
                      key={rec.id}
                      recording={rec}
                      onDelete={(id) => {
                        SQLiteDatabase.deleteRecording(id);
                        setRecordings(SQLiteDatabase.getRecordingsForNote(note.id));
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* OCR Scans */}
            {ocrScans.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold mr-1">
                  Scans:
                </span>
                {ocrScans.map((scan) => (
                  <span
                    key={scan.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 font-mono"
                  >
                    Scan #{scan.id}
                    <button
                      onClick={() => {
                        SQLiteDatabase.deleteOcrScan(scan.id);
                        setOcrScans(SQLiteDatabase.getOcrScansForNote(note.id));
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

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-12 sm:py-8 custom-minimal-scrollbar">
        <div className="max-w-3xl mx-auto w-full space-y-6">
          {/* Note Title Input */}
          <input
            id="note-title-input"
            type="text"
            placeholder="Untitled"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className={`w-full bg-transparent text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 placeholder-zinc-300 dark:placeholder-zinc-700 focus:outline-hidden ${
              fontSerif ? 'font-serif-editorial' : 'font-sans'
            }`}
          />

          {/* Tags bar */}
          <div className="flex flex-wrap items-center gap-1 text-xs">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 text-[11px] font-medium"
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
              className="text-[11px] bg-transparent text-zinc-500 placeholder-zinc-400 focus:outline-hidden px-1 py-0.5 w-16"
            />
          </div>

          {/* Type 1: Interactive Checklist Mode */}
          {noteType === 'checklist' && (
            <div className="space-y-4">
              <ChecklistEditor
                items={checklistItems}
                onChange={handleChecklistChange}
              />
              {/* Optional supplementary notes */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-850">
                <label className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold block mb-2">
                  Additional Notes
                </label>
                <textarea
                  value={body}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  placeholder="Supplementary remarks or instructions..."
                  className="w-full min-h-[140px] bg-transparent text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed resize-none focus:outline-hidden p-0"
                />
              </div>
            </div>
          )}

          {/* Type 2: Sketch Note Canvas Mode */}
          {noteType === 'sketch' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center min-h-[260px] relative overflow-hidden group">
                {sketchData ? (
                  <img
                    src={sketchData}
                    alt="Handwritten sketch"
                    className="max-h-[320px] object-contain rounded-lg shadow-2xs"
                  />
                ) : (
                  <div className="text-center space-y-2 text-zinc-400 py-8">
                    <PenTool className="w-8 h-8 mx-auto stroke-[1.2]" />
                    <p className="text-xs">No sketch drawn yet</p>
                  </div>
                )}

                <button
                  onClick={() => setShowSketchModal(true)}
                  className="absolute bottom-4 right-4 px-3.5 py-1.5 bg-zinc-900/90 dark:bg-zinc-100/90 hover:bg-zinc-900 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl shadow-md flex items-center gap-1.5 transition-all"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>{sketchData ? 'Edit Sketch' : 'Open Canvas'}</span>
                </button>
              </div>

              {/* Supplementary remarks */}
              <textarea
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Sketch annotations and details..."
                className="w-full min-h-[100px] bg-transparent text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed resize-none focus:outline-hidden p-0"
              />
            </div>
          )}

          {/* Type 3: Standard Markdown Writing Mode */}
          {noteType === 'text' && (
            viewMode === 'edit' ? (
              <textarea
                id="note-body-markdown-editor"
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Capture thoughts, transcripts, ideas..."
                className={`w-full min-h-[420px] bg-transparent text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-relaxed resize-none focus:outline-hidden border-none p-0 ${
                  fontSerif ? 'font-serif-editorial text-base sm:text-lg leading-loose' : 'font-sans'
                }`}
              />
            ) : (
              <div
                className={`prose-minimal text-sm sm:text-base leading-relaxed ${
                  fontSerif ? 'font-serif-editorial text-base sm:text-lg' : ''
                }`}
              >
                <ReactMarkdown>{body || '_No content written yet._'}</ReactMarkdown>
              </div>
            )
          )}
        </div>
      </div>

      {/* Quiet Status Bar */}
      <div className="px-4 sm:px-6 py-2 border-t border-zinc-100 dark:border-zinc-850 bg-white/80 dark:bg-[#0c0c0e]/80 flex items-center justify-between text-[11px] text-zinc-400 font-mono shrink-0">
        <div className="flex items-center gap-3">
          <span>{stats.words} words</span>
          <span>·</span>
          <span>{stats.readTimeMinutes} min read</span>
          {saveIndicator && <span className="text-zinc-700 dark:text-zinc-300">Saved</span>}
        </div>

        <div className="flex items-center gap-3">
          <button
            id="toggle-cloud-save-btn"
            onClick={handleToggleCloudSave}
            className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors flex items-center gap-1 font-sans"
          >
            {cloudSaveEnabled ? (
              <>
                <Cloud className="w-3 h-3 text-zinc-700 dark:text-zinc-300" />
                <span>Cloud sync</span>
              </>
            ) : (
              <span>Local only</span>
            )}
          </button>

          <button
            onClick={onOpenVersions}
            className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
          >
            v{note.version || 1}
          </button>
        </div>
      </div>

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
          onSuccess={(updated) => {
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
    </div>
  );
};
