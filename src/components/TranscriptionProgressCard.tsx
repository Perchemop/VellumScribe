import React, { useState } from 'react';
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
  Play
} from 'lucide-react';
import { TranscriptionProgress, PartialTranscriptionSession } from '../types';

interface TranscriptionProgressCardProps {
  progress: TranscriptionProgress | null;
  session?: PartialTranscriptionSession | null;
  onResume?: () => void;
  onUsePartial?: (partialText: string) => void;
  onCancel?: () => void;
  onStartOver?: () => void;
  className?: string;
}

export const TranscriptionProgressCard: React.FC<TranscriptionProgressCardProps> = ({
  progress,
  session,
  onResume,
  onUsePartial,
  onCancel,
  onStartOver,
  className = '',
}) => {
  const [showPreview, setShowPreview] = useState(false);

  if (!progress && !session) return null;

  const phase = progress?.phase || (session?.status === 'failed' ? 'error' : session?.status === 'paused' ? 'paused' : 'idle');
  const isError = phase === 'error' || session?.status === 'failed';
  const isPaused = phase === 'paused' || session?.status === 'paused';
  const isCompleted = phase === 'completed' || session?.status === 'completed';
  const isProcessing = phase === 'transcribing' || phase === 'uploading' || phase === 'preparing';

  const percent = Math.min(
    100,
    Math.max(
      0,
      progress?.percent ??
        (session
          ? Math.round((session.completedSegments.length / Math.max(1, session.totalSegments)) * 100)
          : 0)
    )
  );

  const totalSegments = progress?.totalSegments ?? session?.totalSegments ?? 1;
  const completedSegmentsCount =
    progress?.completedSegmentsCount ?? session?.completedSegments?.length ?? 0;
  const currentSegment = progress?.currentSegment ?? (session ? session.nextSegmentIndex + 1 : 1);

  const partialText = progress?.partialTranscript || session?.partialTranscript || '';
  const errorMessage = progress?.error || session?.lastError;

  return (
    <div
      id="transcription-progress-card"
      className={`rounded-xl border transition-all duration-200 shadow-sm overflow-hidden ${
        isError
          ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
          : isCompleted
          ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
          : isPaused
          ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
      } ${className}`}
    >
      {/* Top Header */}
      <div className="px-4 py-3 border-b border-inherit flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isProcessing && (
            <div className="relative flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
            </div>
          )}
          {isError && (
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          {isPaused && (
            <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          {isCompleted && (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <span className="text-xs font-semibold tracking-wide uppercase text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            AI Audio Transcription
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            id="transcription-progress-percent"
            className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full ${
              isError
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                : isCompleted
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
            }`}
          >
            {percent}%
          </span>
          {isProcessing && onCancel && (
            <button
              id="btn-cancel-transcription"
              type="button"
              onClick={onCancel}
              title="Pause or cancel transcription"
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div className="p-4 space-y-3">
        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden relative">
            <div
              className={`h-full transition-all duration-300 ease-out rounded-full ${
                isError
                  ? 'bg-rose-500'
                  : isCompleted
                  ? 'bg-emerald-500'
                  : isPaused
                  ? 'bg-amber-500'
                  : 'bg-indigo-600 dark:bg-indigo-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Segment Pills */}
          {totalSegments > 1 && (
            <div className="flex items-center gap-1 pt-1">
              {Array.from({ length: totalSegments }).map((_, idx) => {
                const isSegDone = idx < completedSegmentsCount;
                const isSegCurrent = idx === currentSegment - 1 && isProcessing;
                const isSegFailed = idx === currentSegment - 1 && isError;

                return (
                  <div
                    key={idx}
                    title={`Segment ${idx + 1} of ${totalSegments}${
                      isSegDone ? ' (Transcribed)' : isSegCurrent ? ' (In Progress)' : ''
                    }`}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      isSegDone
                        ? 'bg-emerald-500'
                        : isSegCurrent
                        ? 'bg-indigo-600 animate-pulse'
                        : isSegFailed
                        ? 'bg-rose-500'
                        : 'bg-zinc-200 dark:bg-zinc-700'
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Status Text */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 text-xs">
            <p
              id="transcription-progress-status"
              className="font-medium text-zinc-800 dark:text-zinc-200"
            >
              {progress?.status ||
                (isError
                  ? 'Transcription interrupted'
                  : isPaused
                  ? 'Transcription paused'
                  : isCompleted
                  ? 'Transcription completed'
                  : 'Ready')}
            </p>
            {progress?.startStr && progress?.endStr && isProcessing && (
              <p className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">
                Time window: [{progress.startStr} - {progress.endStr}] • Segment {currentSegment} of {totalSegments}
              </p>
            )}
            {isError && (
              <p className="text-rose-600 dark:text-rose-400 text-[11px] leading-relaxed">
                {errorMessage || 'A network disruption or processing error occurred.'}
              </p>
            )}
            {(isError || isPaused) && completedSegmentsCount > 0 && (
              <p className="text-emerald-700 dark:text-emerald-400 font-medium text-[11px]">
                ✓ {completedSegmentsCount} of {totalSegments} segment{totalSegments > 1 ? 's' : ''} preserved in cache. You can resume without losing progress.
              </p>
            )}
          </div>
        </div>

        {/* Action Controls for Error / Paused States */}
        {(isError || isPaused) && (
          <div className="pt-2 flex flex-wrap items-center gap-2">
            {onResume && (
              <button
                id="btn-resume-transcription"
                type="button"
                onClick={onResume}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume Transcription
              </button>
            )}

            {partialText.trim().length > 0 && onUsePartial && (
              <button
                id="btn-use-partial-transcript"
                type="button"
                onClick={() => onUsePartial(partialText)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Use Partial ({completedSegmentsCount}/{totalSegments})
              </button>
            )}

            {onStartOver && (
              <button
                id="btn-restart-transcription"
                type="button"
                onClick={onStartOver}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Start Over
              </button>
            )}
          </div>
        )}

        {/* Expandable Live / Partial Transcript Preview */}
        {partialText.trim().length > 0 && (
          <div className="pt-1">
            <button
              id="btn-toggle-transcript-preview"
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            >
              <FileText className="w-3 h-3" />
              <span>
                {showPreview ? 'Hide partial transcript' : 'Preview partial transcript'} (
                {completedSegmentsCount} segment{completedSegmentsCount === 1 ? '' : 's'})
              </span>
              {showPreview ? (
                <ChevronUp className="w-3 h-3 ml-0.5" />
              ) : (
                <ChevronDown className="w-3 h-3 ml-0.5" />
              )}
            </button>

            {showPreview && (
              <div
                id="transcription-preview-box"
                className="mt-2 p-2.5 max-h-36 overflow-y-auto rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 text-xs font-mono leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap select-text"
              >
                {partialText}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
