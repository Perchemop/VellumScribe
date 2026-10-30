import React from 'react';

/**
 * Canonical VellumScribe brand mark, as a React component.
 *
 * This is the single source of the mark's geometry in the app bundle: the
 * header logo (AppLogo), the About panel and any future surface render this
 * component instead of re-typing path data (design audit m-1, 2026-10-28).
 * The canonical file is assets/brand/vellumscribe-mark.svg; the 24-unit
 * viewBox here is the same geometry as that file's translate(14,14) scale(3)
 * group inside its 100-unit tile (4.5 -> 27.5, 19.5 -> 72.5, 8.5 -> 39.5).
 *
 * The mark inherits currentColor, so callers decide the ink colour.
 */
export interface BrandMarkGlyphProps {
  /** Rendered edge length in CSS pixels. */
  size?: number;
  className?: string;
  /**
   * Accessible name. When omitted the glyph is decorative (aria-hidden) —
   * correct when a sibling already names the brand.
   */
  title?: string;
}

export const BrandMarkGlyph: React.FC<BrandMarkGlyphProps> = ({ size = 18, className, title }) => {
  const labelled = Boolean(title);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {labelled && <title>{title}</title>}
      <path
        d="M4.5 4.5L12 19.5L19.5 4.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 19.5V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="8.5" r="1.75" fill="currentColor" />
    </svg>
  );
};
