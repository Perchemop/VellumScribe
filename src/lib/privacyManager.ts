import { AppLogger } from './logger';

export interface PrivacySettings {
  privateOfflineMode: boolean; // Completely blocks all external network calls
  telemetryDisabled: boolean;
  warnBeforeExternalCalls: boolean;
  wipeSessionKeysOnClose: boolean;
  hasConsentedToCloudAi: boolean;
}

const PRIVACY_SETTINGS_KEY = 'vellumscribe_privacy_settings_v1';

const DEFAULT_PRIVACY: PrivacySettings = {
  privateOfflineMode: false,
  telemetryDisabled: true,
  warnBeforeExternalCalls: true,
  wipeSessionKeysOnClose: false,
  hasConsentedToCloudAi: false,
};

export class PrivacyManager {
  private static settings: PrivacySettings = this.loadSettings();

  private static loadSettings(): PrivacySettings {
    try {
      const stored = localStorage.getItem(PRIVACY_SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_PRIVACY, ...JSON.parse(stored) };
      }
    } catch (e) {
      AppLogger.warn('PrivacyManager', 'Failed to load privacy settings, using defaults', e);
    }
    return { ...DEFAULT_PRIVACY };
  }

  public static getSettings(): PrivacySettings {
    return { ...this.settings };
  }

  public static updateSettings(updates: Partial<PrivacySettings>): PrivacySettings {
    this.settings = { ...this.settings, ...updates };
    try {
      localStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(this.settings));
      AppLogger.info('PrivacyManager', 'Privacy settings updated', updates);
    } catch (e) {
      AppLogger.error('PrivacyManager', 'Failed to save privacy settings', e);
    }
    return this.getSettings();
  }

  public static isPrivateOfflineMode(): boolean {
    return this.settings.privateOfflineMode;
  }

  public static isNetworkAllowed(): boolean {
    return !this.settings.privateOfflineMode;
  }

  public static hasCloudAiConsent(): boolean {
    return !this.settings.warnBeforeExternalCalls || this.settings.hasConsentedToCloudAi;
  }

  public static grantCloudAiConsent(): void {
    this.updateSettings({ hasConsentedToCloudAi: true });
  }

  public static revokeCloudAiConsent(): void {
    this.updateSettings({ hasConsentedToCloudAi: false });
  }

  /**
   * Validates if Cloud AI external requests have user consent.
   * Throws CloudAiConsentRequiredError if warning is enabled and consent has not been granted.
   */
  public static assertCloudAiConsent(operationName: string): void {
    if (!this.hasCloudAiConsent()) {
      throw new CloudAiConsentRequiredError(operationName);
    }
  }

  /**
   * Validates if an external network request is allowed.
   * Throws an error if Private Offline Mode is enabled.
   */
  public static assertNetworkAllowed(targetService: string): void {
    if (this.settings.privateOfflineMode) {
      AppLogger.warn('PrivacyManager', `Blocked network request to "${targetService}" because Private Offline Mode is ACTIVE.`);
      throw new Error(`Network access blocked: Private Offline Mode is enabled. Disable it in Settings -> Privacy & Offline to connect to ${targetService}.`);
    }
  }
}

export class CloudAiConsentRequiredError extends Error {
  public readonly operationName: string;
  constructor(operationName: string) {
    super(`Cloud AI consent required for ${operationName}`);
    this.name = 'CloudAiConsentRequiredError';
    this.operationName = operationName;
  }
}
