#!/usr/bin/env python3
"""UX pass 3: simple tabs include AI/Storage; diagnostics advanced-only; slim AI tab."""
from pathlib import Path
import re


def patch_settings():
    p = Path('src/components/SettingsView.tsx')
    t = p.read_text()

    # Simple mode may use AI + storage; diagnostics only advanced
    t = t.replace(
        "if (mode === 'simple' && !['cloud', 'security', 'about'].includes(activeTab)) {",
        "if (mode === 'simple' && !['cloud', 'ai', 'storage', 'security', 'about'].includes(activeTab)) {",
    )
    t = t.replace(
        "? 'Backup, security, and about'\n            : 'AI keys, Whisper, storage, diagnostics'}",
        "? 'Cloud, AI, storage, security'\n            : 'Includes diagnostics'}",
    )

    # Short tab labels
    replacements = [
        ('<span>Cloud Backup &amp; Providers</span>', '<span>Cloud</span>'),
        ('<span>Cloud Backup & Providers</span>', '<span>Cloud</span>'),
        ('<span>AI Keys &amp; Studio</span>', '<span>AI</span>'),
        ('<span>AI Keys & Studio</span>', '<span>AI</span>'),
        ('<span>Cloud AI Keys</span>', '<span>AI</span>'),
        ('<span>Storage &amp; Backups</span>', '<span>Storage</span>'),
        ('<span>Storage & Backups</span>', '<span>Storage</span>'),
        ('<span>Security &amp; Keystore</span>', '<span>Security</span>'),
        ('<span>Security & Keystore</span>', '<span>Security</span>'),
        ('<span>Architecture &amp; Diagnostics</span>', '<span>Diagnostics</span>'),
        ('<span>Architecture & Diagnostics</span>', '<span>Diagnostics</span>'),
        ('<span>Offline Whisper AI</span>', '<span>AI</span>'),
    ]
    for a, b in replacements:
        t = t.replace(a, b)

    # Remove broken separate Offline Whisper tab button block (advanced)
    t = re.sub(
        r"\s*\{settingsMode === 'advanced' && \(\s*<button\s+id=\"subtab-offline-ai-btn\"[\s\S]*?</button>\s*\)\}",
        '',
        t,
        count=1,
    )

    # Make AI tab visible in simple mode (remove advanced-only wrapper around AI button if present)
    # Pattern: {settingsMode === 'advanced' && ( <button id="subtab-ai-key-btn"
    t = re.sub(
        r"\{settingsMode === 'advanced' && \(\s*<button\s+id=\"subtab-ai-key-btn\"",
        '<button\n          id="subtab-ai-key-btn"',
        t,
        count=1,
    )
    # Close extra paren after AI button - fragile; fix common double close
    # Better: ensure storage also in simple
    t = re.sub(
        r"\{settingsMode === 'advanced' && \(\s*<button\s+id=\"subtab-storage",
        '<button\n          id="subtab-storage',
        t,
        count=1,
    )

    # Fix any setActiveTab('offline-ai')
    t = t.replace("setActiveTab('offline-ai')", "setActiveTab('ai')")

    # AI panel: inject OfflineAiPanel at top if missing inside panel-ai-studio
    if "id=\"panel-ai-studio\"" in t and '<OfflineAiPanel' not in t[t.find('panel-ai-studio'):t.find('panel-ai-studio')+800]:
        t = t.replace(
            'id="panel-ai-studio" role="tabpanel"',
            'id="panel-ai-studio" role="tabpanel"',
            1,
        )
        # After opening div of AI panel, insert OfflineAiPanel
        marker = 'id="panel-ai-studio" role="tabpanel" aria-labelledby="subtab-ai-key-btn" className="max-w-3xl mx-auto space-y-6">'
        if marker in t and '<OfflineAiPanel' not in t.split(marker)[1][:500]:
            t = t.replace(
                marker,
                marker + '\n            <OfflineAiPanel />\n            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">\n              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Cloud AI (optional)</h3>\n              <p className="text-xs text-zinc-500 mb-3">Google API key for summaries when you allow network.</p>',
                1,
            )

    # Force showAdvancedAi default false already; collapse multi-provider sections by ensuring showAdvancedAi starts false
    t = t.replace(
        'const [showAdvancedAi, setShowAdvancedAi] = useState(false);',
        'const [showAdvancedAi, setShowAdvancedAi] = useState(false); // Groq/Deepgram/Ollama hidden until expanded',
    )

    # Remove dead offline-ai exclusive panel if still present
    t = re.sub(
        r"\s*\{/\* TAB: OFFLINE WHISPER AI \*/\}[\s\S]*?\{activeTab === 'ai' && false /\* merged into ai \*/ && \([\s\S]*?<OfflineAiPanel />\s*</div>\s*\)\}",
        '',
        t,
        count=1,
    )
    # Simpler dead panel removal
    t = re.sub(
        r"\s*\{activeTab === 'ai' && false /\* merged into ai \*/ && \([\s\S]*?<OfflineAiPanel />\s*</div>\s*\)\}",
        '',
        t,
        count=1,
    )

    p.write_text(t)
    print('SettingsView patched')


def main():
    patch_settings()
    print('pass3 done')


if __name__ == '__main__':
    main()
