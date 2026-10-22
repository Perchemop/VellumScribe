import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  X,
  
  AlertCircle,
  
  
  WifiOff,
  Upload} from 'lucide-react';
import { AudioRecordingManager, RecordedAudioResult } from '../../services/AudioRecordingManager';
import { OfflineAiManager } from '../../services/OfflineAiManager';
import { TranscriptService } from '../../services/TranscriptService';
import { TranscriptionJobStatus } from '../../types';
import { useModalBackHandler } from '../../lib/modalBackStack';
import { TranscriptionProgressCard } from '../TranscriptionProgressCard';
import { describeAudioImport } from '../../lib/audioImportNotices';
import { AppLogger } from '../../lib/logger';
import { asErrorLike } from '../../lib/errorLike';

interface AudioRecordingModalProps {
  noteId: number;
  isOpen: boolean;
  onClose: () => void;
  onRecordingComplete: (result: RecordedAudioResult) => void;
  /** Fired when offline transcription could not complete, so the host can offer recovery. */
  onTranscriptionUnavailable?: (errorText: string) => void;
}

export const AudioRecordingModal: React.FC<AudioRecordingModalProps> = ({
  noteId,
  isOpen,
  onClose,
  onRecordingComplete,
  onTranscriptionUnavailable,
}) => {
  useModalBackHandler(isOpen, onClose, 'audio-recording-modal');

  const [recordingManager] = useState(() => new AudioRecordingManager());
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Post-recording offline transcription pipeline state
  const [transcribing, setTranscribing] = useState(false);
  const [jobStatus, setJobStatus] = useState<TranscriptionJobStatus | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // Idle = choice screen (Record / Upload). Prevents auto-start race that was
  // contributing to process kills on file pick.
  const [mode, setMode] = useState<'idle' | 'recording' | 'uploading'>('idle');

  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Do NOT auto-start the microphone. Show choice screen instead.
      setMode('idle');
      setErrorMessage(null);
      setImportNotice(null);
      setIsImporting(false);
      setTranscribing(false);
      setJobStatus(null);
      setActiveJobId(null);
      setElapsedSec(0);
      setLiveTranscript('');
    } else {
      handleCleanup();
    }
    return () => handleCleanup();
  }, [isOpen]);

  const handleStart = async () => {
    setErrorMessage(null);
    setImportNotice(null);
    setElapsedSec(0);
    setLiveTranscript('');
    setMode('recording');
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
    } catch (_err) {
      const err = asErrorLike(_err);
      setErrorMessage(err?.message || 'Could not access microphone.');
      setIsRecording(false);
      setMode('idle');
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
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const result = await recordingManager.stopRecording(noteId);
      setIsRecording(false);
      setIsPaused(false);

      // Trigger offline transcription automatically per spec
      if (result.recording) {
        setTranscribing(true);
        const aiManager = OfflineAiManager.getInstance();
        const { jobId } = await aiManager.transcribeRecording(result.recording.id);
        setActiveJobId(jobId);

        const poll = async () => {
          try {
            const status = await aiManager.getTranscriptionStatus(jobId);
            setJobStatus(status);
            if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'CANCELLED') {
              setTranscribing(false);
              if (status.status === 'COMPLETED') {
                onRecordingComplete(result);
                onClose();
              } else if (status.status === 'FAILED') {
                const message = status.error || 'Transcription failed.';
                setErrorMessage(message);
                onTranscriptionUnavailable?.(message);
              }
              return;
            }
            setTimeout(poll, 800);
          } catch (_e) {
            const e = asErrorLike(_e);
            setTranscribing(false);
            const message = e?.message || 'Status poll failed.';
            setErrorMessage(message);
            onTranscriptionUnavailable?.(message);
          }
        };
        setTimeout(poll, 600);
      } else {
        onRecordingComplete(result);
        onClose();
      }
    } catch (_err) {
      const err = asErrorLike(_err);
      setErrorMessage(err?.message || 'Failed to stop and save recording.');
      setIsRecording(false);
    }
  };

  const handleCancelTranscription = async () => {
    if (activeJobId) {
      await OfflineAiManager.getInstance().cancelTranscription(activeJobId);
      setTranscribing(false);
      onClose();
    }
  };

  const handleCleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      recordingManager.stopRecording?.(0).catch(() => {});
    } catch { /* ignore */ }
    setIsRecording(false);
    setIsPaused(false);
    setTranscribing(false);
    setJobStatus(null);
    setIsImporting(false);
    setMode('idle');
  };

  /**
   * Import a pre-recorded audio file (no extra top-level button).
   * Runs the exact same 16 kHz mono PCM conversion + MediaRepository save +
   * offline Whisper pipeline used by live recordings. Fully defensive so a
   * bad file or WebView decode failure never process-kills the app.
   */
  const handleImportAudioFile = async (file: File) => {
    if (!file || isImporting || transcribing) return;
    setErrorMessage(null);
    setImportNotice(null);
    setIsImporting(true);
    setMode('uploading');

    try {
      // Stop any active recording first
      if (isRecording) {
        try {
          await recordingManager.stopRecording(noteId).catch(() => {});
        } catch { /* ignore */ }
        setIsRecording(false);
        setIsPaused(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }

      // Single import pipeline: FileReader materialization, 16 kHz mono
      // conversion, checksum, and MediaRepository persistence.
      const result = await recordingManager.importAudioFile(noteId, file, file.name);
      if (!result.recording?.id) {
        throw new Error('Failed to create recording record for imported audio.');
      }
      setImportNotice(describeAudioImport(result));

      // Kick off offline transcription (same as stopRecording path)
      setTranscribing(true);
      setIsImporting(false);
      const aiManager = OfflineAiManager.getInstance();
      const { jobId } = await aiManager.transcribeRecording(result.recording.id);
      setActiveJobId(jobId);

      // Poll status (reuse existing logic pattern)
      const poll = async () => {
        try {
          const status = await aiManager.getTranscriptionStatus(jobId);
          setJobStatus(status);
          if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'CANCELLED') {
            setTranscribing(false);
            if (status.status === 'COMPLETED') {
              onRecordingComplete(result);
              onClose();
            } else if (status.status === 'FAILED') {
              const message = status.error || 'Transcription failed.';
              setErrorMessage(message);
              onTranscriptionUnavailable?.(message);
            }
            return;
          }
          setTimeout(poll, 800);
        } catch (_e) {
          const e = asErrorLike(_e);
          setTranscribing(false);
          const message = e?.message || 'Status poll failed.';
          setErrorMessage(message);
          onTranscriptionUnavailable?.(message);
        }
      };
      setTimeout(poll, 600);
    } catch (_err) {
      const err = asErrorLike(_err);
      AppLogger.error('AudioRecordingModal', 'Import audio failed', err);
      setIsImporting(false);
      setTranscribing(false);
      setErrorMessage(err?.message || 'Could not import audio file. Try a different format (WAV/MP3/M4A).');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
      <div
        id="audio-recording-modal"
        className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-2xl space-y-6 text-stone-800 dark:text-stone-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <WifiOff className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                {transcribing
                  ? 'Transcribing Speech Locally'
                  : mode === 'idle'
                    ? 'Voice Memo'
                    : 'Record Audio Memo'}
              </h3>
              <span className="text-[11px] text-stone-500">
                16 kHz Mono PCM • On-Device AI
              </span>
            </div>
          </div>

          {!transcribing && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
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

        {importNotice && !errorMessage && (
          <div role="status" className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{importNotice}</span>
          </div>
        )}

        {/* Dynamic State View */}
        {transcribing ? (
          <div className="py-4">
            <TranscriptionProgressCard
              progress={{
                phase: 'transcribing',
                percent: jobStatus?.progressPercent || 25,
                currentSegment: jobStatus?.currentChunk || 1,
                totalSegments: jobStatus?.totalChunks || 1,
                completedSegmentsCount: Math.max(0, (jobStatus?.currentChunk || 1) - 1),
                status: jobStatus?.phaseLabel || 'Transcribing speech chunks locally with Whisper...',
              }}
              onCancel={handleCancelTranscription}
            />
          </div>
        ) : mode === 'idle' ? (
          /* Choice screen – no mic started yet. Prevents race/crash on file pick. */
          <div className="py-6 flex flex-col items-center justify-center space-y-5">
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Mic className="w-9 h-9" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                Add a voice memo
              </p>
              <p className="text-xs text-stone-500">
                Record now or upload an existing audio file. Everything stays on-device.
              </p>
            </div>

            <div className="flex flex-col w-full gap-3 pt-2">
              <button
                type="button"
                onClick={handleStart}
                className="w-full px-5 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
              >
                <Mic className="w-4 h-4" />
                Start Recording
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) {
                    // Defer off the native file-chooser callback to avoid WebView process kills
                    setTimeout(() => {
                      handleImportAudioFile(f).catch((err) => {
                        AppLogger.error('AudioRecordingModal', 'handleImportAudioFile uncaught', err);
                        setErrorMessage(err?.message || 'Import failed');
                        setIsImporting(false);
                        setMode('idle');
                      });
                    }, 0);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setMode('uploading');
                  // Small delay so the mode change paints before the system picker opens
                  setTimeout(() => fileInputRef.current?.click(), 50);
                }}
                disabled={isImporting}
                className="w-full px-5 py-3.5 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-medium text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Upload Audio File
              </button>
            </div>

            {isImporting && (
              <p className="pt-2 text-center text-[11px] text-stone-500 animate-pulse">
                Importing & converting to 16 kHz mono…
              </p>
            )}
          </div>
        ) : (
          /* Active Recording View */
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
                  Live Dictation (Offline):
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
                className="px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-2 shadow-lg shadow-red-600/20 transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop & Transcribe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioRecordingModal;
