import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Square,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  FileAudio,
  Check,
  Loader2,
  X,
  Upload,
  Radio,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { AudioRecorderManager } from '../lib/audioRecorder';
import { GeminiApiService } from '../lib/geminiService';
import { SQLiteDatabase } from '../lib/storage';
import { RecordingRecord, TranscriptRecord } from '../types';
import { MediaRepository, SecureMediaRepository } from '../lib/MediaRepository';
import { UnlockSessionManager } from '../lib/UnlockSessionManager';
import { AiSettingsManager } from '../lib/aiSettings';
import { useModalBackHandler } from '../lib/modalBackStack';

interface AudioRecorderPlayerProps {
  noteId: number;
  onRecordingSaved: (rec: RecordingRecord, transcript?: TranscriptRecord) => void;
  onClose?: () => void;
}

export const AudioRecorderPlayer: React.FC<AudioRecorderPlayerProps> = ({
  noteId,
  onRecordingSaved,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0.1);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [recordedAudio, setRecordedAudio] = useState<{
    blob: Blob;
    base64: string;
    durationSeconds: number;
    fileSizeBytes: number;
    mimeType: string;
    url: string;
    originalFileName?: string;
    liveTranscript?: string;
  } | null>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState<string | null>(null);
  const [transcriptionSource, setTranscriptionSource] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const recorderRef = useRef<AudioRecorderManager | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createdBlobUrlRef = useRef<string | null>(null);

  // Hook up Android hardware & gesture back handling when rendered as modal dialog
  useModalBackHandler(!!onClose, onClose || (() => {}), 'audio-recorder-modal');

  const revokeActiveBlobUrl = () => {
    if (createdBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(createdBlobUrlRef.current);
      } catch {}
      createdBlobUrlRef.current = null;
    }
  };

  useEffect(() => {
    recorderRef.current = new AudioRecorderManager();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      revokeActiveBlobUrl();
    };
  }, []);

  const handleStartRecord = async () => {
    if (!recorderRef.current) return;
    setRecordedAudio(null);
    setTranscriptionText(null);
    setTranscriptionSource(null);
    setLiveTranscript('');
    setRecordingSeconds(0);
    setCurrentTime(0);

    const ok = await recorderRef.current.startRecording(
      (level) => {
        setAudioLevel(Math.max(0.1, level));
      },
      (chunk) => {
        setLiveTranscript(chunk);
      }
    );

    if (ok) {
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    }
  };

  const handleStopRecord = async () => {
    if (!recorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    const result = await recorderRef.current.stopRecording();
    revokeActiveBlobUrl();
    const url = URL.createObjectURL(result.blob);
    createdBlobUrlRef.current = url;
    setRecordedAudio({
      ...result,
      url,
    });

    if (result.liveTranscript && result.liveTranscript.trim().length > 0) {
      setTranscriptionText(result.liveTranscript);
      setTranscriptionSource('Offline Native Speech');
    }
  };

  // Handle file upload
  const handleAudioFileUpload = async (file: File) => {
    if (!file) return;
    setTranscriptionText(null);
    setCurrentTime(0);

    revokeActiveBlobUrl();
    const url = URL.createObjectURL(file);
    createdBlobUrlRef.current = url;
    const mimeType = file.type || 'audio/mp4';

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64Full = reader.result as string;
      const base64Data = base64Full.includes(',') ? base64Full.split(',')[1] : base64Full;

      // Extract duration via temp Audio element
      const tempAudio = new Audio(url);
      tempAudio.onloadedmetadata = () => {
        const dur = Math.round(tempAudio.duration) || 30;
        setRecordedAudio({
          blob: file,
          base64: base64Data,
          durationSeconds: dur,
          fileSizeBytes: file.size,
          mimeType,
          url,
          originalFileName: file.name,
        });
      };
      tempAudio.onerror = () => {
        setRecordedAudio({
          blob: file,
          base64: base64Data,
          durationSeconds: 45,
          fileSizeBytes: file.size,
          mimeType,
          url,
          originalFileName: file.name,
        });
      };
    };
    reader.readAsDataURL(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i)) {
        handleAudioFileUpload(file);
      }
    }
  };

  const handleTogglePlay = () => {
    if (!audioElemRef.current) return;
    if (isPlaying) {
      audioElemRef.current.pause();
      setIsPlaying(false);
    } else {
      audioElemRef.current.playbackRate = playbackRate;
      audioElemRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = Number(e.target.value);
    setCurrentTime(target);
    if (audioElemRef.current) {
      audioElemRef.current.currentTime = target;
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioElemRef.current) {
      audioElemRef.current.playbackRate = rate;
    }
  };

  const handleTranscribeAudio = async () => {
    if (!recordedAudio) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      const res = await GeminiApiService.transcribeAudio(
        recordedAudio.base64,
        recordedAudio.mimeType,
        recordedAudio.durationSeconds,
        liveTranscript || recordedAudio.liveTranscript
      );
      setTranscriptionText(res.transcript);
      setTranscriptionSource(res.source || 'Offline Native');
      setTranscribeError(null);
    } catch (err: any) {
      console.error('Audio transcription notice:', err);
      const errMsg = err?.message || 'Could not complete audio transcription.';
      setTranscribeError(errMsg);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSaveToDatabase = async () => {
    if (!recordedAudio) return;
    const timestamp = new Date().toISOString();
    const fileName = recordedAudio.originalFileName || `rec_${Date.now()}.m4a`;
    const filePath = `/storage/notes/audio/${fileName}`;
    const mediaKey = `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.m4a`;

    try {
      const blob = recordedAudio.blob;

      // Check if note is locked (has a session key)
      const sessionKey = UnlockSessionManager.getSessionKey(noteId);
      if (sessionKey) {
        await SecureMediaRepository.putEncryptedWithKey(mediaKey, blob, sessionKey);
      } else {
        await MediaRepository.putBinary(mediaKey, blob);
      }

      const savedRec = SQLiteDatabase.addRecording({
        note_id: noteId,
        file_path: filePath,
        file_size: recordedAudio.fileSizeBytes,
        duration_seconds: recordedAudio.durationSeconds,
        media_key: mediaKey,
        sample_rate: 44100,
        bitrate_kbps: 64,
        created_at: timestamp,
      });

      let savedTranscript: TranscriptRecord | undefined;
      if (transcriptionText) {
        savedTranscript = SQLiteDatabase.addTranscript({
          recording_id: savedRec.id,
          transcript_text: transcriptionText,
          created_at: timestamp,
          confidence: 0.98,
          speaker_count: 2,
        });
      }

      onRecordingSaved(savedRec, savedTranscript);
      if (onClose) onClose();
    } catch (e: any) {
      console.error('Failed to save recording to database:', e);
      setTranscribeError(`Storage Error: ${e.message}`);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div id="audio-recorder-container" className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
            <Radio className="w-4 h-4 text-rose-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Audio Recording Studio
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Record voice memos or upload recordings to listen and transcribe
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => {
                setActiveTab('record');
                if (!isRecording && !recordedAudio) setRecordedAudio(null);
              }}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 font-medium transition-all ${
                activeTab === 'record'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Mic className="w-3 h-3" />
              Record
            </button>
            <button
              onClick={() => {
                setActiveTab('upload');
                if (isRecording) handleStopRecord();
              }}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 font-medium transition-all ${
                activeTab === 'upload'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Upload Zone (when in upload tab and no file yet) */}
      {activeTab === 'upload' && !recordedAudio && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
              : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 hover:border-zinc-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleAudioFileUpload(e.target.files[0]);
              }
            }}
          />
          <div className="p-3 bg-white dark:bg-zinc-800 rounded-full shadow-2xs text-indigo-600 dark:text-indigo-400">
            <Upload className="w-5 h-5" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Drag and drop an audio file, or click to browse
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Supports MP3, M4A, WAV, AAC, OGG, FLAC & WebM
            </p>
          </div>
        </div>
      )}

      {/* Recording Stage / Visualizer (when in record tab or file selected) */}
      {(activeTab === 'record' || recordedAudio) && (
        <div className="p-5 bg-zinc-50 dark:bg-zinc-950/70 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70 flex flex-col items-center justify-center min-h-[130px] relative overflow-hidden">
          {isRecording ? (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-2xl font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatTime(recordingSeconds)}
                </span>
              </div>

              {/* Dynamic Waveform Bars */}
              <div className="flex items-center gap-1.5 h-10 w-full justify-center px-4">
                {Array.from({ length: 24 }).map((_, i) => {
                  const heightMult = Math.sin((i / 24) * Math.PI + audioLevel * 10) * 0.5 + 0.5;
                  const barHeight = Math.max(4, Math.round(audioLevel * 40 * heightMult + Math.random() * 6));
                  return (
                    <div
                      key={i}
                      className="w-1.5 bg-rose-500 rounded-full transition-all duration-75"
                      style={{ height: `${barHeight}px` }}
                    />
                  );
                })}
              </div>

              {/* Live Speech Recognition text preview */}
              {liveTranscript && (
                <div className="w-full px-3 py-2 bg-white/80 dark:bg-zinc-900/80 rounded-lg border border-zinc-200/70 dark:border-zinc-800/70 text-xs text-zinc-700 dark:text-zinc-300">
                  <span className="text-xs font-semibold text-indigo-500 block mb-0.5">
                    Live Speech (Offline):
                  </span>
                  <p className="line-clamp-2 italic">{liveTranscript}</p>
                </div>
              )}
            </div>
          ) : recordedAudio ? (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                <FileAudio className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-semibold truncate max-w-[260px]">
                  {recordedAudio.originalFileName || 'Audio Recording'}: {formatTime(recordedAudio.durationSeconds)} ({(recordedAudio.fileSizeBytes / 1024).toFixed(0)} KB)
                </span>
              </div>

              {/* Audio waveform visual representation */}
              <div className="flex items-center gap-1 h-7 w-full justify-center px-4 opacity-80">
                {Array.from({ length: 32 }).map((_, i) => {
                  const h = Math.abs(Math.sin(i * 0.4)) * 20 + 4;
                  const isPlayed = (currentTime / (recordedAudio.durationSeconds || 1)) > (i / 32);
                  return (
                    <div
                      key={i}
                      className={`w-1 rounded-full ${
                        isPlayed ? 'bg-indigo-600 dark:bg-indigo-400' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                      style={{ height: `${h}px` }}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Tap start to begin microphone recording
              </p>
              <p className="text-xs text-zinc-400">
                Audio is captured in high fidelity and stored locally
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hidden Audio Element for playback */}
      {recordedAudio && (
        <audio
          ref={audioElemRef}
          src={recordedAudio.url}
          onTimeUpdate={() => {
            if (audioElemRef.current) {
              setCurrentTime(audioElemRef.current.currentTime);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />
      )}

      {/* Recording & Playback Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        {!isRecording && !recordedAudio && activeTab === 'record' && (
          <button
            id="start-audio-recording-btn"
            onClick={handleStartRecord}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg font-medium text-xs transition-colors shadow-2xs"
          >
            <Mic className="w-3.5 h-3.5 text-rose-500" />
            Start Recording
          </button>
        )}

        {isRecording && (
          <button
            id="stop-audio-recording-btn"
            onClick={handleStopRecord}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium text-xs transition-colors shadow-2xs"
          >
            <Square className="w-3.5 h-3.5" />
            Stop Recording
          </button>
        )}

        {recordedAudio && (
          <div className="w-full space-y-3">
            {/* Playback Progress Slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-500">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={recordedAudio.durationSeconds || 1}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 accent-indigo-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
              />
              <span className="text-xs font-mono text-zinc-500">
                {formatTime(recordedAudio.durationSeconds)}
              </span>
            </div>

            {/* Playback Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  id="toggle-playback-btn"
                  onClick={handleTogglePlay}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-lg text-xs font-semibold"
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>

                <button
                  id="re-record-btn"
                  onClick={() => {
                    setRecordedAudio(null);
                    setTranscriptionText(null);
                    if (activeTab === 'record') handleStartRecord();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <RotateCcw className="w-3 h-3" />
                  {activeTab === 'record' ? 'Re-record' : 'Choose Another File'}
                </button>
              </div>

              {/* Playback Rate Multipliers */}
              <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleRateChange(rate)}
                    className={`px-1.5 py-0.5 text-xs font-mono rounded ${
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

            {/* Transcription Section */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <button
                  id="transcribe-audio-btn"
                  onClick={handleTranscribeAudio}
                  disabled={isTranscribing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                >
                  {isTranscribing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  )}
                  {isTranscribing ? 'Transcribing Audio...' : transcriptionText ? 'Re-transcribe Audio' : 'Transcribe to Text'}
                </button>

                <span className="text-xs text-zinc-400">
                  {AiSettingsManager.getSettings().primaryTranscriptionProvider === 'browser_speech' ? 'Offline Native Engine' : 'Speech Engine Active'}
                </span>
              </div>

              {transcribeError && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-lg text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Transcription Notice</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">{transcribeError}</p>
                    </div>
                  </div>
                </div>
              )}

              {transcriptionText && (
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-800 dark:text-zinc-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Transcript ({transcriptionSource || 'Offline Engine'})
                    </span>
                  </div>
                  <p className="leading-relaxed whitespace-pre-line">{transcriptionText}</p>
                </div>
              )}
            </div>

            {/* Save to Note button */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                id="save-audio-to-db-btn"
                onClick={handleSaveToDatabase}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg shadow-2xs"
              >
                <Check className="w-3.5 h-3.5" />
                Attach to Note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
