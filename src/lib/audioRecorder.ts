import { OfflineTranscriptionEngine } from './offlineTranscription';

export class AudioRecorderManager {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private speechRecognizer: any = null;
  public liveTranscript = '';

  public isRecording = false;
  public startTime = 0;

  public async startRecording(
    onAudioLevel?: (level: number) => void,
    onLiveTranscript?: (text: string) => void
  ): Promise<boolean> {
    this.cleanup();
    this.liveTranscript = '';

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 44100,
          },
        });

        // Setup audio analyzer for live waveform
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          const source = this.audioContext.createMediaStreamSource(this.microphoneStream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);

          if (onAudioLevel) {
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            const checkLevel = () => {
              if (this.isRecording && this.analyser) {
                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const average = sum / dataArray.length / 255;
                onAudioLevel(average);
                this.animationFrameId = requestAnimationFrame(checkLevel);
              }
            };
            this.animationFrameId = requestAnimationFrame(checkLevel);
          }
        }

        // Initialize Native Speech Recognition if available (100% offline on-device)
        if (OfflineTranscriptionEngine.isSpeechRecognitionSupported()) {
          this.speechRecognizer = OfflineTranscriptionEngine.createSpeechRecognizer({
            onInterim: (text) => {
              this.liveTranscript = text;
              if (onLiveTranscript) onLiveTranscript(text);
            },
            onFinal: (text) => {
              this.liveTranscript = text;
              if (onLiveTranscript) onLiveTranscript(text);
            },
          });
          if (this.speechRecognizer) {
            try {
              this.speechRecognizer.start();
            } catch (recErr) {
              console.warn('Native speech recognition start notice:', recErr);
            }
          }
        }

        // Pick supported mime type with robust Android WebView fallback
        let selectedMimeType: string | undefined = undefined;
        if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
          const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4;codecs=mp4a.40.2',
            'audio/mp4',
            'audio/aac',
            'audio/ogg;codecs=opus',
          ];
          for (const cand of candidates) {
            if (MediaRecorder.isTypeSupported(cand)) {
              selectedMimeType = cand;
              break;
            }
          }
        }

        this.audioChunks = [];
        if (typeof MediaRecorder !== 'undefined') {
          const recorderOptions: MediaRecorderOptions = {};
          if (selectedMimeType) {
            recorderOptions.mimeType = selectedMimeType;
          }
          recorderOptions.audioBitsPerSecond = 64000;

          try {
            this.mediaRecorder = new MediaRecorder(this.microphoneStream, recorderOptions);
          } catch {
            // Fallback without mimeType option if WebView threw error
            this.mediaRecorder = new MediaRecorder(this.microphoneStream);
          }

          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              this.audioChunks.push(event.data);
            }
          };

          this.mediaRecorder.start(250);
        }
      }

      this.isRecording = true;
      this.startTime = Date.now();
      return true;
    } catch (err) {
      console.error('Microphone stream access unavailable.', err);
      return false;
    }
  }

  public async stopRecording(): Promise<{
    blob: Blob;
    base64: string;
    durationSeconds: number;
    fileSizeBytes: number;
    mimeType: string;
    liveTranscript?: string;
  }> {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    const capturedTranscript = this.liveTranscript.trim();
    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.stop();
      } catch {}
      this.speechRecognizer = null;
    }

    const durationSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    this.isRecording = false;

    const estimatedAacSize = durationSeconds * 8000;

    return new Promise((resolve) => {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = async () => {
          const finalMime = this.mediaRecorder?.mimeType || 'audio/mp4';
          const blob = new Blob(this.audioChunks, { type: finalMime });
          const base64 = await this.blobToBase64(blob);

          this.cleanup();

          resolve({
            blob,
            base64,
            durationSeconds,
            fileSizeBytes: blob.size > 0 ? blob.size : estimatedAacSize,
            mimeType: finalMime,
            liveTranscript: capturedTranscript,
          });
        };
        try {
          this.mediaRecorder.stop();
        } catch {
          this.cleanup();
          resolve({
            blob: new Blob([]),
            base64: '',
            durationSeconds: 0,
            fileSizeBytes: 0,
            mimeType: 'audio/mp4',
            liveTranscript: capturedTranscript,
          });
        }
      } else {
        this.cleanup();
        resolve({
          blob: new Blob([]),
          base64: '',
          durationSeconds: 0,
          fileSizeBytes: 0,
          mimeType: 'audio/mp4',
          liveTranscript: capturedTranscript,
        });
      }
    });
  }

  public cleanup(): void {
    if (this.speechRecognizer) {
      try {
        this.speechRecognizer.stop();
      } catch {}
      this.speechRecognizer = null;
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      this.microphoneStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }
    this.isRecording = false;
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve((reader.result as string) || '');
      };
      reader.onerror = () => {
        resolve('');
      };
      reader.readAsDataURL(blob);
    });
  }
}
