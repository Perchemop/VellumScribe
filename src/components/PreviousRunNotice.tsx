import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Check, X } from 'lucide-react';
import { describePreviousRun, PreviousRunReport } from '../lib/previousRunNotice';
import { OfflineAiManager } from '../services/OfflineAiManager';
import { AppLogger } from '../lib/logger';

/**
 * Launch banner: if the previous session died during offline transcription,
 * say so in plain language, name the exact stage, and offer the raw trail for
 * copy — instead of leaving the user to hunt for a log export.
 *
 * Deliberately dismissible and non-blocking: it reports, it never gates the app.
 */
export const PreviousRunNotice: React.FC = () => {
  const [report, setReport] = useState<PreviousRunReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const trail = await OfflineAiManager.getInstance().readNativeCrashTrail();
        if (cancelled) return;
        const described = describePreviousRun(trail);
        if (described) {
          setReport(described);
          AppLogger.warn(
            'PreviousRunNotice',
            `Previous transcription run ended unexpectedly at ${described.lastStage}`
          );
        }
      } catch {
        /* diagnostics only — never surface an error for this */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!report || dismissed) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `VellumScribe diagnostics — previous run ended unexpectedly\n` +
          `Last stage: ${report.lastStage}\n\n${report.trail}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard may be unavailable; the trail is on screen to screenshot */
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-3 mt-2 p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs space-y-2"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 space-y-1">
          <p className="font-semibold">The previous session stopped unexpectedly</p>
          <p>{report.summary}</p>
          <details className="pt-1">
            <summary className="cursor-pointer font-medium">Show details</summary>
            <pre className="mt-1 p-2 rounded-lg bg-white/60 dark:bg-black/30 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px]">
              {report.trail}
            </pre>
          </details>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss previous-run notice"
          className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-2 pl-6">
        <button
          type="button"
          onClick={handleCopy}
          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center gap-1.5"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy diagnostics'}
        </button>
        <span className="text-[11px] opacity-80">
          Paste this into your report — it names the exact step that stopped.
        </span>
      </div>
    </div>
  );
};
