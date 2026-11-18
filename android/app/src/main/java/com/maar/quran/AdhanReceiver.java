package com.maar.quran;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

/** Runs at the exact prayer time (set by AlarmManager), even if the app is closed. */
public class AdhanReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (!AdhanScheduler.isEnabled(c)) { AdhanLog.add(c, "Alarm arrived but the adhan is switched off, ignored"); return; }
        String key = i.getStringExtra("key");
        String name = i.getStringExtra("name");
        String time = i.getStringExtra("time");
        if (key == null || name == null) return;
        if (time == null) time = "";

        long at = i.getLongExtra("at", 0L);
        long lateMs = at > 0 ? System.currentTimeMillis() - at : 0;
        if (at > 0 && lateMs > AdhanScheduler.STALE_MS) {                                  /* far too late to be useful */
            AdhanLog.add(c, name + " alarm arrived " + (lateMs / 60000) + " min late, skipped");
            return;
        }
        if (!AdhanScheduler.markHandled(c, key)) return;                                  /* already played: no duplicates */
        AdhanLog.add(c, name + " alarm fired (" + AdhanLog.delay(lateMs) + " after " + time + ")");
        AdhanKeepAliveService.refreshNow(c);

        boolean play = i.getBooleanExtra("play", false);
        boolean notify = i.getBooleanExtra("notify", false);
        boolean vibrate = i.getBooleanExtra("vibrate", false);
        String mode = i.getStringExtra("mode");

        if (play) {
            try {
                ContextCompat.startForegroundService(c, AdhanService.playIntent(c, name, time, key));
                /* With "Appear on top" allowed, Android lets us open the call-to-prayer screen straight from the background. */
                try {
                    if (android.provider.Settings.canDrawOverlays(c)) {
                        c.startActivity(new Intent(c, AdhanActivity.class).putExtra("name", name).putExtra("time", time)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
                        AdhanLog.add(c, name + ": opened the call-to-prayer screen");
                    }
                } catch (Exception e) { AdhanLog.add(c, name + ": could not open the call-to-prayer screen (" + e.getClass().getSimpleName() + ")"); }
                return;
            } catch (Exception e) {
                /* Android refused to start audio from the background: show a normal notification instead. */
                AdhanLog.add(c, name + ": Android refused to start the audio service (" + e.getClass().getSimpleName() + "), showed a notification instead");
                AdhanNotifications.postReminder(c, name, time, key);
                return;
            }
        }
        if (vibrate) AdhanNotifications.vibrateNow(c);
        if (notify || vibrate) AdhanNotifications.postReminder(c, name, time, key, mode);
    }
}
