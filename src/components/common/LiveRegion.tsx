import React from 'react';

interface LiveRegionProps {
  message?: string | null;
  role?: 'status' | 'alert';
}

/**
 * Screen-reader accessibility live region for dynamic announcements
 * (e.g., transcription progress, sync status, background durability flushes).
 */
export const LiveRegion: React.FC<LiveRegionProps> = ({ message, role = 'status' }) => {
  if (!message) return null;
  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
};
