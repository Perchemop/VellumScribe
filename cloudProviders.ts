/**
 * Cloud Storage Providers Service
 *
 * Honesty policy for this module: every function here either performs a
 * real network request to the provider's API and reports what actually
 * happened, or returns/throws a clear "not implemented" result. Nothing in
 * this file fabricates a success response, a token, an email address, a
 * checksum, or a byte count. See /CLOUD_PROVIDER_SETUP.md for the current
 * status of each provider and what a user needs to supply to connect it.
 *
 * Current status:
 *  - google_drive, dropbox, onedrive: the user supplies an existing OAuth
 *    access token they generated themselves (see CLOUD_PROVIDER_SETUP.md).
 *    There is no in-app "1-click" browser-redirect login flow yet.
 *    getAuthUrl()/exchangeCodeForToken() below are a real, working PKCE
 *    implementation for that flow - they are just not wired to a redirect
 *    page/UI yet. Wiring them up is a good first contribution; see
 *    CONTRIBUTING.md.
 *  - nextcloud: real WebDAV app-password authentication (server URL,
 *    username, app password) - no OAuth involved.
 *  - icloud, s3: not implemented. The UI disables connecting these.
 */

import { CloudAccount, CloudStorageProvider } from '../types';
import { SecureKeystore } from './keystore';

/** Fixed remote filename used for the single rolling backup snapshot. */
export const BACKUP_FILE_NAME = 'vellumscribe_backup.json';

export interface VerifiedCredential {
  email?: string;
  name?: string;
  storageUsedBytes?: number;
  storageTotalBytes?: number;
}

export interface CredentialInput {
  token?: string;
  serverUrl?: string;
  username?: string;
  appPassword?: string;
}

// OAuth configuration for the redirect-based PKCE flow. Client IDs are only
// populated when a real one is supplied via env vars; there is no
// placeholder/demo client ID here because a fake one cannot actually
// authenticate anyone and would produce a confusing failure instead of a
// clear "not configured" message.
export const OAUTH_CONFIGS: Record<
  CloudStorageProvider,
  {
    name: string;
    authUrl: string;
    tokenUrl: string;
    revokeUrl?: string;
    clientId: string;
    scopes: string[];
    redirectUri: string;
    defaultPath: string;
  }
> = {
  google_drive: {
    name: 'Google Drive',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    clientId: (import.meta as any).env?.VITE_GOOGLE_DRIVE_CLIENT_ID || '',
    scopes: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'http://localhost:3000/oauth/callback',
    defaultPath: 'VellumScribe',
  },
  dropbox: {
    name: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    revokeUrl: 'https://api.dropboxapi.com/2/auth/token/revoke',
    clientId: (import.meta as any).env?.VITE_DROPBOX_CLIENT_ID || '',
    scopes: ['files.content.write', 'files.content.read', 'account_info.read'],
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'http://localhost:3000/oauth/callback',
    defaultPath: 'Apps/VellumScribe',
  },
  onedrive: {
    name: 'Microsoft OneDrive',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: (import.meta as any).env?.VITE_ONEDRIVE_CLIENT_ID || '',
    scopes: ['Files.ReadWrite', 'User.Read', 'offline_access'],
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/oauth/callback` : 'http://localhost:3000/oauth/callback',
    defaultPath: 'VellumScribe',
  },
  nextcloud: {
    name: 'Nextcloud / ownCloud',
    authUrl: '',
    tokenUrl: '',
    clientId: '',
    scopes: [],
    redirectUri: '',
    defaultPath: 'VellumScribe',
  },
  s3: {
    name: 'AWS S3 / Compatible',
    authUrl: '',
    tokenUrl: '',
    clientId: '',
    scopes: [],
    redirectUri: '',
    defaultPath: '',
  },
  icloud: {
    name: 'Apple iCloud',
    authUrl: '',
    tokenUrl: '',
    clientId: '',
    scopes: [],
    redirectUri: '',
    defaultPath: '',
  },
};

/** Generate a PKCE code verifier and S256 code challenge. */
async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    throw new Error('This device does not support the Web Crypto API, so a secure OAuth login cannot be started.');
  }

  const base64Url = (bytes: Uint8Array) => {
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const verifier = base64Url(randomBytes);

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
    return { verifier, challenge: base64Url(new Uint8Array(digest)) };
  }

  throw new Error('This device does not support the Web Crypto API, so a secure OAuth login cannot be started.');
}

function joinRemotePath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

export class CloudProviderService {
  public static isOAuthConfigured(provider: CloudStorageProvider): boolean {
    return Boolean(OAUTH_CONFIGS[provider]?.clientId);
  }

  /**
   * Build a real OAuth 2.0 + PKCE authorization URL for interactive login.
   * NOTE: this is not yet called from the UI (see module docstring) - it is
   * kept here, working and ready, for whoever picks up the "wire up 1-click
   * OAuth login" contribution.
   */
  public static async getAuthUrl(
    provider: CloudStorageProvider,
    customRedirectUri?: string
  ): Promise<{ url: string; state: string; verifier: string }> {
    const config = OAUTH_CONFIGS[provider];
    if (!config || !config.authUrl) {
      throw new Error(`${provider} does not support standard web OAuth.`);
    }
    if (!config.clientId) {
      throw new Error(
        `No OAuth client ID is configured for ${config.name}. Set the corresponding VITE_*_CLIENT_ID build variable - see CLOUD_PROVIDER_SETUP.md.`
      );
    }

    const { verifier, challenge } = await generatePkcePair();
    const state = crypto.getRandomValues(new Uint32Array(4)).join('');
    const redirectUri = customRedirectUri || config.redirectUri;

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`pkce_verifier_${provider}`, verifier);
      sessionStorage.setItem(`oauth_state_${provider}`, state);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (provider === 'google_drive') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    }

    return { url: `${config.authUrl}?${params.toString()}`, state, verifier };
  }

  /**
   * Exchange an authorization code for real tokens via PKCE. Throws with a
   * descriptive error on any failure - it never returns a fabricated token.
   */
  public static async exchangeCodeForToken(
    provider: CloudStorageProvider,
    code: string,
    verifier: string,
    customRedirectUri?: string
  ): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; email?: string }> {
    const config = OAUTH_CONFIGS[provider];
    if (!config || !config.tokenUrl) {
      throw new Error(`Token exchange is not supported for ${provider}.`);
    }

    const redirectUri = customRedirectUri || config.redirectUri;
    const bodyParams = new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`${config.name} token exchange failed (HTTP ${response.status}). ${errText}`.trim());
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error(`${config.name} token exchange did not return an access token.`);
    }
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      email: data.user_email || data.email,
    };
  }

  /**
   * Verify a user-supplied credential against the real provider API. Returns
   * whatever profile info the API gives back, or throws a descriptive error.
   * This is the credential check used both when connecting an account and
   * when the user taps "Test connection" on an already-connected account.
   */
  public static async verifyCredential(
    provider: CloudStorageProvider,
    credential: CredentialInput
  ): Promise<VerifiedCredential> {
    switch (provider) {
      case 'google_drive': {
        if (!credential.token) throw new Error('An access token is required.');
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user,storageQuota', {
          headers: { Authorization: `Bearer ${credential.token}` },
        });
        if (!res.ok) {
          throw new Error(`Google Drive verification failed (HTTP ${res.status}). Check that the token is valid and has drive.file scope.`);
        }
        const data = await res.json();
        return {
          email: data.user?.emailAddress,
          name: data.user?.displayName,
          storageUsedBytes: data.storageQuota?.usage ? Number(data.storageQuota.usage) : undefined,
          storageTotalBytes: data.storageQuota?.limit ? Number(data.storageQuota.limit) : undefined,
        };
      }
      case 'dropbox': {
        if (!credential.token) throw new Error('An access token is required.');
        const res = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
          method: 'POST',
          headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`Dropbox verification failed (HTTP ${res.status}). Check that the access token is valid.`);
        }
        const data = await res.json();
        let storageUsedBytes: number | undefined;
        let storageTotalBytes: number | undefined;
        try {
          const spaceRes = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
            method: 'POST',
            headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json' },
          });
          if (spaceRes.ok) {
            const space = await spaceRes.json();
            storageUsedBytes = space.used;
            storageTotalBytes = space.allocation?.allocated;
          }
        } catch {
          // Storage usage is optional context; ignore failures here.
        }
        return { email: data.email, name: data.name?.display_name, storageUsedBytes, storageTotalBytes };
      }
      case 'onedrive': {
        if (!credential.token) throw new Error('An access token is required.');
        const res = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${credential.token}` },
        });
        if (!res.ok) {
          throw new Error(`OneDrive verification failed (HTTP ${res.status}). Check that the access token is valid.`);
        }
        const data = await res.json();
        let storageUsedBytes: number | undefined;
        let storageTotalBytes: number | undefined;
        try {
          const driveRes = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
            headers: { Authorization: `Bearer ${credential.token}` },
          });
          if (driveRes.ok) {
            const drive = await driveRes.json();
            storageUsedBytes = drive.quota?.used;
            storageTotalBytes = drive.quota?.total;
          }
        } catch {
          // Optional context.
        }
        return { email: data.mail || data.userPrincipalName, name: data.displayName, storageUsedBytes, storageTotalBytes };
      }
      case 'nextcloud': {
        if (!credential.serverUrl || !credential.username || !credential.appPassword) {
          throw new Error('Server URL, username, and app password are all required.');
        }
        const base = credential.serverUrl.replace(/\/+$/, '');
        const auth = btoa(`${credential.username}:${credential.appPassword}`);
        const res = await fetch(`${base}/ocs/v1.php/cloud/user?format=json`, {
          headers: { Authorization: `Basic ${auth}`, 'OCS-APIRequest': 'true', Accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`Nextcloud verification failed (HTTP ${res.status}). Check the server URL, username, and app password.`);
        }
        const data = await res.json();
        const user = data?.ocs?.data;
        if (!user?.id) {
          throw new Error('Nextcloud did not return a valid authenticated user for those credentials.');
        }
        return {
          email: user.id,
          name: user.displayname || user.id,
          storageUsedBytes: typeof user.quota?.used === 'number' ? user.quota.used : undefined,
          storageTotalBytes: typeof user.quota?.total === 'number' ? user.quota.total : undefined,
        };
      }
      default:
        throw new Error(`${provider} isn't implemented as a live sync backend yet.`);
    }
  }

  /** Re-check an already-connected account's stored credential. */
  public static async testSsoSession(
    account: CloudAccount
  ): Promise<{ success: boolean; latencyMs: number; message: string }> {
    const start = performance.now();
    try {
      const profile = await this.verifyCredential(account.provider, this.credentialFromAccount(account));
      const latencyMs = Math.round(performance.now() - start);
      return {
        success: true,
        latencyMs,
        message: `Connection verified${profile.email ? ` as ${profile.email}` : ''} (${latencyMs}ms).`,
      };
    } catch (e: any) {
      return {
        success: false,
        latencyMs: Math.round(performance.now() - start),
        message: e?.message || 'Connection check failed.',
      };
    }
  }

  private static credentialFromAccount(account: CloudAccount): CredentialInput {
    if (account.provider === 'nextcloud') {
      return { serverUrl: account.server_url, username: account.user_email, appPassword: account.access_token };
    }
    return { token: account.access_token };
  }

  /** Revoke tokens upstream on disconnect (best-effort; not all providers support it). */
  public static async revoke(account: CloudAccount): Promise<void> {
    const config = OAUTH_CONFIGS[account.provider];
    const token = account.access_token;

    if (config?.revokeUrl && token) {
      try {
        if (account.provider === 'google_drive') {
          await fetch(`${config.revokeUrl}?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } else if (account.provider === 'dropbox') {
          await fetch(config.revokeUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch (e) {
        console.warn(`Upstream revocation failed for ${account.provider}`, e);
      }
    }

    if (account.refresh_token_alias) {
      try {
        await SecureKeystore.deleteSecret(account.refresh_token_alias);
      } catch {
        // Best-effort local cleanup only.
      }
    }
  }

  public static async signOutSso(account: CloudAccount): Promise<void> {
    await this.revoke(account);
  }

  /**
   * Upload the local backup snapshot to the connected provider. Returns
   * success only when a real upload actually succeeded; otherwise returns
   * success:false with a human-readable reason. Never fabricates success.
   */
  public static async uploadBackup(
    account: CloudAccount,
    fileName: string,
    content: string
  ): Promise<{ success: boolean; bytesUploaded: number; fileId?: string; error?: string }> {
    const bytes = new TextEncoder().encode(content);

    try {
      switch (account.provider) {
        case 'google_drive': {
          if (!account.access_token) {
            return { success: false, bytesUploaded: 0, error: 'Google Drive account is not connected.' };
          }
          const token = account.access_token;
          const q = encodeURIComponent(`name='${fileName.replace(/'/g, "\\'")}' and trashed=false`);
          const listRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1&fields=files(id)`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const existingId = listRes.ok ? (await listRes.json()).files?.[0]?.id : undefined;

          if (existingId) {
            const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: bytes,
            });
            if (!res.ok) return { success: false, bytesUploaded: 0, error: `Google Drive update failed (HTTP ${res.status}).` };
            const data = await res.json();
            return { success: true, bytesUploaded: bytes.byteLength, fileId: data.id };
          }

          const metadata = { name: fileName, mimeType: 'application/json' };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', new Blob([bytes], { type: 'application/json' }));
          const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          if (!res.ok) return { success: false, bytesUploaded: 0, error: `Google Drive upload failed (HTTP ${res.status}).` };
          const data = await res.json();
          return { success: true, bytesUploaded: bytes.byteLength, fileId: data.id };
        }

        case 'dropbox': {
          if (!account.access_token) {
            return { success: false, bytesUploaded: 0, error: 'Dropbox account is not connected.' };
          }
          const path = '/' + joinRemotePath(account.cloud_backup_path || 'VellumScribe', fileName);
          const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', mute: true }),
              'Content-Type': 'application/octet-stream',
            },
            body: bytes,
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { success: false, bytesUploaded: 0, error: `Dropbox upload failed (HTTP ${res.status}). ${errText}`.trim() };
          }
          const data = await res.json();
          return { success: true, bytesUploaded: bytes.byteLength, fileId: data.id };
        }

        case 'onedrive': {
          if (!account.access_token) {
            return { success: false, bytesUploaded: 0, error: 'OneDrive account is not connected.' };
          }
          const safePath = joinRemotePath(account.cloud_backup_path || 'VellumScribe', fileName);
          const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${safePath
            .split('/')
            .map(encodeURIComponent)
            .join('/')}:/content`;
          const res = await fetch(url, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/octet-stream' },
            body: bytes,
          });
          if (!res.ok) return { success: false, bytesUploaded: 0, error: `OneDrive upload failed (HTTP ${res.status}).` };
          const data = await res.json();
          return { success: true, bytesUploaded: bytes.byteLength, fileId: data.id };
        }

        case 'nextcloud': {
          if (!account.server_url || !account.user_email || !account.access_token) {
            return {
              success: false,
              bytesUploaded: 0,
              error: 'Nextcloud account is not fully configured (server URL, username, or app password missing).',
            };
          }
          const base = account.server_url.replace(/\/+$/, '');
          const remotePath = joinRemotePath(account.cloud_backup_path || 'VellumScribe', fileName);
          const url = `${base}/remote.php/dav/files/${encodeURIComponent(account.user_email)}/${remotePath
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`;
          const auth = btoa(`${account.user_email}:${account.access_token}`);
          const res = await fetch(url, {
            method: 'PUT',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: bytes,
          });
          if (!res.ok) {
            return {
              success: false,
              bytesUploaded: 0,
              error: `Nextcloud upload failed (HTTP ${res.status}). Make sure the backup folder exists on the server.`,
            };
          }
          return { success: true, bytesUploaded: bytes.byteLength };
        }

        default:
          return { success: false, bytesUploaded: 0, error: `${account.provider} backup upload isn't implemented yet.` };
      }
    } catch (e: any) {
      return { success: false, bytesUploaded: 0, error: e?.message || 'Upload failed due to a network error.' };
    }
  }

  /** Download the rolling backup snapshot from the connected provider, or null if none exists / not supported. */
  public static async downloadLatestBackup(
    account: CloudAccount
  ): Promise<{ content: string; fileName: string; timestamp: string } | null> {
    try {
      switch (account.provider) {
        case 'google_drive': {
          if (!account.access_token) return null;
          const q = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and trashed=false`);
          const listRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1&fields=files(id,name,modifiedTime)`,
            { headers: { Authorization: `Bearer ${account.access_token}` } }
          );
          if (!listRes.ok) return null;
          const file = (await listRes.json()).files?.[0];
          if (!file) return null;
          const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { Authorization: `Bearer ${account.access_token}` },
          });
          if (!fileRes.ok) return null;
          return { content: await fileRes.text(), fileName: file.name, timestamp: file.modifiedTime || new Date().toISOString() };
        }

        case 'dropbox': {
          if (!account.access_token) return null;
          const path = '/' + joinRemotePath(account.cloud_backup_path || 'VellumScribe', BACKUP_FILE_NAME);
          const res = await fetch('https://content.dropboxapi.com/2/files/download', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              'Dropbox-API-Arg': JSON.stringify({ path }),
            },
          });
          if (!res.ok) return null;
          return { content: await res.text(), fileName: BACKUP_FILE_NAME, timestamp: new Date().toISOString() };
        }

        case 'onedrive': {
          if (!account.access_token) return null;
          const safePath = joinRemotePath(account.cloud_backup_path || 'VellumScribe', BACKUP_FILE_NAME);
          const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${safePath
            .split('/')
            .map(encodeURIComponent)
            .join('/')}:/content`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${account.access_token}` } });
          if (!res.ok) return null;
          return { content: await res.text(), fileName: BACKUP_FILE_NAME, timestamp: new Date().toISOString() };
        }

        case 'nextcloud': {
          if (!account.server_url || !account.user_email || !account.access_token) return null;
          const base = account.server_url.replace(/\/+$/, '');
          const remotePath = joinRemotePath(account.cloud_backup_path || 'VellumScribe', BACKUP_FILE_NAME);
          const url = `${base}/remote.php/dav/files/${encodeURIComponent(account.user_email)}/${remotePath
            .split('/')
            .map(encodeURIComponent)
            .join('/')}`;
          const auth = btoa(`${account.user_email}:${account.access_token}`);
          const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
          if (!res.ok) return null;
          return { content: await res.text(), fileName: BACKUP_FILE_NAME, timestamp: new Date().toISOString() };
        }

        default:
          return null;
      }
    } catch (e) {
      console.warn(`Backup download check failed for ${account.provider}`, e);
      return null;
    }
  }
}
