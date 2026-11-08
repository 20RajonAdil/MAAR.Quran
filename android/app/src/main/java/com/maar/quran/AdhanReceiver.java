package com.maar.quran;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

/** Runs at the exact prayer time (set by AlarmManager), even if the app is closed. */
public class AdhanReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!AdhanScheduler.isEnabled(c)) return;
        String key = i.getStringExtra("key");
        String name = i.getStringExtra("name");
        String time = i.getStringExtra("time");
        if (key == null || name == null) return;
        if (time == null) time = "";

        long at = i.getLongExtra("at", 0L);
        if (at > 0 && System.currentTimeMillis() - at > AdhanScheduler.STALE_MS) return;   /* far too late to be useful */
        if (!AdhanScheduler.markHandled(c, key)) return;                                  /* already played: no duplicates */

        boolean play = i.getBooleanExtra("play", false);
        boolean notify = i.getBooleanExtra("notify", false);

        if (play) {
            try {
                ContextCompat.startForegroundService(c, AdhanService.playIntent(c, name, time, key));
                return;
            } catch (Exception e) {
                /* Android refused to start audio from the background: show a normal notification instead. */
                AdhanNotifications.postReminder(c, name, time, key);
                return;
            }
        }
        if (notify) AdhanNotifications.postReminder(c, name, time, key);
    }
}
