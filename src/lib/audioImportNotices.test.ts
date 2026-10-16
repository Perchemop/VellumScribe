import { describe, expect, it } from 'vitest';
import { describeAudioImport } from './audioImportNotices';

describe('describeAudioImport', () => {
  it('returns null for audio that was fully prepared', () => {
    expect(describeAudioImport({})).toBeNull();
    expect(describeAudioImport({ wasTruncated: false, wasConversionSkipped: false })).toBeNull();
  });

  it('explains the 30-minute cap when resampling truncated the audio', () => {
    const message = describeAudioImport({ wasTruncated: true });
    expect(message).toContain('30 minutes');
  });

  it('explains the skipped downsample for oversized files', () => {
    const message = describeAudioImport({ wasConversionSkipped: true });
    expect(message).toContain('downsampling');
  });

  it('prefers the truncation notice when both limits apply', () => {
    const message = describeAudioImport({ wasTruncated: true, wasConversionSkipped: true });
    expect(message).toContain('30 minutes');
  });
});
