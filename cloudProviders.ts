import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const REDIRECT_BASE = 'com.vellumscribe.app://oauth';
const REDIRECT_OVERRIDES: Record<OAuthProvider, string | undefined> = {
  google_drive: (import.meta as any).env?.VITE_GOOGLE_REDIRECT_URI,
  dropbox: (import.meta as any).env?.VITE_DROPBOX_REDIRECT_URI,
  onedrive: (import.meta as any).env?.VITE_MICROSOFT_REDIRECT_URI,
};
const STATE_PREFIX = 'vellumscribe.oauth.state.';
const TOKEN_PREFIX = 'vellumscribe.oauth.token.';

type OAuthProvider = 'google_drive' | 'dropbox' | 'onedrive';

interface OAuthTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
  expires_in?: number;
}

interface ProviderConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
}

const config: Record<OAuthProvider, ProviderConfig> = {
  google_drive: {
    clientId: (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  },
  dropbox: {
    clientId: (import.meta as any).env?.VITE_DROPBOX_APP_KEY || '',
    authorizationEndpoint: 'https://www.dropbox.com/oauth2/authorize',
    tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    scopes: [],
  },
  onedrive: {
    clientId: (import.meta as any).env?.VITE_MICROSOFT_CLIENT_ID || '',
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['offline_access', 'Files.ReadWrite.AppFolder', 'User.Read'],
  },
};

function base64Url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function randomVerifier(): Promise<string> {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

async function secureSet(key: string, value: unknown): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.set(key, value);
}

async function secureGet<T>(key: string): Promise<T | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    return (await SecureStorage.get(key)) as T | null;
  } catch {
    return null;
  }
}

async function secureRemove(key: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.remove(key);
  } catch { /* best effort */ }
}

export class CloudProviderService {
  public static redirectUri(provider: OAuthProvider): string {
    return REDIRECT_OVERRIDES[provider] || `${REDIRECT_BASE}/${provider}`;
  }

  public static isConfigured(provider: OAuthProvider): boolean {
    return Boolean(config[provider]?.clientId);
  }

  public static async beginOAuth(provider: OAuthProvider): Promise<void> {
    if (!this.isConfigured(provider)) {
      throw new Error(`No ${provider} OAuth client ID is configured. Set the corresponding VITE_*_CLIENT_ID build variable.`);
    }
    const c = config[provider];
    const verifier = await randomVerifier();
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const codeChallenge = await challenge(verifier);
    const redirectUri = this.redirectUri(provider);
    const pending = { verifier, state, redirectUri, createdAt: Date.now() };
    if (Capacitor.isNativePlatform()) await secureSet(`${STATE_PREFIX}${provider}`, pending);
    else sessionStorage.setItem(`${STATE_PREFIX}${provider}`, JSON.stringify(pending));

    const params = new URLSearchParams({
      client_id: c.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    if (provider === 'google_drive') {
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
      params.set('scope', c.scopes.join(' '));
    } else if (provider === 'onedrive') {
      params.set('scope', c.scopes.join(' '));
    } else if (provider === 'dropbox') {
      params.set('token_access_type', 'offline');
    }

    await Browser.open({ url: `${c.authorizationEndpoint}?${params.toString()}` });
  }

  public static async handleOAuthCallback(url: string): Promise<{ provider: OAuthProvider; account: any } | null> {
    const parsed = new URL(url);
    const provider = parsed.pathname.split('/').filter(Boolean).pop() as OAuthProvider;
    if (!provider || !(provider in config)) return null;
    const error = parsed.searchParams.get('error');
    if (error) throw new Error(`Cloud authorization failed: ${error}`);
    const code = parsed.searchParams.get('code');
    const returnedState = parsed.searchParams.get('state');
    if (!code || !returnedState) throw new Error('Cloud authorization callback is incomplete.');

    let pending: any = null;
    if (Capacitor.isNativePlatform()) pending = await secureGet<any>(`${STATE_PREFIX}${provider}`);
    else {
      const raw = sessionStorage.getItem(`${STATE_PREFIX}${provider}`);
      pending = raw ? JSON.parse(raw) : null;
    }
    if (!pending || pending.state !== returnedState || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      throw new Error('Cloud authorization state is invalid or expired. Please try again.');
    }

    const c = config[provider];
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
      client_id: c.clientId,
    });
    const response = await fetch(c.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error(`Cloud token exchange failed (${response.status}).`);
    const token = await response.json() as OAuthTokenSet;
    const tokenKey = `${TOKEN_PREFIX}${provider}`;
    await secureSet(tokenKey, token);
    if (!Capacitor.isNativePlatform()) sessionStorage.removeItem(`${STATE_PREFIX}${provider}`);

    const profile = await this.fetchProfile(provider, token.access_token);
    return { provider, account: { ...profile, token } };
  }

  private static async fetchProfile(provider: OAuthProvider, accessToken: string): Promise<{ email?: string; name?: string }> {
    const endpoints: Record<OAuthProvider, string> = {
      google_drive: 'https://www.googleapis.com/oauth2/v3/userinfo',
      dropbox: 'https://api.dropboxapi.com/2/users/get_current_account',
      onedrive: 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',
    };
    const response = await fetch(endpoints[provider], {
      method: provider === 'dropbox' ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Cloud account verification failed (${response.status}).`);
    const data = await response.json();
    return {
      email: data.email || data.mail || data.userPrincipalName || data.email_address,
      name: data.name || data.displayName,
    };
  }

  public static async getToken(provider: OAuthProvider): Promise<OAuthTokenSet | null> {
    const token = await secureGet<OAuthTokenSet>(`${TOKEN_PREFIX}${provider}`);
    if (!token) return null;
    if (token.expires_at && token.expires_at < Date.now() + 60_000 && token.refresh_token) {
      return this.refresh(provider, token);
    }
    return token;
  }

  private static async refresh(provider: OAuthProvider, current: OAuthTokenSet): Promise<OAuthTokenSet> {
    const c = config[provider];
    if (!current.refresh_token) return current;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
      client_id: c.clientId,
    });
    const response = await fetch(c.tokenEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    if (!response.ok) throw new Error(`Cloud token refresh failed (${response.status}).`);
    const next = await response.json() as OAuthTokenSet;
    const merged = { ...current, ...next, refresh_token: next.refresh_token || current.refresh_token, expires_at: next.expires_in ? Date.now() + next.expires_in * 1000 : current.expires_at } as any;
    await secureSet(`${TOKEN_PREFIX}${provider}`, merged);
    return merged;
  }

  public static async revoke(provider: OAuthProvider): Promise<void> {
    await secureRemove(`${TOKEN_PREFIX}${provider}`);
  }

  public static async uploadBackup(provider: OAuthProvider, path: string, content: Uint8Array): Promise<{ bytes: number; remoteId?: string }> {
    const token = await this.getToken(provider);
    if (!token) throw new Error(`No authenticated ${provider} session. Reconnect the account.`);
    if (provider === 'google_drive') return this.uploadGoogleDrive(token.access_token, path, content);
    if (provider === 'dropbox') return this.uploadDropbox(token.access_token, path, content);
    return this.uploadOneDrive(token.access_token, path, content);
  }

  public static async downloadBackup(provider: OAuthProvider, path: string): Promise<Uint8Array | null> {
    const token = await this.getToken(provider);
    if (!token) throw new Error(`No authenticated ${provider} session. Reconnect the account.`);
    if (provider === 'google_drive') return this.downloadGoogleDrive(token.access_token, path);
    if (provider === 'dropbox') return this.downloadDropbox(token.access_token, path);
    return this.downloadOneDrive(token.access_token, path);
  }

  private static async uploadGoogleDrive(token: string, name: string, content: Uint8Array) {
    const metadata = new Blob([JSON.stringify({ name, mimeType: 'application/json', parents: [] })], { type: 'application/json' });
    const payload = new Blob([content], { type: 'application/json' });
    const form = new FormData();
    form.append('metadata', metadata);
    form.append('file', payload);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!res.ok) throw new Error(`Google Drive upload failed (${res.status}).`);
    const data = await res.json();
    return { bytes: content.byteLength, remoteId: data.id };
  }

  private static async downloadGoogleDrive(token: string, name: string) {
    const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and trashed=false`);
    const list = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1&fields=files(id,name)`, { headers: { Authorization: `Bearer ${token}` } });
    if (!list.ok) throw new Error(`Google Drive lookup failed (${list.status}).`);
    const files = await list.json();
    if (!files.files?.length) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${files.files[0].id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google Drive download failed (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  }

  private static async uploadDropbox(token: string, path: string, content: Uint8Array) {
    const res = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: `/${path.replace(/^\/+/, '')}`, mode: 'overwrite', autorename: false, mute: true }) }, body: content });
    if (!res.ok) throw new Error(`Dropbox upload failed (${res.status}).`);
    const data = await res.json();
    return { bytes: content.byteLength, remoteId: data.id };
  }

  private static async downloadDropbox(token: string, path: string) {
    const res = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: `/${path.replace(/^\/+/, '')}` }) } });
    if (res.status === 409) return null;
    if (!res.ok) throw new Error(`Dropbox download failed (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  }

  private static async uploadOneDrive(token: string, path: string, content: Uint8Array) {
    const safePath = path.replace(/^\/+/, '');
    const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(safePath)}:/content`;
    const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: content });
    if (!res.ok) throw new Error(`OneDrive upload failed (${res.status}).`);
    const data = await res.json();
    return { bytes: content.byteLength, remoteId: data.id };
  }

  private static async downloadOneDrive(token: string, path: string) {
    const safePath = path.replace(/^\/+/, '');
    const url = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${encodeURIComponent(safePath)}:/content`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OneDrive download failed (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  }

  public static async verifyNextcloud(serverUrl: string, username: string, appPassword: string): Promise<{ email: string; name: string }> {
    const base = serverUrl.replace(/\/$/, '');
    const auth = btoa(`${username}:${appPassword}`);
    const response = await fetch(`${base}/ocs/v1.php/cloud/user`, {
      headers: { Authorization: `Basic ${auth}`, 'OCS-APIRequest': 'true', Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Nextcloud authentication failed (${response.status}).`);
    const data = await response.json();
    const user = data?.ocs?.data;
    if (!user?.id) throw new Error('Nextcloud did not return a valid authenticated user.');
    await secureSet(`${TOKEN_PREFIX}nextcloud`, { serverUrl: base, username, appPassword });
    return { email: username, name: user.displayname || username };
  }

  public static async uploadNextcloudStored(path: string, content: Uint8Array) {
    const creds = await secureGet<any>(`${TOKEN_PREFIX}nextcloud`);
    if (!creds) throw new Error('Nextcloud is not authenticated.');
    return this.uploadNextcloud(creds.serverUrl, creds.username, creds.appPassword, path, content);
  }

  public static async downloadNextcloudStored(path: string): Promise<Uint8Array | null> {
    const creds = await secureGet<any>(`${TOKEN_PREFIX}nextcloud`);
    if (!creds) throw new Error('Nextcloud is not authenticated.');
    const base = creds.serverUrl.replace(/\/$/, '');
    const url = `${base}/remote.php/dav/files/${encodeURIComponent(creds.username)}/${path.replace(/^\/+/, '')}`;
    const auth = btoa(`${creds.username}:${creds.appPassword}`);
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Nextcloud download failed (${response.status}).`);
    return new Uint8Array(await response.arrayBuffer());
  }

  public static async uploadNextcloud(serverUrl: string, username: string, appPassword: string, path: string, content: Uint8Array) {
    const base = serverUrl.replace(/\/$/, '');
    const url = `${base}/remote.php/dav/files/${encodeURIComponent(username)}/${path.replace(/^\/+/, '')}`;
    const auth = btoa(`${username}:${appPassword}`);
    const res = await fetch(url, { method: 'PUT', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' }, body: content });
    if (!res.ok) throw new Error(`Nextcloud upload failed (${res.status}).`);
    return { bytes: content.byteLength };
  }
}
