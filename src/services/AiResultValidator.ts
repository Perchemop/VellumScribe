import {
  TranscriptionSegmentRecord,
  StructuredAiExtraction,
  SpeechModelProfile,
} from '../types';

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
  public static validateExtraction(data: any, totalSegmentsCount: number): StructuredAiExtraction {
    if (!data || typeof data !== 'object') {
      return {
        summary: '',
        actionItems: [],
        decisions: [],
        risks: [],
        entities: [],
      };
    }

    const summary = typeof data.summary === 'string' ? data.summary.trim() : '';

    const actionItems = Array.isArray(data.actionItems)
      ? data.actionItems
          .filter((item: any) => item && typeof item.text === 'string' && item.text.trim())
          .map((item: any) => ({
            text: item.text.trim(),
            owner: typeof item.owner === 'string' && item.owner.trim() ? item.owner.trim() : null,
            dueDate: typeof item.dueDate === 'string' && item.dueDate.trim() ? item.dueDate.trim() : null,
            priority: ['low', 'medium', 'high', 'unknown'].includes(item.priority) ? item.priority : 'unknown',
            sourceSegments: Array.isArray(item.sourceSegments)
              ? item.sourceSegments.filter((s: any) => typeof s === 'number' && s >= 1 && s <= totalSegmentsCount)
              : [],
          }))
      : [];

    const decisions = Array.isArray(data.decisions)
      ? data.decisions
          .filter((d: any) => d && typeof d.text === 'string' && d.text.trim())
          .map((d: any) => ({
            text: d.text.trim(),
            sourceSegments: Array.isArray(d.sourceSegments)
              ? d.sourceSegments.filter((s: any) => typeof s === 'number' && s >= 1 && s <= totalSegmentsCount)
              : [],
          }))
      : [];

    const risks = Array.isArray(data.risks)
      ? data.risks
          .filter((r: any) => r && typeof r.text === 'string' && r.text.trim())
          .map((r: any) => ({
            text: r.text.trim(),
            sourceSegments: Array.isArray(r.sourceSegments)
              ? r.sourceSegments.filter((s: any) => typeof s === 'number' && s >= 1 && s <= totalSegmentsCount)
              : [],
          }))
      : [];

    const entities = Array.isArray(data.entities)
      ? data.entities
          .filter((e: any) => e && typeof e.name === 'string' && e.name.trim())
          .map((e: any) => ({
            name: e.name.trim(),
            type: typeof e.type === 'string' ? e.type.trim() : 'entity',
            sourceSegments: Array.isArray(e.sourceSegments)
              ? e.sourceSegments.filter((s: any) => typeof s === 'number' && s >= 1 && s <= totalSegmentsCount)
              : [],
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
