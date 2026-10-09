#!/usr/bin/env python3
from pathlib import Path

p = Path('src/components/SettingsView.tsx')
t = p.read_text()

t = t.replace(
    "onClick={() => handleUpdateAiSettings({ googleApiKey: googleKeyInput.trim() })}",
    "onClick={handleSaveGoogleKey}",
)

old_clear = """                      onClick={() => {
                        setGoogleKeyInput('');
                        handleUpdateAiSettings({ googleApiKey: '' });
                      }}"""
if old_clear in t:
    t = t.replace(old_clear, '                      onClick={handleClearGoogleKey}')

if 'const handleVerifyGoogle' not in t:
    marker = 'const handleClearGoogleKey'
    idx = t.find(marker)
    if idx < 0:
        raise SystemExit('handleClearGoogleKey not found')
    brace = t.find('{', idx)
    depth = 0
    i = brace
    end = None
    while i < len(t):
        if t[i] == '{':
            depth += 1
        elif t[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    if end is None:
        raise SystemExit('could not find end of handleClearGoogleKey')

    verify_fn = """

  const handleVerifyGoogle = async () => {
    const key = googleKeyInput.trim();
    if (!key) return;
    setIsVerifyingGoogle(true);
    setGoogleVerifyResult(null);
    try {
      AiSettingsManager.setGoogleApiKey(key);
      setGoogleVerifyResult({ success: true, message: 'Key saved.' });
    } catch (e: any) {
      setGoogleVerifyResult({ success: false, message: e?.message || 'Could not save key' });
    } finally {
      setIsVerifyingGoogle(false);
    }
  };"""
    t = t[:end] + verify_fn + t[end:]
    print('inserted handleVerifyGoogle')

p.write_text(t)
print('handlers fixed')
print('save wired', 'onClick={handleSaveGoogleKey}' in t)
print('verify defined', 'const handleVerifyGoogle' in t)
