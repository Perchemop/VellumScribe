import React, { useState } from 'react';
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react';
import { ChecklistItem } from '../types';
import { NativeBridge } from '../lib/nativeBridge';
import { generatePrefixedId } from '../lib/uuid';

interface ChecklistEditorProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

export const ChecklistEditor: React.FC<ChecklistEditorProps> = ({ items, onChange }) => {
  const [newItemText, setNewItemText] = useState('');

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;

    const newItem: ChecklistItem = {
      id: generatePrefixedId('chk'),
      text: newItemText.trim(),
      completed: false,
    };
    onChange([...items, newItem]);
    setNewItemText('');
    NativeBridge.hapticImpact('light');
  };

  const handleToggle = (id: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item
    );
    onChange(updated);
    NativeBridge.hapticImpact('light');
  };

  const handleTextChange = (id: string, newText: string) => {
    const updated = items.map((item) => (item.id === id ? { ...item, text: newText } : item));
    onChange(updated);
  };

  const handleDelete = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    onChange(updated);
  };

  const handleClearCompleted = () => {
    const updated = items.filter((item) => !item.completed);
    onChange(updated);
  };

  const completedCount = items.filter((i) => i.completed).length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress Bar & Header */}
      {items.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
            <span>
              {completedCount} of {items.length} tasks completed ({progressPercent}%)
            </span>
            {completedCount > 0 && (
              <button
                type="button"
                onClick={handleClearCompleted}
                className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline underline-offset-4"
              >
                Clear completed
              </button>
            )}
          </div>
          <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2.5 p-2 rounded-xl bg-zinc-50/60 dark:bg-[#141418]/60 hover:bg-zinc-100/80 dark:hover:bg-[#18181d] border border-zinc-200/50 dark:border-zinc-800/50 transition-colors group"
          >
            <button
              type="button"
              onClick={() => handleToggle(item.id)}
              className="p-0.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors shrink-0"
            >
              {item.completed ? (
                <CheckSquare className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
              ) : (
                <Square className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              )}
            </button>

            <input
              type="text"
              value={item.text}
              onChange={(e) => handleTextChange(item.id, e.target.value)}
              placeholder="Task description..."
              className={`flex-1 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-md ${
                item.completed ? 'line-through text-zinc-600 dark:text-zinc-500' : ''
              }`}
            />

            <button
              type="button"
              onClick={() => handleDelete(item.id)}
              aria-label={`Delete checklist item: ${item.text || 'empty item'}`}
              className="opacity-0 group-hover:opacity-100 p-1 text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition-all focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add New Item Input */}
      <form onSubmit={handleAddItem} className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Add a checklist item (press Enter)..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          className="flex-1 px-3 py-2 bg-white dark:bg-[#16161a] border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 focus:border-zinc-400"
        />
        <button
          type="submit"
          disabled={!newItemText.trim()}
          className="px-3 py-2 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-xl disabled:opacity-40 flex items-center gap-1 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </form>
    </div>
  );
};
