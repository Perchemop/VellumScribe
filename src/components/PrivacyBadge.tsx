import React from 'react';
import { ShieldCheck, Cloud } from 'lucide-react';

export interface PrivacyBadgeProps {
  mode: 'local' | 'cloud';
  provider?: string;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
}

/** Compact privacy indicator — minimal chrome. */
export const PrivacyBadge: React.FC<PrivacyBadgeProps> = ({
  mode,
  provider = 'Cloud',
  size = 'sm',
  showTooltip = false,
}) => {
  const isLocal = mode === 'local';

  return (
    <span
      title={showTooltip ? (isLocal ? 'On-device' : provider) : undefined}
      className={`inline-flex items-center gap-1 font-medium rounded-full ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      } ${
        isLocal
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
      }`}
    >
      {isLocal ? (
        <>
          <ShieldCheck className="w-3 h-3 shrink-0" />
          <span>On-device</span>
        </>
      ) : (
        <>
          <Cloud className="w-3 h-3 shrink-0" />
          <span>{provider}</span>
        </>
      )}
    </span>
  );
};
