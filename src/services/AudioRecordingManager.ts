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
  durationSeconds: number;
  durationMs: number;
  fileSizeBytes: number;
  mimeType: string;
  checksum: string;
  wavBlob?: Blob;
  liveTranscript?: string;
  wasConverted?: boolean;
  /** True when resampling capped the audio (see MAX_RESAMPLE_SECONDS). */
  wasTruncated?: boolean;
  /** True when the file was too large to downsample and the source format was kept. */
  wasConversionSkipped?: boolean;
  /** Why conversion was skipped (size, or too long to decode safely on-device). */
  conversionSkipReason?: ConversionSkipReason;
}

/**
 * Maximum audio length retained when resampling to 16 kHz mono.
 * Longer input is deliberately truncated (bounded memory on mobile) — callers
 * are notified via the truncation callback so the cut is never silent.
 */
export const MAX_RESAMPLE_SECONDS = 30 * 60;

/** Largest file the import flow will accept at all. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/**
 * Largest file we will decode+downsample. Bigger inputs are kept in their
 * source format (see wasConversionSkipped) to bound memory on mobile.
 */
export const MAX_CONVERSION_BYTES = 40 * 1024 * 1024;

/**
 * Longest input (in seconds) we will hand to `decodeAudioData` on-device.
 *
 * A decoded buffer is float32 PCM: seconds x sample-rate x channels x 4 bytes
 * — at 44.1 kHz stereo that is ~353 KB per second, INDEPENDENT of the file's
 * compressed size. A long, low-bitrate voice recording therefore crashes the
 * WebView long before the 30-minute resample cap is reached (a 40 MB file at
 * 32 kbps is ~2.8 hours and would need ~3.5 GB to decode). Conversion is only
 * attempted for inputs that fit this window; longer audio is kept as-is and
 * the resumable session API (server-side ffmpeg) handles transcription.
 */
export const MAX_CONVERT_INPUT_SECONDS = 10 * 60;

/**
 * When the duration cannot be probed (metadata unavailable), fall back to a
 * conservative size bound before attempting a decode.
 */
export const MAX_UNPROBED_CONVERT_BYTES = 8 * 1024 * 1024;

export type ConversionSkipReason = 'too_large' | 'too_long' | 'unprobeable';

/**
 * Pure decision for whether an in-memory decode+downsample is safe to attempt.
 * Unit-testable headlessly: the OOM it guards against is a hard WebView crash,
 * not a catchable exception, so the guard must run BEFORE any decode.
 */
export function shouldAttemptConversion(
  sizeBytes: number,
  probedDurationSeconds: number | null
): { attempt: boolean; reason?: ConversionSkipReason } {
  if (sizeBytes > MAX_CONVERSION_BYTES) {
    return { attempt: false, reason: 'too_large' };
  }
  if (probedDurationSeconds != null && probedDurationSeconds > MAX_CONVERT_INPUT_SECONDS) {
    return { attempt: false, reason: 'too_long' };
  }
  if (probedDurationSeconds == null && sizeBytes > MAX_UNPROBED_CONVERT_BYTES) {
    return { attempt: false, reason: 'unprobeable' };
  }
  return { attempt: true };
}

/**
 * Decide how many 16 kHz samples to render for a decoded buffer.
 * Pure helper so the truncation boundary is unit-testable without Web Audio.
 */
export function computeResampleLength(
  durationSeconds: number,
  sampleRate: number
): { targetLength: number; truncated: boolean } {
  const desired = Math.ceil(durationSeconds * sampleRate);
  const maxSamples = sampleRate * MAX_RESAMPLE_SECONDS;
  return { targetLength: Math.min(desired, maxSamples), truncated: desired > maxSamples };
}

/**
 * Pick a file extension that matches the stored container. Converted audio is
 * always WAV; unresolved audio keeps its recorded/source container instead of
 * being mislabeled as `.webm`.
 */
export function extensionForAudioMime(mimeType: string | undefined, converted: boolean): string {
  if (converted) return 'wav';
  const m = (mimeType || '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg') || m.includes('oga') || m.includes('opus')) return 'ogg';
  return 'webm';
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
  private speechRecognizer: { start(): void; stop(): void } | null = null;
  private nativeSpeechListener: PluginListenerHandle | null = null;

  private startTime = 0;
  private pausedDuration = 0;
  private pauseStart = 0;
  public isPaused = false;
  public isRecording = false;
  public liveTranscript = '';

  public async startRecording(
    optionsOrLevel?: AudioRecordingOptions | ((level: number) => void),
    maybeLiveTranscript?: (text: string) => void
  ): Promise<boolean> {
    this.cleanup();
    this.liveTranscript = '';

    let options: AudioRecordingOptions = {};
    if (typeof optionsOrLevel === 'function') {
      options = { onAudioLevel: optionsOrLevel, onLiveTranscript: maybeLiveTranscript };
    } else if (optionsOrLevel) {
      options = optionsOrLevel;
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this platform.');
      }

      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                options.onAudioLevel!(sum / dataArray.length / 255);
                this.animationFrameId = requestAnimationFrame(checkLevel);
              }
            };
            this.animationFrameId = requestAnimationFrame(checkLevel);
          }
        } catch (e) {
          AppLogger.warn('AudioRecordingManager', 'AudioContext analyzer setup failed', e);
        }
      }

      if (NativeBridge.isAndroid()) {
        try {
          const { OfflineAi } = await import('../plugins/offline-ai');
          const avail = await OfflineAi.isSpeechRecognitionAvailable().catch(() => ({
            available: false,
          }));
          if (avail.available) {
            this.nativeSpeechListener = await OfflineAi.addListener(
              'speechRecognitionResult',
              (ev) => {
                if (ev?.text) {
                  this.liveTranscript = ev.text;
                  if (options?.onLiveTranscript) options.onLiveTranscript(ev.text);
                }
              }
            );
            await OfflineAi.startListening({ language: 'en-US' });
          }
        } catch (nativeRecErr) {
          AppLogger.warn(
            'AudioRecordingManager',
            'Native speech recognition startup notice',
            nativeRecErr
          );
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
          if (this.speechRecognizer) this.speechRecognizer.start();
        } catch (recErr) {
          AppLogger.warn('AudioRecordingManager', 'Offline speech recognition notice', recErr);
        }
      }

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        for (const candidate of [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4;codecs=mp4a.40.2',
          'audio/mp4',
          'audio/aac',
          'audio/ogg',
        ]) {
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
        if (event.data && event.data.size > 0) this.audioChunks.push(event.data);
      };

      this.mediaRecorder.start(1000);
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

  public pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      this.pauseStart = Date.now();
      this.isPaused = true;
    }
  }

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
    if (!this.isRecording) return { isRecording: false, isPaused: false, elapsedMs: 0 };
    const current = this.isPaused ? this.pauseStart : Date.now();
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      elapsedMs: Math.max(0, current - this.startTime - this.pausedDuration),
    };
  }

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
      } catch {
        /* ignore */
      }
      this.speechRecognizer = null;
    }
    if (this.nativeSpeechListener) {
      try {
        const { OfflineAi } = await import('../plugins/offline-ai');
        await OfflineAi.stopListening().catch(() => {});
        this.nativeSpeechListener.remove();
      } catch {
        /* ignore */
      }
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
          let finalBlob = rawBlob;
          let pcmWavBlob: Blob | undefined;
          let wasConverted = false;
          let wasTruncated = false;
          let wasConversionSkipped = false;
          let conversionSkipReason: ConversionSkipReason | undefined;
          try {
            onProgress?.(30, 'Resampling to 16kHz speech standard...');
            pcmWavBlob = await this.convertTo16kHzMonoWavAsync(
              rawBlob,
              (pct) => {
                onProgress?.(30 + Math.round(pct * 0.4), 'Encoding 16-bit PCM audio...');
              },
              {
                onConverted: () => {
                  wasConverted = true;
                },
                onSkipped: (info) => {
                  wasConversionSkipped = true;
                  conversionSkipReason = info.reason;
                },
                onTruncated: (info) => {
                  wasTruncated = true;
                  AppLogger.warn(
                    'AudioRecordingManager',
                    `Recording truncated from ${Math.round(info.originalSeconds)}s to ${info.keptSeconds}s for on-device transcription.`
                  );
                },
              }
            );
            if (pcmWavBlob && pcmWavBlob.size > 0) finalBlob = pcmWavBlob;
          } catch (convErr) {
            AppLogger.warn(
              'AudioRecordingManager',
              '16kHz PCM WAV conversion notice, fallback to raw audio',
              convErr
            );
          }
          onProgress?.(75, 'Computing audio integrity checksum...');
          const arrayBuffer = await this.safeReadAsArrayBuffer(finalBlob);
          const checksum = await this.calculateSha256(arrayBuffer);
          let recording: RecordingRecord | undefined;
          if (noteId) {
            onProgress?.(90, 'Saving to secure on-device storage...');
            const ext = extensionForAudioMime(finalBlob.type || mimeType, wasConverted);
            const mediaKey = `${generatePrefixedId('rec')}.${ext}`;
            const fileName = `recording_${Date.now()}.${ext}`;
            await MediaRepository.saveBinary(mediaKey, finalBlob, finalBlob.type, noteId);
            recording = RecordingRepository.save({
              note_id: noteId,
              file_path: fileName,
              media_key: mediaKey,
              duration_seconds: durationSeconds,
              duration_ms: totalMs,
              file_size: finalBlob.size,
              sample_rate: wasConverted ? 16000 : undefined,
              channels: wasConverted ? 1 : undefined,
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
            durationSeconds,
            durationMs: totalMs,
            fileSizeBytes: finalBlob.size,
            mimeType: finalBlob.type,
            checksum,
            wavBlob: pcmWavBlob,
            liveTranscript: capturedLiveTranscript,
            wasConverted,
            wasTruncated,
            wasConversionSkipped,
            conversionSkipReason,
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
   * Import a pre-recorded audio file (WAV/MP3/M4A/etc) and persist as a Recording.
   * Always materializes the picker File via FileReader first to avoid Android
   * WebView process-kills on content-URI objects.
   */
  public async importAudioFile(
    noteId: number,
    file: File | Blob,
    originalName?: string,
    onProgress?: (percent: number, status: string) => void
  ): Promise<RecordedAudioResult> {
    onProgress?.(5, 'Reading audio file…');

    if (!file || (file as Blob).size === 0) {
      throw new Error('Selected file is empty.');
    }
    if ((file as Blob).size > MAX_IMPORT_BYTES) {
      throw new Error(`Audio file is too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB).`);
    }

    // Read once into memory — this is our single source of truth
    let rawBuffer: ArrayBuffer;
    try {
      rawBuffer = await this.safeReadAsArrayBuffer(file as Blob);
    } catch (e) {
      throw new Error('Could not read the selected audio file. Try a different file or format.', {
        cause: e,
      });
    }

    const mimeType = (file as File).type || 'audio/wav';
    let finalBlob: Blob;
    let wasConverted = false;
    let wasTruncated = false;
    let wasConversionSkipped = false;
    let conversionSkipReason: ConversionSkipReason | undefined;
    let pcmWavBlob: Blob | undefined;

    try {
      onProgress?.(20, 'Converting to 16kHz mono WAV…');
      pcmWavBlob = await this.convertTo16kHzMonoWavAsync(
        new Blob([rawBuffer], { type: mimeType }),
        (pct) => {
          onProgress?.(20 + Math.round(pct * 0.4), 'Encoding speech audio…');
        },
        {
          onConverted: () => {
            wasConverted = true;
          },
          onSkipped: (info) => {
            wasConversionSkipped = true;
            conversionSkipReason = info.reason;
          },
          onTruncated: (info) => {
            wasTruncated = true;
            AppLogger.warn(
              'AudioRecordingManager',
              `Imported audio truncated from ${Math.round(info.originalSeconds)}s to ${info.keptSeconds}s for on-device transcription.`
            );
          },
        }
      );
      if (pcmWavBlob && pcmWavBlob.size > 0) {
        finalBlob = pcmWavBlob;
      }
    } catch (e) {
      AppLogger.warn('AudioRecordingManager', 'Import WAV conversion fallback', e);
    }

    // Free rawBuffer now that conversion is done — pcmWavBlob holds the result if converted
    rawBuffer = undefined;

    onProgress?.(70, 'Computing checksum…');
    // Reuse existing buffer instead of re-reading from disk/file
    const arrayBuffer = pcmWavBlob
      ? await this.safeReadAsArrayBuffer(pcmWavBlob)
      : await this.safeReadAsArrayBuffer(rawBuffer); // fall back to safeBlob if conversion skipped
    const checksum = await this.calculateSha256(arrayBuffer);

    let durationSeconds = 1;
    let durationMs = 1000;
    try {
      // Rough estimate from PCM size if converted; otherwise probe metadata
      if (wasConverted) {
        durationSeconds = Math.max(1, Math.round(finalBlob.size / 32000));
        durationMs = durationSeconds * 1000;
      } else if (typeof document !== 'undefined') {
        // Probe duration from container metadata — never decodeAudioData here:
        // decoding a long recording materialises float32 PCM (~353 KB per
        // second) and crashed the WebView on large imports.
        const probed = await this.probeAudioDuration(finalBlob);
        if (probed != null) {
          durationSeconds = Math.max(1, Math.round(probed));
          durationMs = durationSeconds * 1000;
        }
      }
    } catch {
      /* keep defaults */
    }

    onProgress?.(85, 'Saving to on-device storage…');
    const nameHint = originalName || (file as File).name || 'audio';
    const ext = wasConverted
      ? 'wav'
      : nameHint.includes('.')
        ? (nameHint.split('.').pop() as string)
        : extensionForAudioMime(finalBlob.type || mimeType, false);
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
      durationSeconds,
      durationMs,
      fileSizeBytes: finalBlob.size,
      mimeType: finalBlob.type || mimeType,
      checksum,
      wavBlob: pcmWavBlob,
      wasConverted,
      wasTruncated,
      wasConversionSkipped,
      conversionSkipReason,
    };
  }

  /**
   * Read an audio file's duration from its container metadata WITHOUT decoding
   * PCM. Decoding a long recording materialises float32 samples (~353 KB per
   * second at 44.1 kHz stereo) and is what crashed the WebView on import; the
   * browser reads duration from the demuxer instead, using almost no memory.
   *
   * Resolves `null` when duration cannot be determined (unsupported
   * environment, unsupported container, or timeout).
   */
  public async probeAudioDuration(blob: Blob): Promise<number | null> {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !blob.size) {
      return null;
    }
    return new Promise((resolve) => {
      let settled = false;
      let objectUrl: string | null = null;
      const done = (value: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(value);
      };
      const timer = setTimeout(() => done(null), 4000);
      try {
        objectUrl = URL.createObjectURL(blob);
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          const d = audio.duration;
          done(Number.isFinite(d) && d > 0 ? d : null);
        };
        audio.onerror = () => done(null);
        audio.src = objectUrl;
      } catch {
        done(null);
      }
    });
  }

  public async safeReadAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsArrayBuffer(blob);
    });
  }

  private inspectWavHeader(
    buf: ArrayBuffer
  ): { dataOffset: number; sampleRate: number; channels: number; bitsPerSample: number } | null {
    if (buf.byteLength < 44) return null;
    const view = new DataView(buf);
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11)
    );
    if (riff !== 'RIFF' || wave !== 'WAVE') return null;
    let offset = 12;
    let sampleRate = 0,
      channels = 0,
      bitsPerSample = 0,
      audioFormat = 0,
      dataOffset = -1;
    while (offset + 8 <= buf.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === 'fmt ' && chunkSize >= 16) {
        audioFormat = view.getUint16(offset + 8, true);
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      } else if (chunkId === 'data') {
        dataOffset = offset + 8;
        break;
      }
      offset += 8 + chunkSize;
      if (chunkSize % 2 === 1) offset += 1;
    }
    if (dataOffset < 0 || audioFormat !== 1) return null;
    return { dataOffset, sampleRate, channels, bitsPerSample };
  }

  public async convertTo16kHzMonoWavAsync(
    audioBlob: Blob,
    onProgress?: (percent: number) => void,
    options?: {
      onTruncated?: (info: { originalSeconds: number; keptSeconds: number }) => void;
      /** Fired only when the audio was genuinely resampled to 16 kHz mono 16-bit WAV. */
      onConverted?: () => void;
      /** Fired when the input is kept as-is instead of resampled. */
      onSkipped?: (info: { reason: ConversionSkipReason; sizeBytes: number }) => void;
    }
  ): Promise<Blob> {
    if (!audioBlob || audioBlob.size === 0) return audioBlob;
    const decision = shouldAttemptConversion(
      audioBlob.size,
      await this.probeAudioDuration(audioBlob)
    );
    if (!decision.attempt) {
      AppLogger.warn(
        'AudioRecordingManager',
        `AudioRecordingManager: skipping conversion (${decision.reason}) for ${Math.round(audioBlob.size / (1024 * 1024))} MB blob`
      );
      options?.onSkipped?.({
        reason: decision.reason as ConversionSkipReason,
        sizeBytes: audioBlob.size,
      });
      return audioBlob;
    }
    let rawBuffer: ArrayBuffer;
    try {
      rawBuffer = await this.safeReadAsArrayBuffer(audioBlob);
    } catch (readErr) {
      AppLogger.warn(
        'AudioRecordingManager',
        'safeReadAsArrayBuffer failed, returning original blob',
        readErr
      );
      return audioBlob;
    }
    const wavInfo = this.inspectWavHeader(rawBuffer);
    if (
      wavInfo &&
      wavInfo.channels === 1 &&
      wavInfo.bitsPerSample === 16 &&
      wavInfo.sampleRate === 16000
    ) {
      onProgress?.(100);
      options?.onConverted?.();
      return new Blob([rawBuffer], { type: 'audio/wav' });
    }
    const AudioCtx =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AudioCtx) return new Blob([rawBuffer], { type: audioBlob.type || 'audio/wav' });
    let audioCtx: AudioContext | null = null;
    try {
      // Single copy: rawBuffer is already materialised; decodeAudioData does not
      // detach it in Chromium (the WebView engine), so no extra slice is needed.
      audioCtx = new AudioCtx();
      const decoded = await audioCtx.decodeAudioData(rawBuffer.slice(0));
      const targetSampleRate = 16000;
      const { targetLength, truncated } = computeResampleLength(decoded.duration, targetSampleRate);
      if (targetLength <= 0) return new Blob([rawBuffer], { type: audioBlob.type || 'audio/wav' });
      if (truncated) {
        options?.onTruncated?.({
          originalSeconds: decoded.duration,
          keptSeconds: MAX_RESAMPLE_SECONDS,
        });
      }
      const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
      const source = offlineCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(offlineCtx.destination);
      source.start(0);
      const renderedBuffer = await offlineCtx.startRendering();
      const channelData = renderedBuffer.getChannelData(0);
      const wavBuffer = await this.encodeWavAsync(channelData, targetSampleRate, onProgress);
      options?.onConverted?.();
      return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (e) {
      AppLogger.warn(
        'AudioRecordingManager',
        'AudioRecordingManager.convertTo16kHzMonoWavAsync failed, returning safe copy',
        e
      );
      return new Blob([rawBuffer], { type: audioBlob.type || 'audio/wav' });
    } finally {
      try {
        if (audioCtx) await audioCtx.close();
      } catch {
        /* ignore */
      }
    }
  }

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
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
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
      if (onProgress) onProgress(Math.round((chunkEnd / samples.length) * 100));
      if (chunkEnd < samples.length) await new Promise((r) => setTimeout(r, 0));
    }
    return buffer;
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  }

  public async calculateSha256(buffer: ArrayBuffer): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    let hash = 0;
    const view = new Uint8Array(buffer);
    for (let i = 0; i < Math.min(view.length, 100000); i++) {
      hash = (hash << 5) - hash + view[i];
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  private cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((t) => t.stop());
      this.audioStream = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {
        /* ignore */
      }
      this.audioContext = null;
    }
    this.analyser = null;
    this.isRecording = false;
    this.isPaused = false;
  }
}
