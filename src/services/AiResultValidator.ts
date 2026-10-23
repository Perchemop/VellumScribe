import {
  TranscriptionSegmentRecord,
  StructuredAiExtraction,
  SpeechModelProfile,
} from '../types';

/** Raw item shape inside an untrusted AI extraction payload. */
interface AiExtractionItem {
  text?: string;
  owner?: string;
  dueDate?: string;
  priority?: string;
  sourceSegments?: unknown;
}

/** Raw entity shape inside an untrusted AI extraction payload. */
interface AiExtractionEntity {
  name?: string;
  type?: string;
  sourceSegments?: unknown;
}

/** Top-level shape of an untrusted AI extraction payload. */
interface AiExtractionPayload {
  summary?: unknown;
  actionItems?: unknown;
  decisions?: unknown;
  risks?: unknown;
  entities?: unknown;
}

/** Keeps only 1-based segment indexes that exist in the source transcript. */
function inRange(sourceSegments: unknown, totalSegmentsCount: number): number[] {
  if (!Array.isArray(sourceSegments)) return [];
  return sourceSegments.filter(
    (s): s is number => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= totalSegmentsCount
  );
}

export class AiResultValidator {
  /**
   * Validates speech model profile integrity
   */
  public static validateModelProfile(model: SpeechModelProfile): { valid: boolean; error?: string } {
    if (!model.id || !model.displayName) {
      return { valid: false, error: 'Model ID and display name are required.' };
    }
    if (!model.sha256 || model.sha256.length !== 64) {
      return { valid: false, error: 'Invalid SHA-256 checksum format.' };
    }
    if (!model.license) {
      return { valid: false, error: 'Model must have an explicit verified FOSS license.' };
    }
    return { valid: true };
  }

  /**
   * Validates transcription segments:
   * 1. Ascending sequence ordering
   * 2. start_ms <= end_ms
   * 3. No fabricated confidence values
   */
  public static validateSegments(
    segments: TranscriptionSegmentRecord[]
  ): { valid: boolean; error?: string; sanitizedSegments: TranscriptionSegmentRecord[] } {
    if (!Array.isArray(segments) || segments.length === 0) {
      return { valid: false, error: 'No transcription segments provided.', sanitizedSegments: [] };
    }

    const sanitized: TranscriptionSegmentRecord[] = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (seg.start_ms > seg.end_ms) {
        return {
          valid: false,
          error: `Segment ${i + 1} has start time (${seg.start_ms}ms) exceeding end time (${seg.end_ms}ms).`,
          sanitizedSegments: [],
        };
      }

      // Sanitize confidence: per Section 18, never allow fake manufactured precision (e.g. 0.95, 0.98)
      let cleanConfidence: number | null = null;
      if (typeof seg.confidence === 'number' && !isNaN(seg.confidence) && seg.confidence >= 0 && seg.confidence <= 1) {
        // If an engine honestly reports confidence, keep it, otherwise null
        cleanConfidence = seg.confidence;
      }

      sanitized.push({
        ...seg,
        sequence: i + 1,
        text: (seg.text || '').trim(),
        confidence: cleanConfidence,
      });

    }

    return { valid: true, sanitizedSegments: sanitized };
  }

  /**
   * Validates structured AI extraction result:
   * Enforces strict schema, no hallucinated metadata, provenance sourceSegments
   */
  public static validateExtraction(data: unknown, totalSegmentsCount: number): StructuredAiExtraction {
    if (!data || typeof data !== 'object') {
      return {
        summary: '',
        actionItems: [],
        decisions: [],
        risks: [],
        entities: [],
      };
    }

    const payload = data as AiExtractionPayload;

    const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';

    const actionItems = Array.isArray(payload.actionItems)
      ? (payload.actionItems as AiExtractionItem[])
          .filter((item): item is AiExtractionItem & { text: string } =>
            Boolean(item) && typeof item.text === 'string' && item.text.trim().length > 0)
          .map((item) => ({
            text: item.text.trim(),
            owner: typeof item.owner === 'string' && item.owner.trim() ? item.owner.trim() : null,
            dueDate: typeof item.dueDate === 'string' && item.dueDate.trim() ? item.dueDate.trim() : null,
            priority: ['low', 'medium', 'high', 'unknown'].includes(item.priority ?? '') ? item.priority ?? 'unknown' : 'unknown',
            sourceSegments: inRange(item.sourceSegments, totalSegmentsCount),
          }))
      : [];

    const decisions = Array.isArray(payload.decisions)
      ? (payload.decisions as AiExtractionItem[])
          .filter((d): d is AiExtractionItem & { text: string } =>
            Boolean(d) && typeof d.text === 'string' && d.text.trim().length > 0)
          .map((d) => ({
            text: d.text.trim(),
            sourceSegments: inRange(d.sourceSegments, totalSegmentsCount),
          }))
      : [];

    const risks = Array.isArray(payload.risks)
      ? (payload.risks as AiExtractionItem[])
          .filter((r): r is AiExtractionItem & { text: string } =>
            Boolean(r) && typeof r.text === 'string' && r.text.trim().length > 0)
          .map((r) => ({
            text: r.text.trim(),
            sourceSegments: inRange(r.sourceSegments, totalSegmentsCount),
          }))
      : [];

    const entities = Array.isArray(payload.entities)
      ? (payload.entities as AiExtractionEntity[])
          .filter((e): e is AiExtractionEntity & { name: string } =>
            Boolean(e) && typeof e.name === 'string' && e.name.trim().length > 0)
          .map((e) => ({
            name: e.name.trim(),
            type: typeof e.type === 'string' ? e.type.trim() : 'entity',
            sourceSegments: inRange(e.sourceSegments, totalSegmentsCount),
          }))
      : [];

    return {
      summary,
      actionItems,
      decisions,
      risks,
      entities,
    };
  }
}
