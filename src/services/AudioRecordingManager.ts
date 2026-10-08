import { RecordingRepository } from '../repositories/RecordingRepository';
import { MediaRepository } from '../lib/MediaRepository';
import { RecordingRecord } from '../types';
import { AppLogger } from '../lib/logger';
import { PluginListenerHandle } from '@capacitor/core';
import { OfflineTranscriptionEngine } from '../lib/offlineTranscription';
import { NativeBridge } from '../lib/nativeBridge';
import { generatePrefixedId } from '../lib/uuid';

export interface RecordedAudioResult {
  recording?: RecordingRecord;
  blob: Blob;
  base64: string;
  durationSeconds: number;
  durationMs: number;
  fileSizeBytes: number;
  mimeType: string;
  checksum: string;
  wavBlob?: Blob;
  liveTranscript?: string;
  wasConverted?: boolean;
}

export interface AudioRecordingOptions {
  onAudioLevel?: (level: number) => void;
  onLiveTranscript?: (text: string) => void;
  onProgress?: (percent: number, status: string) => void;
}

export class AudioRecordingManager {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private speechRecognizer: any = null;
  private nativeSpeechListener: PluginListenerHandle | null = null;

  private startTime = 0;
  private pausedDuration = 0;
  private pauseStart = 0;
  public isPaused = false;
  public isRecording = false;
  public liveTranscript = '';

  /**
   * Start recording audio with microphone, audio analysis, and optional live speech recognition
   */
  public async startRecording(
    optionsOrLevel?: AudioRecordingOptions | ((level: number) => void),
    maybeLiveTranscript?: (text: string) => void
  ): Promise<boolean> {
    this.cleanup();
    this.liveTranscript = '';

    let options: AudioRecordingOptions = {};
    if (typeof optionsOrLevel === 'function') {
      options = {
        onAudioLevel: optionsOrLevel,
        onLiveTranscript: maybeLiveTranscript,
      };
    } else if (optionsOrLevel) {
      options = optionsOrLevel;
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this platform.');
      }

      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      // Setup audio analyzer for waveform and audio level indicators
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
          const source = this.audioContext.createMediaStreamSource(this.audioStream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);

          if (options?.onAudioLevel) {
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            const checkLevel = () => {
              if (this.isRecording && this.analyser) {
                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const average = sum / dataArray.length / 255;
                options.onAudioLevel!(average);
                this.animationFrameId = requestAnimationFrame(checkLevel);
              }
            };
            this.animationFrameId = requestAnimationFrame(checkLevel);
          }
        } catch (e) {
          AppLogger.warn('AudioRecordingManager', 'AudioContext analyzer setup failed', e);
        }
      }

      // Initialize on-device speech recognition (Android native SpeechRecognizer first, fallback to Web Speech)
      if (NativeBridge.isAndroid()) {
        try {
          const { OfflineAi } = await import('../plugins/offline-ai');
          const avail = await OfflineAi.isSpeechRecognitionAvailable().catch(() => ({ available: false }));
          if (avail.available) {
            this.nativeSpeechListener = await OfflineAi.addListener('speechRecognitionResult', (ev) => {
              if (ev?.text) {
                this.liveTranscript = ev.text;
                if (options?.onLiveTranscript) options.onLiveTranscript(ev.text);
              }
            });
            await OfflineAi.startListening({ language: 'en-US' });
          }
        } catch (nativeRecErr) {
          AppLogger.warn('AudioRecordingManager', 'Native speech recognition startup notice', nativeRecErr);
        }
      } else if (OfflineTranscriptionEngine.isSpeechRecognitionSupported()) {
        try {
          this.speechRecognizer = OfflineTranscriptionEngine.createSpeechRecognizer({
            onInterim: (text) => {
              this.liveTranscript = text;
              if (options?.onLiveTranscript) options.onLiveTranscript(text);
            },
            onFinal: (text) => {
              this.liveTranscript = text;
              if (options?.onLiveTranscript) options.onLiveTranscript(text);
            },
          });
          if (this.speechRecognizer) {
            this.speechRecognizer.start();
          }
        } catch (recErr) {
          AppLogger.warn('AudioRecordingManager', 'Offline speech recognition notice', recErr);
        }
      }

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        const candidates = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/mp4',
          'audio/aac',
          'audio/ogg',
        ];
        for (const candidate of candidates) {
          if (MediaRecorder.isTypeSupported(candidate)) {
            mimeType = candidate;
            break;
          }
        }
      }

      try {
        this.mediaRecorder = new MediaRecorder(this.audioStream, {
          mimeType: mimeType || undefined,
          audioBitsPerSecond: 128000,
        });
      } catch {
        this.mediaRecorder = new MediaRecorder(this.audioStream);
      }

      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // 1-second timeslices for chunk recovery
      this.startTime = Date.now();
      this.isRecording = true;
      this.isPaused = false;
      this.pausedDuration = 0;

      return true;
    } catch (err) {
      AppLogger.error('AudioRecordingManager', 'Failed to start recording', err);
      this.cleanup();
      throw err;
    }
  }

  /**
   * Pause recording
   */
  public pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.pauseStart = Date.now();
      this.isPaused = true;
    }
  }

  /**
   * Resume recording
   */
  public resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      if (this.pauseStart > 0) {
        this.pausedDuration += Date.now() - this.pauseStart;
        this.pauseStart = 0;
      }
      this.isPaused = false;
    }
  }

  public getStatus(): { isRecording: boolean; isPaused: boolean; elapsedMs: number } {
    if (!this.isRecording) {
      return { isRecording: false, isPaused: false, elapsedMs: 0 };
    }
    const current = this.isPaused ? this.pauseStart : Date.now();
    const elapsedMs = Math.max(0, current - this.startTime - this.pausedDuration);
    return { isRecording: this.isRecording, isPaused: this.isPaused, elapsedMs };
  }

  /**
   * Stop recording and persist safely into SQLite and MediaRepository without blocking the UI
   */
  public async stopRecording(
    noteId?: number,
    onProgress?: (percent: number, status: string) => void
  ): Promise<RecordedAudioResult> {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.stop();
      } catch {}
      this.speechRecognizer = null;
    }

    if (this.nativeSpeechListener) {
      try {
        const { OfflineAi } = await import('../plugins/offline-ai');
        await OfflineAi.stopListening().catch(() => {});
        this.nativeSpeechListener.remove();
      } catch {}
      this.nativeSpeechListener = null;
    }

    const capturedLiveTranscript = this.liveTranscript.trim();

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording in progress.'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          onProgress?.(10, 'Processing recorded audio chunks...');
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const rawBlob = new Blob(this.audioChunks, { type: mimeType });
          const totalMs = Math.max(1000, Date.now() - this.startTime - this.pausedDuration);
          const durationSeconds = Math.max(1, Math.round(totalMs / 1000));

          // 1. Resample and encode to 16kHz Mono PCM WAV non-blockingly
          let finalBlob = rawBlob;
          let pcmWavBlob: Blob | undefined;
          let wasConverted = false;

          try {
            onProgress?.(30, 'Resampling to 16kHz speech standard...');
            pcmWavBlob = await this.convertTo16kHzMonoWavAsync(rawBlob, (pct) => {
              onProgress?.(30 + Math.round(pct * 0.4), 'Encoding 16-bit PCM audio...');
            });
            if (pcmWavBlob && pcmWavBlob.size > 0) {
              finalBlob = pcmWavBlob;
              wasConverted = true;
            }
          } catch (convErr) {
            AppLogger.warn('AudioRecordingManager', '16kHz PCM WAV conversion notice, fallback to raw audio', convErr);
          }

          onProgress?.(75, 'Computing audio integrity checksum...');
          const arrayBuffer = await finalBlob.arrayBuffer();
          const checksum = await this.calculateSha256(arrayBuffer);
          const base64 = await this.blobToBase64(finalBlob);

          let recording: RecordingRecord | undefined;

          // 2. Persist to MediaRepository and SQLite if noteId is provided
          if (noteId) {
            onProgress?.(90, 'Saving to secure on-device storage...');
            const mediaKey = `${generatePrefixedId('rec')}.${wasConverted ? 'wav' : 'webm'}`;
            const fileName = `recording_${Date.now()}.${wasConverted ? 'wav' : 'webm'}`;
            await MediaRepository.saveBinary(mediaKey, finalBlob, finalBlob.type, noteId);

            recording = RecordingRepository.save({
              note_id: noteId,
              file_path: fileName,
              media_key: mediaKey,
              duration_seconds: durationSeconds,
              duration_ms: totalMs,
              file_size: finalBlob.size,
              sample_rate: 16000,
              channels: 1,
              checksum,
              mime_type: finalBlob.type,
              status: 'ready',
            });
          }

          onProgress?.(100, 'Complete');
          this.cleanup();

          resolve({
            recording,
            blob: finalBlob,
            base64,
            durationSeconds,
            durationMs: totalMs,
            fileSizeBytes: finalBlob.size,
            mimeType: finalBlob.type,
            checksum,
            wavBlob: pcmWavBlob,
            liveTranscript: capturedLiveTranscript,
            wasConverted,
          });
        } catch (err) {
          AppLogger.error('AudioRecordingManager', 'Failed to finalize recording', err);
          this.cleanup();
          reject(err);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Convert arbitrary audio blob to 16kHz mono 16-bit PCM WAV asynchronously without freezing main thread
   */
  public async convertTo16kHzMonoWavAsync(
    audioBlob: Blob,
    onProgress?: (percent: number) => void
  ): Promise<Blob> {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return audioBlob;

    const audioCtx = new AudioCtx();
    try {
      const buffer = await audioBlob.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(buffer.slice(0));

      const targetSampleRate = 16000;
      const targetLength = Math.ceil(decoded.duration * targetSampleRate);
      const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);

      const source = offlineCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(offlineCtx.destination);
      source.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const channelData = renderedBuffer.getChannelData(0);

      // Encode 16-bit PCM WAV with chunked asynchronous yielding to avoid freezing the UI thread
      const wavBuffer = await this.encodeWavAsync(channelData, targetSampleRate, onProgress);
      await audioCtx.close();
      return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (e) {
      try {
        await audioCtx.close();
      } catch {}
      return audioBlob;
    }
  }

  /**
   * Non-blocking chunked WAV encoder yielding to UI event loop every 65536 samples
   */
  private async encodeWavAsync(
    samples: Float32Array,
    sampleRate: number,
    onProgress?: (percent: number) => void
  ): Promise<ArrayBuffer> {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM = 1
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    const CHUNK_SIZE = 65536;
    let offset = 44;

    for (let chunkStart = 0; chunkStart < samples.length; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, samples.length);
      for (let i = chunkStart; i < chunkEnd; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }

      if (onProgress) {
        onProgress(Math.round((chunkEnd / samples.length) * 100));
      }

      // Yield to main event loop so UI does not stutter
      if (chunkEnd < samples.length) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    return buffer;
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  public async calculateSha256(buffer: ArrayBuffer): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let hash = 0;
    const view = new Uint8Array(buffer);
    for (let i = 0; i < Math.min(view.length, 100000); i++) {
      hash = (hash << 5) - hash + view[i];
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  public async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const base64 = res.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }


  /**
   * Import a pre-recorded audio file and persist as a Recording for transcription.
   */
  public async importAudioFile(
    noteId: number,
    file: File | Blob,
    originalName?: string,
    onProgress?: (percent: number, status: string) => void
  ): Promise<RecordedAudioResult> {
    onProgress?.(5, 'Reading audio file…');
    const mimeType = (file as File).type || 'audio/mpeg';
    let finalBlob: Blob = file;
    let wasConverted = false;
    let pcmWavBlob: Blob | undefined;

    try {
      onProgress?.(20, 'Converting to 16kHz mono WAV…');
      pcmWavBlob = await this.convertTo16kHzMonoWavAsync(file, (pct) => {
        onProgress?.(20 + Math.round(pct * 0.4), 'Encoding speech audio…');
      });
      if (pcmWavBlob && pcmWavBlob.size > 0) {
        finalBlob = pcmWavBlob;
        wasConverted = true;
      }
    } catch (e) {
      AppLogger.warn('AudioRecordingManager', 'Import WAV conversion fallback', e);
    }

    onProgress?.(70, 'Computing checksum…');
    const arrayBuffer = await finalBlob.arrayBuffer();
    const checksum = await this.calculateSha256(arrayBuffer);
    const base64 = await this.blobToBase64(finalBlob);

    let durationSeconds = 1;
    let durationMs = 1000;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        durationSeconds = Math.max(1, Math.round(decoded.duration));
        durationMs = Math.round(decoded.duration * 1000);
        await ctx.close();
      }
    } catch {
      /* defaults */
    }

    onProgress?.(85, 'Saving to on-device storage…');
    const nameHint = originalName || (file as File).name || 'audio';
    const ext = wasConverted ? 'wav' : (nameHint.split('.').pop() || 'bin');
    const mediaKey = `${generatePrefixedId('imp')}.${ext}`;
    const fileName = nameHint.includes('.') ? nameHint : `import_${Date.now()}.${ext}`;
    await MediaRepository.saveBinary(mediaKey, finalBlob, finalBlob.type || mimeType, noteId);

    const recording = RecordingRepository.save({
      note_id: noteId,
      file_path: fileName,
      media_key: mediaKey,
      duration_seconds: durationSeconds,
      duration_ms: durationMs,
      file_size: finalBlob.size,
      sample_rate: wasConverted ? 16000 : undefined,
      channels: wasConverted ? 1 : undefined,
      checksum,
      mime_type: finalBlob.type || mimeType,
      status: 'ready',
    });

    onProgress?.(100, 'Import complete');
    return {
      recording,
      blob: finalBlob,
      base64,
      durationSeconds,
      durationMs,
      fileSizeBytes: finalBlob.size,
      mimeType: finalBlob.type || mimeType,
      checksum,
      wavBlob: pcmWavBlob,
      wasConverted,
    };
  }

  private cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.stop();
      } catch {}
      this.speechRecognizer = null;
    }
    if (this.nativeSpeechListener) {
      try {
        this.nativeSpeechListener.remove();
        import('../plugins/offline-ai').then(({ OfflineAi }) => {
          OfflineAi.stopListening().catch(() => {});
        }).catch(() => {});
      } catch {}
      this.nativeSpeechListener = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isPaused = false;
  }
}
