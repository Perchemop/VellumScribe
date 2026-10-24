import React, { useEffect, useState } from 'react';
import { Bug, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { CrashReporter } from '../../lib/crashReporter';
import { AppLogger } from '../../lib/logger';

/**
 * Settings → Advanced → Crash reporting.
 *
 * Consent-gated, bring-your-own-token crash reporting. Nothing is ever sent
 * automatically; the token is stored in the device keystore and only used when
 * the user submits a report.
 */
export const CrashReportingPanel: React.FC = () => {
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    CrashReporter.getGitHubToken().then((t) => setHasToken(Boolean(t)));
  }, []);

  const handleSave = async () => {
    try {
      await CrashReporter.setGitHubToken(token);
      const stored = await CrashReporter.getGitHubToken();
      setHasToken(Boolean(stored));
      setToken('');
      setStatus(
        stored
          ? 'GitHub token saved to the device keystore.'
          : 'GitHub token removed from the device keystore.'
      );
    } catch (e) {
      AppLogger.error('CrashReporting', 'Failed to save token', e);
      setStatus('Could not save the token.');
    }
  };

  const handleTestReport = async () => {
    setIsSending(true);
    setStatus(null);
    try {
      const stored = await CrashReporter.getGitHubToken();
      if (!stored) {
        setStatus('Add a GitHub token first to submit reports directly.');
        return;
      }
      const report = CrashReporter.buildReport(new Error('Test crash report from Settings'), {
        componentStack: 'settings/test',
      });
      const result = await CrashReporter.submitReport(report, stored);
      setStatus(
        result.success
          ? `Report submitted: ${result.issueUrl}`
          : `Submit failed: ${result.error || 'unknown error'}`
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-5 bg-white dark:bg-[#121216] border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Bug className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Crash reporting</h3>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Nothing is ever sent automatically. If the app crashes you can review a redacted report and
        submit it yourself. To file issues directly, add a personal GitHub token (stored only on
        this device). Without a token you can still copy the report or open a prefilled issue.
      </p>

      <div className="space-y-2">
        <label
          htmlFor="crash-gh-token"
          className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
        >
          GitHub token {hasToken ? '(configured)' : '(not set)'}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="crash-gh-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_… or github_pat_…"
            autoComplete="off"
            className="flex-1 min-w-[12rem] px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 min-h-[44px]"
          >
            Save
          </button>
          {hasToken && (
            <button
              type="button"
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 min-h-[44px]"
              title="Clear the stored token"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={isSending}
        onClick={() => void handleTestReport()}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 min-h-[44px] disabled:opacity-50"
      >
        {isSending ? 'Submitting…' : 'Submit a test report'}
      </button>

      {status && (
        <p
          role="status"
          className="text-xs flex items-start gap-1.5 text-zinc-600 dark:text-zinc-300"
        >
          {status.toLowerCase().includes('fail') || status.toLowerCase().includes('could not') ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          )}
          {status}
        </p>
      )}
    </div>
  );
};
