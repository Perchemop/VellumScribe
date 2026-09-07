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
} from 'lucide-react';
import { RecordingRecord, TranscriptRecord } from '../types';
import { SQLiteDatabase } from '../lib/storage';

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const synthTimerRef = useRef<number | null>(null);

  const transcript: TranscriptRecord | undefined = SQLiteDatabase.getTranscriptForRecording(recording.id);

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

      {/* Transcript Collapsible Drawer */}
      {showTranscript && transcript && (
        <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-xl text-xs space-y-1.5 animate-fadeIn">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 dark:text-indigo-200">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
              Verbatim Voice Transcript
            </span>
            <span className="text-xs text-indigo-600/80 dark:text-indigo-400 font-normal">
              {transcript.speaker_count || 1} Speaker{(transcript.speaker_count || 1) > 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-zinc-800 dark:text-zinc-200 leading-relaxed font-normal bg-white/70 dark:bg-zinc-900/70 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
            "{transcript.transcript_text}"
          </p>
        </div>
      )}
    </div>
  );
};
