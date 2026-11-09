package com.maar.quran;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Adhan is on" background activity. While the adhan is switched on, this quiet foreground service keeps the app
 * alive in the background (it shows in Android's active-apps list), so the prayer alarms and the adhan are as
 * reliable as Android allows. It shows the next prayer and its time. It stops when the adhan is switched off.
 */
public class AdhanKeepAliveService extends Service {
    static final int ID = 7002;
    static final String CH = "adhan_background";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() { refresh(); handler.postDelayed(this, 60_000L); }
    };

    static void start(Context c) {
        try { ContextCompat.startForegroundService(c, new Intent(c, AdhanKeepAliveService.class)); }
        catch (Exception ignored) { /* Android refused a background start; the alarms still work */ }
    }

    static void stop(Context c) {
        try { c.stopService(new Intent(c, AdhanKeepAliveService.class)); } catch (Exception ignored) {}
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!AdhanScheduler.isEnabled(this)) { stopSelf(); return START_NOT_STICKY; }
        ensureChannel();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        try {
            ServiceCompat.startForeground(this, ID, build(), type);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(tick);
        handler.postDelayed(tick, 60_000L);
        return START_STICKY;
    }

    /** Swiped away from recent apps: make sure the alarms are still set. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (AdhanScheduler.isEnabled(this)) AdhanScheduler.rescheduleAll(this);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CH, "Adhan running in background", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("A quiet notification that keeps the adhan reliable while the app is closed");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private String nextPrayerText() {
        try {
            JSONArray ev = AdhanScheduler.loadEvents(this);
            long now = System.currentTimeMillis(), best = Long.MAX_VALUE;
            String label = null;
            for (int i = 0; i < ev.length(); i++) {
                JSONObject e = ev.optJSONObject(i);
                if (e == null) continue;
                String date = e.optString("date"), time = e.optString("time"), name = e.optString("name");
                if (date.isEmpty() || time.isEmpty() || name.isEmpty()) continue;
                long at;
                try { at = AdhanScheduler.toEpoch(date, time); } catch (Exception ex) { continue; }
                if (at > now && at < best) { best = at; label = name + " \u00b7 " + time; }
            }
            if (label != null) return "Next prayer: " + label;
        } catch (Exception ignored) {}
        return "Open the app to refresh prayer times";
    }

    private android.app.Notification build() {
        return new NotificationCompat.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_adhan)
                .setContentTitle("Quran Maar \u00b7 Adhan is on")
                .setContentText(nextPrayerText())
                .setContentIntent(AdhanNotifications.openApp(this))
                .setOngoing(true)
                .setSilent(true)
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    private void refresh() {
        if (!AdhanScheduler.isEnabled(this)) { stopSelf(); return; }
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(ID, build());
        } catch (Exception ignored) {}
    }
}
