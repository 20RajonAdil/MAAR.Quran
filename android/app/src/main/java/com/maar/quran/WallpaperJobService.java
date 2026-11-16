package com.maar.quran;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;

/** Runs the daily wallpaper update in the background (even when the app is closed). */
public class WallpaperJobService extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context c = getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                boolean ok;
                try { ok = WallpaperWorker.apply(c, false); } catch (Throwable t) { ok = false; }
                if (ok) WallpaperScheduler.scheduleNext(c);   /* tomorrow's job */
                jobFinished(params, !ok);                      /* not ok -> Android retries later with back-off */
            }
        }, "maar-wallpaper").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;   /* stopped early (e.g. network lost): try again */
    }
}
