#!/usr/bin/env python3
"""Shorten cloud provider marketing copy in SettingsView."""
from pathlib import Path

p = Path('src/components/SettingsView.tsx')
t = p.read_text()

replacements = [
    (
        "name: 'Google (SSO & Drive)',\n    category: 'Google SSO',\n    description: 'Single Sign-On authentication and encrypted backups directly to Google Drive.',",
        "name: 'Google Drive',\n    category: 'Google',\n    description: 'Sign in and back up notes.',",
    ),
    (
        "name: 'Microsoft (SSO & OneDrive)',\n    category: 'Microsoft SSO',\n    description: 'Single Sign-On authentication and encrypted backup snapshots in Microsoft OneDrive.',",
        "name: 'OneDrive',\n    category: 'Microsoft',\n    description: 'Sign in and back up notes.',",
    ),
    (
        "name: 'Nextcloud',\n    category: 'Nextcloud',\n    description: 'Store backups on private or self-hosted Nextcloud instances via WebDAV.',",
        "name: 'Nextcloud',\n    category: 'Nextcloud',\n    description: 'Private or self-hosted backup.',",
    ),
    (
        "name: 'Custom WebDAV',\n    category: 'WebDAV',\n    description: 'Universal standard WebDAV endpoint with encrypted snapshot support.',",
        "name: 'WebDAV',\n    category: 'WebDAV',\n    description: 'Any WebDAV server.',",
    ),
]

for old, new in replacements:
    if old in t:
        t = t.replace(old, new)
        print('replaced provider block')
    else:
        print('miss provider block')

# Shorter sync feedback strings
for old, new in [
    ("Operating in 100% offline air-gapped mode. Local snapshot is preserved.", "Offline — local only."),
    ("Starting cloud backup...", "Backing up…"),
    ("Sync failed (queued for automatic retry)", "Sync failed — will retry."),
    ("Sync failed. Request queued for automatic retry when online.", "Sync failed — will retry."),
    ("Processing queued offline sync requests...", "Retrying queue…"),
    ("Offline sync retry queue cleared.", "Queue cleared."),
    ("Backup frequency set to Off. Operating completely offline.", "Backups off."),
    ("Restoring and decrypting cloud backup snapshot...", "Restoring…"),
    ("✓ Cloud snapshot restored and local database updated successfully.", "Restored."),
]:
    if old in t:
        t = t.replace(old, new)

p.write_text(t)
print('cloud copy shortened')
