import { RecordingRepository } from '../repositories/RecordingRepository';
import { MediaRepository } from '../lib/MediaRepository';
import { RecordingRecord } from '../types';
import { AppLogger } from '../lib/logger';

export interface RecordedAudioResult {
  recording: RecordingRecord;
  blob: Blob;
  durationMs: number;
  checksum: string;
  wavBlob?: Blob;
}

export class AudioRecordingManager {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioStream: MediaStream | null = null;
  private startTime = 0;
  private pausedDuration = 0;
  private pauseStart = 0;
  private isPaused = false;
  private isRecording = false;

  /**
   * Start recording audio with microphone
   */
  public async startRecording(options?: {
    onAudioLevel?: (level: number) => void;
  }): Promise<boolean> {
    this.cleanup();
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported on this platform.');
      }

      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1, // Mono preferred
          sampleRate: 16000, // 16kHz preferred for speech recognition
        },
      });

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
        const candidates = [
          'audio/webm;codecs=opus',
          'audio/webm',
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

      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: mimeType || undefined,
        audioBitsPerSecond: 128000,
      });

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
   * Stop recording and persist safely into SQLite and MediaRepository
   */
  public async stopRecording(noteId: number): Promise<RecordedAudioResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording in progress.'));
        return;
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const rawBlob = new Blob(this.audioChunks, { type: mimeType });
          const totalMs = Math.max(1000, Date.now() - this.startTime - this.pausedDuration);
          const durationSeconds = Math.max(1, Math.round(totalMs / 1000));

          // 1. Convert to 16kHz 16-bit Mono PCM WAV if AudioContext is available
          let finalBlob = rawBlob;
          let pcmWavBlob: Blob | undefined;
          try {
            pcmWavBlob = await this.convertTo16kHzMonoWav(rawBlob);
            if (pcmWavBlob && pcmWavBlob.size > 0) {
              finalBlob = pcmWavBlob;
            }
          } catch (convErr) {
            AppLogger.warn('AudioRecordingManager', '16kHz PCM WAV conversion notice, using raw audio', convErr);
          }

          // 2. Compute SHA-256 Checksum
          const arrayBuffer = await finalBlob.arrayBuffer();
          const checksum = await this.calculateSha256(arrayBuffer);

          // 3. Persist media blob in app-private media storage
          const mediaKey = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const fileName = `recording_${Date.now()}.${pcmWavBlob ? 'wav' : 'webm'}`;
          await MediaRepository.saveBinary(mediaKey, finalBlob, finalBlob.type, noteId);

          // 4. Save into SQLite recordings table
          const recording = RecordingRepository.save({
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

          this.cleanup();
          resolve({
            recording,
            blob: finalBlob,
            durationMs: totalMs,
            checksum,
            wavBlob: pcmWavBlob,
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
   * Convert arbitrary audio blob to 16kHz mono 16-bit PCM WAV on-device
   */
  public async convertTo16kHzMonoWav(audioBlob: Blob): Promise<Blob> {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return audioBlob;

    const audioCtx = new AudioCtx();
    try {
      const buffer = await audioBlob.arrayBuffer();
      const decoded = await audioCtx.decodeAudioData(buffer.slice(0));

      // OfflineAudioContext for resampling to exactly 16000 Hz, 1 channel
      const targetSampleRate = 16000;
      const targetLength = Math.ceil(decoded.duration * targetSampleRate);
      const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);

      const source = offlineCtx.createBufferSource();
      source.buffer = decoded;
      source.connect(offlineCtx.destination);
      source.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const channelData = renderedBuffer.getChannelData(0);

      // Encode 16-bit PCM WAV
      const wavBuffer = this.encodeWav(channelData, targetSampleRate);
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
   * Encode Float32 PCM channel to 16-bit RIFF WAV
   */
  private encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat PCM = 1
    view.setUint16(22, 1, true); // Mono = 1
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    this.writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    // PCM samples clamped to [-1, 1] -> [-32768, 32767]
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
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
    // Fallback simple checksum
    let hash = 0;
    const view = new Uint8Array(buffer);
    for (let i = 0; i < Math.min(view.length, 100000); i++) {
      hash = (hash << 5) - hash + view[i];
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  private cleanup(): void {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.isPaused = false;
  }
}
