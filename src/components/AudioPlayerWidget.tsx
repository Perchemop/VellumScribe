import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  FileAudio,
  Trash2,
  FileText,
  Clock,
  Sparkles,
  Loader2,
  AlertCircle,
  Mic,
  Key,
} from 'lucide-react';
import { RecordingRecord, TranscriptionJobStatus } from '../types';
import { OfflineAiManager } from '../services/OfflineAiManager';
import { TranscriptService, FullTranscriptView } from '../services/TranscriptService';
import { TranscriptViewer } from './transcription/TranscriptViewer';
import { LiveRegion } from './common/LiveRegion';
import { AppLogger } from '../lib/logger';
import { MediaRepository } from '../lib/MediaRepository';
import { asErrorLike } from '../lib/errorLike';
import { PrivacyManager } from '../lib/privacyManager';
import { CloudAiConsentModal } from './CloudAiConsentModal';
import { AiStudioKeyModal } from './AiStudioKeyModal';

// Lazily loaded so the recovery sheet is only fetched when actually opened —
// keeps it out of the main bundle (see the INEFFECTIVE_DYNAMIC_IMPORT note).
const TranscriptionRecoverySheet = React.lazy(() =>
  import('./audio/TranscriptionRecoverySheet').then((m) => ({
    default: m.TranscriptionRecoverySheet,
  }))
);

interface AudioPlayerWidgetProps {
  recording: RecordingRecord;
  onDelete?: (id: number) => void;
  compact?: boolean;
}

export const AudioPlayerWidget: React.FC<AudioPlayerWidgetProps> = ({
  recording,
  onDelete,
  compact = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(recording.duration_seconds || 60);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // New Durable Full Transcript View (Segments & Speakers)
  const [fullTranscript, setFullTranscript] = useState<FullTranscriptView | null>(() =>
    TranscriptService.getFullTranscriptForRecording(recording.id)
  );

  // Transcription pipeline status
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [jobStatus, setJobStatus] = useState<TranscriptionJobStatus | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [showRecoverySheet, setShowRecoverySheet] = useState(false);
  const [playbackUnavailable, setPlaybackUnavailable] = useState(false);
  const [mediaLoading, setMediaLoading] = useState<boolean>(!!recording.media_key);
  const [showTranscribePrompt, setShowTranscribePrompt] = useState(false);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);
  const [showCloudAiConsentModal, setShowCloudAiConsentModal] = useState(false);
  const [showTranscribePrompt, setShowTranscribePrompt] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Playable media is resolved from local storage: `recording.audio_url` was
  // never assigned anywhere (it stayed undefined), which silently forced every
  // playback through the synthetic demo tone. The real blob URL is created here
  // and revoked on unmount/recording change.
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const hasRealUrl = !!mediaUrl;

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      setMediaUrl(null);
      if (!recording.media_key) {
        setMediaLoading(false);
        return;
      }
      try {
        const blob = await MediaRepository.getBinary(recording.media_key);
        if (!blob || cancelled) return;
        created = URL.createObjectURL(blob);
        setMediaUrl(created);
      } catch (e) {
        AppLogger.warn('AudioPlayerWidget', 'Could not load recording media for playback', e);
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [recording.media_key, recording.id]);

  const refreshTranscriptData = useCallback(() => {
    const updated = TranscriptService.getFullTranscriptForRecording(recording.id);
    setFullTranscript(updated);
  }, [recording.id]);

  useEffect(() => {
    refreshTranscriptData();
  }, [refreshTranscriptData]);

  /**
   * Run 100% Offline On-Device Speech Recognition (whisper.cpp)
   * Zero cloud network requests - completely resolves "Failed to fetch"!
   */
  const handleTranscribeWithOfflineAi = async () => {
    if (isTranscribing) return;
    setIsTranscribing(true);
    setTranscribeError(null);

    const aiMgr = OfflineAiManager.getInstance();
    try {
      const { jobId } = await aiMgr.transcribeRecording(recording.id);
      setActiveJobId(jobId);

      const pollInterval = setInterval(async () => {
        try {
          const status = await aiMgr.getTranscriptionStatus(jobId);
          setJobStatus(status);

          if (status.status === 'COMPLETED') {
            clearInterval(pollInterval);
            setIsTranscribing(false);
            refreshTranscriptData();
            setShowTranscript(true);
            setTranscribeError(null);
          } else if (status.status === 'FAILED') {
            clearInterval(pollInterval);
            setIsTranscribing(false);
            const errorMsg = OfflineAiManager.mapErrorCodeToUserMessage(status.error);
            setTranscribeError(errorMsg);
            setShowRecoverySheet(true);
          } else if (status.status === 'CANCELLED') {
            clearInterval(pollInterval);
            setIsTranscribing(false);
          }
        } catch (_e) {
          const e = asErrorLike(_e);
          clearInterval(pollInterval);
          setIsTranscribing(false);
          setTranscribeError(e?.message || 'Could not verify speech recognition job status.');
          setShowRecoverySheet(true);
        }
      }, 300);
    } catch (_err) {
      const err = asErrorLike(_err);
      setIsTranscribing(false);

      // If on-device Whisper isn't available, offer cloud AI instead
      if (err?.message?.includes('OFFLINE_AI_ENGINE_UNAVAILABLE') || err?.message?.includes('OFFLINE_AI_MODEL_MISSING')) {
        setShowTranscribePrompt(true);
        return;
      }

      const errorMsg = OfflineAiManager.mapErrorCodeToUserMessage(err?.message);
      setTranscribeError(errorMsg);
      setShowRecoverySheet(true);
    }
  };

  const handleCancelTranscription = async () => {
    if (activeJobId) {
      await OfflineAiManager.getInstance().cancelTranscription(activeJobId);
      setIsTranscribing(false);
      setJobStatus(null);
    }
  };

  const handleSeekToTime = (timeSec: number) => {
    setCurrentTime(timeSec);
    if (hasRealUrl && audioRef.current) {
      audioRef.current.currentTime = timeSec;
      if (!isPlaying) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const handleTogglePlay = () => {
    if (mediaLoading) return;
    if (!hasRealUrl || !audioRef.current) {
      // Honest state, never a synthetic tone pretending to be the recording.
      setPlaybackUnavailable(true);
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.muted = isMuted;
      audioRef.current.play().catch((e) => {
        AppLogger.warn('AudioPlayerWidget', 'Playback failed', e);
        setPlaybackUnavailable(true);
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = Number(e.target.value);
    setCurrentTime(target);
    if (hasRealUrl && audioRef.current) {
      audioRef.current.currentTime = target;
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (hasRealUrl && audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const handleToggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (hasRealUrl && audioRef.current) {
      audioRef.current.muted = newMuted;
    }
  };

  const handleReset = () => {
    setCurrentTime(0);
    if (hasRealUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const fileName = recording.file_path.split('/').pop() || `recording_${recording.id}.wav`;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 p-1.5 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-xs">
        {hasRealUrl && (
          <audio
            ref={audioRef}
            src={mediaUrl ?? undefined}
            onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
            onLoadedMetadata={() =>
              audioRef.current &&
              setDuration(audioRef.current.duration || recording.duration_seconds)
            }
            onEnded={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
          />
        )}
        <button
          onClick={handleTogglePlay}
          disabled={playbackUnavailable || mediaLoading}
          title={
            mediaLoading
              ? 'Loading recording audio…'
              : playbackUnavailable
                ? 'Recording audio not found on this device'
                : 'Play recording'
          }
          className="w-6 h-6 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 flex items-center justify-center shadow-2xs hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
        >
          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
        </button>
        <span className="font-mono text-xs text-stone-700 dark:text-stone-300">
          {mediaLoading
            ? 'Loading…'
            : playbackUnavailable
              ? 'Audio not found'
              : `${formatTime(currentTime)} / ${formatTime(duration)}`}
        </span>
        {onDelete && (
          <button
            onClick={() => onDelete(recording.id)}
            className="text-stone-400 hover:text-red-500 transition-colors p-0.5"
            title="Delete recording"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      id={`audio-player-card-${recording.id}`}
      className="p-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xs space-y-3.5 transition-all"
    >
      {hasRealUrl && (
        <audio
          ref={audioRef}
          src={mediaUrl ?? undefined}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={() =>
            audioRef.current && setDuration(audioRef.current.duration || recording.duration_seconds)
          }
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-2 rounded-xl ${isPlaying ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'}`}
          >
            <FileAudio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
              {fileName}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-stone-400">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-2.5 h-2.5" />
                {formatTime(duration)}
              </span>
              <span>•</span>
              <span>{(recording.file_size / 1024).toFixed(0)} KB</span>
              <span>•</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {fullTranscript && (
            <button
              onClick={() => setShowTranscript((prev) => !prev)}
              title="Toggle Transcript view"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                showTranscript
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'text-stone-600 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Transcript</span>
            </button>
          )}

          {/* Offline AI Transcribe action */}
          <button
            onClick={() => handleTranscribeWithOfflineAi()}
            disabled={isTranscribing}
            title={fullTranscript ? 'Re-transcribe' : 'Transcribe'}
            className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isTranscribing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span className="hidden sm:inline">
              {isTranscribing ? '…' : fullTranscript ? 'Retry' : 'Transcribe'}
            </span>
          </button>

          {onDelete && (
            <button
              onClick={() => onDelete(recording.id)}
              title="Delete recording"
              className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress & Status when actively transcribing */}
      {isTranscribing && jobStatus && (
        <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs space-y-2">
          <LiveRegion
            message={`Speech transcription progress: ${jobStatus.progressPercent} percent. ${jobStatus.phaseLabel || ''}`}
            role="status"
          />
          <div className="flex items-center justify-between text-emerald-900 dark:text-emerald-200">
            <span className="font-medium flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              {jobStatus.phaseLabel || 'Transcribing speech chunks...'}
            </span>
            <span>{jobStatus.progressPercent}%</span>
          </div>

          <div className="w-full bg-emerald-200/50 dark:bg-emerald-900/50 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${jobStatus.progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-stone-500">
            <span>
              {jobStatus.currentChunk && jobStatus.totalChunks
                ? `Chunk ${jobStatus.currentChunk} of ${jobStatus.totalChunks}`
                : 'Offline Whisper Model'}
            </span>
            <button
              type="button"
              onClick={handleCancelTranscription}
              className="text-stone-600 hover:text-red-600 dark:text-stone-400 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Waveform Visualization & Scrubber */}
      <div className="space-y-1.5 bg-stone-50 dark:bg-stone-950/60 p-2.5 rounded-xl border border-stone-200/60 dark:border-stone-800/60">
        <div className="flex items-center gap-1 h-6 w-full justify-between px-1">
          {Array.from({ length: 36 }).map((_, i) => {
            const h = Math.abs(Math.sin(i * 0.35 + (recording.id % 5))) * 16 + 4;
            const isPlayed = currentTime / (duration || 1) > i / 36;
            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-100 ${
                  isPlayed
                    ? isPlaying
                      ? 'bg-red-500 dark:bg-red-400'
                      : 'bg-emerald-600 dark:bg-emerald-400'
                    : 'bg-stone-200 dark:bg-stone-800'
                }`}
                style={{
                  height:
                    isPlaying && isPlayed
                      ? `${Math.min(22, h * (1 + Math.sin(i * 1.5 + currentTime * 8) * 0.25))}px`
                      : `${h}px`,
                }}
              />
            );
          })}
        </div>

        {/* Progress Slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-stone-500 w-9 text-left">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 accent-stone-900 dark:accent-stone-100 h-1 bg-stone-200 dark:bg-stone-700 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-stone-500 w-9 text-right">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Playback Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTogglePlay}
            disabled={playbackUnavailable || mediaLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 rounded-lg text-xs font-semibold shadow-xs transition-colors disabled:opacity-40"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5" />
            )}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          {playbackUnavailable && (
            <span role="status" className="text-xs text-amber-700 dark:text-amber-400">
              Recording audio not found on this device.
            </span>
          )}

          <button
            onClick={handleReset}
            title="Restart playback from beginning"
            className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-0.5 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg text-xs">
          {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
            <button
              key={rate}
              onClick={() => handleRateChange(rate)}
              className={`px-1.5 py-0.5 font-mono rounded transition-colors ${
                playbackRate === rate
                  ? 'bg-white dark:bg-stone-700 font-bold text-stone-900 dark:text-stone-100 shadow-2xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Humanized Error Sheet with Recovery Actions (UX-P0.2) */}
      {transcribeError && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs text-amber-200 space-y-2.5 animate-in fade-in">
          <LiveRegion message={`Transcription notice: ${transcribeError}`} role="alert" />
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <p className="font-semibold text-amber-300">Couldn't Transcribe</p>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {transcribeError.includes('Whisper') ||
                transcribeError.includes('runtime') ||
                transcribeError.includes('unavailable')
                  ? 'On-device Whisper isn’t available on this device. Enable Cloud AI transcription in Settings.'
                  : transcribeError}
                </p>
            </div>
            <button
              onClick={() => setTranscribeError(null)}
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-200 p-0.5"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/15">
            <button
              type="button"
              onClick={() => setShowTranscribePrompt(true)}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium rounded-lg text-xs transition-colors shadow-sm"
            >
              Enable Cloud AI Transcription
            </button>
            <button
              type="button"
              onClick={handleTranscribeWithOfflineAi}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-medium transition-colors"
            >
              Retry
            </button>
            <span className="text-[11px] text-zinc-600 dark:text-zinc-400">or try:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-800 text-stone-300 rounded-md text-[11px]">
              <Mic className="w-3 h-3 text-emerald-400" />
              Live Dictation (when recording)
            </span>
          </div>
        </div>
      )}

      {/* Dedicated Transcription Recovery & Alternatives Sheet */}
      {showRecoverySheet && (
        <React.Suspense fallback={null}>
          <TranscriptionRecoverySheet
            isOpen={showRecoverySheet}
            onClose={() => setShowRecoverySheet(false)}
            errorText={transcribeError || undefined}
            recordingId={recording.id}
            onTranscribeSuccess={() => {
              refreshTranscriptData();
              setShowTranscript(true);
              setTranscribeError(null);
              setShowRecoverySheet(false);
            }}
            onRetryOffline={handleTranscribeWithOfflineAi}
          />
        </React.Suspense>
      )}

      {/* Timestamped Segments Transcript Viewer */}
      {showTranscript && fullTranscript && (
        <div className="pt-2 border-t border-stone-200 dark:border-stone-800">
          <TranscriptViewer
            transcription={fullTranscript.transcription}
            segments={fullTranscript.segments}
            speakers={fullTranscript.speakers}
            currentAudioTimeSec={currentTime}
            onSeekAudio={handleSeekToTime}
            onSpeakerRenamed={refreshTranscriptData}
          />
        </div>
      )}
      {/* Cloud AI consent prompt */}
      {showTranscribePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0e] w-full max-w-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Enable Cloud AI Transcription
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  On-device Whisper isn’t available on this device. Cloud AI can transcribe your
                  recording using Google AI Studio (Gemini). Your voice data is sent to Google for
                  processing.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {!hasCloudKey && (
                <>
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="cloud-ai-key-checkbox"
                      onChange={() => setShowAiKeyModal(true)}
                      className="w-4 h-4 rounded border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-zinc-900 dark:text-zinc-100">
                      I have a Google AI Studio API key
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTranscribePrompt(false);
                      setShowAiKeyModal(true);
                    }}
                    className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5"
                  >
                    <span className="w-5 h-5 text-zinc-500 flex items-center justify-center">
                      <Key className="w-3 h-3" />
                    </span>
                    <span>Get a Google AI Studio Key</span>
                  </button>
                </>
              )}
              {hasCloudKey && (
                <button
                  type="button"
                  onClick={() => {
                    setShowTranscribePrompt(false);
                    setShowCloudAiConsentModal(true);
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-2xs"
                >
                  Start Transcription
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowTranscribePrompt(false)}
              className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* AI Studio Key Modal */}
      {showAiKeyModal && (
        <AiStudioKeyModal
          isOpen={showAiKeyModal}
          onClose={() => setShowAiKeyModal(false)}
          onKeySaved={(key: string) => {
            AiSettingsManager.setGoogleApiKey(key);
            setGoogleKey(key);
            setShowAiKeyModal(false);
            setShowCloudAiConsentModal(true);
          }}
        />
      )}

      {/* Cloud AI Consent Modal */}
      {showCloudAiConsentModal && (
        <CloudAiConsentModal
          isOpen={showCloudAiConsentModal}
          onClose={() => setShowCloudAiConsentModal(false)}
          onConfirm={() => {
            PrivacyManager.grantCloudAiConsent();
            setShowCloudAiConsentModal(false);
            handleTranscribeWithOfflineAi();
          }}
        />
      )}
    </div>
  );
};
