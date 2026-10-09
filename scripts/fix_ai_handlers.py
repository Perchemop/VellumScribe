#!/usr/bin/env python3
from pathlib import Path

p = Path('src/components/SettingsView.tsx')
t = p.read_text()

# Fix save button
t = t.replace(
    "onClick={() => handleUpdateAiSettings({ googleApiKey: googleKeyInput.trim() })}",
    "onClick={handleSaveGoogleKey}",
)

# Fix clear button block
old_clear = '''                      onClick={() => {
                        setGoogleKeyInput('');
                        handleUpdateAiSettings({ googleApiKey: '' });
                      }}'''
if old_clear in t:
    t = t.replace(old_clear, '                      onClick={handleClearGoogleKey}')

# Add handleVerifyGoogle if missing
if 'const handleVerifyGoogle' not in t and 'function handleVerifyGoogle' not in t:
    insert_after = '  const handleClearGoogleKey = () => {
    setGoogleKeyInput('');
    AiSettingsManager.setGoogleApiKey('');
    setGoogleVerifyResult(null);
    setFileUploadFeedback('Google AI Studio key removed.');
    setTimeout(() => setFileUploadFeedback(null), 3000);
  };'
    # find handleClearGoogleKey block end
    marker = 'const handleClearGoogleKey'
    idx = t.find(marker)
    if idx < 0:
        raise SystemExit('handleClearGoogleKey not found')
    # find end of function
    brace = t.find('{', idx)
    depth = 0
    i = brace
    while i < len(t):
        if t[i] == '{':
            depth += 1
        elif t[i] == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
        i += 1
    else:
        raise SystemExit('could not find end of handleClearGoogleKey')

    verify_fn = '''

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
  };'''
    t = t[:end] + verify_fn + t[end:]
    print('inserted handleVerifyGoogle')

p.write_text(t)
print('handlers fixed')
