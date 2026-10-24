# Release Keystore Generation Guide (Q-002)

To publish signed Android APKs that can **replace an already-installed copy** on a device, you need a stable release keystore. The same certificate must be used for every update; Android refuses updates with a different key ("App not installed" unless the old app is uninstalled first).

## Step 1: Generate the keystore

Run this command on a secure machine with the Java JDK installed:

```bash
keytool -genkeypair -v \
  -keystore vellumscribe-release.jks \
  -alias vellumscribe \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You will be prompted for:

- **Keystore password** (protects the whole .jks file)
- **Key password** (protects the private key inside)
- **Identity details** (name, organizational unit, organization, city, state, country code)

## Step 2: Back up the keystore

**This is critical.** Copy `vellumscribe-release.jks` to at least one secure, off-machine location (encrypted backup, password manager with file storage, etc.).

> **Warning:** If you lose this key, you can never publish an update that replaces an installed copy of VellumScribe. Users would have to uninstall the old app before installing a new one, losing all local data.

## Step 3: Create `android/keystore.properties`

Copy the example file and fill in your values:

```bash
cp android/keystore.properties.example android/keystore.properties
```

Edit `android/keystore.properties`:

```properties
storeFile=/absolute/path/to/vellumscribe-release.jks
storePassword=<your-keystore-password>
keyAlias=vellumscribe
keyPassword=<your-key-password>
```

**Never commit `android/keystore.properties` or `vellumscribe-release.jks` to git.** They are in `.gitignore`.

## Step 4: Configure CI secrets

Add the following repository secrets in GitHub (Settings → Secrets and variables → Actions):

| Secret                    | Value                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded contents of `vellumscribe-release.jks` (`base64 -w0 vellumscribe-release.jks`) |
| `ANDROID_STORE_PASSWORD`  | The keystore password                                                                         |
| `ANDROID_KEY_ALIAS`       | `vellumscribe`                                                                                |
| `ANDROID_KEY_PASSWORD`    | The key password                                                                              |

The `build-apk.yml` workflow decodes the base64 keystore, writes `android/keystore.properties`, and signs `assembleRelease`.

## Step 5: Verify

Push a tag (`git tag v3.1.1 && git push origin v3.1.1`). CI will:

1. Build and sign the release APK
2. Log `VELLUM: assembleRelease -> versionName=3.1.1 versionCode=30101 signed=true`
3. Attach signed APKs + `APK-SHA256SUMS.txt` to the GitHub Release

Verify with:

```bash
apksigner verify --print-certs VellumScribe-release.apk
```

## If you lose the keystore

You must generate a new key, bump the `applicationId` (package name) in `android/app/build.gradle`, and treat it as a new app. All existing users would need to uninstall and reinstall.
