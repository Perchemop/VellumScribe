import React from 'react';

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
        className={`${sizeMap[size]} rounded-xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black dark:from-zinc-100 dark:via-zinc-200 dark:to-zinc-300 text-white dark:text-zinc-950 flex items-center justify-center font-serif font-semibold tracking-tight shadow-md border border-zinc-800/50 dark:border-white/20 shrink-0 relative overflow-hidden group`}
      >
        {/* Subtle decorative inner corner sheen */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/20 opacity-60 pointer-events-none" />
        
        {/* Geometric Vellum Monogram SVG */}
        <svg
          width={iconDimension[size]}
          height={iconDimension[size]}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-xs"
        >
          <path
            d="M4.5 4.5L12 19.5L19.5 4.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 19.5V11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx="12"
            cy="8.5"
            r="1.75"
            fill="currentColor"
          />
        </svg>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 font-sans leading-none">
              VellumScribe
            </span>
            <span className="text-xs px-1 py-0.2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md font-mono border border-zinc-200/60 dark:border-zinc-700/60">
              v2.6
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
