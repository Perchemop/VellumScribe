/**
 * Token ledger — the suite-wide token accounting standard (guide.md §12.1).
 *
 * `docs/tokens.json` is the single source of truth for how many model tokens
 * this project has spent. It is updated by the release workflow on every semver
 * tag (see `scripts/tokens-ledger.ts`) and bundled into the app here so the UI
 * can show the figures without a network round-trip.
 *
 * Honesty rule (guide §II.29: never claim what was not measured): a value of
 * `0` means "not measured yet", never "zero tokens were used". Callers must say
 * so in words rather than presenting a zero as a measurement.
 */
import ledgerJson from '../../docs/tokens.json';

/** One recorded release and the number of tokens attributed to it. */
export interface TokenLedgerRelease {
  /** Semantic version string, e.g. `"3.1.1"`. */
  version: string;
  /** Tokens spent on that release. Never negative; `0` means "not measured". */
  tokens: number;
}

/** The full token ledger, mirroring `docs/tokens.json`. */
export interface TokenLedger {
  /** Optional human-readable note explaining how the ledger is maintained. */
  _notes?: string;
  /** Running total of tokens spent since the project started. */
  total_tokens_since_start: number;
  /** Tokens attributed to {@link TokenLedger.release_version}. */
  release_tokens: number;
  /** The release these figures describe. */
  release_version: string;
  /**
   * Per-release history. Ordered **newest-first** (index `0` is the most
   * recent release). Optional so hand-written ledgers stay valid.
   */
  releases?: TokenLedgerRelease[];
}

/** A fresh, documented empty ledger used when nothing readable is available. */
function emptyLedger(): TokenLedger {
  return {
    _notes:
      'No token ledger is available: docs/tokens.json was missing, unreadable, or did not contain a release_version with non-negative token counts.',
    total_tokens_since_start: 0,
    release_tokens: 0,
    release_version: '',
    releases: [],
  };
}

/** Narrow an unknown value to a plain JSON object (never arrays or `null`). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accept a token count only when it is a real, finite, non-negative number.
 *
 * Negative or non-numeric values (including numeric strings such as `"123"`)
 * are rejected rather than coerced, because a ledger that needs guesswork is
 * not a measurement. Returns `null` when the value cannot be trusted.
 */
function coerceCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/** Parse the optional `releases` history, dropping malformed entries. */
function parseReleases(value: unknown): TokenLedgerRelease[] {
  if (!Array.isArray(value)) return [];
  const releases: TokenLedgerRelease[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const version = item.version;
    const tokens = coerceCount(item.tokens);
    if (typeof version !== 'string' || version.trim() === '' || tokens === null) continue;
    releases.push({ version: version.trim(), tokens });
  }
  return releases;
}

/** Non-empty, trimmed string or `null`. */
function asVersion(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Parse and validate ledger JSON text.
 *
 * Never throws. Any unreadable input — `null`, `''`, malformed JSON, a missing
 * `release_version`, or a missing/negative/non-finite required token count —
 * yields a documented empty ledger and `available: false`, so the UI can say
 * "not recorded" instead of crashing or inventing a number.
 *
 * @param text Raw JSON text (typically the contents of `docs/tokens.json`).
 * @returns The validated ledger plus whether the input described one.
 */
export function readLedger(text: string | null | undefined): {
  ledger: TokenLedger;
  available: boolean;
} {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ledger: emptyLedger(), available: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* malformed JSON is not a ledger — degrade to the empty ledger below */
    return { ledger: emptyLedger(), available: false };
  }

  if (!isRecord(parsed)) {
    return { ledger: emptyLedger(), available: false };
  }

  const total = coerceCount(parsed.total_tokens_since_start);
  const releaseTokens = coerceCount(parsed.release_tokens);
  const version = asVersion(parsed.release_version);
  if (total === null || releaseTokens === null || version === null) {
    return { ledger: emptyLedger(), available: false };
  }

  // Build in canonical key order so a serialised round-trip matches the file.
  const ledger: TokenLedger = {
    ...(typeof parsed._notes === 'string' ? { _notes: parsed._notes } : {}),
    total_tokens_since_start: total,
    release_tokens: releaseTokens,
    release_version: version,
    releases: parseReleases(parsed.releases),
  };

  return { ledger, available: true };
}

/**
 * The ledger bundled into the app at build time from `docs/tokens.json`.
 *
 * The raw import is re-validated through {@link readLedger} so a malformed or
 * stripped file degrades to the documented empty ledger rather than crashing
 * the app at import time.
 */
const bundled = readLedger(typeof ledgerJson === 'undefined' ? null : JSON.stringify(ledgerJson));

/** The validated ledger, or the documented empty ledger when unavailable. */
export const TOKEN_LEDGER: TokenLedger = bundled.ledger;

/** `false` when `docs/tokens.json` is missing/unreadable, so callers can say "not recorded". */
export const TOKEN_LEDGER_AVAILABLE: boolean = bundled.available;

/**
 * Format a token count for humans.
 *
 * - `0` → `"0"`, `999` → `"999"`, `1234` → `"1,234"`, `45000` → `"45,000"`
 * - `1200000` → `"1.2M"`, `20948427` → `"20.9M"`, `12345678901` → `"12.3B"`
 *
 * Counts below one million are grouped with thousands separators; larger counts
 * are abbreviated to one decimal place. Negative or non-finite input is treated
 * as `0` (numbers are never negative in a ledger).
 *
 * @param n Token count.
 * @returns A stable, locale-independent human-readable string.
 */
export function formatTokens(n: number): string {
  const safe = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (safe >= 1_000_000_000_000) return `${(safe / 1_000_000_000_000).toFixed(1)}T`;
  if (safe >= 1_000_000_000) return `${(safe / 1_000_000_000).toFixed(1)}B`;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Pure update used by the release pipeline: record `tokens` for `version` and
 * return the new ledger. Never mutates its input.
 *
 * Idempotency rule: `releases` is the source of truth for the total. A repeated
 * `(version, tokens)` pair **replaces** that version's existing entry in place
 * (keeping its recorded position) instead of appending a second one, and the
 * running total is recomputed as `baseline + sum(releases)`, where `baseline`
 * is the part of the previous total not itemised in `releases` (tokens counted
 * before this history began). Re-applying the same pair is therefore a no-op.
 *
 * Ordering rule: the list is kept **newest-first**; a brand-new version is
 * inserted at index `0`, and re-applying an existing version leaves it where it
 * already sits.
 *
 * Negative, non-finite or fractional `tokens` are floored to `0` / their whole
 * part so the ledger never over-claims.
 *
 * @param ledger Current ledger.
 * @param version Release the tokens belong to; blank falls back to the ledger's own version.
 * @param tokens Tokens spent on that release.
 * @returns A new ledger with the release recorded once.
 */
export function applyRelease(ledger: TokenLedger, version: string, tokens: number): TokenLedger {
  const safeTokens =
    typeof tokens === 'number' && Number.isFinite(tokens) && tokens > 0 ? Math.floor(tokens) : 0;
  const safeVersion = asVersion(version) ?? ledger.release_version;

  // Copy (never mutate) the history, clamping every stored count so a
  // hand-edited negative entry can never corrupt the recomputed total.
  const releases = (ledger.releases ?? []).map((release) => ({
    version: release.version,
    tokens:
      typeof release.tokens === 'number' && Number.isFinite(release.tokens) && release.tokens > 0
        ? Math.floor(release.tokens)
        : 0,
  }));
  const previousSum = releases.reduce((sum, release) => sum + release.tokens, 0);
  const previousTotal =
    typeof ledger.total_tokens_since_start === 'number' &&
    Number.isFinite(ledger.total_tokens_since_start) &&
    ledger.total_tokens_since_start > 0
      ? Math.floor(ledger.total_tokens_since_start)
      : 0;
  const baseline = Math.max(0, previousTotal - previousSum);

  const index = releases.findIndex((release) => release.version === safeVersion);
  if (index >= 0) {
    releases[index] = { version: safeVersion, tokens: safeTokens };
  } else {
    releases.unshift({ version: safeVersion, tokens: safeTokens });
  }

  const total = baseline + releases.reduce((sum, release) => sum + release.tokens, 0);

  // Keep the canonical key order from docs/tokens.json so the write is stable.
  return {
    ...(typeof ledger._notes === 'string' ? { _notes: ledger._notes } : {}),
    total_tokens_since_start: total,
    release_tokens: safeTokens,
    release_version: safeVersion,
    releases,
  };
}

/**
 * Serialise a ledger for writing to disk.
 *
 * Emits exactly `JSON.stringify(ledger, null, 2) + '\n'`: the trailing newline
 * is what the repository's Prettier `format` gate expects, so the release job
 * can rewrite `docs/tokens.json` without reformatting it.
 *
 * @param ledger Ledger to serialise.
 * @returns Pretty-printed JSON text ending in a single newline.
 */
export function serialiseLedger(ledger: TokenLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

/** Render a count, or the honest phrase "not measured" when it is `0`. */
function measuredOrNot(count: number): string {
  return typeof count === 'number' && Number.isFinite(count) && count > 0
    ? formatTokens(count)
    : 'not measured';
}

/**
 * The markdown section appended to GitHub release notes.
 *
 * A `0` figure is reported as "not measured" in words — the ledger never
 * implies a measurement that was not taken.
 *
 * @param ledger Ledger for the release being published.
 * @returns A markdown section suitable for `gh release create --notes-file`.
 */
export function releaseNotesSection(ledger: TokenLedger): string {
  const version = asVersion(ledger.release_version);
  const lines = [
    '## Token ledger',
    '',
    `Token metrics${version ? ` for v${version}` : ''} are tracked in \`docs/tokens.json\` (guide.md §12.1).`,
    '',
    `- Tokens used for this release: ${measuredOrNot(ledger.release_tokens)}`,
    `- Tokens used since the project started: ${measuredOrNot(ledger.total_tokens_since_start)}`,
  ];
  // The legend exists only to define the phrase "not measured", so emit it
  // solely when at least one figure actually carries that phrase (a `0` in the
  // ledger means "not measured", never a real zero). Printing it next to two
  // measured figures is noise — and it made a real assertion meaningless.
  if (ledger.release_tokens === 0 || ledger.total_tokens_since_start === 0) {
    lines.push(
      '',
      '_Updated automatically by the release workflow on tag push. "not measured" means no figure has been recorded yet — it is not an estimate._'
    );
  }
  return lines.join('\n');
}
