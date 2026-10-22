import React, { useState } from 'react';
import {
  Play,
  
  User,
  
  Copy,
  Check,
  Sparkles,
  Edit2,
  FileText,
  ListTodo,
  
  BookOpen,
  Mic} from 'lucide-react';
import {
  TranscriptionEntity,
  TranscriptionSegmentRecord,
  TranscriptionSpeakerRecord,
  StructuredAiExtraction,
} from '../../types';
import { TranscriptService } from '../../services/TranscriptService';
import { OfflineAiManager } from '../../services/OfflineAiManager';
import { NotebookLMAdapter } from '../../lib/notebooklm/adapter';

interface TranscriptViewerProps {
  transcription: TranscriptionEntity;
  segments: TranscriptionSegmentRecord[];
  speakers: TranscriptionSpeakerRecord[];
  currentAudioTimeSec?: number;
  onSeekAudio?: (timeSec: number) => void;
  onSpeakerRenamed?: () => void;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcription,
  segments,
  speakers,
  currentAudioTimeSec = 0,
  onSeekAudio,
  onSpeakerRenamed,
}) => {
  const [activeTab, setActiveTab] = useState<'segments' | 'raw' | 'ai_insights'>('segments');
  const [copied, setCopied] = useState(false);
  const [notebookLmExported, setNotebookLmExported] = useState(false);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [speakerNameInput, setSpeakerNameInput] = useState('');
  const [structuredExtraction, setStructuredExtraction] = useState<StructuredAiExtraction | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const currentMs = currentAudioTimeSec * 1000;
  const activeSegment = TranscriptService.getActiveSegment(segments, currentMs);

  const getSpeakerDisplayName = (speakerId?: string | null) => {
    if (!speakerId) return 'Speaker';
    const found = speakers.find((s) => s.speaker_id === speakerId);
    return found?.name || found?.label || speakerId.replace('spk_', 'Speaker ');
  };

  const handleCopyTranscript = () => {
    const textToCopy = transcription.text || segments.map((s) => s.text).join('\n');
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportNotebookLM = async () => {
    const formatted = NotebookLMAdapter.formatTranscriptForNotebookLM({
      transcriptionId: transcription.id,
      recordingId: transcription.recording_id,
      engine: transcription.engine,
      modelId: transcription.model_id,
      segments: segments.map((s) => ({
        sequence: s.sequence,
        start_ms: s.start_ms,
        end_ms: s.end_ms,
        speaker_id: s.speaker_id,
        text: s.text,
      })),
      speakers: speakers.map((spk) => ({
        speaker_id: spk.speaker_id,
        label: spk.label,
        name: spk.name,
      })),
      summary: structuredExtraction?.summary,
      actionItems: structuredExtraction?.actionItems?.map((a) => ({
        text: a.text,
        priority: a.priority,
      })),
    });

    const bundle = await NotebookLMAdapter.createBundle({
      title: `Recording_${transcription.recording_id}_Transcript`,
      sourceType: 'transcript',
      content: formatted,
    });

    NotebookLMAdapter.exportBundleToFile(bundle);
    navigator.clipboard.writeText(formatted);
    setNotebookLmExported(true);
    setTimeout(() => setNotebookLmExported(false), 2500);
  };

  const handleSaveSpeakerName = (speakerId: string) => {
    if (speakerNameInput.trim()) {
      TranscriptService.renameSpeaker(transcription.id, speakerId, speakerNameInput.trim());
      setEditingSpeakerId(null);
      if (onSpeakerRenamed) onSpeakerRenamed();
    }
  };

  const handleGenerateLocalAi = () => {
    setIsGeneratingAi(true);
    try {
      const extraction = OfflineAiManager.getInstance().generateStructuredAiExtraction(
        transcription,
        segments.length
      );
      setStructuredExtraction(extraction);
      setActiveTab('ai_insights');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  return (
    <div id="transcript-viewer-container" className="space-y-4 text-stone-800 dark:text-stone-200">
      {/* Header controls & tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs">
          <button
            id="tab-segments"
            onClick={() => setActiveTab('segments')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'segments'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            Timestamped Segments ({segments.length})
          </button>
          <button
            id="tab-raw"
            onClick={() => setActiveTab('raw')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'raw'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            Raw Transcript
          </button>
          <button
            id="tab-ai-insights"
            onClick={() => {
              if (!structuredExtraction) handleGenerateLocalAi();
              else setActiveTab('ai_insights');
            }}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'ai_insights'
                ? 'bg-white dark:bg-stone-800 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            AI Tasks & Summary
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-export-notebooklm"
            onClick={handleExportNotebookLM}
            title="Export structured markdown source formatted for Google NotebookLM"
            className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs text-stone-700 dark:text-stone-300 flex items-center gap-1.5 transition-colors"
          >
            {notebookLmExported ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <BookOpen className="w-3.5 h-3.5 text-blue-600" />}
            {notebookLmExported ? 'Exported & Copied' : 'NotebookLM Export'}
          </button>
          <button
            id="btn-copy-transcript"
            onClick={handleCopyTranscript}
            className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs text-stone-700 dark:text-stone-300 flex items-center gap-1.5 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Engine & provenance metadata badge (T-P1.3 / Review Archive 45) */}
      <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-stone-500 dark:text-stone-400 px-1">
        {transcription.engine.includes('whisper') && !transcription.engine.includes('groq') ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            whisper.cpp (On-Device Native)
          </span>
        ) : transcription.engine.includes('speech_recognizer') || transcription.engine.includes('android_speech') ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            <Mic className="w-3 h-3 text-teal-500" />
            Android SpeechRecognizer (OS On-Device)
          </span>
        ) : transcription.engine.includes('browser_acoustic') ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <Mic className="w-3 h-3 text-sky-500" />
            Browser Acoustic Dictation (Offline)
          </span>
        ) : transcription.engine.includes('gemini') ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            Gemini Multimodal (Cloud AI)
          </span>
        ) : transcription.engine.includes('groq') ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            Groq Whisper (Cloud LPU)
          </span>
        ) : transcription.engine.includes('deepgram') ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Deepgram Nova (Cloud AI)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <Mic className="w-3 h-3 text-sky-500" />
            {transcription.engine ? `${transcription.engine}` : 'Live Microphone Dictation (OS/Web)'}
          </span>
        )}

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono text-[10px]">
          Model: {transcription.model_id}
        </span>

        {transcription.error_code && (
          <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px]">
            [{transcription.error_code}]
          </span>
        )}
      </div>

      {/* Content Tab 1: Segments */}
      {activeTab === 'segments' && (
        <div id="transcript-segments-list" className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {segments.length === 0 ? (
            <p className="text-xs text-stone-500 italic p-4 text-center">
              No timestamped segments available for this transcript.
            </p>
          ) : (
            segments.map((seg) => {
              const isActive = activeSegment?.id === seg.id || activeSegment?.sequence === seg.sequence;
              const startStr = TranscriptService.formatTimeMs(seg.start_ms);
              const endStr = TranscriptService.formatTimeMs(seg.end_ms);

              return (
                <div
                  key={seg.id || seg.sequence}
                  id={`transcript-segment-${seg.sequence}`}
                  onClick={() => onSeekAudio && onSeekAudio(seg.start_ms / 1000)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-xs'
                      : 'bg-stone-50/70 dark:bg-stone-900/50 border-stone-200/80 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-emerald-600 hover:text-white transition-colors"
                        title="Seek audio to timestamp"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        {startStr} – {endStr}
                      </button>

                      {seg.speaker_id && (
                        <div className="flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-300">
                          <User className="w-3 h-3 text-stone-400" />
                          <span>{getSpeakerDisplayName(seg.speaker_id)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSpeakerId(seg.speaker_id!);
                              setSpeakerNameInput(getSpeakerDisplayName(seg.speaker_id));
                            }}
                            className="p-1 hover:text-stone-900 dark:hover:text-stone-100 text-stone-400"
                            title="Rename speaker"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <span className="text-[10px] text-stone-400">
                      Segment {seg.sequence}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-stone-800 dark:text-stone-200 font-normal">
                    {seg.text}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Content Tab 2: Raw */}
      {activeTab === 'raw' && (
        <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 font-sans text-xs leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
          {transcription.text || 'No raw transcript recorded.'}
        </div>
      )}

      {/* Content Tab 3: Local AI Second-Stage Extraction */}
      {activeTab === 'ai_insights' && (
        <div id="ai-insights-panel" className="space-y-4">
          {structuredExtraction ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/40 space-y-1.5">
                <h5 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileText className="w-3.5 h-3.5" />
                  Local AI Summary
                </h5>
                <p className="text-xs text-stone-800 dark:text-stone-200 leading-relaxed">
                  {structuredExtraction.summary}
                </p>
              </div>

              {/* Action Items */}
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <ListTodo className="w-3.5 h-3.5 text-blue-600" />
                  Extracted Action Items ({structuredExtraction.actionItems.length})
                </h5>

                {structuredExtraction.actionItems.length === 0 ? (
                  <p className="text-xs text-stone-500 italic">No action items detected in transcript.</p>
                ) : (
                  <div className="space-y-2">
                    {structuredExtraction.actionItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <p className="font-medium text-stone-900 dark:text-stone-100">{item.text}</p>
                          <div className="flex items-center gap-2 text-[10px] text-stone-500">
                            <span>Priority: <span className="capitalize">{item.priority}</span></span>
                            {item.sourceSegments.length > 0 && (
                              <>
                                <span>•</span>
                                <span>Source Segment: #{item.sourceSegments.join(', #')}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {item.sourceSegments[0] && onSeekAudio && (
                          <button
                            type="button"
                            onClick={() => {
                              const targetSeg = segments.find((s) => s.sequence === item.sourceSegments[0]);
                              if (targetSeg) onSeekAudio(targetSeg.start_ms / 1000);
                            }}
                            className="px-2 py-1 rounded-md bg-stone-200 dark:bg-stone-800 hover:bg-emerald-600 hover:text-white text-[10px] font-mono shrink-0 transition-colors"
                          >
                            Jump to audio
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <button
                type="button"
                onClick={handleGenerateLocalAi}
                disabled={isGeneratingAi}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-medium inline-flex items-center gap-2 hover:bg-emerald-700 transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                {isGeneratingAi ? 'Extracting Insights Locally...' : 'Extract Tasks & Summary with Local AI'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Speaker Rename Modal */}
      {editingSpeakerId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 p-5 rounded-2xl max-w-sm w-full border border-stone-200 dark:border-stone-800 space-y-4 shadow-xl">
            <h4 className="font-semibold text-sm text-stone-900 dark:text-stone-100">
              Rename Speaker
            </h4>
            <input
              type="text"
              value={speakerNameInput}
              onChange={(e) => setSpeakerNameInput(e.target.value)}
              placeholder="e.g. Alice, Dr. Smith"
              className="w-full px-3 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs text-stone-900 dark:text-stone-100"
              autoFocus
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setEditingSpeakerId(null)}
                className="px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveSpeakerName(editingSpeakerId)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
