import { StorageManager } from './storage';

export type SummaryFormat = 'executive' | 'action_items' | 'tldr' | 'outline' | 'clean_notes';

export interface AiIntegrationSettings {
  apiKey: string;
  preferredModel: string;
  enableAnnotationOcr: boolean;
  enableMeetingSummary: boolean;
  summaryFormat: SummaryFormat;
  autoExtractActionItems: boolean;
  includeTranscriptsInSummary: boolean;
  includeOcrInSummary: boolean;
  lastVerifiedAt?: string;
}

const STORAGE_KEYS = {
  API_KEY: 'vellumscribe_ai_studio_api_key_v1',
  SETTINGS: 'vellumscribe_ai_settings_v1',
  LAST_VERIFIED: 'vellumscribe_ai_last_verified_v1',
};

const DEFAULT_SETTINGS: AiIntegrationSettings = {
  apiKey: '',
  preferredModel: 'gemini-3.7-flash',
  enableAnnotationOcr: true,
  enableMeetingSummary: true,
  summaryFormat: 'executive',
  autoExtractActionItems: true,
  includeTranscriptsInSummary: true,
  includeOcrInSummary: true,
};

export class AiSettingsManager {
  private static initPromise: Promise<void> | null = null;

  /**
   * Initializes AI settings and hydrates cached keys from storage.
   */
  public static async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.getApiKey();
      })();
    }
    return this.initPromise;
  }

  /**
   * Retrieves user API key stored strictly in local browser storage / keystore.
   */
  public static getApiKey(): string {
    return StorageManager.getItem<string>(STORAGE_KEYS.API_KEY, '') || '';
  }

  /**
   * Async accessor ensuring initialization has completed before reading key.
   */
  public static async getApiKeyAsync(): Promise<string> {
    await this.initialize();
    return this.getApiKey();
  }

  /**
   * Saves API key to local storage only.
   */
  public static setApiKey(key: string): void {
    const trimmed = key.trim();
    if (trimmed) {
      StorageManager.setItem(STORAGE_KEYS.API_KEY, trimmed);
    } else {
      StorageManager.removeItem(STORAGE_KEYS.API_KEY);
      StorageManager.removeItem(STORAGE_KEYS.LAST_VERIFIED);
    }
  }

  /**
   * Clears API key from local storage.
   */
  public static clearApiKey(): void {
    StorageManager.removeItem(STORAGE_KEYS.API_KEY);
    StorageManager.removeItem(STORAGE_KEYS.LAST_VERIFIED);
  }

  /**
   * Checks if user has a locally configured API key.
   */
  public static hasLocalKey(): boolean {
    return Boolean(this.getApiKey());
  }

  /**
   * Returns a masked preview of the key, e.g. "AIzaSy...4F2x".
   */
  public static getMaskedKey(): string {
    const key = this.getApiKey();
    if (!key) return '';
    if (key.length <= 10) return '••••••••';
    return `${key.slice(0, 6)}••••••••${key.slice(-4)}`;
  }

  /**
   * Get general AI settings.
   */
  public static getSettings(): AiIntegrationSettings {
    const parsed = StorageManager.getItem<Partial<AiIntegrationSettings>>(STORAGE_KEYS.SETTINGS, {});
    const lastVerified = StorageManager.getItem<string>(STORAGE_KEYS.LAST_VERIFIED, '');
    return {
      ...DEFAULT_SETTINGS,
      ...(parsed || {}),
      apiKey: this.getApiKey(),
      lastVerifiedAt: lastVerified || undefined,
    };
  }

  /**
   * Save general AI settings.
   */
  public static saveSettings(settings: Partial<AiIntegrationSettings>): void {
    try {
      if (settings.apiKey !== undefined) {
        this.setApiKey(settings.apiKey);
      }
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      const toSave = { ...updated };
      delete (toSave as any).apiKey;
      StorageManager.setItem(STORAGE_KEYS.SETTINGS, toSave);
    } catch (e) {
      console.error('Failed to save AI settings', e);
    }
  }

  /**
   * Parses raw file contents (such as .env, JSON, or text) to extract Google AI Studio API key.
   */
  public static extractApiKeyFromFile(content: string): { key: string | null; error?: string } {
    if (!content || !content.trim()) {
      return { key: null, error: 'File is empty.' };
    }

    const trimmed = content.trim();

    // 1. Direct AI Studio key (starts with AIzaSy)
    if (/^AIzaSy[A-Za-z0-9_-]{33}$/.test(trimmed)) {
      return { key: trimmed };
    }

    // 2. .env style (GEMINI_API_KEY=AIzaSy... or API_KEY=AIzaSy...)
    const envMatch = trimmed.match(/(?:GEMINI_API_KEY|GOOGLE_API_KEY|AI_STUDIO_API_KEY|API_KEY)\s*=\s*["']?([A-Za-z0-9_-]+)["']?/i);
    if (envMatch && envMatch[1]) {
      return { key: envMatch[1].trim() };
    }

    // 3. JSON format { "apiKey": "AIzaSy..." } or { "GEMINI_API_KEY": "..." }
    try {
      const parsed = JSON.parse(trimmed);
      const possibleKeys = ['apiKey', 'api_key', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'key', 'token'];
      for (const k of possibleKeys) {
        if (parsed[k] && typeof parsed[k] === 'string') {
          return { key: parsed[k].trim() };
        }
      }
    } catch {
      // Continue search
    }

    // 4. Pattern match for AIza token pattern anywhere in content
    const generalMatch = trimmed.match(/AIzaSy[A-Za-z0-9_-]{33}/);
    if (generalMatch && generalMatch[0]) {
      return { key: generalMatch[0] };
    }

    // 5. Generic format (at least 24 chars)
    if (/^[A-Za-z0-9_-]{24,64}$/.test(trimmed)) {
      return { key: trimmed };
    }

    return { key: null, error: 'Could not find a valid Google AI Studio API key in this file. Keys typically begin with "AIzaSy".' };
  }

  /**
   * Verifies the provided or locally stored API key against the server verification endpoint.
   */
  public static async testApiKey(customKey?: string): Promise<{ success: boolean; message: string; model?: string }> {
    const keyToTest = (customKey !== undefined ? customKey : this.getApiKey()).trim();

    try {
      const res = await fetch('/api/gemini/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(keyToTest ? { Authorization: `Bearer ${keyToTest}` } : {}),
        },
        body: JSON.stringify({ customApiKey: keyToTest }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      let data: any = {};

      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        try {
          data = JSON.parse(text);
        } catch {}
      }

      if (res.ok && data.success) {
        const now = new Date().toISOString();
        StorageManager.setItem(STORAGE_KEYS.LAST_VERIFIED, now);
        return {
          success: true,
          message: data.message || 'API Key verified successfully! Connected to Google AI Studio.',
          model: data.model || 'gemini-3.7-flash',
        };
      }

      const errorMessage = data.error || (res.status ? `Verification failed (status ${res.status}).` : 'Verification failed.');
      return {
        success: false,
        message: errorMessage,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Network error while connecting to server verification service.',
      };
    }
  }
}
