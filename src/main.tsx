import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './context/AppContext';
import { StorageManager } from './lib/storage';
import { AndroidKeystoreManager } from './lib/keystore';
import { registerDurabilityHooks } from './lib/NativeLifecycle';
import './index.css';

Promise.all([
  StorageManager.initialize(),
  AndroidKeystoreManager.migrateLegacyCredentials(),
]).then(() => {
  registerDurabilityHooks();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <AppProvider>
          <App />
        </AppProvider>
      </ErrorBoundary>
    </StrictMode>
  );
});
