import { StorageManager } from './storage';
import { AndroidKeystoreManager } from './keystore';
import { AppLogger } from './logger';
import { asErrorLike } from './errorLike';

export type SummaryFormat = 'executive' | 'action_items' | 'tldr' | 'outline' | 'clean_notes';

export type LlmProvider = 'google' | 'groq' | 'offline_rules';
export type TranscriptionProvider =
  'google' | 'groq_whisper' | 'deepgram' | 'local_whisper' | 'browser_speech';
export type OcrProvider = 'google' | 'offline_rules';

export interface AiIntegrationSettings {
  // Provider routing
  primaryLlmProvider: LlmProvider;
  primaryTranscriptionProvider: TranscriptionProvider;
  autoFallbackToLocal: boolean;

  // BYOK API Keys (stored locally only)
  googleApiKey: string;
  groqApiKey: string;
  deepgramApiKey: string;

  // Model & Endpoint configurations
  googleModel: string;
  groqModel: string;
  deepgramModel: string;
  localWhisperEndpoint: string;

  // Backward-compatible properties
  apiKey: string;
  preferredModel: string;

  // Feature preferences
  enableAnnotationOcr: boolean;
  enableMeetingSummary: boolean;
  summaryFormat: SummaryFormat;
  autoExtractActionItems: boolean;
  includeTranscriptsInSummary: boolean;
  includeOcrInSummary: boolean;
  lastVerifiedAt?: string;
}

export const AI_PROVIDERS_META = {
  google: {
    id: 'google',
    name: 'Google AI Studio (Gemini)',
    category: 'Cloud Multimodal (Free Tier)',
    description:
      'Ultra-fast vision OCR, audio transcription, and long-context meeting synthesis with generous free tier quotas.',
    models: [
      {
        id: 'gemini-3.6-flash',
        name: 'Gemini 3.6 Flash (Recommended)',
        desc: 'Fast, high accuracy synthesis & vision',
      },
      {
        id: 'gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
        desc: 'Cutting-edge reasoning & analysis',
      },
      {
        id: 'gemini-3.1-flash-lite',
        name: 'Gemini 3.1 Flash Lite',
        desc: 'Minimal latency & low token consumption',
      },
      {
        id: 'gemini-flash-latest',
        name: 'Gemini Flash Latest',
        desc: 'Auto-updating latest stable release',
      },
    ],
    transcriptionModels: [
      {
        id: 'gemini-3.5-transcribe',
        name: 'Gemini 3.5 Transcribe',
        desc: 'Optimized high-fidelity speech recognition',
      },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'Multimodal audio reasoning' },
    ],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIzaSy...',
    keyPrefix: 'AIzaSy',
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud (LPU Inference)',
    category: 'High-Speed Cloud (Free Tier)',
    description:
      'Near-instantaneous LLM inference via custom LPUs with free access to open-source models and Whisper Large.',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        desc: 'Top-tier open intelligence on LPUs',
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        desc: 'Sub-second real-time streaming responses',
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B (32k Context)',
        desc: 'High capacity long-meeting synthesizer',
      },
    ],
    transcriptionModels: [
      {
        id: 'whisper-large-v3-turbo',
        name: 'Whisper Large v3 Turbo',
        desc: 'Lightning-fast transcription on Groq hardware',
      },
      {
        id: 'whisper-large-v3',
        name: 'Whisper Large v3',
        desc: 'High accuracy multilingual transcription',
      },
    ],
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    keyPrefix: 'gsk_',
  },
  deepgram: {
    id: 'deepgram',
    name: 'Deepgram Speech Engine',
    category: 'Dedicated Audio AI (Free Tier)',
    description:
      'Enterprise-grade end-to-end speech recognition with Nova-3 acoustics and auto-formatting.',
    transcriptionModels: [
      { id: 'nova-3', name: 'Nova-3 (Latest)', desc: 'Next-gen speech accuracy & speed' },
      { id: 'nova-2', name: 'Nova-2', desc: 'Industry-standard high accuracy transcription' },
      { id: 'enhanced', name: 'Enhanced Speech', desc: 'Robust in noisy ambient environments' },
    ],
    keyUrl: 'https://console.deepgram.com',
    keyPlaceholder: '••••••••',
    keyPrefix: '',
  },
  local_whisper: {
    id: 'local_whisper',
    name: 'Local Whisper Server (100% Offline)',
    category: 'Local Speech Server (No Account)',
    description:
      'Connect to local whisper.cpp, faster-whisper-server, or LocalAI transcription daemon on your machine.',
    defaultEndpoint: 'http://localhost:8080/v1/audio/transcriptions',
  },
  offline_rules: {
    id: 'offline_rules',
    name: 'Built-in Local Rule Engine (Default)',
    category: 'Device Native (100% Offline / Zero Setup)',
    description:
      'Deterministic extractive synthesis, task detector, and note digest running directly on-device without any API keys or internet connection.',
  },
  browser_speech: {
    id: 'browser_speech',
    name: 'Native Speech Recognition (Default)',
    category: 'Device Native (100% Offline / Zero Setup)',
    description:
      'Real-time on-device speech recognition via Web Speech API and acoustic signal analyzer. No external network requests or keys required.',
  },
};

const STORAGE_KEYS = {
  SETTINGS: 'vellumscribe_ai_settings_v2',
  GOOGLE_KEY: 'vellumscribe_ai_studio_api_key_v1',
  GROQ_KEY: 'vellumscribe_groq_api_key_v1',
  DEEPGRAM_KEY: 'vellumscribe_deepgram_api_key_v1',
  LAST_VERIFIED: 'vellumscribe_ai_last_verified_v1',
};

const DEFAULT_SETTINGS: AiIntegrationSettings = {
  primaryLlmProvider: 'offline_rules',
  primaryTranscriptionProvider: 'browser_speech',
  autoFallbackToLocal: true,

  googleApiKey: '',
  groqApiKey: '',
  deepgramApiKey: '',

  googleModel: 'gemini-3.6-flash',
  groqModel: 'llama-3.3-70b-versatile',
  deepgramModel: 'nova-3',
  localWhisperEndpoint: '',

  apiKey: '',
  preferredModel: 'gemini-3.6-flash',

  enableAnnotationOcr: true,
  enableMeetingSummary: true,
  summaryFormat: 'executive',
  autoExtractActionItems: true,
  includeTranscriptsInSummary: true,
  includeOcrInSummary: true,
};

export class AiSettingsManager {
  private static initPromise: Promise<void> | null = null;
  private static cachedGoogleKey: string | null = null;
  private static cachedGroqKey: string | null = null;
  private static cachedDeepgramKey: string | null = null;

  public static async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          // 1. Google API Key
          let googleKey = await AndroidKeystoreManager.getSecret('google_api_key');
          if (!googleKey) {
            const legacy =
              StorageManager.getItem<string>(STORAGE_KEYS.GOOGLE_KEY, '') ||
              (typeof localStorage !== 'undefined'
                ? localStorage.getItem('gemini_api_key') ||
                  localStorage.getItem('vs_gemini_api_key') ||
                  ''
                : '');
            if (legacy && legacy.trim()) {
              await AndroidKeystoreManager.saveSecret('google_api_key', legacy.trim(), 'api_key');
              const verified = await AndroidKeystoreManager.getSecret('google_api_key');
              if (verified === legacy.trim()) {
                StorageManager.removeItem(STORAGE_KEYS.GOOGLE_KEY);
                if (typeof localStorage !== 'undefined') {
                  localStorage.removeItem('gemini_api_key');
                  localStorage.removeItem('vs_gemini_api_key');
                }
                googleKey = verified;
              }
            }
          }
          this.cachedGoogleKey = googleKey || '';

          // 2. Groq API Key
          let groqKey = await AndroidKeystoreManager.getSecret('groq_api_key');
          if (!groqKey) {
            const legacy = StorageManager.getItem<string>(STORAGE_KEYS.GROQ_KEY, '');
            if (legacy && legacy.trim()) {
              await AndroidKeystoreManager.saveSecret('groq_api_key', legacy.trim(), 'api_key');
              const verified = await AndroidKeystoreManager.getSecret('groq_api_key');
              if (verified === legacy.trim()) {
                StorageManager.removeItem(STORAGE_KEYS.GROQ_KEY);
                groqKey = verified;
              }
            }
          }
          this.cachedGroqKey = groqKey || '';

          // 3. Deepgram API Key
          let deepgramKey = await AndroidKeystoreManager.getSecret('deepgram_api_key');
          if (!deepgramKey) {
            const legacy = StorageManager.getItem<string>(STORAGE_KEYS.DEEPGRAM_KEY, '');
            if (legacy && legacy.trim()) {
              await AndroidKeystoreManager.saveSecret('deepgram_api_key', legacy.trim(), 'api_key');
              const verified = await AndroidKeystoreManager.getSecret('deepgram_api_key');
              if (verified === legacy.trim()) {
                StorageManager.removeItem(STORAGE_KEYS.DEEPGRAM_KEY);
                deepgramKey = verified;
              }
            }
          }
          this.cachedDeepgramKey = deepgramKey || '';
        } catch (e) {
          AppLogger.warn(
            'AiSettings',
            '[AiSettingsManager] Failed during secure key initialization:',
            e
          );
        }
        this.getSettings();
      })();
    }
    return this.initPromise;
  }

  // --- Key Accessors ---
  public static getGoogleApiKey(): string {
    if (this.cachedGoogleKey !== null) return this.cachedGoogleKey;
    return StorageManager.getItem<string>(STORAGE_KEYS.GOOGLE_KEY, '') || '';
  }

  public static setGoogleApiKey(key: string): void {
    const trimmed = key.trim();
    this.cachedGoogleKey = trimmed;
    StorageManager.removeItem(STORAGE_KEYS.GOOGLE_KEY);
    if (trimmed) {
      AndroidKeystoreManager.saveSecret('google_api_key', trimmed, 'api_key').catch((e) => {
        AppLogger.warn('AiSettings', 'Failed to save Google API key to keystore', e);
      });
    } else {
      AndroidKeystoreManager.deleteSecret('google_api_key').catch((e) => {
        AppLogger.warn('AiSettings', 'Failed to delete Google API key from keystore', e);
      });
    }
  }

  public static getGroqApiKey(): string {
    if (this.cachedGroqKey !== null) return this.cachedGroqKey;
    return StorageManager.getItem<string>(STORAGE_KEYS.GROQ_KEY, '') || '';
  }

  public static setGroqApiKey(key: string): void {
    const trimmed = key.trim();
    this.cachedGroqKey = trimmed;
    StorageManager.removeItem(STORAGE_KEYS.GROQ_KEY);
    if (trimmed) {
      AndroidKeystoreManager.saveSecret('groq_api_key', trimmed, 'api_key').catch((e) => {
        AppLogger.warn('AiSettings', 'Failed to save Groq API key to keystore', e);
      });
    } else {
      AndroidKeystoreManager.deleteSecret('groq_api_key').catch((e) => {
        AppLogger.warn('AiSettings', 'Failed to delete Groq API key from keystore', e);
      });
    }
  }

  public static getDeepgramApiKey(): string {
    if (this.cachedDeepgramKey !== null) return this.cachedDeepgramKey;
    return StorageManager.getItem<string>(STORAGE_KEYS.DEEPGRAM_KEY, '') || '';
  }

  public static setDeepgramApiKey(key: string): void {
    const trimmed = key.trim();
    this.cachedDeepgramKey = trimmed;
    StorageManager.removeItem(STORAGE_KEYS.DEEPGRAM_KEY);
    if (trimmed) {
      AndroidKeystoreManager.saveSecret('deepgram_api_key', trimmed, 'api_key').catch((e) => {
        AppLogger.warn('AiSettings', 'Failed to save Deepgram API key to keystore', e);
      });
    } else {
      AndroidKeystoreManager.deleteSecret('deepgram_api_key').catch((e) => {
        AppLogger.warn('AiSettings', 'Failed to delete Deepgram API key from keystore', e);
      });
    }
  }

  /**
   * Returns key for current active provider or Google key for backwards compatibility.
   */
  public static getApiKey(): string {
    const settings = this.getSettings();
    if (settings.primaryLlmProvider === 'groq') {
      return this.getGroqApiKey();
    }
    return this.getGoogleApiKey();
  }

  public static async getApiKeyAsync(): Promise<string> {
    await this.initialize();
    return this.getApiKey();
  }

  public static setApiKey(key: string): void {
    this.setGoogleApiKey(key);
  }

  public static clearApiKey(): void {
    this.cachedGoogleKey = '';
    this.cachedGroqKey = '';
    this.cachedDeepgramKey = '';
    StorageManager.removeItem(STORAGE_KEYS.GOOGLE_KEY);
    StorageManager.removeItem(STORAGE_KEYS.GROQ_KEY);
    StorageManager.removeItem(STORAGE_KEYS.DEEPGRAM_KEY);
    StorageManager.removeItem(STORAGE_KEYS.LAST_VERIFIED);
    AndroidKeystoreManager.deleteSecret('google_api_key').catch(() => {});
    AndroidKeystoreManager.deleteSecret('groq_api_key').catch(() => {});
    AndroidKeystoreManager.deleteSecret('deepgram_api_key').catch(() => {});
  }

  public static hasLocalKey(): boolean {
    const s = this.getSettings();
    if (s.primaryLlmProvider === 'offline_rules') {
      return true; // Local inference doesn't require cloud key
    }
    if (s.primaryLlmProvider === 'groq') {
      return Boolean(this.getGroqApiKey());
    }
    return Boolean(this.getGoogleApiKey());
  }

  public static getMaskedKey(key?: string): string {
    const k = key !== undefined ? key : this.getApiKey();
    if (!k) return '';
    if (k.length <= 8) return '••••••••';
    return `${k.slice(0, 5)}••••••••${k.slice(-4)}`;
  }

  // --- Settings Persistence ---
  public static getSettings(): AiIntegrationSettings {
    const parsed = StorageManager.getItem<Partial<AiIntegrationSettings>>(
      STORAGE_KEYS.SETTINGS,
      {}
    );
    const googleKey = this.getGoogleApiKey();
    const groqKey = this.getGroqApiKey();
    const deepgramKey = this.getDeepgramApiKey();
    const lastVerified = StorageManager.getItem<string>(STORAGE_KEYS.LAST_VERIFIED, '');

    const resolved: AiIntegrationSettings = {
      ...DEFAULT_SETTINGS,
      ...(parsed || {}),
      primaryLlmProvider: parsed?.primaryLlmProvider || 'offline_rules',
      primaryTranscriptionProvider: parsed?.primaryTranscriptionProvider || 'browser_speech',
      localWhisperEndpoint:
        parsed?.localWhisperEndpoint !== undefined ? parsed.localWhisperEndpoint : '',
      googleApiKey: googleKey,
      groqApiKey: groqKey,
      deepgramApiKey: deepgramKey,
      apiKey: googleKey || groqKey,
      lastVerifiedAt: lastVerified || undefined,
    };

    return resolved;
  }

  public static saveSettings(settings: Partial<AiIntegrationSettings>): void {
    try {
      if (settings.googleApiKey !== undefined) {
        this.setGoogleApiKey(settings.googleApiKey);
      }
      if (settings.groqApiKey !== undefined) {
        this.setGroqApiKey(settings.groqApiKey);
      }
      if (settings.deepgramApiKey !== undefined) {
        this.setDeepgramApiKey(settings.deepgramApiKey);
      }
      if (settings.apiKey !== undefined && !settings.googleApiKey) {
        this.setGoogleApiKey(settings.apiKey);
      }

      const current = this.getSettings();
      const updated = { ...current, ...settings };
      // API keys live in the keystore, never in the settings blob.
      const {
        googleApiKey: _googleApiKey,
        groqApiKey: _groqApiKey,
        deepgramApiKey: _deepgramApiKey,
        apiKey: _apiKey,
        ...toSave
      } = updated;

      StorageManager.setItem(STORAGE_KEYS.SETTINGS, toSave);
    } catch (e) {
      AppLogger.error('AiSettings', 'Failed to save AI settings', e);
    }
  }

  /**
   * Intelligently parses raw file content or clipboard text for API keys across providers.
   */
  public static extractApiKeyFromFile(content: string): {
    key: string | null;
    provider?: 'google' | 'groq' | 'deepgram';
    error?: string;
  } {
    if (!content || !content.trim()) {
      return { key: null, error: 'File is empty.' };
    }

    const trimmed = content.trim();

    // 1. Google AI Studio key
    if (/^AIzaSy[A-Za-z0-9_-]{33}$/.test(trimmed)) {
      return { key: trimmed, provider: 'google' };
    }

    // 2. Groq key
    if (/^gsk_[A-Za-z0-9]{30,80}$/.test(trimmed)) {
      return { key: trimmed, provider: 'groq' };
    }

    // 3. .env format
    const groqMatch = trimmed.match(/(?:GROQ_API_KEY|GROQ_KEY)\s*=\s*["']?([A-Za-z0-9_-]+)["']?/i);
    if (groqMatch && groqMatch[1]) {
      return { key: groqMatch[1].trim(), provider: 'groq' };
    }

    const deepgramMatch = trimmed.match(
      /(?:DEEPGRAM_API_KEY|DEEPGRAM_KEY)\s*=\s*["']?([A-Za-z0-9_-]+)["']?/i
    );
    if (deepgramMatch && deepgramMatch[1]) {
      return { key: deepgramMatch[1].trim(), provider: 'deepgram' };
    }

    const googleMatch = trimmed.match(
      /(?:GEMINI_API_KEY|GOOGLE_API_KEY|AI_STUDIO_API_KEY|API_KEY)\s*=\s*["']?([A-Za-z0-9_-]+)["']?/i
    );
    if (googleMatch && googleMatch[1]) {
      return { key: googleMatch[1].trim(), provider: 'google' };
    }

    // 4. JSON format
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.GROQ_API_KEY || parsed.groqApiKey) {
        return { key: String(parsed.GROQ_API_KEY || parsed.groqApiKey).trim(), provider: 'groq' };
      }
      if (parsed.DEEPGRAM_API_KEY || parsed.deepgramApiKey) {
        return {
          key: String(parsed.DEEPGRAM_API_KEY || parsed.deepgramApiKey).trim(),
          provider: 'deepgram',
        };
      }
      if (parsed.GEMINI_API_KEY || parsed.googleApiKey || parsed.apiKey) {
        return {
          key: String(parsed.GEMINI_API_KEY || parsed.googleApiKey || parsed.apiKey).trim(),
          provider: 'google',
        };
      }
    } catch {
      /* ignore */
    }

    // 5. Pattern search anywhere in content
    const gskRegex = /gsk_[A-Za-z0-9]{30,80}/;
    const gskFound = trimmed.match(gskRegex);
    if (gskFound) return { key: gskFound[0], provider: 'groq' };

    const aizaRegex = /AIzaSy[A-Za-z0-9_-]{33}/;
    const aizaFound = trimmed.match(aizaRegex);
    if (aizaFound) return { key: aizaFound[0], provider: 'google' };

    // 6. Generic token fallback
    if (/^[A-Za-z0-9_-]{24,64}$/.test(trimmed)) {
      return { key: trimmed, provider: 'google' };
    }

    return {
      key: null,
      error:
        'Could not detect a valid Google AI Studio (AIzaSy...), Groq (gsk_...), or Deepgram API key in this input.',
    };
  }

  /**
   * Tests connection to any chosen provider.
   */
  public static async testProviderConnection(
    provider: LlmProvider | TranscriptionProvider,
    options?: { key?: string; endpoint?: string; model?: string }
  ): Promise<{
    success: boolean;
    message: string;
    availableModels?: string[];
    latencyMs?: number;
  }> {
    const startTime = Date.now();

    // 1. Google AI Studio
    if (provider === 'google') {
      const keyToTest = (options?.key || this.getGoogleApiKey()).trim();
      if (!keyToTest) {
        return {
          success: false,
          message: 'Please provide a Google AI Studio API key (starts with AIzaSy).',
        };
      }

      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(keyToTest)}`
        );
        const data = await res.json().catch(() => null);
        const latency = Date.now() - startTime;

        if (res.ok && data?.models) {
          const now = new Date().toISOString();
          StorageManager.setItem(STORAGE_KEYS.LAST_VERIFIED, now);
          return {
            success: true,
            message: `Connected to Google AI Studio in ${latency}ms! Verified models available.`,
            latencyMs: latency,
          };
        }

        if (data?.error) {
          return {
            success: false,
            message: data.error.message || 'Authentication rejected by Google AI Studio.',
          };
        }
      } catch {
        // Fallback to server verification
      }

      try {
        const res = await fetch('/api/gemini/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyToTest}` },
          body: JSON.stringify({ customApiKey: keyToTest }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          return {
            success: true,
            message: data.message || 'Google AI Studio key verified via proxy.',
          };
        }
        return { success: false, message: data?.error || 'Unable to connect to Google AI Studio.' };
      } catch (_err) {
        const err = asErrorLike(_err);
        return {
          success: false,
          message: err?.message || 'Network error connecting to Google AI Studio.',
        };
      }
    }

    // 2. Groq
    if (provider === 'groq' || provider === 'groq_whisper') {
      const keyToTest = (options?.key || this.getGroqApiKey()).trim();
      if (!keyToTest) {
        return { success: false, message: 'Please provide a Groq API key (starts with gsk_).' };
      }

      try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${keyToTest}` },
        });
        const data = await res.json().catch(() => null);
        const latency = Date.now() - startTime;

        if (res.ok && data?.data) {
          const modelList = (data.data as Array<{ id: string }>).map((m) => m.id);
          return {
            success: true,
            message: `Connected to Groq Cloud in ${latency}ms! ${modelList.length} LPU models available.`,
            availableModels: modelList.filter(
              (m: string) => m.includes('llama') || m.includes('mixtral') || m.includes('whisper')
            ),
            latencyMs: latency,
          };
        }

        if (data?.error) {
          return {
            success: false,
            message: data.error.message || 'Authentication rejected by Groq Cloud.',
          };
        }
      } catch {
        // Try server proxy
      }

      try {
        const res = await fetch('/api/groq/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: keyToTest }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          return { success: true, message: data.message || 'Groq API Key verified.' };
        }
        return { success: false, message: data?.error || 'Failed to verify Groq API key.' };
      } catch (_err) {
        const err = asErrorLike(_err);
        return { success: false, message: err?.message || 'Network error connecting to Groq.' };
      }
    }

    // 3. Deepgram
    if (provider === 'deepgram') {
      const keyToTest = (options?.key || this.getDeepgramApiKey()).trim();
      if (!keyToTest) {
        return { success: false, message: 'Please provide a Deepgram API key.' };
      }

      try {
        const res = await fetch('/api/deepgram/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: keyToTest }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          return { success: true, message: data.message || 'Deepgram API key verified.' };
        }
        return { success: false, message: data?.error || 'Failed to verify Deepgram API key.' };
      } catch (_err) {
        const err = asErrorLike(_err);
        return { success: false, message: err?.message || 'Network error connecting to Deepgram.' };
      }
    }

    // 4. Local Whisper (Opt-in)
    if (provider === 'local_whisper') {
      const endpoint = (
        options?.endpoint !== undefined
          ? options.endpoint
          : this.getSettings().localWhisperEndpoint || ''
      ).trim();
      if (!endpoint) {
        return {
          success: false,
          message:
            'Local Whisper is opt-in. Enter your Whisper server endpoint or use Native Speech Recognition.',
        };
      }
      try {
        const res = await fetch('/api/local-whisper/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          return {
            success: true,
            message: data.message || `Local Whisper server reachable at ${endpoint}.`,
          };
        }
        return {
          success: false,
          message: data?.error || `Could not connect to Local Whisper server at ${endpoint}.`,
        };
      } catch (_err) {
        const err = asErrorLike(_err);
        return {
          success: false,
          message: `Local Whisper check failed: ${err?.message || 'Server unreachable'}`,
        };
      }
    }

    // 6. Built-in Offline Engine
    if (provider === 'offline_rules' || provider === 'browser_speech') {
      return {
        success: true,
        message:
          'Built-in Offline Native Engine is ready. 100% on-device deterministic summarization and Web Speech API parser.',
      };
    }

    return { success: false, message: 'Unknown provider.' };
  }

  public static updateSettings(settings: Partial<AiIntegrationSettings>): AiIntegrationSettings {
    this.saveSettings(settings);
    return this.getSettings();
  }

  public static setLocalWhisperEndpoint(endpoint: string): void {
    this.saveSettings({ localWhisperEndpoint: endpoint.trim() });
  }

  public static async testGroqKey(
    key?: string
  ): Promise<{ success: boolean; message: string; availableModels?: string[] }> {
    return this.testProviderConnection('groq', { key });
  }

  public static async testDeepgramKey(
    key?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.testProviderConnection('deepgram', { key });
  }

  public static async probeLocalWhisperEndpoint(
    endpoint?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.testProviderConnection('local_whisper', { endpoint });
  }

  /**
   * Backwards compatible test method for Google AI Studio.
   */
  public static async testApiKey(
    customKey?: string
  ): Promise<{ success: boolean; message: string; model?: string }> {
    const res = await this.testProviderConnection('google', { key: customKey });
    return {
      success: res.success,
      message: res.message,
      model: 'gemini-3.6-flash',
    };
  }
}
