import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Repositories are mocked so importAudioFile can persist without SQLite/IndexedDB.
const mocks = vi.hoisted(() => ({
  saveBinary: vi.fn(async (..._args: unknown[]) => undefined),
  getBinary: vi.fn(async () => null as Blob | null),
  saveRecording: vi.fn((record: Record<string, unknown>) => ({ ...record, id: 42 })),
}));

vi.mock('../lib/MediaRepository', () => ({
  MediaRepository: {
    saveBinary: mocks.saveBinary,
    getBinary: mocks.getBinary,
  },
}));

vi.mock('../repositories/RecordingRepository', () => ({
  RecordingRepository: {
    save: mocks.saveRecording,
  },
}));

import {
  AudioRecordingManager,
  MAX_RESAMPLE_SECONDS,
  computeResampleLength,
  extensionForAudioMime,
} from './AudioRecordingManager';

const { saveBinary, saveRecording } = mocks;

/**
 * Minimal FileReader for the Node test environment — delegates to Blob.arrayBuffer().
 * Mirrors the handlers the production code actually registers.
 */
class FakeFileReader {
  public result: string | ArrayBuffer | null = null;
  public error: unknown = null;
  public onload: (() => void) | null = null;
  public onerror: ((err: unknown) => void) | null = null;
  public onloadend: (() => void) | null = null;

  public readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onload?.();
        this.onloadend?.();
      })
      .catch((err) => {
        this.error = err;
        this.onerror?.(err);
      });
  }

  public readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        const base64 = Buffer.from(buffer).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
        this.onloadend?.();
      })
      .catch((err) => {
        this.error = err;
        this.onerror?.(err);
      });
  }
}

interface FakeAudioContext {
  closed: boolean;
  decodeAudioData: (buffer: ArrayBuffer) => Promise<unknown>;
  close: () => Promise<void>;
}

function installAudioContext(behavior: 'reject' | 'unused'): FakeAudioContext[] {
  const instances: FakeAudioContext[] = [];
  class FakeAudioCtx implements FakeAudioContext {
    public closed = false;
    constructor() {
      instances.push(this);
    }
    public decodeAudioData(): Promise<unknown> {
      return Promise.reject(new Error('decodeAudioData not supported in test'));
    }
    public close(): Promise<void> {
      this.closed = true;
      return Promise.resolve();
    }
  }
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeAudioCtx };
  void behavior;
  return instances;
}

function makeWav(opts: {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  seconds: number;
}): Blob {
  const { sampleRate, channels, bitsPerSample, seconds } = opts;
  const bytesPerSample = bitsPerSample / 8;
  const dataBytes = Math.floor(sampleRate * seconds) * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

const originalFileReader = (globalThis as { FileReader?: unknown }).FileReader;
const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  saveBinary.mockClear();
  saveRecording.mockClear();
  (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
});

afterEach(() => {
  (globalThis as unknown as { FileReader?: unknown }).FileReader = originalFileReader;
  (globalThis as unknown as { window?: unknown }).window = originalWindow;
});

describe('AudioRecordingManager.importAudioFile guards', () => {
  it('rejects an empty file before touching storage', async () => {
    const mgr = new AudioRecordingManager();
    await expect(mgr.importAudioFile(1, new Blob([], { type: 'audio/wav' }))).rejects.toThrow(
      /empty/i
    );
    expect(saveBinary).not.toHaveBeenCalled();
  });

  it('rejects files larger than 50 MB', async () => {
    const mgr = new AudioRecordingManager();
    const oversized = { size: 51 * 1024 * 1024, type: 'audio/wav' } as unknown as File;
    await expect(mgr.importAudioFile(1, oversized)).rejects.toThrow(/too large/i);
    expect(saveBinary).not.toHaveBeenCalled();
  });
});

describe('AudioRecordingManager.importAudioFile happy path', () => {
  it('imports a canonical 16 kHz mono WAV and derives duration from PCM size', async () => {
    const mgr = new AudioRecordingManager();
    const wav = makeWav({ sampleRate: 16000, channels: 1, bitsPerSample: 16, seconds: 2 });

    const result = await mgr.importAudioFile(7, wav, 'voice.wav');

    expect(result.wasConverted).toBe(true);
    expect(result.durationSeconds).toBe(2);
    expect(result.durationMs).toBe(2000);
    expect(result.mimeType).toBe('audio/wav');
    expect(result.recording?.id).toBe(42);
    expect(result.recording?.media_key).toMatch(/^imp_/);
    expect(result.recording?.sample_rate).toBe(16000);
    expect(result.recording?.channels).toBe(1);
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(saveBinary).toHaveBeenCalledTimes(1);
    expect(saveRecording).toHaveBeenCalledTimes(1);
  });
});

describe('AudioRecordingManager AudioContext lifecycle', () => {
  it('closes every AudioContext even when decoding fails (Android pool safety)', async () => {
    const instances = installAudioContext('reject');
    const mgr = new AudioRecordingManager();
    // 8 kHz mono forces the decode/resample path instead of the canonical fast path.
    const wav = makeWav({ sampleRate: 8000, channels: 1, bitsPerSample: 16, seconds: 1 });

    const result = await mgr.importAudioFile(3, wav, 'legacy.wav');

    expect(instances.length).toBeGreaterThanOrEqual(2);
    expect(instances.every((ctx) => ctx.closed)).toBe(true);
    // Conversion failed, so the raw blob is kept and no false truncation is reported.
    expect(result.wasConverted).toBe(false);
    expect(result.wasTruncated).toBe(false);
  });
});

describe('computeResampleLength truncation boundary', () => {
  it('keeps the full length for audio within the cap', () => {
    const { targetLength, truncated } = computeResampleLength(10, 16000);
    expect(truncated).toBe(false);
    expect(targetLength).toBe(160000);
  });

  it('caps length and flags truncation beyond the cap', () => {
    const { targetLength, truncated } = computeResampleLength(MAX_RESAMPLE_SECONDS + 90, 16000);
    expect(truncated).toBe(true);
    expect(targetLength).toBe(16000 * MAX_RESAMPLE_SECONDS);
  });
});

describe('extensionForAudioMime', () => {
  it('always uses wav for converted audio', () => {
    expect(extensionForAudioMime('audio/webm', true)).toBe('wav');
    expect(extensionForAudioMime(undefined, true)).toBe('wav');
  });

  it('keeps the recorded container when not converted', () => {
    expect(extensionForAudioMime('audio/mp4;codecs=mp4a.40.2', false)).toBe('m4a');
    expect(extensionForAudioMime('audio/mpeg', false)).toBe('mp3');
    expect(extensionForAudioMime('audio/ogg;codecs=opus', false)).toBe('ogg');
    expect(extensionForAudioMime('audio/webm;codecs=opus', false)).toBe('webm');
    expect(extensionForAudioMime(undefined, false)).toBe('webm');
  });
});

describe('AudioRecordingManager.stopRecording metadata', () => {
  it('keeps the source container and omits PCM metadata when conversion fails', async () => {
    installAudioContext('reject');
    const mgr = new AudioRecordingManager() as unknown as {
      startTime: number;
      pausedDuration: number;
      audioChunks: Blob[];
      mediaRecorder: unknown;
      stopRecording: (noteId?: number) => Promise<{
        wasConverted?: boolean;
        recording?: { media_key: string; sample_rate?: number; channels?: number; mime_type: string };
      }>;
    };

    mgr.startTime = Date.now() - 5000;
    mgr.pausedDuration = 0;
    mgr.audioChunks = [new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'audio/mp4' })];
    mgr.mediaRecorder = {
      mimeType: 'audio/mp4',
      state: 'recording',
      onstop: null,
      stop(this: { state: string }) {
        this.state = 'inactive';
        queueMicrotask(() => (mgr.mediaRecorder as { onstop?: () => void }).onstop?.());
      },
    };

    const result = await mgr.stopRecording(5);

    expect(result.wasConverted).toBe(false);
    expect(result.recording?.media_key).toMatch(/^rec_.*\.m4a$/);
    expect(result.recording?.mime_type).toBe('audio/mp4');
    expect(result.recording?.sample_rate).toBeUndefined();
    expect(result.recording?.channels).toBeUndefined();
  });
});

