import { AppLogger } from './logger';
import { AndroidKeystoreManager } from './keystore';
import { asErrorLike } from './errorLike';

/**
 * Consent-gated, privacy-preserving crash reporting.
 *
 * Design (guide §20, §23; ROADMAP 3.3.0):
 *  - Nothing is ever sent automatically. A crash is captured locally; the user
 *    must explicitly choose to submit a report.
 *  - Reports are built from redacted diagnostics only: app version, platform,
 *    the error message/stack, the component stack, and the already-redacted log
 *    tail (`AppLogger` strips tokens, keys, PINs before they enter a log entry).
 *  - Submission uses the **user's own** GitHub token (BYO), stored in the device
 *    keystore — never a bundled or server-side token. Without a token the user
 *    can still copy the report or open a prefilled GitHub issue URL.
 */
export interface CrashReport {
  title: string;
  body: string;
  labels: string[];
}

export interface CrashReportContext {
  appVersion?: string;
  platform?: string;
  userAgent?: string;
  componentStack?: string;
  repo?: string;
}

/** Redact obvious secrets that could reach an error string before it is logged. */
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9_\-.+=/]+/gi,
  /(?:AIza[0-9A-Za-z\-_]{35})/g,
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /gsk_[A-Za-z0-9\-_]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

const APP_VERSION = '3.1.0'; // keep in sync with package.json

export class CrashReporter {
  private static readonly GH_TOKEN_ALIAS = 'github_issue_token';
  private static readonly DEFAULT_REPO = 'Perchemop/VellumScribe';

  /** Detect the runtime platform without depending on Capacitor at module load. */
  private static detectPlatform(): string {
    try {
      if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
        return 'android';
      }
      if (typeof navigator !== 'undefined' && navigator.userAgent) return 'web';
    } catch {
      /* ignore */
    }
    return 'unknown';
  }

  /**
   * Build a redacted, user-readable crash report. Never include note content,
   * user input, or secrets.
   */
  public static buildReport(error: Error | unknown, context: CrashReportContext = {}): CrashReport {
    const err = asErrorLike(error);
    const message = redactSecrets(err?.message || String(error || 'Unknown error'));
    const stack = redactSecrets(err?.stack || '(no stack)');
    const componentStack = context.componentStack
      ? redactSecrets(context.componentStack)
      : '(not captured)';
    const platform = context.platform || this.detectPlatform();
    const appVersion = context.appVersion || APP_VERSION;
    const userAgent =
      context.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown');

    const logs = AppLogger.getLogs()
      .slice(0, 40)
      .map((l) => `${l.timestamp} [${l.level}] [${l.category}] ${l.message}`)
      .join('\n');

    const title = `[Crash] ${message.split('\n')[0].slice(0, 80)}`.trim();
    const body = [
      '## In-app crash report',
      '',
      `- **App version:** ${appVersion}`,
      `- **Platform:** ${platform}`,
      `- **When:** ${new Date().toISOString()}`,
      `- **User agent:** ${userAgent}`,
      '',
      '### Error message',
      '',
      '```',
      message,
      '```',
      '',
      '### Stack',
      '',
      '```',
      stack,
      '```',
      '',
      '### Component stack',
      '',
      '```',
      componentStack,
      '```',
      '',
      '### Recent logs (redacted)',
      '',
      '```',
      logs || '(no logs captured)',
      '```',
      '',
      '---',
      '_Submitted with explicit user consent. Logs are redacted: no PINs, API keys, or tokens are included._',
    ].join('\n');

    return { title, body, labels: ['bug', 'crash-report'] };
  }

  /** GitHub token the user supplied for filing issues (BYO). */
  public static async getGitHubToken(): Promise<string | null> {
    try {
      return await AndroidKeystoreManager.getSecret(this.GH_TOKEN_ALIAS);
    } catch {
      return null;
    }
  }

  public static async setGitHubToken(token: string): Promise<void> {
    const trimmed = token.trim();
    if (!trimmed) {
      await AndroidKeystoreManager.deleteSecret(this.GH_TOKEN_ALIAS);
      return;
    }
    await AndroidKeystoreManager.saveSecret(this.GH_TOKEN_ALIAS, trimmed, 'api_key');
  }

  public static hasGitHubToken(): boolean {
    return AndroidKeystoreManager.listSecrets().some((s) => s.alias === this.GH_TOKEN_ALIAS);
  }

  /** A prefilled "new issue" URL — the no-token fallback. */
  public static prefilledIssueUrl(report: CrashReport, repo = this.DEFAULT_REPO): string {
    const params = new URLSearchParams({ title: report.title, body: report.body });
    return `https://github.com/${repo}/issues/new?${params.toString()}`;
  }

  /**
   * Submit a report as a GitHub issue using the user's own token.
   * Returns the issue URL on success; never throws.
   */
  public static async submitReport(
    report: CrashReport,
    token: string,
    repo = this.DEFAULT_REPO
  ): Promise<{ success: boolean; issueUrl?: string; error?: string }> {
    if (!token || !token.trim()) {
      return { success: false, error: 'A GitHub token is required to submit a report.' };
    }
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: report.title,
          body: report.body,
          labels: report.labels,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        html_url?: string;
        message?: string;
      } | null;
      if (res.ok && data?.html_url) {
        AppLogger.info('CrashReporter', 'Crash report submitted to GitHub Issues');
        return { success: true, issueUrl: data.html_url };
      }
      return { success: false, error: data?.message || `GitHub responded ${res.status}.` };
    } catch (_e) {
      const e = asErrorLike(_e);
      return { success: false, error: e?.message || 'Network error submitting the report.' };
    }
  }
}
