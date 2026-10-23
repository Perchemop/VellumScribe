import React, { useState } from 'react';
import { CheckSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { ChecklistItem } from '../../types';
import { ChecklistEditor } from '../ChecklistEditor';

interface ChecklistSectionProps {
  items: ChecklistItem[];
  onChange: (newItems: ChecklistItem[]) => void;
}

export const ChecklistSection: React.FC<ChecklistSectionProps> = ({ items, onChange }) => {
  const [isOpen, setIsOpen] = useState(true);

  const completedCount = items.filter((i) => i.completed || i.is_completed).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="p-4 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200 hover:text-indigo-600 transition"
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          )}
          <CheckSquare className="w-4 h-4 text-indigo-500" />
          <span>Interactive Checklists</span>
          {totalCount > 0 && (
            <span className="text-xs font-mono font-normal text-zinc-500">
              ({completedCount}/{totalCount})
            </span>
          )}
        </button>

        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-16 bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-zinc-400">{progressPercent}%</span>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="pt-1">
          <ChecklistEditor items={items} onChange={onChange} />
        </div>
      )}
    </div>
  );
};
