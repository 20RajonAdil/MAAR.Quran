package com.maar.quran;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * Deferrable housekeeping, run by WorkManager roughly every 6 hours (Android picks the exact moment to save battery).
 * It is NOT what plays the adhan: prayer times are exact AlarmManager alarms. This only checks that those alarms are
 * still registered (some battery managers drop them) and refreshes the background notification's countdown.
 */
public class AdhanMaintenanceWorker extends Worker {
    private static final String NAME = "adhan-maintenance";

    public AdhanMaintenanceWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            if (!AdhanScheduler.isEnabled(c)) return Result.success();
            if (AdhanScheduler.countPending(c) == 0 && AdhanScheduler.nextAlarmAt(c) > 0) {
                AdhanLog.add(c, "Maintenance check: alarms had disappeared, set them again");
                AdhanScheduler.rescheduleAll(c);
            }
            AdhanKeepAliveService.refreshNow(c);
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    static void schedule(Context c, boolean on) {
        try {
            WorkManager wm = WorkManager.getInstance(c);
            if (!on) { wm.cancelUniqueWork(NAME); return; }
            wm.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP,
                    new PeriodicWorkRequest.Builder(AdhanMaintenanceWorker.class, 6, TimeUnit.HOURS).build());
        } catch (Exception ignored) {}
    }
}
