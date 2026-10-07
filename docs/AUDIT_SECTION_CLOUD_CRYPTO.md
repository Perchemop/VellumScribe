# Audit section — Cloud backup crypto & sync

## Strengths

| Area | Assessment |
|------|------------|
| Envelope | v3 `EncryptedCloudBackupEnvelope`: AES-256-GCM, PBKDF2-HMAC-SHA256 @ 210k iterations, gzip |
| Export path | `StorageManager.exportCloudBackupArchive` → `CloudBackupCrypto.encryptArchive` |
| Key storage | Prefer Android Keystore alias `client_vault_key`; migrate off plaintext localStorage; fail closed if metadata exists but decrypt fails |
| Legacy import | Unencrypted JSON only with explicit `allowLegacyUnencrypted` |
| Sync | Session token in memory/keystore (not localStorage); network asserts; offline queue + staged MediaRepository blobs; chunked upload >2MB |
| Accounts cache | localStorage `vs_cloud_accounts` after server config |

## Residual risks / open items

1. **Ephemeral vault key on web** — If keystore path fails, `getOrCreateClientVaultKey` may hold an in-memory key that is lost on reload → prior cloud backups become undecryptable on that browser profile. Mitigate: surface “backup passphrase” UI for cross-device restore (optional user passphrase already supported in `encryptArchive`).
2. **No multi-device key export UX** — Device-bound vault key means Drive/OneDrive copies are not portable without user passphrase or key export flow.
3. **OAuth env** — Google/Microsoft still require server secrets + App Links for production APK (device E2E).
4. **Queue retry policy** — `processSyncQueue` stops on first network exception; acceptable but could backoff per-item.

No in-repo correctness bug found in encrypt/decrypt path for the intended single-device model.
