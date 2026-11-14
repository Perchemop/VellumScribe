import { describe, expect, it } from 'vitest';
import ledgerJson from '../../docs/tokens.json';
import { CURRENT_APP_VERSION } from './appUpdateManager';
import {
  applyRelease,
  formatTokens,
  readLedger,
  releaseNotesSection,
  serialiseLedger,
  TOKEN_LEDGER,
  TOKEN_LEDGER_AVAILABLE,
  type TokenLedger,
} from './tokenLedger';

/** A minimal, valid ledger used as the starting point for mutation tests. */
function baseLedger(overrides: Partial<TokenLedger> = {}): TokenLedger {
  return {
    total_tokens_since_start: 0,
    release_tokens: 0,
    release_version: '3.1.1',
    releases: [],
    ...overrides,
  };
}

describe('formatTokens', () => {
  it('renders small counts verbatim and groups thousands below one million', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1000)).toBe('1,000');
    expect(formatTokens(1234)).toBe('1,234');
    expect(formatTokens(45000)).toBe('45,000');
    expect(formatTokens(999999)).toBe('999,999');
  });

  it('abbreviates millions with one decimal place', () => {
    expect(formatTokens(1000000)).toBe('1.0M');
    expect(formatTokens(1200000)).toBe('1.2M');
    expect(formatTokens(20948427)).toBe('20.9M');
  });

  it('abbreviates billions for very large counts', () => {
    expect(formatTokens(12345678901)).toBe('12.3B');
  });

  it('never emits a negative figure', () => {
    expect(formatTokens(-5)).toBe('0');
    expect(formatTokens(Number.NaN)).toBe('0');
  });
});

describe('readLedger', () => {
  it('parses a valid ledger and marks it available', () => {
    const text = JSON.stringify({
      _notes: 'note',
      total_tokens_since_start: 20948427,
      release_tokens: 45000,
      release_version: '3.1.1',
      releases: [
        { version: '3.1.1', tokens: 45000 },
        { version: '3.0.0', tokens: 100000 },
      ],
    });

    const { ledger, available } = readLedger(text);
    expect(available).toBe(true);
    expect(ledger.total_tokens_since_start).toBe(20948427);
    expect(ledger.release_tokens).toBe(45000);
    expect(ledger.release_version).toBe('3.1.1');
    expect(ledger.releases).toEqual([
      { version: '3.1.1', tokens: 45000 },
      { version: '3.0.0', tokens: 100000 },
    ]);
  });

  it('reports available: false when required fields are missing', () => {
    const { available } = readLedger(JSON.stringify({ release_version: '3.1.1' }));
    expect(available).toBe(false);
  });

  it('reports available: false for non-numeric string counts', () => {
    const { available } = readLedger(
      JSON.stringify({
        total_tokens_since_start: 'many',
        release_tokens: '123',
        release_version: '3.1.1',
      })
    );
    expect(available).toBe(false);
  });

  it('reports available: false for a negative running total', () => {
    const { available, ledger } = readLedger(
      JSON.stringify({
        total_tokens_since_start: -5,
        release_tokens: 0,
        release_version: '3.1.1',
      })
    );
    expect(available).toBe(false);
    expect(ledger.total_tokens_since_start).toBe(0);
  });

  it('reports available: false for null, empty and whitespace input', () => {
    expect(readLedger(null).available).toBe(false);
    expect(readLedger(undefined).available).toBe(false);
    expect(readLedger('').available).toBe(false);
    expect(readLedger('   ').available).toBe(false);
  });

  it('never throws on malformed JSON and reports available: false', () => {
    expect(() => readLedger('{ not json')).not.toThrow();
    expect(readLedger('{ not json').available).toBe(false);
    expect(readLedger('[]').available).toBe(false);
    expect(readLedger('42').available).toBe(false);
  });

  it('drops malformed release history entries but keeps the ledger', () => {
    const { ledger, available } = readLedger(
      JSON.stringify({
        total_tokens_since_start: 100,
        release_tokens: 100,
        release_version: '3.1.1',
        releases: [
          { version: '3.1.1', tokens: 100 },
          { version: '', tokens: 5 },
          { version: '2.9.0', tokens: -1 },
          null,
        ],
      })
    );
    expect(available).toBe(true);
    expect(ledger.releases).toEqual([{ version: '3.1.1', tokens: 100 }]);
  });
});

describe('applyRelease', () => {
  it('increments the running total and records the release newest-first', () => {
    const first = applyRelease(baseLedger(), '3.0.0', 100);
    expect(first.total_tokens_since_start).toBe(100);
    expect(first.release_tokens).toBe(100);
    expect(first.release_version).toBe('3.0.0');
    expect(first.releases).toEqual([{ version: '3.0.0', tokens: 100 }]);

    const second = applyRelease(first, '3.1.1', 50);
    expect(second.total_tokens_since_start).toBe(150);
    expect(second.release_version).toBe('3.1.1');
    // Newest first: the latest release sits at index 0.
    expect(second.releases).toEqual([
      { version: '3.1.1', tokens: 50 },
      { version: '3.0.0', tokens: 100 },
    ]);
  });

  it('does not double count when the same version is re-applied', () => {
    const once = applyRelease(baseLedger(), '3.1.1', 1234);
    const twice = applyRelease(once, '3.1.1', 1234);

    expect(twice.total_tokens_since_start).toBe(1234);
    expect(twice.releases).toEqual([{ version: '3.1.1', tokens: 1234 }]);
  });

  it('replaces an existing version in place, preserving its recorded position', () => {
    let ledger = applyRelease(baseLedger(), '3.0.0', 100);
    ledger = applyRelease(ledger, '3.1.1', 200);
    ledger = applyRelease(ledger, '3.0.0', 400);

    expect(ledger.total_tokens_since_start).toBe(600);
    expect(ledger.releases).toEqual([
      { version: '3.1.1', tokens: 200 },
      { version: '3.0.0', tokens: 400 },
    ]);
  });

  it('treats negative tokens as zero', () => {
    const ledger = applyRelease(baseLedger(), '3.1.1', -500);
    expect(ledger.release_tokens).toBe(0);
    expect(ledger.total_tokens_since_start).toBe(0);
    expect(ledger.releases).toEqual([{ version: '3.1.1', tokens: 0 }]);
  });

  it('preserves the part of the total not itemised in the release history', () => {
    // 5000 was spent before the per-release history began; only 100 is listed.
    const ledger = applyRelease(
      baseLedger({ total_tokens_since_start: 5000, releases: [{ version: '2.9.0', tokens: 100 }] }),
      '3.1.1',
      300
    );
    expect(ledger.total_tokens_since_start).toBe(5300);
  });

  it('does not mutate its input ledger', () => {
    const input = baseLedger();
    applyRelease(input, '3.1.1', 1000);
    expect(input.total_tokens_since_start).toBe(0);
    expect(input.releases).toEqual([]);
  });
});

describe('serialiseLedger', () => {
  it('emits pretty JSON with exactly one trailing newline', () => {
    const ledger = baseLedger({
      _notes: 'note',
      total_tokens_since_start: 1234,
      release_tokens: 1234,
      releases: [{ version: '3.1.1', tokens: 1234 }],
    });

    const text = serialiseLedger(ledger);
    expect(text).toBe(`${JSON.stringify(ledger, null, 2)}\n`);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('round-trips through readLedger', () => {
    const ledger = applyRelease(baseLedger({ _notes: 'note' }), '3.1.1', 45000);
    const { ledger: parsed, available } = readLedger(serialiseLedger(ledger));
    expect(available).toBe(true);
    expect(parsed).toEqual(ledger);
  });
});

describe('releaseNotesSection', () => {
  it('names the version and the formatted figures', () => {
    const section = releaseNotesSection(
      baseLedger({
        total_tokens_since_start: 20948427,
        release_tokens: 45000,
        release_version: '3.1.1',
      })
    );

    expect(section).toContain('3.1.1');
    expect(section).toContain('45,000');
    expect(section).toContain('20.9M');
    expect(section).not.toContain('not measured');
  });

  it('says "not measured" in words instead of implying a zero measurement', () => {
    const section = releaseNotesSection(
      baseLedger({ total_tokens_since_start: 0, release_tokens: 0, release_version: '3.1.1' })
    );

    expect(section).toContain('3.1.1');
    expect(section).toContain('not measured');
  });
});

describe('the shipped docs/tokens.json', () => {
  it('parses and stays in step with the app version', () => {
    const { ledger, available } = readLedger(JSON.stringify(ledgerJson));

    expect(available).toBe(true);
    expect(ledger.release_version).toBe(CURRENT_APP_VERSION);
    expect(ledger.total_tokens_since_start).toBeGreaterThanOrEqual(0);
    expect(ledger.release_tokens).toBeGreaterThanOrEqual(0);
  });

  it('is bundled into the app as an available ledger', () => {
    expect(TOKEN_LEDGER_AVAILABLE).toBe(true);
    expect(TOKEN_LEDGER.release_version).toBe(CURRENT_APP_VERSION);
  });
});
