package com.maar.quran;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Enable App Background": a user-visible foreground service (type specialUse) that exists only while the user has the
 * adhan AND the "Enable App Background" switch on. Android lists it under Active apps / Check background activity with
 * the app name, running time and a Stop button, and it keeps the app's process in a protected state so prayer alarms
 * and the adhan are delivered reliably.
 *
 * It does real, visible work: the notification is a live countdown to the next prayer. It does NOT poll or loop. The
 * countdown is drawn by Android itself; the text is refreshed only when something changes (an alarm fired, the
 * schedule changed, WorkManager's periodic check). The adhan audio itself is a separate mediaPlayback foreground
 * service (AdhanService) that exists only while the adhan is actually playing.
 */
public class AdhanKeepAliveService extends Service {
    static final int ID = 7002;
    static final String CH = "adhan_background";
    static final String ACTION_TURN_OFF = "com.maar.quran.ADHAN_BG_OFF";

    static volatile boolean running = false;
    private static volatile AdhanKeepAliveService instance;
    private boolean stoppingOnPurpose = false;

    /** True when this service should exist: adhan on and the user's background switch on. */
    static boolean shouldRun(Context c) { return AdhanScheduler.isEnabled(c) && AdhanScheduler.bgEnabled(c); }

    static void start(Context c) {
        if (!shouldRun(c)) return;
        try {
            ContextCompat.startForegroundService(c, new Intent(c, AdhanKeepAliveService.class));
        } catch (Exception e) {
            /* e.g. ForegroundServiceStartNotAllowedException when the app is in the background: the alarms still work */
            AdhanLog.add(c, "Android did not allow the background service to start now (" + e.getClass().getSimpleName() + ")");
        }
    }

    static void stop(Context c) {
        AdhanKeepAliveService s = instance;
        if (s != null) s.stoppingOnPurpose = true;
        try { c.stopService(new Intent(c, AdhanKeepAliveService.class)); } catch (Exception ignored) {}
    }

    /** Refreshes the countdown text if the service is running (no-op otherwise; never starts it). */
    static void refreshNow(Context c) {
        AdhanKeepAliveService s = instance;
        if (s != null) s.postNotification();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_TURN_OFF.equals(intent.getAction())) {
            /* The "Turn off" button in the notification */
            AdhanScheduler.setBg(this, false);
            AdhanLog.add(this, "Enable App Background turned off from its notification");
            stoppingOnPurpose = true;
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!shouldRun(this)) { stoppingOnPurpose = true; stopSelf(); return START_NOT_STICKY; }

        ensureChannel();
        /* Promote to a foreground service within 10 s of the start (the declared type is mandatory on Android 14+). */
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        try {
            ServiceCompat.startForeground(this, ID, build(), type);
        } catch (Exception e) {
            AdhanLog.add(this, "Background service could not enter the foreground (" + e.getClass().getSimpleName() + ")");
            stoppingOnPurpose = true;
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        boolean notifOk = NotificationManagerCompat.from(this).areNotificationsEnabled();
        AdhanLog.add(this, "Background service running" + (intent == null ? " (restarted by Android)" : "") + (notifOk ? "" : " (notifications are blocked, so its notification is hidden)"));
        try { if (AdhanScheduler.countPending(this) == 0) AdhanScheduler.rescheduleAll(this); } catch (Exception ignored) {}
        return START_STICKY;
    }

    /** Swiped away from Recent apps: the service and the alarms stay (stopWithTask=false). Just make sure the alarms are set. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        AdhanLog.add(this, "App removed from Recent apps; the background service stays on");
        try { if (AdhanScheduler.isEnabled(this)) AdhanScheduler.rescheduleAll(this); } catch (Exception ignored) {}
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        instance = null;
        /* Stopped by something other than us (for example the Stop button in the phone's Active apps list). Respect it. */
        if (!stoppingOnPurpose && AdhanScheduler.bgEnabled(this)) {
            AdhanScheduler.setBg(this, false);
            AdhanLog.add(this, "Background service was stopped from outside the app (for example Active apps > Stop). Alarms stay set.");
        }
        super.onDestroy();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CH, "App background (adhan)", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Shows that Quran Maar is running in the background so the adhan sounds at prayer time");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private long[] nextPrayer(String[] labelOut) {
        long now = System.currentTimeMillis(), best = Long.MAX_VALUE;
        try {
            JSONArray ev = AdhanScheduler.loadEvents(this);
            for (int i = 0; i < ev.length(); i++) {
                JSONObject e = ev.optJSONObject(i);
                if (e == null) continue;
                String date = e.optString("date"), time = e.optString("time"), name = e.optString("name");
                if (date.isEmpty() || time.isEmpty() || name.isEmpty()) continue;
                long at;
                try { at = AdhanScheduler.toEpoch(date, time); } catch (Exception ex) { continue; }
                if (at > now && at < best) { best = at; labelOut[0] = name + " \u00b7 " + time; }
            }
        } catch (Exception ignored) {}
        return new long[]{best == Long.MAX_VALUE ? 0 : best};
    }

    private android.app.Notification build() {
        String[] label = new String[1];
        long next = nextPrayer(label)[0];
        PendingIntent off = PendingIntent.getService(this, 3,
                new Intent(this, AdhanKeepAliveService.class).setAction(ACTION_TURN_OFF),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_adhan)
                .setContentTitle("Quran Maar")
                .setContentText(label[0] != null ? "Next prayer: " + label[0] : "Open the app to refresh prayer times")
                .setContentIntent(AdhanNotifications.openApp(this))
                .addAction(0, "Turn off", off)
                .setOngoing(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (next > 0) {
            /* A live countdown drawn by Android itself, so nothing here has to tick. */
            b.setShowWhen(true).setWhen(next).setUsesChronometer(true).setChronometerCountDown(true);
        } else {
            b.setShowWhen(false);
        }
        return b.build();
    }

    private void postNotification() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(ID, build());
        } catch (Exception ignored) {}
    }
}
