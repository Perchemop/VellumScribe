import React, { useCallback, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  Coins,
  ExternalLink,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  APP_CHANGELOGS,
  AppUpdateManager,
  CURRENT_APP_VERSION,
  CURRENT_BUILD_NUMBER,
} from '../lib/appUpdateManager';
import { MetricsManager } from '../lib/metricsManager';
import { TOKEN_LEDGER, TOKEN_LEDGER_AVAILABLE, formatTokens } from '../lib/tokenLedger';
import { BrandMarkGlyph } from './BrandMarkGlyph';
import { useModalBackHandler } from '../lib/modalBackStack';
import { useDialogFocusTrap } from '../lib/dialogFocus';
import { asErrorLike } from '../lib/errorLike';
import {
  describeMetricsSection,
  describeTokenMetrics,
  resolveUpdateAction,
  summariseUsageByVersion,
  usageVersionLabel,
  type UpdateAction,
} from '../lib/releaseNotes';

interface ReleaseNotesModalProps {
  onClose: () => void;
}

type RemoteUpdateResult = Awaited<ReturnType<typeof AppUpdateManager.checkForRemoteUpdates>>;

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'done'; result: RemoteUpdateResult }
  | { status: 'error'; message: string };

/** Renders the resolved (non-checking) update action. Never auto-installs. */
const UpdateResultPanel: React.FC<{ action: Exclude<UpdateAction, { kind: 'checking' }> }> = ({
  action,
}) => {
  if (action.kind === 'up-to-date') {
    return (
      <div
        role="status"
        className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
        <span>You are running the latest version (v{action.version})</span>
      </div>
    );
  }

  if (action.kind === 'available') {
    return (
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          Newer version available: v{action.version} ({action.releaseDate})
        </div>
        <a
          href={action.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold no-underline hover:bg-zinc-800 dark:hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Open the releases page</span>
        </a>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          On Android the APK is installed over your current copy; your notes, voice memos and
          offline databases are preserved. Nothing installs automatically.
        </p>
      </div>
    );
  }

  if (action.kind === 'unavailable') {
    return (
      <div
        role="status"
        className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300"
      >
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{action.message}</span>
      </div>
    );
  }

  return (
    <div role="status" className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
      <span>Update check failed: {action.message}</span>
    </div>
  );
};

/**
 * The suite-standard Release Notes popup (guide §12.1): version history,
 * per-release app usage, token metrics and the update action, reachable by
 * clicking the bottom-right version footprint.
 *
 * Everything is read-only and honest: usage figures respect the opt-in flag,
 * token figures say so plainly when this build records none, and the update
 * action never auto-installs anything.
 */
export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ onClose }) => {
  useModalBackHandler(true, onClose, 'release-notes-modal');
  const dialogCardRef = useDialogFocusTrap<HTMLDivElement>(true);
  const [checkState, setCheckState] = useState<CheckState>({ status: 'idle' });

  // Snapshot the local, privacy-preserving state once, when the popup opens.
  const [usageGroups] = useState(() => summariseUsageByVersion(MetricsManager.getMetrics().events));
  const [metricsEnabled] = useState(() => MetricsManager.isEnabled());
  const [tokenView] = useState(() =>
    describeTokenMetrics(TOKEN_LEDGER_AVAILABLE, TOKEN_LEDGER, formatTokens)
  );

  const usageCopy = describeMetricsSection(metricsEnabled, usageGroups);

  const updateAction: UpdateAction | null =
    checkState.status === 'idle'
      ? null
      : resolveUpdateAction(
          checkState.status === 'done' ? checkState.result : null,
          checkState.status === 'error' ? checkState.message : undefined
        );

  const handleCheckForUpdates = useCallback(async () => {
    setCheckState({ status: 'checking' });
    try {
      const result = await AppUpdateManager.checkForRemoteUpdates();
      setCheckState({ status: 'done', result });
    } catch (_e) {
      const e = asErrorLike(_e);
      setCheckState({
        status: 'error',
        message: e.message ?? 'The update check could not complete.',
      });
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs select-none animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        ref={dialogCardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-notes-title"
        tabIndex={-1}
        className="w-full max-w-xl bg-white dark:bg-[#141418] border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-white">
              <BrandMarkGlyph size={16} />
            </div>
            <div>
              <h2
                id="release-notes-title"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 font-serif-editorial"
              >
                VellumScribe v{CURRENT_APP_VERSION}
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Release notes &bull; Build #{CURRENT_BUILD_NUMBER}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto custom-minimal-scrollbar space-y-6">
          {/* Version history */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
              <span>Version history</span>
            </h3>
            <div className="space-y-3">
              {APP_CHANGELOGS.map((rel) => (
                <div
                  key={rel.version}
                  className={`p-4 rounded-2xl border ${
                    rel.isCurrent
                      ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200/80 dark:border-indigo-800/60'
                      : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200/70 dark:border-zinc-800/70'
                  } space-y-3`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Version {rel.version}
                      </span>
                      {rel.isCurrent && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500 text-white font-medium">
                          Active build
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                      {rel.releaseDate}
                    </span>
                  </div>
                  <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {rel.highlights.map((highlight, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* This release — app usage */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              <BarChart3 className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
              <span>{usageCopy.heading}</span>
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{usageCopy.body}</p>
            {usageCopy.showsCounts && (
              <div className="space-y-2">
                {usageGroups.map((group) => (
                  <div
                    key={group.version}
                    className="p-3 rounded-2xl border border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-50 dark:bg-zinc-900/40 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {usageVersionLabel(group.version)}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                        {group.total} event{group.total === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(group.byEvent).map(([name, count]) => (
                        <span
                          key={name}
                          className="text-[11px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono"
                        >
                          {name} &middot; {count}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Token metrics */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              <Coins className="w-3.5 h-3.5 text-indigo-500" aria-hidden="true" />
              <span>Token metrics</span>
            </h3>
            {tokenView.available ? (
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/60 dark:border-zinc-800/60 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-zinc-600 dark:text-zinc-400">Total tokens since start</div>
                  <div className="font-mono text-zinc-800 dark:text-zinc-200">
                    {tokenView.total}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-600 dark:text-zinc-400">This release</div>
                  <div className="font-mono text-zinc-800 dark:text-zinc-200">
                    {tokenView.release}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-zinc-600 dark:text-zinc-400">Ledger release version</div>
                  <div className="font-mono text-zinc-800 dark:text-zinc-200">
                    v{tokenView.releaseVersion}
                  </div>
                </div>
                <p className="col-span-2 text-zinc-500 dark:text-zinc-400">{tokenView.note}</p>
              </div>
            ) : (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{tokenView.note}</p>
            )}
          </section>
        </div>

        {/* Footer — update action */}
        <div className="px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-[#101014] space-y-3">
          {updateAction === null && (
            <button
              type="button"
              onClick={handleCheckForUpdates}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Check for updates</span>
            </button>
          )}

          {updateAction?.kind === 'checking' && (
            <div
              role="status"
              className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              <span>Checking for updates...</span>
            </div>
          )}

          {updateAction && updateAction.kind !== 'checking' && (
            <div className="space-y-3">
              <UpdateResultPanel action={updateAction} />
              <button
                type="button"
                onClick={handleCheckForUpdates}
                className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                Check again
              </button>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-xs font-semibold shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
