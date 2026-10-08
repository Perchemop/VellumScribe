#!/usr/bin/env python3
"""UX pass 2: settings AI merge, remove command bar, simplify batch, onboarding, note AI key."""
from pathlib import Path
import re


def patch_onboarding():
    p = Path('src/components/FirstTimeUserGuideModal.tsx')
    t = p.read_text()
    # Returning installs (any notes or prior session) skip the tour
    old = '''export function hasCompletedOnboarding(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const direct = localStorage.getItem(STORAGE_KEY);
      if (direct === 'true' || direct === '1') return true;
      const secondary = localStorage.getItem(SPLASH_SEEN_KEY);
      if (secondary === 'true' || secondary === '1') return true;
    }
    if (typeof sessionStorage !== 'undefined') {
      const sess = sessionStorage.getItem(STORAGE_KEY);
      if (sess === 'true' || sess === '1') return true;
    }
    const item = StorageManager.getItem<any>(STORAGE_KEY, null);
    if (item === true || item === 'true' || item === 1 || item === '1') return true;
    return false;
  } catch {
    return false;
  }
}'''
    new = '''export function hasCompletedOnboarding(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const direct = localStorage.getItem(STORAGE_KEY);
      if (direct === 'true' || direct === '1') return true;
      const secondary = localStorage.getItem(SPLASH_SEEN_KEY);
      if (secondary === 'true' || secondary === '1') return true;
    }
    if (typeof sessionStorage !== 'undefined') {
      const sess = sessionStorage.getItem(STORAGE_KEY);
      if (sess === 'true' || sess === '1') return true;
    }
    const item = StorageManager.getItem<any>(STORAGE_KEY, null);
    if (item === true || item === 'true' || item === 1 || item === '1') return true;
    // Returning installs: any existing notes means skip the first-run tour
    try {
      const notes = StorageManager.getNotes();
      if (Array.isArray(notes) && notes.length > 0) {
        markOnboardingCompleted();
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  } catch {
    return false;
  }
}'''
    if old in t:
        t = t.replace(old, new)
        p.write_text(t)
        print('onboarding: skip returning installs')
    else:
        print('onboarding: pattern miss')


def patch_note_chrome_remove_ai_key():
    p = Path('src/components/NoteEditorChrome.tsx')
    t = p.read_text()
    # Remove Google AI key / AI key button block from more menu
    t2 = re.sub(
        r"\s*<button\b[^>]*>\s*<span className=\"flex items-center gap-3\">\s*<Key[\s\S]*?</button>",
        '',
        t,
        count=1,
    )
    # Also try simpler pattern if still present
    if 'setShowAiKeyModal(true)' in t2:
        t2 = re.sub(
            r"\s*<button[^>]*setShowAiKeyModal\(true\)[\s\S]*?</button>",
            '',
            t2,
            count=1,
        )
    # Remove unused Key import if no longer used
    if 'setShowAiKeyModal' not in t2 and '<Key ' not in t2:
        t2 = t2.replace('  Key,\n', '')
    # Keep setShowAiKeyModal prop for API stability but it's ok if unused in body
    p.write_text(t2)
    print('chrome: AI key removed from note menu', 'setShowAiKeyModal(true)' not in t2)


def patch_remove_command_bar():
    p = Path('src/components/EventNotesList.tsx')
    t = p.read_text()
    t = t.replace("import { AiCommandBar } from './AiCommandBar';\n", '')
    t = t.replace("import { AiAction } from '../types';\n", '')
    # Remove JSX usage of AiCommandBar - common patterns
    t = re.sub(
        r"\s*<AiCommandBar[\s\S]*?/>",
        '',
        t,
        count=3,
    )
    # Remove handleAiAction if unused
    t = re.sub(
        r"\n  const handleAiAction = async \(action: AiAction\) => \{[\s\S]*?\n  \};\n",
        '\n',
        t,
        count=1,
    )
    p.write_text(t)
    print('EventNotesList: AiCommandBar removed', 'AiCommandBar' not in t)


def patch_batch_bar():
    """Simplify primary batch actions: Cancel | count | Archive | Trash | More.
    Move color, pin, category, tag, lock, export, merge into More menu only.
    """
    p = Path('src/components/BatchActionBar.tsx')
    t = p.read_text()
    # Mark file so we can do structural simplify: inject a comment and trim primary row
    # Replace the large non-trash primary actions block with a thinner set
    start = t.find('{/* Merge Notes Button')
    if start < 0:
        start = t.find('{count >= 2 && onOpenMergeModal')
    end = t.find('{/* More Overflow Menu */}')
    if start > 0 and end > start:
        replacement = '''{/* Primary actions kept minimal — rest under More */}
              <button
                type="button"
                onClick={handleBatchArchive}
                aria-label={activeTab === 'archived' ? 'Unarchive' : 'Archive'}
                title={activeTab === 'archived' ? 'Unarchive' : 'Archive'}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white/15 dark:hover:bg-black/10 transition-colors"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                id="batch-trash-btn"
                type="button"
                onClick={handleBatchTrashOrDelete}
                aria-label="Trash"
                title="Trash"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-rose-500/20 text-rose-300 dark:text-rose-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              '''
        t = t[:start] + replacement + t[end:]
        # Ensure More menu still has Pin, Move, Color, Merge at top
        if 'batch-more-menu-btn' in t and 'Move Category' not in t and 'Move to category' not in t:
            # Insert pin/move/color/merge into more menu after opening of showMoreMenu div content
            more_insert = '''
                    {count >= 2 && onOpenMergeModal && (
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          onOpenMergeModal();
                        }}
                        className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                      >
                        <GitMerge className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Merge</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowCategorySheet(true);
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <FolderInput className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Move</span>
                    </button>
                    <button
                      onClick={() => {
                        handleBatchPin();
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Pin className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{hasUnpinned ? 'Pin' : 'Unpin'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowColorSheet(true);
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-2.5 py-2 text-left rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2"
                    >
                      <Palette className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Color</span>
                    </button>
'''
            marker = '{showMoreMenu && ('
            idx = t.find(marker)
            if idx > 0:
                # find first <button after the menu opens
                btn = t.find('<button', idx)
                if btn > 0:
                    t = t[:btn] + more_insert + t[btn:]
        p.write_text(t)
        print('batch bar simplified')
    else:
        print('batch bar: markers not found', start, end)


def patch_settings_ai_tabs():
    """Collapse offline-ai into AI tab; offline panel first."""
    p = Path('src/components/SettingsView.tsx')
    t = p.read_text()
    # When rendering AI tab content, prefer OfflineAiPanel at top
    # Find offline-ai tab button and remove from nav if present as separate tab
    t = t.replace("'cloud' | 'ai' | 'offline-ai' | 'storage'", "'cloud' | 'ai' | 'storage'")
    t = t.replace(
        "'cloud' | 'ai' | 'offline-ai' | 'storage' | 'security' | 'diagnostics' | 'about'",
        "'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics' | 'about'",
    )
    # Redirect initial offline-ai to ai
    if "initialSubtab === 'offline-ai'" not in t:
        t = t.replace(
            "const [activeTab, setActiveTab] = useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics' | 'about'>(\n    initialSubtab || 'cloud'\n  );",
            "const [activeTab, setActiveTab] = useState<'cloud' | 'ai' | 'storage' | 'security' | 'diagnostics' | 'about'>(\n    initialSubtab === 'offline-ai' ? 'ai' : (initialSubtab || 'cloud')\n  );",
        )
    # Ensure OfflineAiPanel shows when activeTab === 'ai'
    if "activeTab === 'ai'" in t and 'OfflineAiPanel' in t:
        # If offline-ai exclusive block exists, merge
        t = t.replace("activeTab === 'offline-ai'", "activeTab === 'ai' && false /* merged into ai */")
    p.write_text(t)
    print('settings: offline-ai folded into ai type')


def main():
    patch_onboarding()
    patch_note_chrome_remove_ai_key()
    patch_remove_command_bar()
    patch_batch_bar()
    patch_settings_ai_tabs()
    print('pass2 done')


if __name__ == '__main__':
    main()
