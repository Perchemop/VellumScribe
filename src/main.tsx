import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './context/AppContext';
import { StorageManager } from './lib/storage';
import { AndroidKeystoreManager } from './lib/keystore';
import { registerDurabilityHooks } from './lib/NativeLifecycle';
import { forceWebDatabaseAdapter } from './lib/sqlite/databaseAdapter';
import './index.css';

const BOOT_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function mountApp(bootWarning?: string) {
  try {
    registerDurabilityHooks();
  } catch (e) {
    console.warn('[boot] registerDurabilityHooks failed', e);
  }

  const rootEl = document.getElementById('root');
  if (!rootEl) {
    console.error('[boot] #root element missing');
    return;
  }

  if (bootWarning) {
    try {
      sessionStorage.setItem('vellumscribe_boot_warning', bootWarning);
    } catch {
      /* ignore */
    }
  }

  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <AppProvider>
          <App />
        </AppProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}

async function boot() {
  let warning: string | undefined;

  try {
    await withTimeout(
      Promise.all([
        StorageManager.initialize(),
        AndroidKeystoreManager.migrateLegacyCredentials().catch((e) => {
          console.warn('[boot] keystore migration skipped', e);
          return 0;
        }),
      ]),
      BOOT_TIMEOUT_MS,
      'Storage bootstrap'
    );
  } catch (primaryErr) {
    console.error('[boot] Primary storage init failed', primaryErr);
    warning =
      primaryErr instanceof Error
        ? primaryErr.message
        : 'Storage initialization failed';

    // Fall back to in-app sql.js so the UI can still open
    try {
      forceWebDatabaseAdapter();
      await withTimeout(StorageManager.initialize(), 8_000, 'Web storage fallback');
      warning = `${warning} — using on-device web storage fallback.`;
    } catch (fallbackErr) {
      console.error('[boot] Web storage fallback also failed', fallbackErr);
      warning = `${warning} — storage unavailable; notes may not persist until restart.`;
    }
  }

  mountApp(warning);
}

boot().catch((e) => {
  console.error('[boot] Unexpected fatal', e);
  mountApp(e instanceof Error ? e.message : 'Unexpected startup error');
});
