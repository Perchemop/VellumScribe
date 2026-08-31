import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# 1. Rename "Timeline" to "Recent"
content = content.replace(">Timeline</span>", ">Recent</span>")
content = content.replace("/* Dedicated Timeline / Recents View */", "/* Dedicated Recent View */")

# 2. Rename "Settings & AI" to "Settings"
content = content.replace("Settings & AI", "Settings")

# 3. Remove "Archive" from the mobile bottom navigation
# Mobile bottom nav usually looks like this:
# <button onClick={() => setCurrentView('archive')} ... Archive ... </button>
content = re.sub(r'<button[^>]*?onClick=\{\(\) => setCurrentView\(\'archive\'\)\}[^>]*?>[\s\S]*?Archive</span>\s*</button>', '', content)

# 4. Simplify "Sketch Canvas" to "Sketch"
content = content.replace("Sketch Canvas", "Sketch")

# Also, accessible labels for bottom navigation:
content = re.sub(r'<button\s+onClick=\{\(\) => setCurrentView\(\'notes\'\)\}([^>]*?)>', r'<button onClick={() => setCurrentView(\'notes\')} aria-label="Notes" \1>', content)
content = re.sub(r'<button\s+onClick=\{\(\) => setCurrentView\(\'timeline\'\)\}([^>]*?)>', r'<button onClick={() => setCurrentView(\'timeline\')} aria-label="Recent notes" \1>', content)
content = re.sub(r'<button\s+onClick=\{\(\) => setCurrentView\(\'settings\'\)\}([^>]*?)>', r'<button onClick={() => setCurrentView(\'settings\')} aria-label="Settings" \1>', content)

# Height changes for mobile bottom nav
# from "h-14" to "min-h-[56px] h-[env(safe-area-inset-bottom)+56px] pb-[env(safe-area-inset-bottom)] px-[env(safe-area-inset-left)]" or similar, maybe just min-h-16
content = content.replace('h-14 bg-white', 'min-h-[64px] bg-white')
content = content.replace('h-14 border-t', 'min-h-[64px] border-t pb-[env(safe-area-inset-bottom)] px-[env(safe-area-inset-left)]')

# The floating create control is positioned further above the mobile navigation
content = content.replace('bottom-20', 'bottom-24')

with open('src/App.tsx', 'w') as f:
    f.write(content)
