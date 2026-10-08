#!/usr/bin/env python3
"""Complete residual A-E items: list filter menu, bury advanced AI providers."""
from pathlib import Path
import re


def patch_list_filters():
    p = Path('src/components/EventNotesList.tsx')
    t = p.read_text()
    # Add Filter icon import if missing
    if 'Filter' not in t.split('from \'lucide-react\'')[0]:
        t = t.replace(
            '  MoreHorizontal,\n',
            '  MoreHorizontal,\n  Filter,\n',
            1,
        )
    # Replace 6-col pills with compact All + Filter select + Archive + Trash
    start = t.find('{/* Omni-Notes Core Mode Tabs (Pills) */}')
    end = t.find('{/* Category Pills Strip */}')
    if start < 0 or end < 0:
        print('filter markers missing')
        return
    replacement = '''{/* Compact filters: All + type filter + Archive + Trash */}
      <div className="px-3 py-1 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            aria-label="All notes"
            className={`min-h-[40px] px-3 rounded-xl border transition-all ${
              activeTab === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent'
                : 'bg-white dark:bg-[#16161a] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800'
            }`}
          >
            All
          </button>
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Filter</span>
            <div className="flex items-center gap-1.5 min-h-[40px] px-2.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#16161a] text-zinc-600 dark:text-zinc-300">
              <Filter className="w-3.5 h-3.5 shrink-0 opacity-60" />
              <select
                value={['checklist', 'sketch', 'reminders'].includes(activeTab) ? activeTab : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setActiveTab(v as NoteTabFilter);
                  else setActiveTab('all');
                }}
                className="flex-1 bg-transparent text-xs font-medium focus:outline-none min-w-0"
                aria-label="Filter notes"
              >
                <option value="">Type</option>
                <option value="checklist">Lists</option>
                <option value="sketch">Sketch</option>
                <option value="reminders">Reminders</option>
              </select>
            </div>
          </label>
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            aria-label="Archive"
            className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border transition-all ${
              activeTab === 'archived'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent'
                : 'bg-white dark:bg-[#16161a] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800'
            }`}
          >
            <Archive className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('trash')}
            aria-label="Trash"
            className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border transition-all ${
              activeTab === 'trash'
                ? 'bg-rose-600 text-white border-transparent'
                : 'bg-white dark:bg-[#16161a] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800'
            }`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      '''
    t = t[:start] + replacement + t[end:]
    # Shorter category label
    t = t.replace('All Categories', 'All')
    p.write_text(t)
    print('list filters collapsed')


def patch_settings_bury_advanced_ai():
    p = Path('src/components/SettingsView.tsx')
    if not p.exists():
        return
    t = p.read_text()
    # Force advanced AI off
    t = t.replace(
        'const [showAdvancedAi, setShowAdvancedAi] = useState(false); // Groq/Deepgram/Ollama hidden until expanded',
        'const [showAdvancedAi, setShowAdvancedAi] = useState(false); // permanently buried — Google only in simple AI',
    )
    # Disable any button that expands advanced AI
    t = re.sub(
        r'setShowAdvancedAi\(true\)',
        'setShowAdvancedAi(false)',
        t,
    )
    t = re.sub(
        r'setShowAdvancedAi\(\(p\) => !p\)',
        'setShowAdvancedAi(false)',
        t,
    )
    # Hide "More AI providers" style buttons by neutralizing showAdvancedAi blocks
    # Keep Google key UI; advanced section never renders when showAdvancedAi is false
    p.write_text(t)
    print('advanced AI buried')


def patch_focus_default():
    for rel in ['src/components/NoteEditorWriteFirst.tsx', 'src/components/NoteEditor.tsx']:
        p = Path(rel)
        if not p.exists():
            continue
        t = p.read_text()
        # Prefer starting in focus mode for calmer chrome
        if 'useState(false)' in t and 'focusMode' in t:
            t2 = re.sub(
                r'const \[focusMode, setFocusMode\] = useState\(false\)',
                'const [focusMode, setFocusMode] = useState(true)',
                t,
                count=1,
            )
            if t2 != t:
                p.write_text(t2)
                print('focus default on', rel)
                return
    print('focus default: no match')


def main():
    patch_list_filters()
    patch_settings_bury_advanced_ai()
    patch_focus_default()
    print('residual complete')


if __name__ == '__main__':
    main()
