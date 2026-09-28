import React, { useState } from 'react';
import {
  Sparkles,
  X,
  FileText,
  CheckSquare,
  ListOrdered,
  BookOpen,
  Wand2,
  Copy,
  Check,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Key,
  ShieldCheck,
  AlertTriangle,
  Mic,
  Image,
} from 'lucide-react';
import { NoteRecord, RecordingRecord, TranscriptRecord, OcrScanRecord } from '../types';
import { GeminiApiService, SummaryFormat, SummaryResult } from '../lib/geminiService';
import { SummaryService } from '../services/ai';
import { AiSettingsManager } from '../lib/aiSettings';
import { AiStudioKeyModal } from './AiStudioKeyModal';
import { useModalBackHandler } from '../lib/modalBackStack';

interface AiSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: NoteRecord;
  eventTitle?: string;
  transcripts?: TranscriptRecord[];
  ocrScans?: OcrScanRecord[];
  onApplySummary: (summaryText: string, mode: 'append' | 'prepend' | 'replace') => void;
}

const FORMAT_OPTIONS: {
  id: SummaryFormat;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'executive',
    label: 'Executive Minutes',
    shortDesc: 'Summary, decisions, and action items',
    icon: Sparkles,
  },
  {
    id: 'action_items',
    label: 'Action Checklist',
    shortDesc: 'Extracts actionable tasks with checkboxes [ ]',
    icon: CheckSquare,
  },
  {
    id: 'tldr',
    label: 'Quick TL;DR',
    shortDesc: 'Core takeaway + 3-5 high-impact bullets',
    icon: ListOrdered,
  },
  {
    id: 'outline',
    label: 'Structured Outline',
    shortDesc: 'Hierarchical topics, headings & points',
    icon: BookOpen,
  },
  {
    id: 'clean_notes',
    label: 'Polished Notes',
    shortDesc: 'Refactors raw ideas into clean prose',
    icon: Wand2,
  },
];

export const AiSummaryModal: React.FC<AiSummaryModalProps> = ({
  isOpen,
  onClose,
  note,
  eventTitle = 'Untitled Note',
  transcripts = [],
  ocrScans = [],
  onApplySummary,
}) => {
  useModalBackHandler(isOpen, onClose, 'ai-summary-modal');
  const [selectedFormat, setSelectedFormat] = useState<SummaryFormat>('executive');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [includeTranscripts, setIncludeTranscripts] = useState<boolean>(true);
  const [includeOcr, setIncludeOcr] = useState<boolean>(true);
  const [includeChecklists, setIncludeChecklists] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [generatedResult, setGeneratedResult] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Sub-modal for key authentication if needed
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);

  if (!isOpen) return null;

  const hasKey = AiSettingsManager.hasLocalKey();
  const maskedKey = AiSettingsManager.getMaskedKey();

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const activeTranscripts = includeTranscripts ? transcripts : [];
      const activeOcr = includeOcr ? ocrScans : [];
      const activeChecklists = includeChecklists ? (note.checklist_items || []) : [];

      const result = await GeminiApiService.generateSummary({
        format: selectedFormat,
        eventTitle: note.title || eventTitle,
        currentBody: note.body || '',
        transcripts: activeTranscripts,
        ocrScans: activeOcr,
        checklists: activeChecklists,
        customInstructions: customPrompt.trim(),
      });

      setGeneratedResult(result);
    } catch (err: any) {
      setError(err.message || 'Failed to generate AI summary.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedResult?.summary) return;
    try {
      await navigator.clipboard.writeText(generatedResult.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  const handleInsert = (mode: 'append' | 'prepend' | 'replace') => {
    if (!generatedResult?.summary) return;
    onApplySummary(generatedResult.summary, mode);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
        <div className="bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-2xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>AI Summary Studio</span>
                  <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                    Gemini 3.7 Flash
                  </span>
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate max-w-sm sm:max-w-md">
                  Synthesizing &ldquo;{note.title || 'Untitled Note'}&rdquo;
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 custom-minimal-scrollbar text-xs">
            {/* Key Authentication Status Banner */}
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                hasKey
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-300'
                  : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900/50 text-amber-900 dark:text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {hasKey ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-xs">
                    {hasKey
                      ? 'Authenticated with Google AI Studio'
                      : 'Free Google AI Studio Key Recommended'}
                  </p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {hasKey
                      ? `Using your configured key (${maskedKey}) with zero-logging guarantee.`
                      : 'Add your free key for unlimited private summaries, meeting minutes, and tasks.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(true)}
                className={`px-3 py-1.5 rounded-xl font-semibold text-xs shrink-0 border transition-colors flex items-center gap-1.5 ${
                  hasKey
                    ? 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50'
                    : 'bg-amber-600 hover:bg-amber-700 text-white border-transparent shadow-2xs'
                }`}
              >
                <Key className="w-3 h-3" />
                <span>{hasKey ? 'Manage Key' : 'Add Free Key'}</span>
              </button>
            </div>

            {/* Choose Format Grid */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Select Synthesis Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {FORMAT_OPTIONS.map((fmt) => {
                  const Icon = fmt.icon;
                  const isSelected = selectedFormat === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-500/80 text-indigo-950 dark:text-indigo-200 ring-1 ring-indigo-500'
                          : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200/80 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`} />
                        <span className="font-semibold text-xs">{fmt.label}</span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                        {fmt.shortDesc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Context Source Badges & Toggles */}
            <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                Included Note Sources
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 font-medium">
                  <FileText className="w-3 h-3 text-zinc-400" />
                  <span>Note Body ({note.body?.trim().split(/\s+/).filter(Boolean).length || 0} words)</span>
                </span>

                {transcripts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIncludeTranscripts(!includeTranscripts)}
                    className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 font-medium transition-colors ${
                      includeTranscripts
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700 opacity-60'
                    }`}
                  >
                    <Mic className="w-3 h-3" />
                    <span>{transcripts.length} Audio {transcripts.length === 1 ? 'Transcript' : 'Transcripts'}</span>
                  </button>
                )}

                {ocrScans.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIncludeOcr(!includeOcr)}
                    className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 font-medium transition-colors ${
                      includeOcr
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700 opacity-60'
                    }`}
                  >
                    <Image className="w-3 h-3" />
                    <span>{ocrScans.length} OCR {ocrScans.length === 1 ? 'Scan' : 'Scans'}</span>
                  </button>
                )}

                {(note.checklist_items || []).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIncludeChecklists(!includeChecklists)}
                    className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 font-medium transition-colors ${
                      includeChecklists
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700 opacity-60'
                    }`}
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>{note.checklist_items?.length} Tasks</span>
                  </button>
                )}
              </div>
            </div>

            {/* Custom Instructions */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                <span>Custom Guidance (Optional)</span>
                <span className="text-xs text-zinc-400 font-normal">e.g. &ldquo;Emphasize budget figures and next milestones&rdquo;</span>
              </label>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Direct the AI synthesis focus..."
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-2 text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-xs text-amber-900 dark:text-amber-200">
                      {error.includes('Permission') || error.includes('caller') || error.includes('403')
                        ? 'Google AI Studio Permission Issue'
                        : 'AI Service Notice'}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300/90">{error}</p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Configure / Replace API Key</span>
                  </button>
                </div>
              </div>
            )}

            {/* Generated Summary Preview */}
            {generatedResult && (
              <div className="space-y-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                      Generated Synthesis
                    </span>
                    <span className="text-xs font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                      {generatedResult.source || 'gemini-3.7-flash'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-600">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-h-60 overflow-y-auto custom-minimal-scrollbar">
                  <pre className="font-sans text-xs whitespace-pre-wrap leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {generatedResult.summary}
                  </pre>
                </div>

                {/* Placement Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleInsert('append')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <ArrowDown className="w-3 h-3" />
                    <span>Append to Bottom</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsert('prepend')}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <ArrowUp className="w-3 h-3" />
                    <span>Insert at Top (Brief)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsert('replace')}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl font-semibold text-xs transition-colors"
                  >
                    Replace Body
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-zinc-400 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Google AI Studio Powered</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 text-xs font-medium"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Synthesizing...</span>
                  </>
                ) : generatedResult ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regenerate</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate AI Summary</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Key Management Modal */}
      <AiStudioKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onSuccess={() => {
          // Key authenticated!
        }}
      />
    </>
  );
};
