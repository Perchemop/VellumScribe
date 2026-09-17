import React from 'react';
import { ShieldCheck, Cloud, Cpu, Lock } from 'lucide-react';

export interface PrivacyBadgeProps {
  mode: 'local' | 'cloud';
  provider?: string;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}

export const PrivacyBadge: React.FC<PrivacyBadgeProps> = ({
  mode,
  provider = 'Google Gemini',
  size = 'sm',
  showTooltip = true,
}) => {
  const isLocal = mode === 'local';

  return (
    <div
      title={
        showTooltip
          ? isLocal
            ? '100% On-Device / Local: Zero data leaves this hardware'
            : `Cloud AI: Processed securely via ${provider}`
          : undefined
      }
      className={`inline-flex items-center gap-1.5 font-medium rounded-full transition-colors ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${
        isLocal
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/50'
          : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/50'
      }`}
    >
      {isLocal ? (
        <>
          <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Local / On-Device</span>
        </>
      ) : (
        <>
          <Cloud className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>{provider}</span>
        </>
      )}
    </div>
  );
};
