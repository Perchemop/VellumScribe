package com.vellumscribe.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.vellumscribe.app.offlineai.OfflineAiPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfflineAiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
