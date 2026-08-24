import React, { useState } from 'react';
import {
  Shield,
  Key,
  Lock,
  RotateCcw,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  Cpu,
  Fingerprint,
} from 'lucide-react';
import { AndroidKeystoreManager } from '../lib/keystore';
import { KeystoreSecret } from '../types';

interface KeystoreSecurityModalProps {
  onClose: () => void;
}

export const KeystoreSecurityModal: React.FC<KeystoreSecurityModalProps> = ({ onClose }) => {
  const [secrets, setSecrets] = useState<KeystoreSecret[]>(() => AndroidKeystoreManager.listSecrets());
  const [newAlias, setNewAlias] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newType, setNewType] = useState<KeystoreSecret['key_type']>('api_key');
  const [rotatedMessage, setRotatedMessage] = useState<string | null>(null);

  const handleAddSecret = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlias || !newValue) return;
    AndroidKeystoreManager.saveSecret(newAlias.trim().toLowerCase().replace(/\s+/g, '_'), newValue, newType);
    setSecrets(AndroidKeystoreManager.listSecrets());
    setNewAlias('');
    setNewValue('');
  };

  const handleRotateKey = (alias: string) => {
    const updated = AndroidKeystoreManager.rotateKey(alias);
    if (updated) {
      setSecrets(AndroidKeystoreManager.listSecrets());
      setRotatedMessage(`Successfully rotated cryptographic key: ${alias}`);
      setTimeout(() => setRotatedMessage(null), 3000);
    }
  };

  const handleDelete = (alias: string) => {
    if (window.confirm(`Delete secret alias '${alias}' from Android Keystore?`)) {
      AndroidKeystoreManager.deleteSecret(alias);
      setSecrets(AndroidKeystoreManager.listSecrets());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        id="keystore-security-modal"
        className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Android Keystore & Flutter Secure Storage
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hardware Security Module (HSM) • AES-256-GCM Hardware-Backed Master Keys
              </p>
            </div>
          </div>
          <button
            id="close-keystore-modal-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {rotatedMessage && (
            <div className="p-3 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {rotatedMessage}
            </div>
          )}

          {/* Enclave Security Status Badge */}
          <div className="p-4 bg-slate-950 rounded-xl text-white border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Android Hardware Keystore Status: Active
                </span>
              </div>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
                StrongBox / TEE Enclave
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cryptographic keys and OAuth2 refresh tokens are sealed in hardware-backed storage via <code className="text-indigo-400 font-mono">flutter_secure_storage</code>. Key material never leaves the secure cryptographic boundary.
            </p>
          </div>

          {/* Stored Secrets List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Encrypted Aliases ({secrets.length})
            </h3>

            <div className="space-y-2">
              {secrets.map((s) => (
                <div
                  key={s.alias}
                  className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
                      <Key className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{s.alias}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                          {s.algorithm}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                        {s.masked_value}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRotateKey(s.alias)}
                      className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Rotate Key
                    </button>
                    <button
                      onClick={() => handleDelete(s.alias)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Secret Form */}
          <form onSubmit={handleAddSecret} className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-indigo-500" />
              Enroll New Keystore Secret
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Secret Alias (e.g. dropbox_token)"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                className="text-xs p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                required
              />
              <input
                type="password"
                placeholder="Raw Secret Key Value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="text-xs p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                required
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="text-xs p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
              >
                <option value="api_key">API Key</option>
                <option value="oauth_refresh_token">OAuth2 Refresh Token</option>
                <option value="sqlite_cipher_key">SQLCipher Master Key</option>
              </select>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                Encrypt & Save in Keystore
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
