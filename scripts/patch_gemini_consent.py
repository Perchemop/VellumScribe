#!/usr/bin/env python3
"""Require cloud AI consent for direct Google AI Studio calls."""
from pathlib import Path

p = Path("src/lib/geminiService.ts")
text = p.read_text()

old = "    PrivacyManager.assertNetworkAllowed('Google AI Studio');\n    const apiKey"
new = "    PrivacyManager.assertNetworkAllowed('Google AI Studio');\n    PrivacyManager.assertCloudAiConsent('Google AI Studio');\n    const apiKey"

if "assertCloudAiConsent('Google AI Studio')" in text:
    print("already patched")
    raise SystemExit(0)
if old not in text:
    raise SystemExit("marker missing")
p.write_text(text.replace(old, new, 1))
print("patched gemini consent")
