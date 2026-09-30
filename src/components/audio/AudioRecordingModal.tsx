import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  X,
  Sparkles,
  AlertCircle,
  RefreshCw,
  HardDrive,
  WifiOff,
} from 'lucide-react';
import { AudioRecordingManager, RecordedAudioResult } from '../../services/AudioRecordingManager';
import { OfflineAiManager } from '../../services/OfflineAiManager';
import { TranscriptService } from '../../services/TranscriptService';
import { TranscriptionJobStatus } from '../../types';
import { useModalBackHandler } from '../../lib/modalBackStack';
import { TranscriptionProgressCard } from '../TranscriptionProgressCard';

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

  // Post-recording offline transcription pipeline state
  const [transcribing, setTranscribing] = useState(false);
  const [jobStatus, setJobStatus] = useState<TranscriptionJobStatus | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      handleStart();
    } else {
      handleCleanup();
    }
    return () => handleCleanup();
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

        // Poll progress truthfully
        const pollInterval = setInterval(async () => {
          try {
            const status = await aiManager.getTranscriptionStatus(jobId);
            setJobStatus(status);

            if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'CANCELLED') {
              clearInterval(pollInterval);
              setTranscribing(false);
              onRecordingComplete(result);
              onClose();
            }
          } catch (pollErr) {
            clearInterval(pollInterval);
            setTranscribing(false);
            onRecordingComplete(result);
            onClose();
          }
        }, 300);
      } else {
        onRecordingComplete(result);
        onClose();
      }
    } catch (err: any) {
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
    setIsRecording(false);
    setIsPaused(false);
    setTranscribing(false);
    setJobStatus(null);
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
                {transcribing ? 'Transcribing Speech Locally' : 'Record Audio Memo'}
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
        ) : (
          /* Active Recording View */
          <div className="py-6 flex flex-col items-center justify-center space-y-5">
            {/* Visual Pulse circle */}
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                isPaused
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                  : 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400 animate-pulse ring-8 ring-red-50 dark:ring-red-950/20'
              }`}
            >
              <Mic className="w-10 h-10" />
            </div>

            {/* Timer Counter */}
            <div className="text-center space-y-1">
              <span className="font-mono text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                {TranscriptService.formatTimeMs(elapsedSec * 1000)}
              </span>
              <p className="text-xs text-stone-500 uppercase tracking-wider font-medium">
                {isPaused ? 'Recording Paused' : 'Recording In Progress'}
              </p>
            </div>

            {/* Live Dictation Preview */}
            {liveTranscript && (
              <div
                aria-live="polite"
                aria-atomic="false"
                className="w-full p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700/60 text-xs text-stone-700 dark:text-stone-300 max-h-24 overflow-y-auto"
              >
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">
                  🎙️ Live Dictation (Offline Speech Recognizer):
                </span>
                <p className="italic">{liveTranscript}</p>
              </div>
            )}

            {/* Controls */}
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
