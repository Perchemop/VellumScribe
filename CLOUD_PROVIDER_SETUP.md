# Cloud Backup Provider Setup & Architecture

This document describes the cloud backup integration in VellumScribe, including OAuth 2.0 endpoints, chunked archive streaming, and provider setup instructions.

## Supported Cloud Destinations

| Provider | Connect Method | Upload / Streaming | Status |
|---|---|---|---|
| **Google Drive** | 1-Click OAuth 2.0 (`/api/cloud/google_drive/connect`) | Direct & Resumable Chunked (`application/octet-stream`) | Fully Implemented & Functional |
| **Microsoft OneDrive** | 1-Click OAuth 2.0 (`/api/cloud/microsoft/connect`) | Direct & Resumable Chunked (Microsoft Graph AppFolder) | Fully Implemented & Functional |

---

## 1. Setting up Google Drive OAuth 2.0

To enable 1-click Google Drive backup synchronization:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a Project (e.g., `VellumScribe`).
3. Enable the **Google Drive API** under **APIs & Services -> Enabled APIs & Services**.
4. Configure the **OAuth Consent Screen** (User Type: External / Internal) and add scopes:
   - `https://www.googleapis.com/auth/drive.file` (access only to files created by VellumScribe)
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
5. Create credentials under **Credentials -> Create Credentials -> OAuth Client ID**:
   - Application Type: **Web Application**
   - Authorized redirect URIs: `https://<YOUR_APP_DOMAIN>/api/cloud/google_drive/callback` (or `http://localhost:3000/api/cloud/google_drive/callback` for local development)
6. Add the credentials to your environment (`.env` or Cloud Run environment variables):
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=https://<YOUR_APP_DOMAIN>/api/cloud/google_drive/callback
   ```

---

## 2. Setting up Microsoft OneDrive OAuth 2.0

To enable 1-click Microsoft OneDrive backup synchronization:

1. Go to the [Microsoft Entra Admin Center / Azure Portal](https://portal.azure.com/).
2. Navigate to **App Registrations -> New registration**:
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts (e.g. Skype, Xbox, Outlook.com)**.
   - Redirect URI (Web): `https://<YOUR_APP_DOMAIN>/api/cloud/microsoft/callback`.
3. Under **Certificates & secrets**, generate a new Client Secret.
4. Under **API permissions**, add Delegated permissions for **Microsoft Graph**:
   - `Files.ReadWrite.AppFolder`
   - `User.Read`
   - `offline_access`
5. Add the credentials to your environment:
   ```env
   MICROSOFT_CLIENT_ID=your_microsoft_client_id
   MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
   MICROSOFT_REDIRECT_URI=https://<YOUR_APP_DOMAIN>/api/cloud/microsoft/callback
   ```

---

## 3. Streaming & Chunked Upload Architecture

VellumScribe includes a resilient binary backup pipeline:

1. **Snapshot Generation & Compression**: Notes, metadata, audio recordings, OCR scans, and sketches are packed into a portable binary structure and compressed with native gzip (`CompressionStream('gzip')`).
2. **Dynamic Transport**:
   - Archives `< 2MB`: Uploaded directly as `application/octet-stream` via `/api/cloud/:provider/backup`.
   - Archives `> 2MB`: Sliced into 1MB chunks and streamed with sha256 checksum verification via `/api/cloud/:provider/chunk/init`, `/api/cloud/:provider/chunk/upload`, and `/api/cloud/:provider/chunk/commit`.
3. **Retention Pruning**: Up to 10 latest snapshots are maintained per provider with automatic rolling pruning upon successful upload.
4. **Transactional Restore**: Validates archive integrity, takes a pre-restore safety snapshot of the local database, decompresses the archive, and verifies all notes before committing changes.
