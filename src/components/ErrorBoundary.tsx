import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Database, Bug } from 'lucide-react';
import { AppLogger } from '../lib/logger';
import { CrashReporter } from '../lib/crashReporter';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (error: Error, reset: () => void) => ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    AppLogger.error('ErrorBoundary', 'Caught component crash in ErrorBoundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    this.setState({ errorInfo });
  }

  public reset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      sessionStorage.clear();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  /**
   * Consent-gated crash reporting: build a redacted report, copy it to the
   * clipboard, and open a prefilled GitHub issue. Nothing is sent until the
   * user submits the prefilled issue themselves.
   */
  private handleReportCrash = async () => {
    try {
      const report = CrashReporter.buildReport(this.state.error, {
        componentStack: this.state.errorInfo?.componentStack || undefined,
      });
      try {
        await navigator.clipboard.writeText(report.body);
      } catch {
        // Clipboard may be unavailable; the prefilled issue still carries the body.
      }
      window.open(CrashReporter.prefilledIssueUrl(report), '_blank', 'noopener,noreferrer');
    } catch (e) {
      AppLogger.warn('ErrorBoundary', 'Failed to build crash report', e);
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender(this.state.error, this.reset);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6 select-none font-sans">
          <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6 text-center">
            <div className="w-14 h-14 bg-rose-950/60 border border-rose-800/40 text-rose-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Something interrupted your session
              </h2>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                An unexpected interface exception occurred. Your local notes and recordings remain
                safely persisted in storage.
              </p>
            </div>

            {this.state.error && (
              <div className="text-left rounded-xl p-3.5 text-xs font-mono text-zinc-800 dark:text-zinc-200 bg-white/60 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800/60 overflow-x-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto px-4 py-2.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Application
              </button>
              <button
                onClick={this.handleResetCache}
                className="w-full sm:w-auto px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Database className="w-3.5 h-3.5" />
                Reset Session Cache
              </button>
              <button
                onClick={this.handleReportCrash}
                className="w-full sm:w-auto px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Bug className="w-3.5 h-3.5" />
                Report this crash
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
