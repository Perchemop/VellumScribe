/**
 * Pure helpers behind the standard "Release Notes" popup (guide §12.1 suite
 * standard).
 *
 * Everything here is free of React, storage and network so each branch — the
 * honest opt-in metrics copy, the safe update-link fallback, and the
 * per-release usage grouping — is unit-testable headlessly. (This repo's test
 * environment is node with no DOM.)
 */

/**
 * Canonical releases page. Always an https URL, and the mandatory fallback for
 * any update link that is missing, malformed, or not https.
 */
export const RELEASES_PAGE_URL = 'https://github.com/Perchemop/VellumScribe/releases';

/**
 * Bucket name for usage events that carry no usable version string. It is a
 * marker, never rendered as a version number.
 */
export const UNKNOWN_VERSION_BUCKET = 'unknown';

/** Minimal shape of a usage event needed to group it by release. */
export interface UsageEventLike {
  event: string;
  version?: string;
  timestamp?: string;
}

/** Aggregated app usage for a single app version. */
export interface UsageByVersion {
  version: string;
  total: number;
  byEvent: Record<string, number>;
}

interface UsageBucket {
  version: string;
  total: number;
  byEvent: Record<string, number>;
  latestTimestamp: string;
}

/** Natural (numeric-aware) descending order, used to break timestamp ties. */
function versionRank(a: string, b: string): number {
  return b.localeCompare(a, 'en', { numeric: true });
}

/**
 * Group recorded usage events by the app version that produced them.
 *
 * Returns buckets newest-first: ordered by the most recent event timestamp,
 * then by version number, with the {@link UNKNOWN_VERSION_BUCKET} bucket always
 * last. Blank or missing version strings are bucketed as
 * {@link UNKNOWN_VERSION_BUCKET} rather than being shown as a version number.
 */
export function summariseUsageByVersion(events: readonly UsageEventLike[]): UsageByVersion[] {
  const buckets = new Map<string, UsageBucket>();

  for (const entry of events) {
    const rawVersion = typeof entry.version === 'string' ? entry.version.trim() : '';
    const version = rawVersion.length > 0 ? rawVersion : UNKNOWN_VERSION_BUCKET;
    const rawEvent = typeof entry.event === 'string' ? entry.event.trim() : '';
    const eventName = rawEvent.length > 0 ? rawEvent : UNKNOWN_VERSION_BUCKET;
    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : '';

    let bucket = buckets.get(version);
    if (!bucket) {
      bucket = { version, total: 0, byEvent: {}, latestTimestamp: '' };
      buckets.set(version, bucket);
    }

    bucket.total += 1;
    bucket.byEvent[eventName] = (bucket.byEvent[eventName] ?? 0) + 1;
    if (timestamp > bucket.latestTimestamp) bucket.latestTimestamp = timestamp;
  }

  return [...buckets.values()]
    .sort((a, b) => {
      const aUnknown = a.version === UNKNOWN_VERSION_BUCKET;
      const bUnknown = b.version === UNKNOWN_VERSION_BUCKET;
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      if (a.latestTimestamp !== b.latestTimestamp) {
        return a.latestTimestamp < b.latestTimestamp ? 1 : -1;
      }
      return versionRank(a.version, b.version);
    })
    .map((bucket) => ({
      version: bucket.version,
      total: bucket.total,
      byEvent: bucket.byEvent,
    }));
}

/**
 * Human label for a usage bucket. The {@link UNKNOWN_VERSION_BUCKET} marker is
 * never presented as a version number.
 */
export function usageVersionLabel(version: string): string {
  return version === UNKNOWN_VERSION_BUCKET ? 'Version not recorded' : `Version ${version}`;
}

/** The subset of an update-check result the popup needs in order to render. */
export interface UpdateCheckResultLike {
  isUpToDate: boolean;
  latestVersion: string;
  releaseDate: string;
  hasUpdate: boolean;
  checked: boolean;
  message: string;
  release?: { apkDownloadUrl?: string } | null;
}

/** True only for a well-formed absolute `https:` URL. */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve the update link to open.
 *
 * Security rule: a candidate link is only used when it parses as an absolute
 * `https:` URL. Anything else — `http:`, `javascript:`, `data:`, relative or
 * malformed — falls back to {@link RELEASES_PAGE_URL}, which is always safe.
 *
 * The return value is the **normalised** absolute URL (`new URL(trimmed).href`),
 * never the raw candidate: `'HTTPS://EXAMPLE.COM/'` comes back as
 * `'https://example.com/'` and a backslash form such as `'https:\\/\\/evil'` as
 * `'https://evil/'`. Normalising is what the popup actually opens, so the
 * value it renders, tests against and hands to `window.open` are all one and
 * the same string. A userinfo component (`https://user@host/`) is still an
 * `https:` link and is accepted as-is — it cannot execute script, so rejecting
 * or stripping it would add behaviour with no security gain.
 */
export function resolveReleaseHref(candidate: string | null | undefined): string {
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && isHttpsUrl(trimmed)) return new URL(trimmed).href;
  }
  return RELEASES_PAGE_URL;
}

/** Discriminated result of an update check, as rendered by the popup footer. */
export type UpdateAction =
  | { kind: 'checking' }
  | { kind: 'up-to-date'; version: string }
  | { kind: 'available'; version: string; releaseDate: string; href: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'error'; message: string };

/**
 * Turn a raw update-check result into the single action the popup renders.
 *
 * Pass `null`/`undefined` while a check is in flight (→ `checking`), an
 * `errorMessage` when the check threw (→ `error`), or the resolved result
 * otherwise (→ `available` / `up-to-date` / `unavailable`). An `available`
 * action always carries a safe https link (see {@link resolveReleaseHref}).
 */
export function resolveUpdateAction(
  result: UpdateCheckResultLike | null | undefined,
  errorMessage?: string
): UpdateAction {
  if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
    return { kind: 'error', message: errorMessage.trim() };
  }
  if (!result) return { kind: 'checking' };
  if (!result.checked) {
    return { kind: 'unavailable', message: result.message };
  }
  if (result.hasUpdate) {
    return {
      kind: 'available',
      version: result.latestVersion,
      releaseDate: result.releaseDate,
      href: resolveReleaseHref(result.release?.apkDownloadUrl),
    };
  }
  return { kind: 'up-to-date', version: result.latestVersion };
}

/** Which honest variant the usage section is in. */
export type MetricsSectionKind = 'disabled' | 'empty' | 'recorded';

/** The heading/body/shape decided for the usage section. */
export interface MetricsSectionCopy {
  kind: MetricsSectionKind;
  heading: string;
  body: string;
  /** True only when the section may render real counters. */
  showsCounts: boolean;
}

/**
 * Decide the honest copy for the "app usage" section.
 *
 * Opt-in rules from PrivacyManager: when metrics are disabled the section says
 * recording is off (opt-in, local-only) and never renders zeros as if they
 * were usage data; when enabled but empty it says there is no recorded usage
 * yet. Counters are only shown when there is real usage to show.
 */
export function describeMetricsSection(
  enabled: boolean,
  groups: readonly UsageByVersion[]
): MetricsSectionCopy {
  if (!enabled) {
    return {
      kind: 'disabled',
      heading: 'Usage recording is off',
      body: 'Usage signals are opt-in and stay on this device. Nothing has been recorded, so no usage figures are shown here.',
      showsCounts: false,
    };
  }
  if (groups.length === 0) {
    return {
      kind: 'empty',
      heading: 'No usage recorded yet',
      body: 'Usage recording is on, but there is no recorded usage yet. Counts will appear here after you use the app.',
      showsCounts: false,
    };
  }
  return {
    kind: 'recorded',
    heading: 'This release — app usage',
    body: 'Anonymous app-event counts recorded on this device. Never note content, and never personal data.',
    showsCounts: true,
  };
}

/** Minimal shape of the shared token ledger needed to render its figures. */
export interface TokenLedgerLike {
  total_tokens_since_start: number;
  release_tokens: number;
  release_version: string;
}

/** Resolved token-metrics view: formatted figures, or the honest "not recorded" copy. */
export interface TokenMetricsView {
  available: boolean;
  total: string | null;
  release: string | null;
  releaseVersion: string | null;
  note: string;
}

/** Honest wording for a figure that was never measured (a zero in the ledger). */
export const TOKEN_NOT_MEASURED = 'not measured';

/**
 * Resolve the token-metrics view for the popup.
 *
 * The ledger's own honesty rule (guide §II.29) applies: `0` means "not measured
 * yet", never "zero tokens were used". So when this build carries no recorded
 * ledger (`available === false`) the figures are withheld and `note` states
 * plainly that they are not recorded; a recorded ledger whose count is still
 * `0` renders as {@link TOKEN_NOT_MEASURED} rather than a zero presented as a
 * measurement. The formatter is injected to keep this helper pure and free of
 * the ledger module.
 */
export function describeTokenMetrics(
  available: boolean,
  ledger: TokenLedgerLike | null | undefined,
  format: (value: number) => string
): TokenMetricsView {
  if (!available || !ledger) {
    return {
      available: false,
      total: null,
      release: null,
      releaseVersion: null,
      note: 'Token figures are not recorded in this build.',
    };
  }
  const measured = (value: number): string =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? format(value)
      : TOKEN_NOT_MEASURED;
  return {
    available: true,
    total: measured(ledger.total_tokens_since_start),
    release: measured(ledger.release_tokens),
    releaseVersion: ledger.release_version,
    note: `Token figures come from the release ledger recorded in this build; "${TOKEN_NOT_MEASURED}" means no figure has been recorded yet.`,
  };
}
