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

  it('gives a distinct reason when audio is too long to convert safely', () => {
    const message = describeAudioImport({
      wasConversionSkipped: true,
      conversionSkipReason: 'too_long',
    });
    expect(message).toContain('longer than 10 minutes');
    expect(message).toContain('out of memory');
  });

  it('prefers the truncation notice when both limits apply', () => {
    const message = describeAudioImport({ wasTruncated: true, wasConversionSkipped: true });
    expect(message).toContain('30 minutes');
  });
});
