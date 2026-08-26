import { StorageManager } from './storage';

export interface AiIntegrationSettings {
  apiKey: string;
  preferredModel: string;
  enableAnnotationOcr: boolean;
  enableMeetingSummary: boolean;
  enableIntelligentMerge: boolean;
  summaryFormat: 'standard' | 'action_oriented' | 'executive';
}

const STORAGE_KEYS = {
  API_KEY: 'vellumscribe_ai_studio_api_key_v1',
  SETTINGS: 'vellumscribe_ai_settings_v1',
};

const DEFAULT_SETTINGS: AiIntegrationSettings = {
  apiKey: '',
  preferredModel: 'gemini-3.7-flash',
  enableAnnotationOcr: true,
  enableMeetingSummary: true,
  enableIntelligentMerge: true,
  summaryFormat: 'standard',
};

export class AiSettingsManager {
  private static initPromise: Promise<void> | null = null;

  /**
   * Initializes AI settings and hydrates cached keys from storage.
   */
  public static async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        // Pre-warm storage and check compatibility
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
    }
  }

  /**
   * Clears API key from local storage.
   */
  public static clearApiKey(): void {
    StorageManager.removeItem(STORAGE_KEYS.API_KEY);
  }

  /**
   * Checks if user has a locally configured API key.
   */
  public static hasLocalKey(): boolean {
    return Boolean(this.getApiKey());
  }

  /**
   * Get general AI settings.
   */
  public static getSettings(): AiIntegrationSettings {
    const parsed = StorageManager.getItem<Partial<AiIntegrationSettings>>(STORAGE_KEYS.SETTINGS, {});
    return {
      ...DEFAULT_SETTINGS,
      ...(parsed || {}),
      apiKey: this.getApiKey(),
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
      // Delete apiKey from settings object to keep apiKey strictly in its dedicated storage key
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

    // 1. Check if direct AI Studio key (starts with AIzaSy)
    if (/^AIzaSy[A-Za-z0-9_-]{33}$/.test(trimmed)) {
      return { key: trimmed };
    }

    // 2. Check for .env style (GEMINI_API_KEY=AIzaSy... or API_KEY=AIzaSy...)
    const envMatch = trimmed.match(/(?:GEMINI_API_KEY|GOOGLE_API_KEY|AI_STUDIO_API_KEY|API_KEY)\s*=\s*["']?([A-Za-z0-9_-]+)["']?/i);
    if (envMatch && envMatch[1]) {
      return { key: envMatch[1].trim() };
    }

    // 3. Check JSON format { "apiKey": "AIzaSy..." } or { "GEMINI_API_KEY": "..." }
    try {
      const parsed = JSON.parse(trimmed);
      const possibleKeys = ['apiKey', 'api_key', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'key', 'token'];
      for (const k of possibleKeys) {
        if (parsed[k] && typeof parsed[k] === 'string') {
          return { key: parsed[k].trim() };
        }
      }
    } catch {
      // Not JSON, continue searching
    }

    // 4. Fallback search for any AIza token pattern anywhere in content
    const generalMatch = trimmed.match(/AIzaSy[A-Za-z0-9_-]{33}/);
    if (generalMatch && generalMatch[0]) {
      return { key: generalMatch[0] };
    }

    // 5. If it looks like a generic key format (at least 20 chars without spaces)
    if (/^[A-Za-z0-9_-]{24,64}$/.test(trimmed)) {
      return { key: trimmed };
    }

    return { key: null, error: 'Could not find a valid Google AI Studio API key in this file. Keys typically begin with "AIzaSy".' };
  }

  /**
   * Verifies the provided or locally stored API key against the test verification endpoint,
   * with automatic client-side fallback if running in a standalone mobile APK (where /api routes return HTML).
   */
  public static async testApiKey(customKey?: string): Promise<{ success: boolean; message: string; model?: string }> {
    const keyToTest = (customKey || this.getApiKey()).trim();

    if (!keyToTest) {
      return {
        success: false,
        message: 'Please enter a Google AI Studio API key (starts with "AIzaSy").',
      };
    }

    // 1. Try server verification endpoint first
    try {
      const res = await fetch('/api/gemini/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keyToTest}`,
        },
        body: JSON.stringify({ customApiKey: keyToTest }),
      });

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      // Check if response is actual JSON (not HTML fallback from Capacitor / WebView)
      if (contentType.includes('application/json') || (!text.trim().startsWith('<') && text.trim().startsWith('{'))) {
        try {
          const data = JSON.parse(text);
          if (res.ok && data.success) {
            return {
              success: true,
              message: data.message || 'API Key verified successfully! Connected to Google AI Studio.',
              model: data.model || 'gemini-3.7-flash',
            };
          } else if (data.error) {
            return {
              success: false,
              message: data.error,
            };
          }
        } catch {
          // JSON parse failed, proceed to direct client fallback
        }
      }
    } catch {
      // Server request failed, proceed to direct fallback
    }

    // 2. Direct client-side verification fallback (essential for standalone APK on Android)
    try {
      const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${encodeURIComponent(keyToTest)}`;
      const directRes = await fetch(directUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with OK' }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10,
          },
        }),
      });

      const data = await directRes.json().catch(() => ({}));

      if (directRes.ok) {
        return {
          success: true,
          message: 'API Key verified successfully! Connected to Google AI Studio (gemini-3.7-flash).',
          model: 'gemini-3.7-flash',
        };
      }

      // Handle specific Google API error messages
      const apiError = data.error?.message || data.error?.status || `Google API returned status ${directRes.status}`;
      return {
        success: false,
        message: `API Key verification failed: ${apiError}`,
      };
    } catch (directErr: any) {
      return {
        success: false,
        message: directErr.message || 'Network error while connecting to Google AI Studio. Please check your internet connection.',
      };
    }
  }
}
