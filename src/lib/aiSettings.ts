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
  /**
   * Retrieves user API key stored strictly in local browser storage / keystore.
   */
  public static getApiKey(): string {
    try {
      return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    } catch {
      return '';
    }
  }

  /**
   * Saves API key to local storage only.
   */
  public static setApiKey(key: string): void {
    try {
      const trimmed = key.trim();
      if (trimmed) {
        localStorage.setItem(STORAGE_KEYS.API_KEY, trimmed);
      } else {
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
      }
    } catch (e) {
      console.error('Failed to save API key to local storage', e);
    }
  }

  /**
   * Clears API key from local storage.
   */
  public static clearApiKey(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.API_KEY);
    } catch (e) {
      console.error('Failed to clear API key from local storage', e);
    }
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
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        apiKey: this.getApiKey(),
      };
    } catch {
      return { ...DEFAULT_SETTINGS, apiKey: this.getApiKey() };
    }
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
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(toSave));
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
   * Verifies the provided or locally stored API key against the test verification endpoint.
   */
  public static async testApiKey(customKey?: string): Promise<{ success: boolean; message: string; model?: string }> {
    const keyToTest = customKey || this.getApiKey();

    try {
      const res = await fetch('/api/gemini/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(keyToTest ? { 'x-gemini-api-key': keyToTest } : {}),
        },
        body: JSON.stringify({ customApiKey: keyToTest }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return {
          success: false,
          message: data.error || 'Failed to verify API key with Google AI Studio.',
        };
      }

      return {
        success: true,
        message: data.message || 'API Key verified successfully! Connected to Google AI Studio.',
        model: data.model || 'gemini-3.7-flash',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Network error while attempting to connect to AI Studio verification endpoint.',
      };
    }
  }
}
