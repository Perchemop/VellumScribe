import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

replacement = """      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-full shadow-lg text-sm font-medium z-50 animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3">
          <span>{toastMessage}</span>
          {toastAction && (
            <button onClick={toastAction.onClick} className="text-blue-400 hover:text-blue-300 font-bold uppercase text-xs tracking-wider border-l border-zinc-700 pl-3">
              {toastAction.label}
            </button>
          )}
        </div>
      )}"""

content = re.sub(
    r"\{\s*toastMessage && \([\s\S]*?\}\)",
    replacement,
    content
)

with open('src/App.tsx', 'w') as f:
    f.write(content)
