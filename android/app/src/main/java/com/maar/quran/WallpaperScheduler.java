package com.maar.quran;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import java.util.Calendar;

/**
 * Daily wallpaper: settings + scheduling.
 * Uses Android's JobScheduler (no extra library): one job fires a few minutes after midnight, and one
 * "catch-up" job runs right away when today's wallpaper has not been set yet (phone was off, no internet, etc).
 */
final class WallpaperScheduler {
    static final String PREFS = "maar_wallpaper";
    static final int JOB_NEXT = 7301;
    static final int JOB_NOW = 7302;

    private WallpaperScheduler() {}

    static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) {
        return p(c).getBoolean("enabled", false);
    }

    /** Today's date in the phone's time zone, e.g. 2026-11-16. */
    static String dayKey() {
        Calendar c = Calendar.getInstance();
        return String.format(java.util.Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static boolean isStale(Context c) {
        return !dayKey().equals(p(c).getString("applied_day", ""));
    }

    /** Re-arm the midnight job, and run a catch-up job straight away if today's wallpaper is missing. */
    static void ensure(Context c) {
        if (!isEnabled(c)) return;
        scheduleNext(c);
        if (isStale(c)) scheduleNow(c);
    }

    static void scheduleNext(Context c) {
        if (!isEnabled(c)) return;
        Calendar t = Calendar.getInstance();
        t.add(Calendar.DAY_OF_YEAR, 1);
        t.set(Calendar.HOUR_OF_DAY, 0);
        t.set(Calendar.MINUTE, 5);
        t.set(Calendar.SECOND, 0);
        t.set(Calendar.MILLISECOND, 0);
        long latency = Math.max(60_000L, t.getTimeInMillis() - System.currentTimeMillis());
        submit(c, JOB_NEXT, latency, latency + 3L * 3600_000L);
    }

    static void scheduleNow(Context c) {
        if (!isEnabled(c)) return;
        submit(c, JOB_NOW, 0, 0);
    }

    static void cancel(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js != null) { js.cancel(JOB_NEXT); js.cancel(JOB_NOW); }
        } catch (Exception ignored) {}
    }

    private static void submit(Context c, int id, long latencyMs, long deadlineMs) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            JobInfo.Builder b = new JobInfo.Builder(id, new ComponentName(c, WallpaperJobService.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true);
            if (latencyMs > 0) {
                b.setMinimumLatency(latencyMs);
                b.setOverrideDeadline(deadlineMs);
            }
            js.schedule(b.build());
        } catch (Exception ignored) {}
    }
}
