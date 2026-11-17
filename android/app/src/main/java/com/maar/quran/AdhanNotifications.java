package com.maar.quran;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

final class AdhanNotifications {
    private AdhanNotifications() {}

    static final String CH_PLAYING = "adhan_playing";
    static final String CH_REMINDER = "adhan_reminder";
    static final String CH_VIBRATE = "adhan_vibrate";
    static final String CH_SILENT = "adhan_silent";
    static final int ID_PLAYING = 7001;

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        /* Shown while the adhan audio is playing. The audio comes from the service, so the channel itself is silent. */
        NotificationChannel playing = new NotificationChannel(CH_PLAYING, "Adhan playing", NotificationManager.IMPORTANCE_HIGH);
        playing.setDescription("Shown while the call to prayer is playing, with a Stop button");
        playing.setSound(null, null);
        playing.enableVibration(false);
        playing.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(playing);

        /* Reminder only (adhan sound switched off for that prayer), or the fallback if audio cannot start. */
        NotificationChannel reminder = new NotificationChannel(CH_REMINDER, "Prayer reminders", NotificationManager.IMPORTANCE_HIGH);
        reminder.setDescription("A reminder at each prayer time");
        reminder.enableVibration(true);
        reminder.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(reminder);

        /* Prayer-time notification that only vibrates / is completely silent (the "mode" the user picked for a prayer). */
        NotificationChannel vib = new NotificationChannel(CH_VIBRATE, "Prayer time (vibrate only)", NotificationManager.IMPORTANCE_HIGH);
        vib.setSound(null, null);
        vib.enableVibration(true);
        vib.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(vib);
        NotificationChannel quiet = new NotificationChannel(CH_SILENT, "Prayer time (silent)", NotificationManager.IMPORTANCE_LOW);
        quiet.setSound(null, null);
        quiet.enableVibration(false);
        quiet.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(quiet);
    }

    /** Direct vibration for the "vibration" mode (works even if the notification channel is muted). */
    static void vibrateNow(Context c) {
        try {
            long[] pattern = {0, 700, 350, 700, 350, 1100};
            android.os.Vibrator v;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                android.os.VibratorManager vm = (android.os.VibratorManager) c.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                v = vm == null ? null : vm.getDefaultVibrator();
            } else {
                //noinspection deprecation
                v = (android.os.Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) v.vibrate(android.os.VibrationEffect.createWaveform(pattern, -1));
            else { //noinspection deprecation
                v.vibrate(pattern, -1); }
        } catch (Exception ignored) {}
    }

    static PendingIntent openApp(Context c) {
        Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (launch == null) launch = new Intent(c, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static android.app.Notification playing(Context c, String name, String time) {
        ensureChannels(c);
        PendingIntent stop = PendingIntent.getService(c, 1,
                new Intent(c, AdhanService.class).setAction(AdhanService.ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(c, CH_PLAYING)
                .setSmallIcon(R.drawable.ic_stat_adhan)
                .setContentTitle(time == null || time.isEmpty() ? name : name + " \u00b7 " + time)
                .setContentText("The adhan is playing")
                .setContentIntent(openApp(c))
                .addAction(0, "Stop adhan", stop)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    static void postReminder(Context c, String name, String time, String key) { postReminder(c, name, time, key, null); }

    static void postReminder(Context c, String name, String time, String key, String mode) {
        ensureChannels(c);
        String channel = "vibrate".equals(mode) ? CH_VIBRATE : "silent".equals(mode) ? CH_SILENT : CH_REMINDER;
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        android.app.Notification n = new NotificationCompat.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_stat_adhan)
                .setContentTitle(name + " \u00b7 " + time)
                .setContentText("It\u2019s time for " + name + " prayer.")
                .setContentIntent(openApp(c))
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();
        try {
            NotificationManagerCompat.from(c).notify(Math.abs(key.hashCode() % 100000) + 10000, n);
        } catch (SecurityException ignored) { /* POST_NOTIFICATIONS not granted */ }
    }
}
