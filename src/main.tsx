import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppProvider } from './context/AppContext';
import { StorageManager } from './lib/storage';
import { AndroidKeystoreManager } from './lib/keystore';
import './index.css';

Promise.all([
  StorageManager.initialize(),
  AndroidKeystoreManager.migrateLegacyCredentials(),
]).then(() => {
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
