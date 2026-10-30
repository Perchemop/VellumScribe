import React from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import { CURRENT_APP_VERSION } from '../../lib/appUpdateManager';
import { AppLogo } from '../AppLogo';

interface AboutPanelProps {
  onOpenOnboardingGuide?: () => void;
}

export const AboutPanel: React.FC<AboutPanelProps> = ({ onOpenOnboardingGuide }) => {
  return (
    <div className="space-y-4">
      <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 flex items-center gap-4">
        <div className="shrink-0">
          <AppLogo size="lg" showText={false} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              VellumScribe
            </h3>
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              v{CURRENT_APP_VERSION}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Offline-first notes · on-device voice · optional cloud
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {onOpenOnboardingGuide && (
          <button
            type="button"
            onClick={onOpenOnboardingGuide}
            className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-left flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
          >
            <BookOpen className="w-4 h-4 text-zinc-500 shrink-0" />
            <div>
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Quick tips</div>
              <div className="text-xs text-zinc-500">Replay the intro</div>
            </div>
          </button>
        )}
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-zinc-500 shrink-0" />
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Open source</div>
            <div className="text-xs text-zinc-500">MIT License</div>
          </div>
        </div>
      </div>
    </div>
  );
};
