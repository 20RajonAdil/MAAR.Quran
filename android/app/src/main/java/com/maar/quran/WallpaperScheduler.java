package com.maar.quran;

import android.app.job.JobScheduler;
import android.content.Context;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Background scheduling for the Daily Quran Wallpaper, using WorkManager.
 *
 * Every job has a unique name, so enabling twice, rebooting, or changing the time zone can never create a
 * duplicate. WorkManager itself keeps the jobs across restarts.
 *
 *  - DAILY  : repeats every 24 h, first run a few minutes after local midnight. Inexact: Android may delay it
 *             (battery saver, Doze, manufacturer limits). That is fine, because the wallpaper engine also checks the
 *             date by itself whenever the wallpaper is shown (see MaarWallpaperService).
 *  - NOW    : one immediate run (after enabling, a language change, or when today's verse has not been set yet).
 *  - NET    : like NOW, but waits for an internet connection (to download a translation language).
 */
final class WallpaperScheduler {
    static final String W_DAILY = "maar_wallpaper_daily";
    static final String W_NOW = "maar_wallpaper_now";
    static final String W_NET = "maar_wallpaper_net";
    static final String TAG_NET = "maar_net";
    private static final long AFTER_MIDNIGHT_MS = 5L * 60_000L;

    private WallpaperScheduler() {}

    /** Re-arm everything that should exist. Called at app start, after a restart / app update, and by the engine. */
    static void ensure(Context c) {
        cancelLegacyJobs(c);
        if (!WallpaperStore.isEnabled(c)) return;
        scheduleDaily(c, false);
        if (WallpaperStore.isStale(c)) scheduleNow(c, false);
    }

    /** The clock or time zone changed: the midnight run has to be worked out again. */
    static void rescheduleAfterClockChange(Context c) {
        if (!WallpaperStore.isEnabled(c)) return;
        scheduleDaily(c, true);
        scheduleNow(c, true);
    }

    static void scheduleDaily(Context c, boolean replace) {
        try {
            long delay = WallpaperStore.millisUntilMidnight() + AFTER_MIDNIGHT_MS;
            PeriodicWorkRequest r = new PeriodicWorkRequest.Builder(WallpaperWorker.class, 24, TimeUnit.HOURS)
                    .setInitialDelay(delay, TimeUnit.MILLISECONDS)
                    .build();
            WorkManager.getInstance(c.getApplicationContext()).enqueueUniquePeriodicWork(W_DAILY,
                    replace ? ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE : ExistingPeriodicWorkPolicy.KEEP, r);
        } catch (Throwable ignored) {}
    }

    static void scheduleNow(Context c, boolean replace) {
        try {
            OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(WallpaperWorker.class)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build();
            WorkManager.getInstance(c.getApplicationContext()).enqueueUniqueWork(W_NOW,
                    replace ? ExistingWorkPolicy.REPLACE : ExistingWorkPolicy.KEEP, r);
        } catch (Throwable ignored) {}
    }

    /** Wait for internet, then download the translations. */
    static void scheduleNet(Context c) {
        try {
            Constraints online = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            OneTimeWorkRequest r = new OneTimeWorkRequest.Builder(WallpaperWorker.class)
                    .setConstraints(online)
                    .addTag(TAG_NET)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                    .build();
            WorkManager.getInstance(c.getApplicationContext()).enqueueUniqueWork(W_NET, ExistingWorkPolicy.KEEP, r);
        } catch (Throwable ignored) {}
    }

    /** Switching the feature off: no more automatic updates. (The wallpaper already on the phone is left alone.) */
    static void cancel(Context c) {
        try {
            WorkManager wm = WorkManager.getInstance(c.getApplicationContext());
            wm.cancelUniqueWork(W_DAILY);
            wm.cancelUniqueWork(W_NOW);
            wm.cancelUniqueWork(W_NET);
        } catch (Throwable ignored) {}
        cancelLegacyJobs(c);
    }

    /** Older builds used Android's JobScheduler with these ids. Remove them so nothing runs twice. */
    private static void cancelLegacyJobs(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getApplicationContext().getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js != null) { js.cancel(7301); js.cancel(7302); }
        } catch (Throwable ignored) {}
    }
}
