import React, { useState, useRef, useEffect } from 'react';
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
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { RecordingRecord, TranscriptRecord } from '../types';
import { SQLiteDatabase } from '../lib/storage';
import { MediaRepository, SecureMediaRepository } from '../lib/MediaRepository';
import { UnlockSessionManager } from '../lib/UnlockSessionManager';
import { GeminiApiService } from '../lib/geminiService';
import { SqliteRepository } from '../lib/sqlite/sqliteRepository';

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
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [isTranscriptCopied, setIsTranscriptCopied] = useState(false);

  const [currentTranscript, setCurrentTranscript] = useState<TranscriptRecord | undefined>(() =>
    SQLiteDatabase.getTranscriptForRecording(recording.id)
  );
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const transcript: TranscriptRecord | undefined =
    currentTranscript || SQLiteDatabase.getTranscriptForRecording(recording.id);

  const handleTranscribeWithAi = async () => {
    if (isTranscribing) return;
    setIsTranscribing(true);
    setTranscribeError(null);

    try {
      let audioBlob: Blob | null = null;
      let mimeType = 'audio/webm';

      if (recording.media_key) {
        const sessionKey = recording.note_id
          ? UnlockSessionManager.getSessionKey(recording.note_id)
          : null;
        if (sessionKey) {
          audioBlob = await SecureMediaRepository.getEncryptedWithKey(recording.media_key, sessionKey);
        }
        if (!audioBlob) {
          audioBlob = await MediaRepository.getBinary(recording.media_key);
        }
      }

      if (!audioBlob && recording.audio_url) {
        try {
          const res = await fetch(recording.audio_url);
          if (res.ok) {
            audioBlob = await res.blob();
          }
        } catch (fetchErr) {
          console.warn('Could not fetch audio URL blob:', fetchErr);
        }
      }

      if (!audioBlob) {
        throw new Error('Audio recording data is not available on this device.');
      }

      if (audioBlob.type) {
        mimeType = audioBlob.type;
      }

      const res = await GeminiApiService.transcribeAudio(
        audioBlob,
        mimeType,
        recording.duration_seconds,
        '',
        recording.file_path || 'recording.wav'
      );

      if (!res.transcript || !res.transcript.trim()) {
        throw new Error('No speech text could be recognized from this audio recording.');
      }

      // Save or update in SQLite
      const existing = SQLiteDatabase.getTranscriptForRecording(recording.id);
      let saved: TranscriptRecord;
      if (existing) {
        saved = {
          ...existing,
          transcript_text: res.transcript,
          confidence: 0.95,
          created_at: new Date().toISOString(),
        };
        SqliteRepository.saveTranscript(saved);
        SQLiteDatabase.refreshCaches();
      } else {
        saved = SQLiteDatabase.addTranscript({
          recording_id: recording.id,
          transcript_text: res.transcript,
          confidence: 0.95,
          speaker_count: 1,
          created_at: new Date().toISOString(),
        });
      }

      setCurrentTranscript(saved);
      setShowTranscript(true);
      setTranscribeError(null);
    } catch (err: any) {
      console.error('AudioPlayerWidget transcription error:', err);
      setTranscribeError(err?.message || 'Failed to transcribe audio with AI.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleCopyTranscript = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsTranscriptCopied(true);
      setTimeout(() => setIsTranscriptCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy transcript:', err);
    }
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const synthTimerRef = useRef<number | null>(null);

  // Initialize or handle audio src
  const hasRealUrl = !!(recording.audio_url && recording.audio_url.startsWith('blob:'));

  useEffect(() => {
    return () => {
      if (synthTimerRef.current) window.clearInterval(synthTimerRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Web Audio Synthesizer fallback for demo / synthetic recordings
  const playSyntheticAudioDemo = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      // Play soft harmonic chords / notes representing the speech memo
      const now = ctx.currentTime;
      const notesList = [261.63, 329.63, 392.0, 523.25, 440.0, 349.23, 392.0]; // C4, E4, G4, C5, A4, F4, G4
      
      notesList.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.4);
        
        gain.gain.setValueAtTime(0.001, now + i * 0.4);
        gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.4 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.4);
        osc.stop(now + i * 0.4 + 0.4);
      });

      // Advance synthetic progress bar
      let currentProgress = currentTime;
      synthTimerRef.current = window.setInterval(() => {
        currentProgress += 0.25 * playbackRate;
        if (currentProgress >= duration) {
          setIsPlaying(false);
          setCurrentTime(0);
          if (synthTimerRef.current) clearInterval(synthTimerRef.current);
        } else {
          setCurrentTime(currentProgress);
        }
      }, 250);
    } catch (err) {
      console.warn('Web Audio synthesis not allowed yet without user gesture:', err);
    }
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      if (hasRealUrl && audioRef.current) {
        audioRef.current.pause();
      } else {
        if (synthTimerRef.current) clearInterval(synthTimerRef.current);
        if (audioContextRef.current) audioContextRef.current.suspend().catch(() => {});
      }
      setIsPlaying(false);
    } else {
      if (hasRealUrl && audioRef.current) {
        audioRef.current.playbackRate = playbackRate;
        audioRef.current.muted = isMuted;
        audioRef.current.play().catch(() => {
          playSyntheticAudioDemo();
        });
      } else {
        playSyntheticAudioDemo();
      }
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

  const fileName = recording.file_path.split('/').pop() || `recording_${recording.id}.m4a`;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 p-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs">
        {hasRealUrl && (
          <audio
            ref={audioRef}
            src={recording.audio_url}
            onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
            onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration || recording.duration_seconds)}
            onEnded={() => {
              setIsPlaying(false);
              setCurrentTime(0);
            }}
          />
        )}
        <button
          onClick={handleTogglePlay}
          className="w-6 h-6 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shadow-2xs hover:scale-105 transition-transform"
        >
          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
        </button>
        <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        {onDelete && (
          <button
            onClick={() => onDelete(recording.id)}
            className="text-zinc-400 hover:text-rose-500 transition-colors p-0.5"
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
      className="p-3 sm:p-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xs space-y-2.5 transition-all"
    >
      {hasRealUrl && (
        <audio
          ref={audioRef}
          src={recording.audio_url}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration || recording.duration_seconds)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg ${isPlaying ? 'bg-rose-500 text-white animate-pulse' : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'}`}>
            <FileAudio className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {fileName}
            </h4>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-2.5 h-2.5" />
                {formatTime(duration)}
              </span>
              <span>•</span>
              <span>{(recording.file_size / 1024).toFixed(0)} KB</span>
              {recording.bitrate_kbps && <span>• {recording.bitrate_kbps} kbps</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {transcript && (
            <button
              onClick={() => setShowTranscript((prev) => !prev)}
              title="Toggle Transcript view"
              className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                showTranscript
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Transcript</span>
            </button>
          )}

          {/* AI Transcribe / Re-transcribe action */}
          <button
            onClick={handleTranscribeWithAi}
            disabled={isTranscribing}
            title={transcript ? "Re-transcribe recording with AI" : "Transcribe recording to text"}
            className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isTranscribing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            )}
            <span className="hidden sm:inline text-xs">
              {isTranscribing ? 'Transcribing...' : transcript ? 'Re-transcribe' : 'Transcribe'}
            </span>
          </button>

          {onDelete && (
            <button
              onClick={() => onDelete(recording.id)}
              title="Delete recording"
              className="p-1.5 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Waveform Visualization & Scrubber */}
      <div className="space-y-1.5 bg-zinc-50 dark:bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex items-center gap-1 h-6 w-full justify-between px-1">
          {Array.from({ length: 36 }).map((_, i) => {
            const h = Math.abs(Math.sin(i * 0.35 + (recording.id % 5))) * 16 + 4;
            const isPlayed = (currentTime / (duration || 1)) > (i / 36);
            return (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-100 ${
                  isPlayed
                    ? isPlaying
                      ? 'bg-rose-500 dark:bg-rose-400'
                      : 'bg-indigo-600 dark:bg-indigo-400'
                    : 'bg-zinc-200 dark:bg-zinc-800'
                }`}
                style={{
                  height: isPlaying && isPlayed ? `${Math.min(22, h * (1 + Math.random() * 0.3))}px` : `${h}px`,
                }}
              />
            );
          })}
        </div>

        {/* Progress Slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-500 w-9 text-left">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 accent-zinc-900 dark:accent-zinc-100 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-zinc-500 w-9 text-right">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Playback Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTogglePlay}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold shadow-2xs transition-colors"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={handleReset}
            title="Restart playback from beginning"
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
          {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
            <button
              key={rate}
              onClick={() => handleRateChange(rate)}
              className={`px-1.5 py-0.5 font-mono rounded transition-colors ${
                playbackRate === rate
                  ? 'bg-white dark:bg-zinc-700 font-bold text-zinc-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>

      {/* Error notice if transcription fails */}
      {transcribeError && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Transcription Error</p>
            <p className="text-amber-700 dark:text-amber-300">{transcribeError}</p>
          </div>
          <button
            onClick={handleTranscribeWithAi}
            className="px-2 py-0.5 bg-amber-600 text-white rounded text-[11px] font-medium hover:bg-amber-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Transcript Collapsible Drawer */}
      {showTranscript && transcript && (
        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-xl text-xs space-y-2 animate-fadeIn">
          {/* Notice if only offline acoustic VAD segments were detected */}
          {(transcript.transcript_text.includes('Voice Activity Detection') ||
            transcript.transcript_text.includes('Vocal Segment')) && (
            <div className="p-2.5 bg-amber-50/90 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 rounded-lg text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Offline acoustic segments detected. Click to run high-accuracy AI speech recognition.</span>
              </div>
              <button
                type="button"
                onClick={handleTranscribeWithAi}
                disabled={isTranscribing}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md text-xs flex items-center gap-1 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
              >
                {isTranscribing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {isTranscribing ? 'Transcribing...' : 'Transcribe with AI'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 dark:text-indigo-200 flex-wrap gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Verbatim Voice Transcript</span>
              <span className="text-[11px] text-indigo-600/70 dark:text-indigo-400/70 font-normal">
                • {transcript.transcript_text.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {transcript.speaker_count && transcript.speaker_count > 1 && (
                <span className="text-[11px] text-indigo-600/80 dark:text-indigo-400 font-normal bg-indigo-100/70 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded">
                  {transcript.speaker_count} Speakers
                </span>
              )}

              {/* Copy transcript button */}
              <button
                type="button"
                onClick={() => handleCopyTranscript(transcript.transcript_text)}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border border-indigo-200/80 dark:border-indigo-800 bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                title="Copy transcript text"
              >
                {isTranscriptCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-indigo-500" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {/* Expand / Collapse toggle for large transcripts */}
              {transcript.transcript_text.length > 180 && (
                <button
                  type="button"
                  onClick={() => setIsTranscriptExpanded((prev) => !prev)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border border-indigo-200/80 dark:border-indigo-800 bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  title={isTranscriptExpanded ? 'Collapse transcript view' : 'Expand transcript view'}
                >
                  {isTranscriptExpanded ? (
                    <>
                      <Minimize2 className="w-3 h-3" />
                      <span>Compact</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3 h-3" />
                      <span>Expand</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Transcript Text Box */}
          <div
            tabIndex={0}
            role="region"
            aria-label="Scrollable verbatim voice transcript"
            className={`text-zinc-800 dark:text-zinc-200 leading-relaxed font-normal bg-white/80 dark:bg-zinc-900/80 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/50 overflow-y-auto overscroll-contain pr-2 custom-minimal-scrollbar select-text text-xs whitespace-pre-line focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-all ${
              isTranscriptExpanded ? 'max-h-80 sm:max-h-[420px]' : 'max-h-36 sm:max-h-48'
            }`}
          >
            "{transcript.transcript_text}"
          </div>
        </div>
      )}
    </div>
  );
};
