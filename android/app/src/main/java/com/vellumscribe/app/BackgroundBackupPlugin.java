package com.vellumscribe.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "VellumScribeBackgroundBackup")
public class BackgroundBackupPlugin extends Plugin {

    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .setRequiresCharging(call.getBoolean("requiresCharging", false))
                    .build();

            int intervalMinutes = call.getInt("intervalMinutes", 15);
            if (intervalMinutes < 15) {
                intervalMinutes = 15;
            }

            PeriodicWorkRequest backupWorkRequest =
                    new PeriodicWorkRequest.Builder(DeviceBackupWorker.class, intervalMinutes, TimeUnit.MINUTES)
                            .setConstraints(constraints)
                            .build();

            WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
                    "VellumScribeBackup",
                    ExistingPeriodicWorkPolicy.UPDATE,
                    backupWorkRequest
            );

            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to schedule backup", e);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            WorkManager.getInstance(getContext()).cancelUniqueWork("VellumScribeBackup");
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to cancel backup", e);
        }
    }
    
    @PluginMethod
    public void status(PluginCall call) {
        // Just a mock response for now, proper status would require querying WorkManager
        call.resolve();
    }
}
