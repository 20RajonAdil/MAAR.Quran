package com.maar.quran;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Runs in the background (even when the app is closed), a few minutes after midnight and whenever
 * WallpaperScheduler asks. It
 *  1. moves the shown verse on to today's (works offline),
 *  2. downloads translations for the coming days when the person's language needs it and there is internet,
 *  3. tells any running wallpaper engine to redraw.
 * It never sets a wallpaper itself: the live wallpaper engine does the drawing.
 */
public class WallpaperWorker extends Worker {

    public WallpaperWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        try {
            if (!WallpaperStore.isEnabled(c)) return Result.success();

            WallpaperStore.advance(c, false);
            boolean complete = true;
            if (WallpaperStore.needsNetwork(c)) complete = WallpaperStore.prefetch(c, WallpaperStore.PREFETCH_DAYS);
            WallpaperStore.advance(c, false);                 /* picks up a translation that has just arrived */
            WallpaperStore.p(c).edit().putLong("worker_at", System.currentTimeMillis()).apply();
            MaarWallpaperService.refreshAll();

            if (!complete) {
                if (getTags().contains(WallpaperScheduler.TAG_NET)) return getRunAttemptCount() < 6 ? Result.retry() : Result.success();
                WallpaperScheduler.scheduleNet(c);            /* try again as soon as there is internet */
            }
            return Result.success();
        } catch (Throwable t) {
            return getRunAttemptCount() < 4 ? Result.retry() : Result.failure();
        }
    }
}
