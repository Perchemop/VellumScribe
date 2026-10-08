import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  X,
  AlertCircle,
  WifiOff,
  Cpu,
} from 'lucide-react';
import { AudioRecordingManager, RecordedAudioResult } from '../../services/AudioRecordingManager';
import { TranscriptionOrchestrator } from '../../services/TranscriptionOrchestrator';
import { OfflineAiManager } from '../../services/OfflineAiManager';
import { TranscriptService } from '../../services/TranscriptService';
import { useModalBackHandler } from '../../lib/modalBackStack';
import { TranscriptionProgressCard } from '../TranscriptionProgressCard';
import { PrivacyManager } from '../../lib/privacyManager';

interface AudioRecordingModalProps {
  noteId: number;
  isOpen: boolean;
  onClose: () => void;
  onRecordingComplete: (result: RecordedAudioResult) => void;
}

export const AudioRecordingModal: React.FC<AudioRecordingModalProps> = ({
  noteId,
  isOpen,
  onClose,
  onRecordingComplete,
}) => {
  useModalBackHandler(isOpen, onClose, 'audio-recording-modal');

  const [recordingManager] = useState(() => new AudioRecordingManager());
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [transcribing, setTranscribing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStatus, setProgressStatus] = useState('Preparing…');
  const [engineLabel, setEngineLabel] = useState('Checking runtime…');
  const [inferenceReady, setInferenceReady] = useState<boolean | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isOpen) {
      handleStart();
      OfflineAiManager.getInstance()
        .getDeviceCapabilities()
        .then((caps) => {
          const ready = Boolean(caps.inferenceRuntimeReady && caps.isNativeEngineAvailable);
          setInferenceReady(ready);
          setEngineLabel(
            ready ? 'On-device' : ''
          );
        })
        .catch(() => {
          setInferenceReady(false);
          setEngineLabel('');
        });
    } else {
      handleCleanup();
    }
    return () => handleCleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleStart = async () => {
    setErrorMessage(null);
    setElapsedSec(0);
    setLiveTranscript('');
    try {
      await recordingManager.startRecording({
        onLiveTranscript: (text) => setLiveTranscript(text),
      });
      setIsRecording(true);
      setIsPaused(false);

      timerRef.current = setInterval(() => {
        const st = recordingManager.getStatus();
        setElapsedSec(Math.floor(st.elapsedMs / 1000));
      }, 500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not access microphone.');
      setIsRecording(false);
    }
  };

  const handlePause = () => {
    recordingManager.pause();
    setIsPaused(true);
  };

  const handleResume = () => {
    recordingManager.resume();
    setIsPaused(false);
  };

  const handleStop = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      const result = await recordingManager.stopRecording(noteId);
      setIsRecording(false);
      setIsPaused(false);

      // Persist live text on result for recovery / note body
      const liveText = (result.liveTranscript || liveTranscript || '').trim();
      if (liveText) {
        result.liveTranscript = liveText;
        try {
          sessionStorage.setItem(`vs_live_transcript_${result.recording?.id || 'latest'}`, liveText);
        } catch {
          /* ignore */
        }
      }

      if (result.recording) {
        setTranscribing(true);
        setProgressPercent(5);
        setProgressStatus('Selecting transcription engine…');

        const controller = new AbortController();
        abortRef.current = controller;

        const policy = 'offline_only';

        try {
          const orchestrator = TranscriptionOrchestrator.getInstance();
          const tr = await orchestrator.orchestrate(
            {
              recordingId: result.recording.id,
              noteId,
              audioBlob: result.blob,
              mediaKey: result.recording.media_key,
              mimeType: result.mimeType,
              durationSeconds: result.durationSeconds,
              liveTranscript: liveText,
              liveCapturedText: liveText,
            },
            {
              policy,
              signal: controller.signal,
              onProgress: (p) => {
                setProgressPercent(p.percent);
                setProgressStatus(p.status || p.phase);
              },
            }
          );

          setProgressPercent(100);
          setProgressStatus(`Done via ${tr.engineId}`);

          // Attach transcript for callers that append to note body
          (result as RecordedAudioResult & { transcript?: string }).transcript = tr.transcript;
        } catch (txErr: any) {
          // Recording is still saved; surface honest error but close with result
          setErrorMessage(
            txErr?.message ||
              'Transcription could not complete. Your recording is saved — use recovery options on the note.'
          );
        } finally {
          setTranscribing(false);
          abortRef.current = null;
          onRecordingComplete(result);
          // Brief pause if error so user can read, else close
          if (!errorMessage) {
            onClose();
          }
        }
      } else {
        onRecordingComplete(result);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to stop and save recording.');
      setIsRecording(false);
      setTranscribing(false);
    }
  };

  const handleCancelTranscription = () => {
    abortRef.current?.abort();
    setTranscribing(false);
    onClose();
  };

  const handleCleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();
    setIsRecording(false);
    setIsPaused(false);
    setTranscribing(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
      <div
        id="audio-recording-modal"
        className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-2xl space-y-6 text-stone-800 dark:text-stone-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {inferenceReady ? <Cpu className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                {transcribing ? 'Transcribing' : 'Recording'}
              </h3>
              <span className="text-[11px] text-stone-500">{engineLabel}</span>
            </div>
          </div>

          {!transcribing && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {transcribing ? (
          <div className="py-4">
            <TranscriptionProgressCard
              progress={{
                phase: 'transcribing',
                percent: progressPercent || 25,
                currentSegment: 1,
                totalSegments: 1,
                completedSegmentsCount: progressPercent >= 100 ? 1 : 0,
                status: progressStatus,
              }}
              onCancel={handleCancelTranscription}
            />
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center space-y-5">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                isPaused
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400 animate-pulse ring-8 ring-red-50 dark:ring-red-950/20'
              }`}
            >
              <Mic className="w-10 h-10" />
            </div>

            <div className="text-center space-y-1">
              <span className="font-mono text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                {TranscriptService.formatTimeMs(elapsedSec * 1000)}
              </span>
              <p className="text-xs text-stone-500 uppercase tracking-wider font-medium">
                {isPaused ? 'Recording Paused' : 'Recording In Progress'}
              </p>
            </div>

            {liveTranscript && (
              <div
                aria-live="polite"
                aria-atomic="false"
                className="w-full p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/60 text-xs text-stone-700 dark:text-stone-300 max-h-24 overflow-y-auto"
              >
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">
                  Live
                </span>
                <p className="italic">{liveTranscript}</p>
              </div>
            )}

            <div className="flex items-center gap-4 pt-2">
              {isPaused ? (
                <button
                  id="btn-resume-recording"
                  onClick={handleResume}
                  className="p-3.5 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 transition-colors"
                  title="Resume"
                >
                  <Play className="w-5 h-5 fill-current" />
                </button>
              ) : (
                <button
                  id="btn-pause-recording"
                  onClick={handlePause}
                  className="p-3.5 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 transition-colors"
                  title="Pause"
                >
                  <Pause className="w-5 h-5 fill-current" />
                </button>
              )}

              <button
                id="btn-stop-recording"
                onClick={handleStop}
                className="px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-red-600/20 transition-all hover:scale-102"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioRecordingModal;
