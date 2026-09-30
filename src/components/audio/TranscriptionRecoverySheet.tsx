import React, { useState } from 'react';
import { Cloud, Mic, AlertTriangle, RefreshCw, X, CheckCircle2, Key, Loader2 } from 'lucide-react';
import { useModalBackHandler } from '../../lib/modalBackStack';
import { TranscriptionOrchestrator } from '../../services/TranscriptionOrchestrator';
import { PrivacyManager } from '../../lib/privacyManager';
import { RecordingRepository } from '../../repositories/RecordingRepository';

export interface TranscriptionRecoverySheetProps {
  isOpen: boolean;
  onClose: () => void;
  errorText?: string;
  recordingId?: number;
  audioBlob?: Blob;
  onTranscribeSuccess?: (transcript: string) => void;
  onRetryOffline?: () => void;
}

export const TranscriptionRecoverySheet: React.FC<TranscriptionRecoverySheetProps> = ({
  isOpen,
  onClose,
  errorText,
  recordingId,
  audioBlob,
  onTranscribeSuccess,
  onRetryOffline,
}) => {
  useModalBackHandler(isOpen, onClose);

  const [isCloudTranscribing, setIsCloudTranscribing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudSuccess, setCloudSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCloudTranscribe = async () => {
    setIsCloudTranscribing(true);
    setCloudError(null);
    setCloudSuccess(null);

    try {
      if (!PrivacyManager.isNetworkAllowed()) {
        throw new Error('Network permission is blocked by Privacy Mode. Allow network in Settings to use Cloud AI.');
      }

      let targetBlob = audioBlob;
      if (!targetBlob && recordingId) {
        const rec = await RecordingRepository.getByIdAsync(recordingId);
        if (rec) {
          const { MediaRepository } = await import('../../lib/MediaRepository');
          targetBlob = (await MediaRepository.getBinary(rec.file_path)) || undefined;
        }
      }

      const orchestrator = TranscriptionOrchestrator.getInstance();
      const result = await orchestrator.orchestrate(
        {
          recordingId,
          audioBlob: targetBlob,
          mimeType: 'audio/webm',
        },
        {
          policy: 'cloud_only',
          enginePreference: 'cloud_gemini_multimodal',
        }
      );

      setCloudSuccess(result.transcript);
      if (onTranscribeSuccess) {
        onTranscribeSuccess(result.transcript);
      }
    } catch (e: any) {
      setCloudError(e?.message || 'Cloud transcription failed. Please check network and Gemini API key.');
    } finally {
      setIsCloudTranscribing(false);
    }
  };

  const isStubEngineNotice = !errorText || /OFFLINE_AI_ENGINE_UNAVAILABLE|whisper.*stub|tensor/i.test(errorText);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transcription-recovery-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="transcription-recovery-title"
                className="text-sm font-semibold text-stone-900 dark:text-stone-100"
              >
                Transcription Options & Recovery
              </h2>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {isStubEngineNotice ? 'Offline Whisper Runtime Pending' : 'Speech Recognition Notice'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            aria-label="Close recovery dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Status & Engine Badge */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {isStubEngineNotice
                  ? 'Native Engine: GGML Tensor Runtime Pending'
                  : 'Acoustic Processing Status'}
              </span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300">
                Honest Capability
              </span>
            </div>
            <p className="text-stone-700 dark:text-stone-300 leading-relaxed">
              {errorText ||
                'The native libwhisper.so library is linked, but the full GGML tensor inference runtime is not compiled into this binary. To ensure 100% genuine transcripts without placeholder text, choose one of the reliable working alternatives below.'}
            </p>
          </div>

          {/* Alternative 1: Cloud Gemini Transcription */}
          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                    Cloud Gemini Transcription
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    High accuracy multimodal speech-to-text with punctuation
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>

            {cloudError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{cloudError}</span>
              </div>
            )}

            {cloudSuccess ? (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-medium">Transcription completed!</p>
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 line-clamp-2 mt-0.5">
                    {cloudSuccess}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCloudTranscribe}
                disabled={isCloudTranscribing}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                {isCloudTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Transcribing with Cloud AI...
                  </>
                ) : (
                  <>
                    <Cloud className="w-3.5 h-3.5" />
                    Transcribe with Cloud Gemini
                  </>
                )}
              </button>
            )}
          </div>

          {/* Alternative 2: Live Microphone Dictation */}
          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                  Live Dictation (Always Offline & Free)
                </h3>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Transcribe words directly while speaking into the microphone
                </p>
              </div>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed pl-8">
              When recording audio in VellumScribe, speech recognition processes words live through your browser or Android OS engine. That text is saved directly with your recording without needing Whisper inference.
            </p>
          </div>
        </div>

        {/* Footer controls */}
        <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 flex items-center justify-between gap-3">
          {onRetryOffline ? (
            <button
              type="button"
              onClick={() => {
                onRetryOffline();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-medium hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Offline
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-white dark:text-stone-900 text-xs font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
