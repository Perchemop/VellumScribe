import React, { useEffect, useState } from 'react';
import { Cloud, Mic, AlertTriangle, RefreshCw, X, CheckCircle2, Loader2, Download } from 'lucide-react';
import { useModalBackHandler } from '../../lib/modalBackStack';
import { TranscriptionOrchestrator } from '../../services/TranscriptionOrchestrator';
import { PrivacyManager } from '../../lib/privacyManager';
import { RecordingRepository } from '../../repositories/RecordingRepository';
import { OfflineAiManager } from '../../services/OfflineAiManager';
import { asErrorLike } from '../../lib/errorLike';

export interface TranscriptionRecoverySheetProps {
  isOpen: boolean;
  onClose: () => void;
  errorText?: string;
  recordingId?: number;
  audioBlob?: Blob;
  onTranscribeSuccess?: (transcript: string) => void;
  onRetryOffline?: () => void;
}

type CapabilityState =
  | { phase: 'loading' }
  | {
      phase: 'ready';
      inferenceReady: boolean;
      libLoaded: boolean;
      installedModels: string[];
    }
  | { phase: 'error'; message: string };

export const TranscriptionRecoverySheet: React.FC<TranscriptionRecoverySheetProps> = ({
  isOpen,
  onClose,
  errorText,
  recordingId,
  audioBlob,
  onTranscribeSuccess,
  onRetryOffline,
}) => {
  useModalBackHandler(isOpen, onClose, 'transcription-recovery-sheet');

  const [isCloudTranscribing, setIsCloudTranscribing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudSuccess, setCloudSuccess] = useState<string | null>(null);
  const [caps, setCaps] = useState<CapabilityState>({ phase: 'loading' });
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const mgr = OfflineAiManager.getInstance();
        const c = await mgr.getDeviceCapabilities();
        const models = await mgr.listSpeechModels();
        const list = Array.isArray(models) ? models : [];
        if (cancelled) return;
        setCaps({
          phase: 'ready',
          inferenceReady: Boolean(c.inferenceRuntimeReady || c.isNativeEngineAvailable),
          libLoaded: Boolean(c.nativeLibraryLoaded),
          installedModels: list.filter((m) => m.installed).map((m) => m.id),
        });
      } catch (_e) {
        const e = asErrorLike(_e);
        if (!cancelled) {
          setCaps({ phase: 'error', message: e?.message || 'Could not read offline AI status' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCloudTranscribe = async () => {
    setIsCloudTranscribing(true);
    setCloudError(null);
    setCloudSuccess(null);

    try {
      if (!PrivacyManager.isNetworkAllowed()) {
        throw new Error('Network is blocked by Privacy Mode. Allow network in Settings to use Cloud AI.');
      }
      if (!PrivacyManager.hasCloudAiConsent()) {
        throw new Error('Cloud AI consent is required. Grant consent in Settings → Privacy.');
      }

      let targetBlob = audioBlob;
      let targetMimeType: string | undefined;
      let targetMediaKey: string | undefined;
      if (recordingId) {
        const rec = await RecordingRepository.getByIdAsync(recordingId);
        if (rec) {
          targetMimeType = rec.mime_type || undefined;
          targetMediaKey = rec.media_key || rec.file_path || undefined;
          if (!targetBlob && targetMediaKey) {
            const { MediaRepository } = await import('../../lib/MediaRepository');
            targetBlob = (await MediaRepository.getBinary(targetMediaKey)) || undefined;
          }
        }
      }

      const orchestrator = TranscriptionOrchestrator.getInstance();
      const result = await orchestrator.orchestrate(
        {
          recordingId,
          audioBlob: targetBlob,
          mediaKey: targetMediaKey,
          // Preserve the real container: imports can be WAV/M4A/MP3, not only webm.
          mimeType: targetMimeType,
        },
        {
          policy: 'cloud_only',
          enginePreference: 'cloud_gemini_multimodal',
        }
      );

      setCloudSuccess(result.transcript);
      onTranscribeSuccess?.(result.transcript);
    } catch (_e) {
      const e = asErrorLike(_e);
      setCloudError(e?.message || 'Cloud transcription failed.');
    } finally {
      setIsCloudTranscribing(false);
    }
  };

  const handleInstallModel = async () => {
    setIsInstalling(true);
    setInstallError(null);
    setInstallProgress(0);
    try {
      const mgr = OfflineAiManager.getInstance();
      const result = await mgr.installModel('whisper-tiny');
      if (!result.installed) {
        throw new Error(result.error || 'Model install failed');
      }
      const models = await mgr.listSpeechModels();
      const list = Array.isArray(models) ? models : [];
      setCaps((prev) =>
        prev.phase === 'ready'
          ? {
              ...prev,
              installedModels: list.filter((m) => m.installed).map((m) => m.id),
            }
          : prev
      );
      setInstallProgress(100);
    } catch (_e) {
      const e = asErrorLike(_e);
      setInstallError(e?.message || 'Model download failed');
    } finally {
      setIsInstalling(false);
    }
  };

  const inferenceReady = caps.phase === 'ready' && caps.inferenceReady;
  const hasModel = caps.phase === 'ready' && caps.installedModels.length > 0;
  const modelMissing = inferenceReady && !hasModel;

  let statusTitle = 'Checking offline engine…';
  let statusBody =
    errorText ||
    'Checking whether on-device Whisper is ready on this device.';

  if (caps.phase === 'ready') {
    if (inferenceReady && hasModel) {
      statusTitle = 'Whisper ready';
      statusBody =
        errorText ||
        `On-device engine is ready (${caps.installedModels.join(', ')}). You can retry offline transcription.`;
    } else if (modelMissing) {
      statusTitle = 'Speech model not downloaded';
      statusBody =
        errorText ||
        'Native Whisper is available, but no speech model is installed yet. Download a small model to transcribe offline.';
    } else {
      statusTitle = 'Offline Whisper not available';
      statusBody =
        errorText ||
        (caps.libLoaded
          ? 'libwhisper.so is present but the tensor runtime did not report ready. Reinstall the latest REAL APK or use live dictation / cloud.'
          : 'Native Whisper library is not loaded. Install the latest REAL APK build, or use live dictation / cloud.');
    }
  } else if (caps.phase === 'error') {
    statusTitle = 'Could not read engine status';
    statusBody = caps.message;
  }

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
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="transcription-recovery-title"
                className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate"
              >
                Transcription
              </h2>
              <span className="text-xs text-stone-500 dark:text-stone-400 truncate block">
                {statusTitle}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
            <p className="text-stone-700 dark:text-stone-300 leading-relaxed">{statusBody}</p>
          </div>

          {modelMissing && (
            <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                    Download offline model
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Whisper Tiny (~30 MB) — required once for offline transcription
                  </p>
                </div>
              </div>
              {installError && (
                <p className="text-xs text-red-600 dark:text-red-400">{installError}</p>
              )}
              <button
                type="button"
                onClick={handleInstallModel}
                disabled={isInstalling}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                {isInstalling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Downloading{installProgress != null ? ` ${installProgress}%` : '…'}
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Download Whisper Tiny
                  </>
                )}
              </button>
            </div>
          )}

          {inferenceReady && hasModel && onRetryOffline && (
            <button
              type="button"
              onClick={() => {
                onRetryOffline();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry offline Whisper
            </button>
          )}

          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                  <Cloud className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                    Cloud Gemini
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">
                    Needs network + consent + API key
                  </p>
                </div>
              </div>
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
                  <p className="font-medium">Done</p>
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
                    Transcribing…
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

          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                  Live dictation
                </h3>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Record with the mic — words are captured while you speak (no model download).
                </p>
              </div>
            </div>
          </div>
        </div>

        <div
          className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 flex items-center justify-end gap-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-white dark:text-stone-900 text-xs font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
