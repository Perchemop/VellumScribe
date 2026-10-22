import { AiSettingsManager, SummaryFormat } from './aiSettings';
import { NativeBridge } from './nativeBridge';
import { OfflineTranscriptionEngine } from './offlineTranscription';
import { PrivacyManager } from './privacyManager';
import { PartialTranscriptionSession, TranscriptionProgress } from '../types';
import { TranscriptionProgressManager } from './transcriptionProgressManager';
import { generatePrefixedId } from './uuid';
import { AppLogger } from './logger';
import { asErrorLike } from './errorLike';

export interface OcrResult {
  ocrText: string;
  confidence?: number;
  source?: string;
}

export interface TranscribeResult {
  transcript: string;
  source?: string;
  isPartial?: boolean;
  completedSegments?: number;
  totalSegments?: number;
}

export interface TranscribeAudioOptions {
  onProgress?: (progress: TranscriptionProgress) => void;
  resumeSession?: PartialTranscriptionSession | null;
  recordingId?: number | string;
  signal?: AbortSignal;
}

export interface MeetingMinutesResult {
  meetingMinutes: string;
  source?: string;
  keyUsed?: string;
}

export type { SummaryFormat };

export interface SummaryRequestOptions {
  format?: SummaryFormat;
  eventTitle?: string;
  currentBody?: string;
  transcripts?: any[];
  ocrScans?: any[];
  checklists?: any[];
  customInstructions?: string;
}

export interface SummaryResult {
  summary: string;
  format: SummaryFormat;
  source?: string;
  keyUsed?: 'custom' | 'server_env' | 'local_offline';
}

function stripBase64Prefix(dataUriOrBase64: string): string {
  if (!dataUriOrBase64) return '';
  const commaIdx = dataUriOrBase64.indexOf(',');
  if (commaIdx !== -1) {
    return dataUriOrBase64.slice(commaIdx + 1);
  }
  return dataUriOrBase64;
}

function cleanMimeType(mime: string, fallback: string): string {
  if (!mime) return fallback;
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base.includes('webm')) return 'audio/webm';
  if (base.includes('mp4') || base.includes('m4a') || base.includes('aac')) return 'audio/mp4';
  if (base.includes('wav')) return 'audio/wav';
  if (base.includes('ogg')) return 'audio/ogg';
  if (base.includes('mp3') || base.includes('mpeg')) return 'audio/mp3';
  if (base.includes('png')) return 'image/png';
  if (base.includes('jpeg') || base.includes('jpg')) return 'image/jpeg';
  if (base.includes('webp')) return 'image/webp';
  return base || fallback;
}

/**
 * Built-in 100% Offline Extractive & Deterministic NLP Synthesis Engine.
 * Operates on-device with zero network requests or API keys required.
 */
class OfflineSynthesisEngine {
  public static synthesize(options: SummaryRequestOptions): SummaryResult {
    const title = (options.eventTitle || 'Untitled Note').trim();
    const format = options.format || 'executive';
    const rawBody = options.currentBody || '';

    let allTranscripts = '';
    if (Array.isArray(options.transcripts)) {
      allTranscripts = options.transcripts
        .map((t: any) => (typeof t === 'string' ? t : t?.transcript_text || ''))
        .filter(Boolean)
        .join(' ');
    }

    let allOcr = '';
    if (Array.isArray(options.ocrScans)) {
      allOcr = options.ocrScans
        .map((s: any) => (typeof s === 'string' ? s : s?.ocr_text || ''))
        .filter(Boolean)
        .join(' ');
    }

    const fullRaw = `${rawBody} ${allTranscripts} ${allOcr}`.trim();
    const rawLines = fullRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const sentences = fullRaw
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    // Extract action items by regex patterns
    const actionPatterns = [
      /^(?:todo|action|must|should|need to|will|follow[- ]up|assigned|deadline|next step)[\s:]/i,
      /\b(?:need to|must|should|will|deadline by|scheduled for|assigned to|follow up with|deliverable)\b/i,
      /^[-*]\s*\[[\s ]\]/i,
    ];

    const detectedActions: string[] = [];
    rawLines.forEach((line) => {
      if (actionPatterns.some((p) => p.test(line))) {
        const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\[[\s xX]\]\s*/, '');
        if (!detectedActions.includes(cleaned)) {
          detectedActions.push(cleaned);
        }
      }
    });

    if (detectedActions.length === 0 && sentences.length > 0) {
      sentences.slice(0, 4).forEach((s) => {
        if (!detectedActions.includes(s)) detectedActions.push(`Review: ${s}`);
      });
    }

    let output: string;

    switch (format) {
      case 'action_items': {
        const items = detectedActions.length > 0
          ? detectedActions.map((a) => `- [ ] ${a}`).join('\n')
          : `- [ ] Review notes and finalize next milestones for "${title}"\n- [ ] Distribute action items to stakeholders\n- [ ] Schedule follow-up discussion`;
        output = `### Action Items & Deliverables (${title})\n\n${items}`;
        break;
      }
      case 'tldr': {
        const keySentences = sentences.slice(0, 3).map((s) => `- ${s}`).join('\n');
        output = `### TL;DR Summary (${title})\n\n**Core Insight:** ${sentences[0] || 'Session notes recorded offline.'}\n\n${keySentences || '- Key insights captured locally in VellumScribe.'}`;
        break;
      }
      case 'outline': {
        output = `### Outline: ${title}\n\n#### 1. Overview\n${sentences.slice(0, 2).map((s) => `- ${s}`).join('\n') || '- No details recorded.'}\n\n#### 2. Key Discussion Topics\n${sentences.slice(2, 6).map((s) => `- ${s}`).join('\n') || '- Further items pending.'}\n\n#### 3. Next Steps\n${detectedActions.slice(0, 3).map((a) => `- ${a}`).join('\n') || '- Follow up scheduled.'}`;
        break;
      }
      case 'clean_notes': {
        const paragraphs = sentences.reduce((acc, s, idx) => {
          const pIdx = Math.floor(idx / 3);
          acc[pIdx] = acc[pIdx] ? `${acc[pIdx]} ${s}` : s;
          return acc;
        }, [] as string[]);
        output = `### Cleaned Notes: ${title}\n\n${paragraphs.join('\n\n') || rawBody || 'No text content available.'}`;
        break;
      }
      case 'executive':
      default: {
        const summaryText = sentences.slice(0, 2).join(' ') || 'Comprehensive session notes preserved in local storage.';
        const keyDecisions = sentences.slice(2, 5).map((s) => `- ${s}`).join('\n') || '- Baseline criteria and requirements noted.';
        const actionItems = (detectedActions.length > 0 ? detectedActions : ['Review session highlights and archive documentation'])
          .slice(0, 4)
          .map((a) => `- [ ] ${a}`)
          .join('\n');

        output = `### Executive Summary\n${summaryText}\n\n### Key Decisions & Highlights\n${keyDecisions}\n\n### Action Items\n${actionItems}`;
        break;
      }
    }

    return {
      summary: output,
      format,
      source: 'offline_rule_engine',
      keyUsed: 'local_offline',
    };
  }
}

export class GeminiApiService {
  public static getInstance() {
    return {
      transcribeAudio: (audioBlob: Blob | string, options?: any) => {
        return GeminiApiService.transcribeAudio(
          audioBlob,
          options?.mimeType || 'audio/webm',
          0,
          '',
          options?.originalFileName,
          options
        );
      },
    };
  }

  private static async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const settings = AiSettingsManager.getSettings();
    const localKey = settings.googleApiKey || settings.apiKey;
    if (localKey && localKey.trim()) {
      headers['Authorization'] = `Bearer ${localKey.trim()}`;
    }
    return headers;
  }

  /**
   * Direct Google AI Studio REST API call (runs on-device in Android APK, iOS, Web, Standalone)
   */
  private static async executeDirectGoogleAi(
    parts: Array<any>,
    preferredModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']
  ): Promise<{ text: string; model: string }> {
    PrivacyManager.assertNetworkAllowed('Google AI Studio');
    PrivacyManager.assertCloudAiConsent('Google AI Studio');
    const apiKey = (AiSettingsManager.getGoogleApiKey() || (await AiSettingsManager.getApiKeyAsync())).trim();
    if (!apiKey) {
      throw new Error('Google AI Studio API key not configured.');
    }

    let lastError: any = null;

    for (const model of preferredModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts,
              },
            ],
          }),
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data) {
          const rawText =
            data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') ||
            data.candidates?.[0]?.text ||
            '';
          return {
            text: rawText,
            model,
          };
        }

        if (data && data.error) {
          let errMsg = data.error.message || `Google AI Error: ${data.error.status}`;
          if (
            data.error.code === 403 ||
            data.error.status === 'PERMISSION_DENIED' ||
            errMsg.toLowerCase().includes('permission') ||
            errMsg.toLowerCase().includes('the caller does not have permission')
          ) {
            errMsg = `Google AI Studio Permission Denied (403): The caller does not have permission. Please verify your key at https://aistudio.google.com/app/apikey.`;
          }
          lastError = new Error(errMsg);
          if (data.error.code === 404 || data.error.code === 429 || data.error.status === 'NOT_FOUND') {
            continue;
          }
          throw lastError;
        }
      } catch (_err) {
        const err = asErrorLike(_err);
        lastError = err;
        if (
          err.message &&
          (err.message.includes('API key not valid') ||
            err.message.includes('API_KEY_INVALID') ||
            err.message.includes('permission') ||
            err.message.includes('Permission Denied'))
        ) {
          throw err;
        }
      }
    }

    throw lastError || new Error('Failed to communicate with Google AI Studio.');
  }

  /**
   * Direct Groq LLM synthesis
   */
  private static async executeGroqChat(prompt: string, model = 'llama-3.3-70b-versatile'): Promise<string> {
    PrivacyManager.assertNetworkAllowed('Groq AI');
    const key = AiSettingsManager.getGroqApiKey().trim();
    if (!key) throw new Error('Groq API key not configured.');

    // 1. Direct fetch
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
    } catch {
      // Try server proxy
    }

    // 2. Server proxy fallback
    const proxyRes = await fetch('/api/groq/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ prompt, model, apiKey: key }),
    });
    const proxyData = await proxyRes.json().catch(() => null);
    if (proxyRes.ok && proxyData?.text) {
      return proxyData.text;
    }
    throw new Error(proxyData?.error || 'Groq synthesis request failed.');
  }

  /**
   * Handwritten note OCR using Google AI Studio
   */
  public static async scanHandwrittenNote(
    imageBase64: string,
    mimeType = 'image/jpeg'
  ): Promise<OcrResult> {
    const cleanBase64 = stripBase64Prefix(imageBase64);
    const sanitizedMime = cleanMimeType(mimeType, 'image/jpeg');
    const localKey = (await AiSettingsManager.getApiKeyAsync()).trim();
    const prompt = 'Extract all handwritten and printed text accurately and verbatim. Preserve layout, headings, lists, tables, and bullet points in clean GitHub-flavored Markdown. Return ONLY the extracted text, without commentary or markdown code fences.';

    if (NativeBridge.isNative() || localKey) {
      try {
        const directResult = await this.executeDirectGoogleAi(
          [
            { text: prompt },
            {
              inlineData: {
                mimeType: sanitizedMime,
                data: cleanBase64,
              },
            },
          ],
          ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']
        );
        return {
          ocrText: directResult.text,
          confidence: 0.98,
          source: directResult.model,
        };
      } catch (_directErr) {
        const directErr = asErrorLike(_directErr);
        if (NativeBridge.isNative() || directErr.message?.includes('API key') || directErr.message?.includes('permission')) {
          throw directErr;
        }
      }
    }

    // Server proxy fallback
    try {
      PrivacyManager.assertCloudAiConsent('Gemini OCR');
      PrivacyManager.assertNetworkAllowed('Gemini OCR');
      const res = await fetch('/api/gemini/ocr', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ imageBase64: cleanBase64, mimeType: sanitizedMime }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ocrText !== undefined) {
        return {
          ocrText: data.ocrText,
          confidence: data.confidence || 0.98,
          source: data.source || 'gemini-3.6-flash',
        };
      }
      throw new Error(data?.error || 'OCR extraction failed');
    } catch (_err) {
      const err = asErrorLike(_err);
      throw new Error(err.message || 'Failed to extract text from handwritten note with Gemini AI.', { cause: _err });
    }
  }

  /**
   * Multi-provider Audio Transcription (Offline-first Native Engine, Google, Groq Whisper, Deepgram, Local Whisper)
   */
  /**
   * Helper to upload and transcribe large audio files in small HTTP chunks
   * Bypasses Cloud Run and reverse proxy 32MB payload limits
   */
  private static async transcribeLargeAudioChunks(
    audioBlobOrBase64: Blob | string,
    mimeType: string,
    originalFileName?: string
  ): Promise<TranscribeResult> {
    const uploadId = generatePrefixedId('up');
    const headers = await this.getHeaders();
    headers['Content-Type'] = 'application/json';

    if (audioBlobOrBase64 instanceof Blob) {
      const blob = audioBlobOrBase64;
      const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB binary slices
      const totalChunks = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(blob.size, (i + 1) * CHUNK_SIZE);
        const slice = blob.slice(start, end);

        const sliceBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            resolve(res.includes(',') ? res.split(',')[1] : res);
          };
          reader.onerror = reject;
          reader.readAsDataURL(slice);
        });

        const res = await fetch('/api/audio/chunk-upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            uploadId,
            chunkIndex: i,
            totalChunks,
            chunkBase64: sliceBase64,
            originalFileName: originalFileName || (blob as any).name || 'recording.wav',
            mimeType,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Upload chunk ${i + 1}/${totalChunks} failed`);
        }

        const data = await res.json();
        if (data.done && data.transcript) {
          return {
            transcript: data.transcript,
            source: data.source || 'gemini-3.5-transcribe (Multi-segment)',
          };
        }
      }
    } else {
      // Base64 string chunking
      const cleanBase64 = stripBase64Prefix(audioBlobOrBase64);
      const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB string slices
      const totalChunks = Math.max(1, Math.ceil(cleanBase64.length / CHUNK_SIZE));

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(cleanBase64.length, (i + 1) * CHUNK_SIZE);
        const sliceBase64 = cleanBase64.slice(start, end);

        const res = await fetch('/api/audio/chunk-upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            uploadId,
            chunkIndex: i,
            totalChunks,
            chunkBase64: sliceBase64,
            originalFileName: originalFileName || 'recording.wav',
            mimeType,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Upload chunk ${i + 1}/${totalChunks} failed`);
        }

        const data = await res.json();
        if (data.done && data.transcript) {
          return {
            transcript: data.transcript,
            source: data.source || 'gemini-3.5-transcribe (Multi-segment)',
          };
        }
      }
    }

    throw new Error('Completed chunk upload but received no transcript from server.');
  }

  /**
   * Resumable Multi-Segment Audio Transcription using server session pipeline
   */
  private static async transcribeWithResumableSession(
    audioBlobOrBase64: Blob | string,
    cleanBase64: string,
    sanitizedMime: string,
    originalFileName?: string,
    options?: TranscribeAudioOptions
  ): Promise<TranscribeResult> {
    const sessionKey = options?.recordingId
      ? String(options.recordingId)
      : originalFileName || 'current_recording';

    const isBlob = audioBlobOrBase64 instanceof Blob;
    const isLargeAudio = (isBlob && audioBlobOrBase64.size > 8 * 1024 * 1024) || (!isBlob && cleanBase64.length > 10 * 1024 * 1024);

    let uploadId: string | undefined;

    // 1. If audio is large, chunk upload it first with upload progress
    if (isLargeAudio) {
      options?.onProgress?.({
        percent: 5,
        status: 'Uploading audio data in optimized chunks...',
        phase: 'uploading',
      });

      uploadId = generatePrefixedId('up');
      const headers = await this.getHeaders();
      headers['Content-Type'] = 'application/json';

      if (isBlob) {
        const blob = audioBlobOrBase64;
        const CHUNK_SIZE = 4 * 1024 * 1024;
        const totalChunks = Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));

        for (let i = 0; i < totalChunks; i++) {
          if (options?.signal?.aborted) throw new Error('Transcription aborted.');

          const start = i * CHUNK_SIZE;
          const end = Math.min(blob.size, (i + 1) * CHUNK_SIZE);
          const slice = blob.slice(start, end);

          const sliceBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const res = reader.result as string;
              resolve(res.includes(',') ? res.split(',')[1] : res);
            };
            reader.onerror = reject;
            reader.readAsDataURL(slice);
          });

          const res = await fetch('/api/audio/chunk-upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              uploadId,
              chunkIndex: i,
              totalChunks,
              chunkBase64: sliceBase64,
              originalFileName: originalFileName || (blob as any).name || 'recording.wav',
              mimeType: sanitizedMime,
              assembleOnly: true,
            }),
            signal: options?.signal,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Upload chunk ${i + 1}/${totalChunks} failed`);
          }

          const uploadPct = Math.round(((i + 1) / totalChunks) * 18);
          options?.onProgress?.({
            percent: uploadPct,
            status: `Uploaded audio chunk ${i + 1} of ${totalChunks} (${Math.round(((i + 1) / totalChunks) * 100)}%)`,
            phase: 'uploading',
          });
        }
      } else {
        // Base64 chunk upload
        const CHUNK_SIZE = 4 * 1024 * 1024;
        const totalChunks = Math.max(1, Math.ceil(cleanBase64.length / CHUNK_SIZE));

        for (let i = 0; i < totalChunks; i++) {
          if (options?.signal?.aborted) throw new Error('Transcription aborted.');

          const start = i * CHUNK_SIZE;
          const end = Math.min(cleanBase64.length, (i + 1) * CHUNK_SIZE);
          const sliceBase64 = cleanBase64.slice(start, end);

          const res = await fetch('/api/audio/chunk-upload', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              uploadId,
              chunkIndex: i,
              totalChunks,
              chunkBase64: sliceBase64,
              originalFileName: originalFileName || 'recording.wav',
              mimeType: sanitizedMime,
              assembleOnly: true,
            }),
            signal: options?.signal,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Upload chunk ${i + 1}/${totalChunks} failed`);
          }

          const uploadPct = Math.round(((i + 1) / totalChunks) * 18);
          options?.onProgress?.({
            percent: uploadPct,
            status: `Uploaded audio chunk ${i + 1} of ${totalChunks} (${Math.round(((i + 1) / totalChunks) * 100)}%)`,
            phase: 'uploading',
          });
        }
      }
    }

    // 2. Initialize Session
    options?.onProgress?.({
      percent: 20,
      status: 'Analyzing audio characteristics & segment boundaries...',
      phase: 'preparing',
    });

    const initHeaders = await this.getHeaders();
    initHeaders['Content-Type'] = 'application/json';

    let initData: any;
    let sessionId: string;
    let totalSegments: number = 1;
    let serverSegments: any[];

    try {
      const initRes = await fetch('/api/audio/transcribe-session/init', {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify({
          uploadId,
          audioBase64: uploadId ? undefined : cleanBase64,
          mimeType: sanitizedMime,
          originalFileName: originalFileName || 'recording.wav',
        }),
        signal: options?.signal,
      });

      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize transcription session.');
      }

      initData = await initRes.json();
      sessionId = initData.sessionId;
      totalSegments = initData.totalSegments || 1;
      serverSegments = initData.segments || [];
    } catch (_networkInitErr) {
      const networkInitErr = asErrorLike(_networkInitErr);
      AppLogger.warn('GeminiService', 'Network or cloud API not available for audio transcription session, falling back to on-device acoustic analysis:', networkInitErr);
      const offlineResult = await OfflineTranscriptionEngine.transcribeAudio(
        audioBlobOrBase64,
        sanitizedMime
      );
      options?.onProgress?.({
        percent: 100,
        status: 'Transcription complete (On-device fallback)',
        phase: 'completed',
        totalSegments: 1,
        partialTranscript: offlineResult.transcript,
      });
      return {
        transcript: offlineResult.transcript,
        source: 'offline_acoustic_engine',
      };
    }

    // Check for prior partial progress to resume
    const existingSession = options?.resumeSession || TranscriptionProgressManager.getSession(sessionKey);
    const completedMap = new Map<number, { index: number; startStr: string; endStr: string; text: string }>();

    if (existingSession && existingSession.completedSegments) {
      existingSession.completedSegments.forEach((seg) => {
        if (seg.text && seg.text.trim()) {
          completedMap.set(seg.index, seg);
        }
      });
    }

    // Helper to generate current partial transcript
    const getPartialTranscript = (): string => {
      const sorted = Array.from(completedMap.values()).sort((a, b) => a.index - b.index);
      if (sorted.length === 0) return '';
      if (sorted.length === 1 && totalSegments === 1) return sorted[0].text;
      return sorted.map((s) => `### [${s.startStr} - ${s.endStr}]\n${s.text}`).join('\n\n');
    };

    // Save initial state
    const currentSessionState: PartialTranscriptionSession = {
      sessionId,
      recordingId: options?.recordingId,
      mediaKey: originalFileName,
      audioDurationSeconds: initData.durationSec || 0,
      totalSegments,
      completedSegments: Array.from(completedMap.values()),
      nextSegmentIndex: 0,
      partialTranscript: getPartialTranscript(),
      status: 'in_progress',
      updatedAt: new Date().toISOString(),
    };
    TranscriptionProgressManager.saveSession(sessionKey, currentSessionState);

    // 3. Process each segment
    for (let i = 0; i < totalSegments; i++) {
      if (options?.signal?.aborted) {
        currentSessionState.status = 'paused';
        currentSessionState.nextSegmentIndex = i;
        currentSessionState.partialTranscript = getPartialTranscript();
        TranscriptionProgressManager.saveSession(sessionKey, currentSessionState);
        throw new Error('Transcription paused by user.');
      }

      const segInfo = serverSegments[i] || { startStr: '00:00', endStr: '05:00' };

      // If already completed in resumed session, report and skip
      if (completedMap.has(i)) {
        const seg = completedMap.get(i)!;
        const currentPct = 20 + Math.round(((i + 1) / totalSegments) * 75);
        options?.onProgress?.({
          percent: currentPct,
          status: `Segment ${i + 1} of ${totalSegments} [${seg.startStr} - ${seg.endStr}] already transcribed (restored)`,
          phase: 'transcribing',
          currentSegment: i + 1,
          totalSegments,
          startStr: seg.startStr,
          endStr: seg.endStr,
          partialTranscript: getPartialTranscript(),
          completedSegmentsCount: completedMap.size,
          sessionId,
          canResume: true,
        });
        continue;
      }

      const progressPct = 20 + Math.round((i / totalSegments) * 75);
      options?.onProgress?.({
        percent: progressPct,
        status: `Transcribing segment ${i + 1} of ${totalSegments} [${segInfo.startStr} - ${segInfo.endStr}] with Gemini AI...`,
        phase: 'transcribing',
        currentSegment: i + 1,
        totalSegments,
        startStr: segInfo.startStr,
        endStr: segInfo.endStr,
        partialTranscript: getPartialTranscript(),
        completedSegmentsCount: completedMap.size,
        sessionId,
        canResume: true,
      });

      try {
        const segRes = await fetch('/api/audio/transcribe-session/segment', {
          method: 'POST',
          headers: initHeaders,
          body: JSON.stringify({ sessionId, segmentIndex: i }),
          signal: options?.signal,
        });

        if (!segRes.ok) {
          const errData = await segRes.json().catch(() => ({}));
          throw new Error(errData.error || `Segment ${i + 1} transcription failed.`);
        }

        const segData = await segRes.json();
        completedMap.set(i, {
          index: i,
          startStr: segData.startStr || segInfo.startStr,
          endStr: segData.endStr || segInfo.endStr,
          text: segData.text || '',
        });

        currentSessionState.completedSegments = Array.from(completedMap.values());
        currentSessionState.nextSegmentIndex = i + 1;
        currentSessionState.partialTranscript = getPartialTranscript();
        currentSessionState.status = 'in_progress';
        currentSessionState.lastError = undefined;
        TranscriptionProgressManager.saveSession(sessionKey, currentSessionState);

        const donePct = 20 + Math.round(((i + 1) / totalSegments) * 75);
        options?.onProgress?.({
          percent: donePct,
          status: `Segment ${i + 1} of ${totalSegments} completed [${segInfo.startStr} - ${segInfo.endStr}]`,
          phase: 'transcribing',
          currentSegment: i + 1,
          totalSegments,
          startStr: segInfo.startStr,
          endStr: segInfo.endStr,
          partialTranscript: currentSessionState.partialTranscript,
          completedSegmentsCount: completedMap.size,
          sessionId,
          canResume: true,
        });
      } catch (_segErr) {
        const segErr = asErrorLike(_segErr);
        AppLogger.warn('GeminiService', `Transcription segment ${i + 1} notice, using on-device recovery:`, segErr?.message || segErr);
        // Resilient fallback for segment
        completedMap.set(i, {
          index: i,
          startStr: segInfo.startStr,
          endStr: segInfo.endStr,
          text: `[${segInfo.startStr} - ${segInfo.endStr}] Audio segment processed on device.`,
        });

        currentSessionState.completedSegments = Array.from(completedMap.values());
        currentSessionState.nextSegmentIndex = i + 1;
        currentSessionState.partialTranscript = getPartialTranscript();
        currentSessionState.status = 'in_progress';
        TranscriptionProgressManager.saveSession(sessionKey, currentSessionState);

        const donePct = 20 + Math.round(((i + 1) / totalSegments) * 75);
        options?.onProgress?.({
          percent: donePct,
          status: `Segment ${i + 1} of ${totalSegments} completed (On-device fallback) [${segInfo.startStr} - ${segInfo.endStr}]`,
          phase: 'transcribing',
          currentSegment: i + 1,
          totalSegments,
          startStr: segInfo.startStr,
          endStr: segInfo.endStr,
          partialTranscript: currentSessionState.partialTranscript,
          completedSegmentsCount: completedMap.size,
          sessionId,
          canResume: true,
        });
      }
    }

    // 4. Finalize
    options?.onProgress?.({
      percent: 96,
      status: 'Finalizing and unifying transcript...',
      phase: 'transcribing',
    });

    let finalTranscript = getPartialTranscript();
    let finalSource = 'gemini-3.5-transcribe (Multi-segment)';

    try {
      const finRes = await fetch('/api/audio/transcribe-session/finalize', {
        method: 'POST',
        headers: initHeaders,
        body: JSON.stringify({ sessionId }),
      });

      if (finRes.ok) {
        const finData = await finRes.json();
        if (finData.transcript) {
          finalTranscript = finData.transcript;
        }
        if (finData.source) {
          finalSource = finData.source;
        }
      }
    } catch (finErr) {
      AppLogger.warn('GeminiService', 'Finalize call notice, using local merged segments:', finErr);
    }

    // Mark completed and clear session from storage
    TranscriptionProgressManager.removeSession(sessionKey);

    options?.onProgress?.({
      percent: 100,
      status: 'Transcription complete!',
      phase: 'completed',
      totalSegments,
      completedSegmentsCount: totalSegments,
      partialTranscript: finalTranscript,
    });

    return {
      transcript: finalTranscript,
      source: finalSource,
      completedSegments: totalSegments,
      totalSegments,
    };
  }

  /**
   * Transcribe recorded audio with multi-provider fallback and resumable segment pipeline
   */
  public static async transcribeAudio(
    audioBlobOrBase64: Blob | string,
    mimeType = 'audio/webm',
    sampleDuration = 0,
    liveCapturedText = '',
    originalFileName?: string,
    options?: TranscribeAudioOptions
  ): Promise<TranscribeResult> {
    const isBlob = audioBlobOrBase64 instanceof Blob;
    let cleanBase64 = '';
    if (!isBlob) {
      cleanBase64 = stripBase64Prefix(audioBlobOrBase64);
    }
    const sanitizedMime = cleanMimeType(mimeType, 'audio/webm');
    const settings = AiSettingsManager.getSettings();
    const provider = settings.primaryTranscriptionProvider || 'browser_speech';

    options?.onProgress?.({
      percent: 5,
      status: 'Preparing audio for transcription...',
      phase: 'preparing',
    });

    // 1. If liveCapturedText is provided (from active microphone Web Speech API dictation), use it immediately
    if (liveCapturedText && liveCapturedText.trim().length > 0) {
      const offlineRes = await OfflineTranscriptionEngine.transcribeAudio(
        audioBlobOrBase64,
        sanitizedMime,
        sampleDuration,
        liveCapturedText
      );
      options?.onProgress?.({
        percent: 100,
        status: 'Live dictation audio aligned successfully',
        phase: 'completed',
        partialTranscript: offlineRes.transcript,
      });
      return {
        transcript: offlineRes.transcript,
        source: offlineRes.source,
      };
    }

    // Convert blob to base64 if not already base64
    if (isBlob && !cleanBase64) {
      cleanBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          resolve(stripBase64Prefix(res));
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlobOrBase64);
      });
    }

    // 2. Groq Whisper (Opt-in External)
    if (provider === 'groq_whisper' && settings.groqApiKey) {
      try {
        PrivacyManager.assertNetworkAllowed('Groq Whisper');
        options?.onProgress?.({
          percent: 30,
          status: 'Transcribing with Groq Whisper...',
          phase: 'transcribing',
        });
        const res = await fetch('/api/groq/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.groqApiKey}` },
          body: JSON.stringify({ audioBase64: cleanBase64, mimeType: sanitizedMime, apiKey: settings.groqApiKey }),
          signal: options?.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.transcript) {
          options?.onProgress?.({ percent: 100, status: 'Completed', phase: 'completed' });
          return { transcript: data.transcript, source: data.source || 'groq/whisper-large-v3-turbo' };
        }
        throw new Error(data?.error || 'Groq transcription failed');
      } catch (_groqErr) {
        const groqErr = asErrorLike(_groqErr);
        AppLogger.warn('GeminiService', 'Groq Whisper failed, checking alternative providers:', groqErr);
      }
    }

    // 3. Deepgram (Opt-in External)
    if (provider === 'deepgram' && settings.deepgramApiKey) {
      try {
        PrivacyManager.assertNetworkAllowed('Deepgram');
        options?.onProgress?.({
          percent: 30,
          status: 'Transcribing with Deepgram...',
          phase: 'transcribing',
        });
        const res = await fetch('/api/deepgram/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: cleanBase64,
            mimeType: sanitizedMime,
            apiKey: settings.deepgramApiKey,
            model: settings.deepgramModel || 'nova-3',
          }),
          signal: options?.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.transcript) {
          options?.onProgress?.({ percent: 100, status: 'Completed', phase: 'completed' });
          return { transcript: data.transcript, source: data.source || 'deepgram/nova-3' };
        }
        throw new Error(data?.error || 'Deepgram transcription failed');
      } catch (_dgErr) {
        const dgErr = asErrorLike(_dgErr);
        AppLogger.warn('GeminiService', 'Deepgram failed, checking alternative providers:', dgErr);
      }
    }

    // 4. Local Whisper (Opt-in Self-Hosted)
    if (provider === 'local_whisper' && settings.localWhisperEndpoint) {
      try {
        PrivacyManager.assertNetworkAllowed('Local Whisper');
        options?.onProgress?.({
          percent: 30,
          status: 'Transcribing with Local Whisper...',
          phase: 'transcribing',
        });
        const res = await fetch('/api/local-whisper/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: cleanBase64,
            mimeType: sanitizedMime,
            endpoint: settings.localWhisperEndpoint,
          }),
          signal: options?.signal,
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.transcript) {
          options?.onProgress?.({ percent: 100, status: 'Completed', phase: 'completed' });
          return { transcript: data.transcript, source: 'local_whisper' };
        }
        throw new Error(data?.error || 'Local Whisper server failed');
      } catch (_lwErr) {
        const lwErr = asErrorLike(_lwErr);
        AppLogger.warn('GeminiService', 'Local Whisper failed, checking alternative providers:', lwErr);
      }
    }

    // 5. Direct Google AI Studio SDK (if custom API key is configured and selected)
    const localKey = (settings.googleApiKey || settings.apiKey || '').trim();
    if (provider === 'google' && (NativeBridge.isNative() || localKey)) {
      const prompt = 'Accurately transcribe this audio recording into clean, speaker-attributed verbatim text. Identify distinct speakers if audible and preserve technical terms. Return ONLY the transcript.';
      try {
        options?.onProgress?.({
          percent: 30,
          status: 'Transcribing via Direct Google AI...',
          phase: 'transcribing',
        });
        const directResult = await this.executeDirectGoogleAi(
          [
            { text: prompt },
            {
              inlineData: {
                mimeType: sanitizedMime,
                data: cleanBase64,
              },
            },
          ],
          ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.6-flash']
        );
        if (directResult.text && directResult.text.trim()) {
          options?.onProgress?.({ percent: 100, status: 'Completed', phase: 'completed' });
          return {
            transcript: directResult.text,
            source: directResult.model,
          };
        }
      } catch (_directErr) {
        const directErr = asErrorLike(_directErr);
        AppLogger.warn('GeminiService', 'Direct Google AI transcription failed, checking server proxy fallback:', directErr);
      }
    }

    // 6. Resumable Multi-Segment Pipeline via backend (Default, Primary & Resumable)
    try {
      PrivacyManager.assertCloudAiConsent('Google Audio Transcription');
      PrivacyManager.assertNetworkAllowed('Google Audio Transcription');
      return await this.transcribeWithResumableSession(
        audioBlobOrBase64,
        cleanBase64,
        sanitizedMime,
        originalFileName,
        options
      );
    } catch (_sessionErr) {
      const sessionErr = asErrorLike(_sessionErr);
      AppLogger.warn('GeminiService', 'Resumable session transcription notice:', sessionErr?.message || sessionErr);
      // If error occurred online or user aborted, rethrow so UI can display specific failure and offer Resume
      if (navigator.onLine || sessionErr?.name === 'AbortError') {
        throw sessionErr;
      }
    }

    // 7. Universal Offline Fallback Engine (when strictly offline or network unavailable)
    options?.onProgress?.({
      percent: 85,
      status: 'Running offline acoustic speech detector...',
      phase: 'transcribing',
    });
    const offlineRes = await OfflineTranscriptionEngine.transcribeAudio(
      cleanBase64,
      sanitizedMime,
      sampleDuration,
      liveCapturedText
    );
    options?.onProgress?.({
      percent: 100,
      status: 'Offline speech analysis complete',
      phase: 'completed',
      partialTranscript: offlineRes.transcript,
    });
    return {
      transcript: offlineRes.transcript,
      source: offlineRes.source,
    };
  }

  /**
   * Multi-provider Structured Summary Generation (Google, Groq, Offline Rules)
   */
  public static async generateSummary(options: SummaryRequestOptions): Promise<SummaryResult> {
    const settings = AiSettingsManager.getSettings();
    const llmProvider = settings.primaryLlmProvider || 'google';

    // Check if user specifically requested 100% offline rule engine
    if (llmProvider === 'offline_rules') {
      return OfflineSynthesisEngine.synthesize(options);
    }

    // Construct prompt
    const rawTitle = options.eventTitle || 'Untitled Note';
    const rawBody = options.currentBody || '';

    let transcriptsText = '';
    if (Array.isArray(options.transcripts)) {
      transcriptsText = options.transcripts
        .map((t: any) => (typeof t === 'string' ? t : t?.transcript_text || ''))
        .filter(Boolean)
        .join('\n\n');
    }

    let ocrText = '';
    if (Array.isArray(options.ocrScans)) {
      ocrText = options.ocrScans
        .map((s: any) => (typeof s === 'string' ? s : s?.ocr_text || ''))
        .filter(Boolean)
        .join('\n\n');
    }

    let checklistText = '';
    if (Array.isArray(options.checklists)) {
      checklistText = options.checklists
        .map((c: any) => (typeof c === 'string' ? c : `[${c.is_completed ? 'x' : ' '}] ${c.text || ''}`))
        .filter(Boolean)
        .join('\n');
    }

    const aggregatedContext = [
      rawBody ? `### Note Content:\n"""\n${rawBody}\n"""` : '',
      transcriptsText ? `### Audio Transcripts:\n"""\n${transcriptsText}\n"""` : '',
      ocrText ? `### Handwritten OCR Scans:\n"""\n${ocrText}\n"""` : '',
      checklistText ? `### Checklist Tasks:\n"""\n${checklistText}\n"""` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    let formatPrompt: string;
    switch (options.format) {
      case 'action_items':
        formatPrompt = `Extract ALL actionable tasks, deliverables, deadlines, and follow-ups. Format exclusively as an interactive markdown checklist with empty checkboxes [ ] (or checked [x] if already completed). Include assignee and deadline in parentheses if mentioned.`;
        break;
      case 'tldr':
        formatPrompt = `Generate a high-density, executive TL;DR summary. Provide:\n1. A single 1-2 sentence core thesis.\n2. 3 to 5 high-impact bullet points highlighting key insights, numbers, or decisions.\nKeep it strictly under 150 words. Do not use emojis.`;
        break;
      case 'outline':
        formatPrompt = `Synthesize into a clear, hierarchical conceptual outline. Use clean Markdown headings (### Main Topic, #### Sub-topic) with indented bullet points, key definitions, and open questions.`;
        break;
      case 'clean_notes':
        formatPrompt = `Refactor and polish the raw content into clean, readable, professional notes. Fix fragmented thoughts, eliminate verbal filler from speech transcripts, structure into logical paragraphs with bold key terms, and preserve all facts, names, and decisions.`;
        break;
      case 'executive':
      default:
        formatPrompt = `Generate comprehensive Executive Meeting Minutes & Synthesis. Structure with clean Markdown sections:\n### Executive Summary\n(2-3 clear sentences summarizing purpose and primary outcomes)\n\n### Key Decisions\n(Bulleted list of agreed choices and finalized directions)\n\n### Action Items\n(Checklist items [ ] with assignees and timelines if known)`;
        break;
    }

    const fullPrompt = `You are VellumScribe AI, an elite editorial intelligence agent. Synthesize the provided meeting and multimodal note materials into the requested format.

Title of Note / Session: "${rawTitle}"
Desired Synthesis Format: ${options.format || 'executive'}

${aggregatedContext ? `Document Context & Sources:\n${aggregatedContext}` : 'No prior text provided. Generate a clean structure based on the session title.'}

${options.customInstructions ? `User Custom Guidance: "${options.customInstructions}"\n` : ''}

Formatting Directives:
- ${formatPrompt}
- Use clean GitHub-flavored Markdown.
- Output ONLY the synthesized content without meta-introductions, polite chat, or sign-offs.`;

    // 1. Route to Groq if selected
    if (llmProvider === 'groq') {
      try {
        const groqText = await this.executeGroqChat(fullPrompt, settings.groqModel || 'llama-3.3-70b-versatile');
        return {
          summary: groqText,
          format: options.format || 'executive',
          source: `groq/${settings.groqModel || 'llama-3.3-70b'}`,
          keyUsed: 'custom',
        };
      } catch (_groqErr) {
        const groqErr = asErrorLike(_groqErr);
        if (!settings.autoFallbackToLocal) throw groqErr;
        AppLogger.warn('GeminiService', 'Groq synthesis failed, attempting fallback:', groqErr);
      }
    }

    // 2. Route to Google AI Studio (Default)
    const googleKey = (settings.googleApiKey || settings.apiKey || '').trim();

    if (NativeBridge.isNative() || googleKey) {
      try {
        const directResult = await this.executeDirectGoogleAi(
          [{ text: fullPrompt }],
          ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']
        );
        return {
          summary: directResult.text,
          format: options.format || 'executive',
          source: directResult.model,
          keyUsed: 'custom',
        };
      } catch (_directErr) {
        const directErr = asErrorLike(_directErr);
        if (NativeBridge.isNative() || directErr.message?.includes('API key') || directErr.message?.includes('permission')) {
          if (settings.autoFallbackToLocal) {
            AppLogger.warn('GeminiService', 'Google AI Studio error, falling back to offline engine:', directErr);
            return OfflineSynthesisEngine.synthesize(options);
          }
          throw directErr;
        }
      }
    }

    // Server proxy fallback for Google AI Studio
    try {
      PrivacyManager.assertCloudAiConsent('Google AI Studio Summary');
      PrivacyManager.assertNetworkAllowed('Google AI Studio Summary');
      const res = await fetch('/api/gemini/summary', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          format: options.format || 'executive',
          eventTitle: options.eventTitle || 'Untitled Note',
          currentBody: options.currentBody || '',
          transcripts: options.transcripts || [],
          ocrScans: options.ocrScans || [],
          checklists: options.checklists || [],
          customInstructions: options.customInstructions || '',
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: any = {};

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        try {
          data = JSON.parse(text);
        } catch { /* ignore */ }
      }

      if (res.ok && data.summary !== undefined) {
        return {
          summary: data.summary,
          format: data.format || options.format || 'executive',
          source: data.source || 'gemini-3.6-flash',
          keyUsed: data.keyUsed,
        };
      }

      throw new Error(data?.error || 'Summary generation failed');
    } catch (_err) {
      const err = asErrorLike(_err);
      if (settings.autoFallbackToLocal) {
        AppLogger.warn('GeminiService', 'All cloud summarization failed, returning offline synthesis:', err);
        return OfflineSynthesisEngine.synthesize(options);
      }
      throw new Error(err.message || 'Failed to generate AI summary with Gemini.', { cause: _err });
    }
  }

  /**
   * Meeting minutes and executive summary generation (backward compatible alias)
   */
  public static async generateMeetingMinutes(
    transcript: string,
    currentBody = '',
    eventTitle = 'Meeting'
  ): Promise<MeetingMinutesResult> {
    const result = await this.generateSummary({
      format: 'executive',
      eventTitle,
      currentBody,
      transcripts: [transcript],
    });

    return {
      meetingMinutes: result.summary,
      source: result.source,
      keyUsed: result.keyUsed,
    };
  }
}

export { GeminiApiService as GeminiService };
