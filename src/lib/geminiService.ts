import { AiSettingsManager, SummaryFormat } from './aiSettings';
import { NativeBridge } from './nativeBridge';
import { OfflineTranscriptionEngine } from './offlineTranscription';

export interface OcrResult {
  ocrText: string;
  confidence?: number;
  source?: string;
}

export interface TranscribeResult {
  transcript: string;
  source?: string;
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
  keyUsed?: 'custom' | 'server_env' | 'local_offline' | 'ollama';
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

    let output = '';

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
      } catch (err: any) {
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
   * Direct Local Ollama synthesis
   */
  private static async executeOllama(prompt: string, endpoint: string, model: string): Promise<string> {
    const cleanEndpoint = (endpoint || 'http://localhost:11434').replace(/\/+$/, '');

    // 1. Direct browser fetch
    try {
      const res = await fetch(`${cleanEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.response) {
        return data.response;
      }
    } catch {
      // Try server proxy
    }

    // 2. Server proxy fallback
    const proxyRes = await fetch('/api/ollama/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: cleanEndpoint, model, prompt }),
    });
    const proxyData = await proxyRes.json().catch(() => null);
    if (proxyRes.ok && proxyData?.text) {
      return proxyData.text;
    }
    throw new Error(proxyData?.error || `Could not connect to Ollama at ${cleanEndpoint}`);
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
      } catch (directErr: any) {
        if (NativeBridge.isNative() || directErr.message?.includes('API key') || directErr.message?.includes('permission')) {
          throw directErr;
        }
      }
    }

    // Server proxy fallback
    try {
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
    } catch (err: any) {
      throw new Error(err.message || 'Failed to extract text from handwritten note with Gemini AI.');
    }
  }

  /**
   * Multi-provider Audio Transcription (Offline-first Native Engine, Google, Groq Whisper, Deepgram, Local Whisper)
   */
  public static async transcribeAudio(
    audioBase64: string,
    mimeType = 'audio/webm',
    sampleDuration = 0,
    liveCapturedText = ''
  ): Promise<TranscribeResult> {
    const cleanBase64 = stripBase64Prefix(audioBase64);
    const sanitizedMime = cleanMimeType(mimeType, 'audio/webm');
    const settings = AiSettingsManager.getSettings();
    const provider = settings.primaryTranscriptionProvider || 'browser_speech';

    // 1. Primary Offline-First Native Engine (Default)
    if (provider === 'browser_speech' || provider === ('offline_rules' as any)) {
      const offlineRes = await OfflineTranscriptionEngine.transcribeAudio(
        cleanBase64,
        sanitizedMime,
        sampleDuration,
        liveCapturedText
      );
      return {
        transcript: offlineRes.transcript,
        source: offlineRes.source,
      };
    }

    // 2. Groq Whisper (Opt-in External)
    if (provider === 'groq_whisper' && settings.groqApiKey) {
      try {
        const res = await fetch('/api/groq/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.groqApiKey}` },
          body: JSON.stringify({ audioBase64: cleanBase64, mimeType: sanitizedMime, apiKey: settings.groqApiKey }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.transcript) {
          return { transcript: data.transcript, source: data.source || 'groq/whisper-large-v3-turbo' };
        }
        throw new Error(data?.error || 'Groq transcription failed');
      } catch (groqErr: any) {
        console.warn('Groq Whisper failed, falling back to on-device transcription:', groqErr);
      }
    }

    // 3. Deepgram (Opt-in External)
    if (provider === 'deepgram' && settings.deepgramApiKey) {
      try {
        const res = await fetch('/api/deepgram/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: cleanBase64,
            mimeType: sanitizedMime,
            apiKey: settings.deepgramApiKey,
            model: settings.deepgramModel || 'nova-3',
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.transcript) {
          return { transcript: data.transcript, source: data.source || 'deepgram/nova-3' };
        }
        throw new Error(data?.error || 'Deepgram transcription failed');
      } catch (dgErr: any) {
        console.warn('Deepgram failed, falling back to on-device transcription:', dgErr);
      }
    }

    // 4. Local Whisper (Opt-in Self-Hosted)
    if (provider === 'local_whisper' && settings.localWhisperEndpoint) {
      try {
        const res = await fetch('/api/local-whisper/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: cleanBase64,
            mimeType: sanitizedMime,
            endpoint: settings.localWhisperEndpoint,
          }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.transcript) {
          return { transcript: data.transcript, source: 'local_whisper' };
        }
        throw new Error(data?.error || 'Local Whisper server failed');
      } catch (lwErr: any) {
        console.warn('Local Whisper failed, falling back to on-device transcription:', lwErr);
      }
    }

    // 5. Google AI Studio (Opt-in External)
    const localKey = (settings.googleApiKey || settings.apiKey || '').trim();
    if (provider === 'google' && (NativeBridge.isNative() || localKey)) {
      const prompt = 'Accurately transcribe this audio recording into clean, speaker-attributed verbatim text. Identify distinct speakers if audible and preserve technical terms. Return ONLY the transcript.';
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
          ['gemini-3.5-transcribe', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-flash-latest']
        );
        return {
          transcript: directResult.text,
          source: directResult.model,
        };
      } catch (directErr: any) {
        console.warn('Direct Google AI transcription failed, checking server or on-device fallback:', directErr);
      }
    }

    if (provider === 'google') {
      try {
        const res = await fetch('/api/gemini/transcribe', {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify({ audioBase64: cleanBase64, mimeType: sanitizedMime }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.transcript !== undefined) {
          return {
            transcript: data.transcript,
            source: data.source || 'gemini-3.6-flash',
          };
        }
      } catch (proxyErr) {
        console.warn('Server Google transcription failed, activating on-device engine:', proxyErr);
      }
    }

    // 6. Universal Seamless Fallback to Built-in Offline Engine
    const offlineRes = await OfflineTranscriptionEngine.transcribeAudio(
      cleanBase64,
      sanitizedMime,
      sampleDuration,
      liveCapturedText
    );
    return {
      transcript: offlineRes.transcript,
      source: offlineRes.source,
    };
  }

  /**
   * Multi-provider Structured Summary Generation (Google, Groq, Ollama, Offline Rules)
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

    let formatPrompt = '';
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
      } catch (groqErr: any) {
        if (!settings.autoFallbackToLocal) throw groqErr;
        console.warn('Groq synthesis failed, attempting fallback:', groqErr);
      }
    }

    // 2. Route to Local Ollama if selected
    if (llmProvider === 'ollama') {
      try {
        const ollamaText = await this.executeOllama(
          fullPrompt,
          settings.ollamaEndpoint || 'http://localhost:11434',
          settings.ollamaModel || 'llama3.2'
        );
        return {
          summary: ollamaText,
          format: options.format || 'executive',
          source: `ollama/${settings.ollamaModel || 'llama3.2'}`,
          keyUsed: 'ollama',
        };
      } catch (ollamaErr: any) {
        if (!settings.autoFallbackToLocal) throw ollamaErr;
        console.warn('Ollama synthesis failed, executing built-in offline engine fallback:', ollamaErr);
        return OfflineSynthesisEngine.synthesize(options);
      }
    }

    // 3. Route to Google AI Studio (Default)
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
      } catch (directErr: any) {
        if (NativeBridge.isNative() || directErr.message?.includes('API key') || directErr.message?.includes('permission')) {
          if (settings.autoFallbackToLocal) {
            console.warn('Google AI Studio error, falling back to offline engine:', directErr);
            return OfflineSynthesisEngine.synthesize(options);
          }
          throw directErr;
        }
      }
    }

    // Server proxy fallback for Google AI Studio
    try {
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
        } catch {}
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
    } catch (err: any) {
      if (settings.autoFallbackToLocal) {
        console.warn('All cloud summarization failed, returning offline synthesis:', err);
        return OfflineSynthesisEngine.synthesize(options);
      }
      throw new Error(err.message || 'Failed to generate AI summary with Gemini.');
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
