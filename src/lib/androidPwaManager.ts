import { Capacitor } from '@capacitor/core';
import { AppLogger } from './logger';

export interface AndroidInstallGuide {
  browser: string;
  steps: string[];
}

type InstallListener = (canInstall: boolean) => void;

/** Minimal shape of Chromium's `beforeinstallprompt` event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class AndroidPwaManagerClass {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private listeners: Set<InstallListener> = new Set();
  private initialized = false;

  constructor() {
    this.init();
  }

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      const promptEvent = e as BeforeInstallPromptEvent;
      // Prevent standard browser mini-infobar from appearing on mobile
      e.preventDefault();
      this.deferredPrompt = promptEvent;
      this.notifyListeners();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.notifyListeners();
    });
  }

  public subscribe(listener: InstallListener): () => void {
    this.listeners.add(listener);
    listener(this.canPromptInstall());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const can = this.canPromptInstall();
    this.listeners.forEach((l) => l(can));
  }

  public canPromptInstall(): boolean {
    return !!this.deferredPrompt && !this.isStandalone();
  }

  public async promptInstall(): Promise<{ outcome: 'accepted' | 'dismissed' | 'unavailable' }> {
    if (!this.deferredPrompt) {
      return { outcome: 'unavailable' };
    }

    try {
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        this.deferredPrompt = null;
        this.notifyListeners();
        return { outcome: 'accepted' };
      }
      return { outcome: 'dismissed' };
    } catch (err) {
      AppLogger.warn('AndroidPwaManager', 'Install prompt error:', err);
      return { outcome: 'unavailable' };
    }
  }

  public isAndroid(): boolean {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      return true;
    }
    if (typeof navigator !== 'undefined') {
      return /Android/i.test(navigator.userAgent);
    }
    return false;
  }

  public isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    if (Capacitor.isNativePlatform()) return true;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  public isMobile(): boolean {
    if (this.isAndroid()) return true;
    if (typeof window === 'undefined') return false;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.innerWidth <= 768)
    );
  }

  public getAndroidInstallGuide(): AndroidInstallGuide {
    if (typeof navigator === 'undefined') {
      return {
        browser: 'Android Browser',
        steps: [
          'Tap the 3-dot menu (⋮) in the top-right corner of your browser.',
          'Select "Add to Home screen" or "Install app".',
          'Tap "Install" to place VellumScribe onto your Android home screen launcher.',
        ],
      };
    }

    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('samsungbrowser')) {
      return {
        browser: 'Samsung Internet',
        steps: [
          'Tap the hamburger menu (☰) at the bottom-right of your screen.',
          'Tap "Add page to".',
          'Select "Home screen" and confirm by tapping "Add".',
        ],
      };
    } else if (ua.includes('firefox')) {
      return {
        browser: 'Firefox Android',
        steps: [
          'Tap the 3-dot menu (⋮) in the bottom or top address bar.',
          'Select "Install".',
          'Confirm "Add to Home Screen".',
        ],
      };
    }

    // Default Chrome / Chromium on Android
    return {
      browser: 'Google Chrome for Android',
      steps: [
        'Tap the 3-dot menu (⋮) in the top-right corner.',
        'Tap "Install app" (or "Add to Home screen").',
        'Tap "Install" to add VellumScribe as a native full-screen phone app.',
      ],
    };
  }
}

export const AndroidPwaManager = new AndroidPwaManagerClass();
