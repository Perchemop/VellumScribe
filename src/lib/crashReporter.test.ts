import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashReporter, redactSecrets } from './crashReporter';
import { AppLogger } from './logger';

describe('CrashReporter (3.3.0 consent-gated crash reporting)', () => {
  beforeEach(() => {
    localStorage.clear();
    AppLogger.clearLogs();
    vi.restoreAllMocks();
  });

  it('redacts bearer tokens, API keys, and PATs', () => {
    expect(redactSecrets('Authorization: Bearer abc.def.ghi')).toContain('[REDACTED]');
    expect(redactSecrets('key AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456')).toContain('[REDACTED]');
    expect(redactSecrets('ghp_' + 'a'.repeat(36))).toContain('[REDACTED]');
    expect(redactSecrets('no secrets here')).toBe('no secrets here');
  });

  it('builds a report with version, platform, error, and redacted logs', () => {
    AppLogger.error('TestCategory', 'Something failed with Bearer supersecrettoken');
    const error = new Error('Boom at render');
    error.stack = 'Error: Boom at render\n    at Component (file.tsx:1:1)';

    const report = CrashReporter.buildReport(error, {
      appVersion: '9.9.9',
      platform: 'web',
      componentStack: 'in Component\n in App',
      userAgent: 'test-agent',
    });

    expect(report.title).toContain('Boom at render');
    expect(report.title.startsWith('[Crash]')).toBe(true);
    expect(report.labels).toContain('crash-report');
    expect(report.body).toContain('App version:** 9.9.9');
    expect(report.body).toContain('Platform:** web');
    expect(report.body).toContain('test-agent');
    expect(report.body).toContain('Boom at render');
    expect(report.body).toContain('in Component');
    // The logged bearer token must be redacted in the report body
    expect(report.body).not.toContain('supersecrettoken');
  });

  it('handles a non-Error crash value', () => {
    const report = CrashReporter.buildReport('plain string crash');
    expect(report.title).toContain('plain string crash');
    expect(report.body).toContain('plain string crash');
  });

  it('produces a prefilled GitHub issue URL', () => {
    const report = CrashReporter.buildReport(new Error('X'));
    const url = CrashReporter.prefilledIssueUrl(report, 'Owner/Repo');
    expect(url.startsWith('https://github.com/Owner/Repo/issues/new?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('title')).toBe(report.title);
    expect(params.get('body')).toBe(report.body);
  });

  it('stores and clears a user GitHub token', async () => {
    expect(await CrashReporter.getGitHubToken()).toBeNull();
    await CrashReporter.setGitHubToken('ghp_testtoken1234567890');
    expect(await CrashReporter.getGitHubToken()).toBe('ghp_testtoken1234567890');
    await CrashReporter.setGitHubToken('');
    expect(await CrashReporter.getGitHubToken()).toBeNull();
  });

  it('refuses to submit without a token', async () => {
    const report = CrashReporter.buildReport(new Error('X'));
    const result = await CrashReporter.submitReport(report, '');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/token/i);
  });

  it('submits a report and returns the issue URL', async () => {
    const report = CrashReporter.buildReport(new Error('X'));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/Perchemop/VellumScribe/issues/999' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await CrashReporter.submitReport(report, 'ghp_token', 'Perchemop/VellumScribe');
    expect(result.success).toBe(true);
    expect(result.issueUrl).toContain('/issues/999');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports a GitHub error response without throwing', async () => {
    const report = CrashReporter.buildReport(new Error('X'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Bad credentials' }),
      }))
    );

    const result = await CrashReporter.submitReport(report, 'bad-token');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad credentials');
  });
});
