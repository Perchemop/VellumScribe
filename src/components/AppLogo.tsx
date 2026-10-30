import React from 'react';
import { version } from '../../package.json';
import { BrandMarkGlyph } from './BrandMarkGlyph';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-11 h-11 text-lg',
    xl: 'w-16 h-16 text-2xl',
  };

  const iconDimension = {
    sm: 16,
    md: 18,
    lg: 24,
    xl: 36,
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Icon Badge */}
      <div
        className={`${sizeMap[size]} rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-white flex items-center justify-center font-serif font-semibold tracking-tight shadow-md border border-zinc-800/50 dark:border-white/20 shrink-0 relative overflow-hidden group`}
      >
        {/* Subtle decorative inner corner sheen */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 opacity-60 pointer-events-none" />

        {/* Geometric Vellum Monogram — single source of the mark geometry */}
        <BrandMarkGlyph
          size={iconDimension[size]}
          className="relative z-10 drop-shadow-xs"
          title={showText ? undefined : 'VellumScribe'}
        />
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 font-sans leading-none">
              VellumScribe
            </span>
            <span className="text-xs px-1 py-0.2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md font-mono border border-zinc-200/60 dark:border-zinc-700/60">
              v{version}
            </span>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-normal leading-none mt-0.5">
            Private Multimodal Studio
          </span>
        </div>
      )}
    </div>
  );
};
