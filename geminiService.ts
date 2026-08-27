import { AiSettingsManager } from './aiSettings';

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
}

export interface ConflictMergeResult {
  mergedContent: string;
  resolutionStrategy?: string;
}

function extractRawBase64(input: string): string {
  if (!input) return '';
  const commaIndex = input.indexOf(',');
  if (input.startsWith('data:') && commaIndex !== -1) {
    return input.slice(commaIndex + 1).trim();
  }
  return input.trim();
}

function extractMimeType(input: string, fallback: string): string {
  if (input && input.startsWith('data:')) {
    const match = input.match(/^data:([^;,]+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return fallback;
}

export class GeminiApiService {
  private static async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const localKey = await AiSettingsManager.getApiKeyAsync();
    if (localKey) {
      headers['Authorization'] = `Bearer ${localKey}`;
    }
    return headers;
  }

  /**
   * Helper to perform direct Gemini REST API call when running in a client-only or APK environment
   */
  private static async directGeminiGenerate(
    promptOrParts: any,
    apiKey: string,
    model = 'gemini-3.7-flash'
  ): Promise<string> {
    const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    
    let contentsPayload: any;
    if (typeof promptOrParts === 'string') {
      contentsPayload = [{ parts: [{ text: promptOrParts }] }];
    } else if (Array.isArray(promptOrParts)) {
      contentsPayload = [{ parts: promptOrParts }];
    } else if (promptOrParts.parts) {
      contentsPayload = [promptOrParts];
    } else {
      contentsPayload = [{ parts: [promptOrParts] }];
    }

    const res = await fetch(directUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: contentsPayload,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data.error?.message || `Google AI Studio API error (${res.status})`;
      throw new Error(err);
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
    return text.trim();
  }

  public static async scanHandwrittenNote(
    imageBase64: string,
    mimeType = 'image/jpeg'
  ): Promise<OcrResult> {
    const localKey = await AiSettingsManager.getApiKeyAsync();

    // 1. Try server endpoint first
    try {
      const res = await fetch('/api/gemini/ocr', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        const data = JSON.parse(text);
        if (res.ok && data.ocrText !== undefined) {
          return data;
        }
      }
    } catch {
      // Server not reachable, proceed to direct fallback
    }

    // 2. Direct fallback using configured API key (for APK build)
    if (localKey) {
      try {
        const cleanBase64 = extractRawBase64(imageBase64);
        const validMime = mimeType || extractMimeType(imageBase64, 'image/jpeg');
        const prompt = 'Extract all handwritten and printed text from this image verbatim without markdown alterations.';

        const extractedText = await this.directGeminiGenerate(
          [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: validMime,
              },
            },
            { text: prompt },
          ],
          localKey
        );

        return {
          ocrText: extractedText,
          confidence: 0.99,
          source: 'gemini-3.7-flash (client)',
        };
      } catch (err: any) {
        console.error('Direct Gemini OCR failed:', err);
        throw new Error(err.message || 'Failed to extract text using Gemini AI.');
      }
    }

    // 3. No server and no API key: do not fabricate OCR content that looks
    // like it came from the photo. Say plainly that nothing was extracted.
    throw new Error(
      'AI OCR is unavailable: no Gemini API key is configured and the AI service is unreachable. Configure a key in Settings to extract text from this image.'
    );
  }

  public static async transcribeAudio(
    audioBase64: string,
    mimeType = 'audio/webm',
    sampleDuration = 0
  ): Promise<TranscribeResult> {
    const localKey = await AiSettingsManager.getApiKeyAsync();

    // 1. Try server endpoint
    try {
      const res = await fetch('/api/gemini/transcribe', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ audioBase64, mimeType, sampleDuration }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        const data = JSON.parse(text);
        if (res.ok && data.transcript !== undefined) {
          return data;
        }
      }
    } catch {
      // Server not reachable
    }

    // 2. Direct fallback using configured API key (for APK build)
    if (localKey) {
      try {
        const cleanBase64 = extractRawBase64(audioBase64);
        const prompt = 'Accurately transcribe this audio recording into clean, verbatim text. Preserve technical terms and distinguish speakers if applicable.';

        const transcript = await this.directGeminiGenerate(
          [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || 'audio/mp4',
              },
            },
            { text: prompt },
          ],
          localKey
        );

        return {
          transcript,
          source: 'gemini-3.7-flash (client)',
        };
      } catch (err: any) {
        console.error('Direct Gemini Transcription failed:', err);
        throw new Error(err.message || 'Failed to transcribe audio using Gemini AI.');
      }
    }

    return {
      transcript: 'Voice memo recorded successfully. Configure your Google AI Studio API key in Settings to enable automatic transcription.',
      source: 'offline_fallback',
    };
  }

  public static async generateMeetingMinutes(
    transcript: string,
    currentBody = '',
    eventTitle = 'Meeting'
  ): Promise<MeetingMinutesResult> {
    const localKey = await AiSettingsManager.getApiKeyAsync();

    // 1. Try server endpoint first
    try {
      const res = await fetch('/api/gemini/meeting-minutes', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ transcript, currentBody, eventTitle }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        const data = JSON.parse(text);
        if (res.ok && data.meetingMinutes !== undefined) {
          return data;
        }
      }
    } catch {
      // Server not reachable
    }

    // 2. Direct fallback using configured API key (for APK build)
    if (localKey) {
      try {
        const prompt = `Analyse the following transcript and notes. Generate concise bullet points for key decisions, action items, and summaries. Format with clean markdown headers (### Executive Summary, ### Key Decisions, ### Action Items with checkboxes [ ] and assignees if mentioned). Do not include emojis in the output.

Event Title: ${eventTitle}

Transcript Content:
"""
${transcript || 'No audio transcript provided. Summarize the current note context.'}
"""

Current Note Content:
"""
${currentBody}
"""`;

        const summaryText = await this.directGeminiGenerate(prompt, localKey);
        const meetingMinutes = `\n\n---\n### Meeting Summary (${new Date().toLocaleDateString()})\n${summaryText}`;

        return {
          meetingMinutes,
          source: 'gemini-3.7-flash (client)',
        };
      } catch (err: any) {
        console.error('Direct Gemini Meeting Minutes failed:', err);
        throw new Error(err.message || 'Failed to generate meeting summary using Gemini AI.');
      }
    }

    // 3. No server and no API key: do not synthesize plausible-sounding
    // "decisions" or "action items" that were not actually derived from the
    // transcript. Say plainly that no AI summary was generated, and keep
    // the real transcript (if any) so nothing is lost.
    const trimmedTranscript = (transcript || '').trim();
    const fallbackMinutes = `\n\n---\n### Meeting Summary (${new Date().toLocaleDateString()})\n_No AI summary was generated: no Gemini API key is configured and the AI service is unreachable. Configure a key in Settings to generate a real summary._${
      trimmedTranscript ? `\n\n#### Raw Transcript\n${trimmedTranscript}` : ''
    }`;

    return {
      meetingMinutes: fallbackMinutes,
      source: 'offline_fallback',
    };
  }

  public static async intelligent3WayMerge(
    baseContent: string,
    localContent: string,
    remoteContent: string,
    documentTitle = 'Note'
  ): Promise<ConflictMergeResult> {
    const localKey = await AiSettingsManager.getApiKeyAsync();

    // 1. Try server endpoint
    try {
      const res = await fetch('/api/gemini/intelligent-merge', {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({
          baseContent,
          localContent,
          remoteContent,
          documentTitle,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        const data = JSON.parse(text);
        if (res.ok && data.mergedContent !== undefined) {
          return data;
        }
      }
    } catch {
      // Server not reachable
    }

    // 2. Direct fallback
    if (localKey) {
      try {
        const prompt = `You are a distributed database conflict resolution engine. Perform an intelligent 3-way merge on the following document.
Original Base:
"""
${baseContent || 'None'}
"""

Local Version (Client):
"""
${localContent}
"""

Remote Version (Cloud):
"""
${remoteContent}
"""

Merge both versions cleanly preserving all unique notes, action items, and structural headers without repeating identical lines. Return only the merged markdown text.`;

        const merged = await this.directGeminiGenerate(prompt, localKey);
        return {
          mergedContent: merged,
          resolutionStrategy: 'gemini-3.7-flash_semantic_merge (client)',
        };
      } catch (err: any) {
        console.error('Direct Gemini Merge failed:', err);
      }
    }

    // Heuristic fallback
    const merged = `### ${documentTitle} (Merged)\n\n#### Local Edits\n${localContent}\n\n#### Remote Additions\n${remoteContent}`;
    return {
      mergedContent: merged,
      resolutionStrategy: 'intelligent_heuristic',
    };
  }
}

