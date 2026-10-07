import React from 'react';
import { BackupPassphrasePanel } from './BackupPassphrasePanel';

/**
 * Extracted cloud settings cluster (U-03).
 * Hosts multi-device backup passphrase and future cloud-only controls.
 */
export const CloudSettingsPanel: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <div className="space-y-4" data-testid="cloud-settings-panel">
      <BackupPassphrasePanel />
      {children}
    </div>
  );
};

export default CloudSettingsPanel;
