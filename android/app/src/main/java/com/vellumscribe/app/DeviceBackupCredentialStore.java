package com.vellumscribe.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

public class DeviceBackupCredentialStore {
    private static final String PREF_NAME = "device_backup_credentials";
    private static final String KEY_CREDENTIAL = "backup_credential";

    private SharedPreferences getEncryptedPrefs(Context context) throws Exception {
        MasterKey masterKey = new MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();

        return EncryptedSharedPreferences.create(
                context,
                PREF_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    public void saveCredential(Context context, String credential) throws Exception {
        getEncryptedPrefs(context).edit().putString(KEY_CREDENTIAL, credential).apply();
    }

    public String getCredential(Context context) throws Exception {
        return getEncryptedPrefs(context).getString(KEY_CREDENTIAL, null);
    }

    public void clearCredential(Context context) throws Exception {
        getEncryptedPrefs(context).edit().remove(KEY_CREDENTIAL).apply();
    }
}
