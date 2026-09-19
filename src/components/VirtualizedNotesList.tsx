import React, { useRef, useState, useEffect, useCallback } from 'react';
import { List, RowComponentProps } from 'react-window';
import { NoteRecord } from '../types';

export interface VirtualizedNotesListProps {
  notes: NoteRecord[];
  renderNote: (note: NoteRecord) => React.ReactNode;
  itemHeight?: number;
  className?: string;
  emptyState?: React.ReactNode;
}

interface CustomRowProps {
  // Empty object required by react-window for rowProps
}

/**
 * High-performance virtualized list wrapper using react-window v2.
 * Automatically switches to virtualization when note count exceeds threshold,
 * preventing UI thread stalls and memory pressure on Android WebView with 100+ notes.
 */
export const VirtualizedNotesList: React.FC<VirtualizedNotesListProps> = ({
  notes,
  renderNote,
  itemHeight = 138,
  className = '',
  emptyState = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(500);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const rect = el.getBoundingClientRect();
      const h = Math.max(300, rect.height || (window.innerHeight - 240));
      setContainerHeight(h);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(el);

    window.addEventListener('resize', updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  const rowKey = useCallback((index: number) => {
    return notes[index]?.id ?? index;
  }, [notes]);

  if (notes.length === 0) {
    return <>{emptyState}</>;
  }

  // Under 20 notes, standard DOM mapping has zero overhead and avoids FixedSize constraints
  if (notes.length <= 20) {
    return (
      <div className={`space-y-2 ${className}`}>
        {notes.map((note) => (
          <React.Fragment key={note.id}>
            {renderNote(note)}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const RowComponent = ({ index, style }: RowComponentProps<CustomRowProps>) => {
    const note = notes[index];
    if (!note) return null;
    return (
      <div style={{ ...style, paddingBottom: '8px', boxSizing: 'border-box' }}>
        {renderNote(note)}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={`w-full h-full min-h-[300px] ${className}`}>
      <List<CustomRowProps>
        rowCount={notes.length}
        rowHeight={itemHeight}
        rowProps={{}}
        rowKey={rowKey}
        rowComponent={RowComponent}
        style={{ height: containerHeight, width: '100%' }}
        overscanCount={4}
      />
    </div>
  );
};
