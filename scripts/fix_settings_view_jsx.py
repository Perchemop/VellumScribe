#!/usr/bin/env python3
"""Fix corrupted SettingsView.tsx: stray JSX in useEffect + broken AI tab."""
from pathlib import Path

p = Path('src/components/SettingsView.tsx')
t = p.read_text()

# 1) Fix useEffect corruption
bad_effect = '''  React.useEffect(() => {
              <CloudSettingsPanel />
    if (activeTab === 'cloud') {
      accounts.forEach((acc) => {
        handleLoadRemoteBackups(acc.provider);
      });
    }
  }, [activeTab, accounts]);'''

good_effect = '''  React.useEffect(() => {
    if (activeTab === 'cloud') {
      accounts.forEach((acc) => {
        handleLoadRemoteBackups(acc.provider);
      });
    }
  }, [activeTab, accounts]);'''

if bad_effect in t:
    t = t.replace(bad_effect, good_effect)
    print('fixed useEffect')
else:
    # fallback: remove stray panel line
    t2 = t.replace('              <CloudSettingsPanel />\n', '')
    if t2 != t:
        t = t2
        print('removed stray CloudSettingsPanel')
    else:
        print('useEffect pattern not found exactly')

# 2) Replace entire AI tab block with clean minimal panel
start_marker = "        {/* TAB 2: AI PROVIDERS, BYOK & LOCAL OFFLINE */}"
end_marker = "        {/* TAB 3: STORAGE & BACKUPS */}"
start = t.find(start_marker)
end = t.find(end_marker)
if start < 0 or end < 0:
    # alternate markers
    start = t.find("{activeTab === 'ai' && (")
    end = t.find("{/* TAB 3: STORAGE")
    if start < 0:
        start = t.find("id=\"panel-ai-studio\"")
        if start > 0:
            # walk back to conditional
            start = t.rfind("{activeTab === 'ai'", 0, start)

if start < 0 or end < 0:
    raise SystemExit(f'AI tab markers not found start={start} end={end}')

clean_ai = r'''        {/* TAB 2: AI — offline Whisper first + optional Google key */}
        {activeTab === 'ai' && (
          <div id="panel-ai-studio" role="tabpanel" aria-labelledby="subtab-ai-key-btn" className="max-w-3xl mx-auto space-y-6">
            <OfflineAiPanel />

            <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cloud AI (optional)</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Google API key for summaries when network is allowed.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Google API key</label>
                <div className="flex gap-2">
                  <input
                    type={showGoogleKey ? 'text' : 'password'}
                    value={googleKeyInput}
                    onChange={(e) => setGoogleKeyInput(e.target.value)}
                    placeholder="AIza…"
                    className="flex-1 min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGoogleKey((v) => !v)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-700"
                    aria-label={showGoogleKey ? 'Hide key' : 'Show key'}
                  >
                    {showGoogleKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateAiSettings({ googleApiKey: googleKeyInput.trim() })}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  >
                    Save key
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyGoogle}
                    disabled={isVerifyingGoogle || !googleKeyInput.trim()}
                    className="px-3 py-2 rounded-xl text-xs font-medium border border-zinc-200 dark:border-zinc-700 disabled:opacity-40"
                  >
                    {isVerifyingGoogle ? 'Checking…' : 'Test'}
                  </button>
                  {googleKeyInput ? (
                    <button
                      type="button"
                      onClick={() => {
                        setGoogleKeyInput('');
                        handleUpdateAiSettings({ googleApiKey: '' });
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-medium text-rose-600"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {googleVerifyResult && (
                  <p className={`text-xs ${googleVerifyResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {googleVerifyResult.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

'''

# Find end marker again on possibly modified t
end = t.find(end_marker)
if end < 0:
    end = t.find("{/* TAB 3: STORAGE")
if end < 0:
    raise SystemExit('end marker missing')

t = t[:start] + clean_ai + t[end:]
p.write_text(t)
print('AI tab replaced, file lines', len(t.splitlines()))

# Quick sanity: no stray CloudSettingsPanel in effects
if '<CloudSettingsPanel />' in t and 'useEffect' in t:
    # ensure not inside useEffect body incorrectly
    idx = t.find('<CloudSettingsPanel />')
    window = t[max(0, idx - 80) : idx + 40]
    if 'useEffect' in window:
        print('WARNING still near useEffect')
    else:
        print('CloudSettingsPanel only in JSX ok')
print('done')
