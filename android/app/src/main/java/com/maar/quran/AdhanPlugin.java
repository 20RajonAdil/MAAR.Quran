package com.maar.quran;

import android.Manifest;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** The bridge between the website's adhan.js and the native scheduler / audio service. */
@CapacitorPlugin(
        name = "AdhanNative",
        permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class AdhanPlugin extends Plugin {
    private BroadcastReceiver stateReceiver;

    @Override
    public void load() {
        /* Notification channels are created lazily (when a notification is first shown). Creating them here would make
           Android 13+ pop up its own notification prompt at launch, before the app is ready to explain it. */
        stateReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                JSObject o = new JSObject();
                o.put("playing", i.getBooleanExtra("playing", false));
                o.put("name", i.getStringExtra("name"));
                notifyListeners("adhanState", o);
            }
        };
        ContextCompat.registerReceiver(getContext(), stateReceiver, new IntentFilter(AdhanService.ACTION_STATE),
                ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        try { if (stateReceiver != null) getContext().unregisterReceiver(stateReceiver); } catch (Exception ignored) {}
        stateReceiver = null;
    }

    private boolean notificationsAllowed() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private boolean batteryUnrestricted() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    private JSObject statusObject() {
        JSObject o = new JSObject();
        o.put("playing", AdhanService.playing);
        o.put("name", AdhanService.playingName);
        o.put("notifications", notificationsAllowed());
        o.put("notifState", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? getPermissionState("notifications").toString()
                : (notificationsAllowed() ? "granted" : "denied"));
        o.put("exactAlarms", AdhanScheduler.canScheduleExact(getContext()));
        o.put("batteryUnrestricted", batteryUnrestricted());
        o.put("sdk", Build.VERSION.SDK_INT);
        return o;
    }

    /** schedule({ enabled, volume, events:[{date,name,time,play,notify}] }) */
    @PluginMethod
    public void schedule(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Integer vol = call.getInt("volume", 85);
        JSArray events = call.getArray("events");
        String fajrSound = null, otherSound = null;
        com.getcapacitor.JSObject snd = call.getObject("sounds");
        if (snd != null) { fajrSound = snd.getString("fajr"); otherSound = snd.getString("other"); }
        AdhanScheduler.saveConfig(getContext(), enabled, vol == null ? 85 : vol, events, fajrSound, otherSound);
        int n;
        if (enabled) { n = AdhanScheduler.rescheduleAll(getContext()); AdhanKeepAliveService.start(getContext()); }
        else { AdhanScheduler.cancelAlarms(getContext()); AdhanService.stopNow(); AdhanKeepAliveService.stop(getContext()); n = 0; }
        JSObject o = statusObject();
        o.put("scheduled", n);
        call.resolve(o);
    }

    @PluginMethod
    public void status(PluginCall call) { call.resolve(statusObject()); }

    @PluginMethod
    public void stop(PluginCall call) { AdhanService.stopNow(); call.resolve(statusObject()); }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject o = new JSObject();
            o.put("granted", notificationsAllowed());
            call.resolve(o);
            return;
        }
        requestPermissionForAlias("notifications", call, "notifPermResult");
    }

    @PermissionCallback
    private void notifPermResult(PluginCall call) {
        JSObject o = new JSObject();
        o.put("granted", notificationsAllowed());
        call.resolve(o);
    }

    private void launch(PluginCall call, Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings");
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        launch(call, i);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) { call.resolve(); return; }
        launch(call, new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            launch(call, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    private static String slotOf(PluginCall call) {
        String s = call.getString("slot", "other");
        return "fajr".equals(s) ? "fajr" : "other";
    }

    /** Plays the adhan right now through the real foreground audio service (the same path an alarm uses). */
    @PluginMethod
    public void test(PluginCall call) {
        String name = call.getString("name", "Dhuhr");
        try {
            ContextCompat.startForegroundService(getContext(),
                    AdhanService.playIntent(getContext(), name, "Test", "test-" + System.currentTimeMillis()));
            call.resolve();
        } catch (Exception e) {
            call.reject("Android did not allow the audio service to start: " + e.getMessage());
        }
    }

    /** Preview one sound ("adan1" / "adan2" / "custom") for a slot ("fajr" / "other"). */
    @PluginMethod
    public void preview(PluginCall call) {
        String slot = slotOf(call);
        String src = AdhanScheduler.cleanSound(call.getString("src"), "fajr".equals(slot) ? "adan1" : "adan2");
        try {
            ContextCompat.startForegroundService(getContext(), AdhanService.previewIntent(getContext(), slot, src));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start the preview: " + e.getMessage());
        }
    }

    /** Opens Android's own file picker for an audio file and copies it into the app's private storage. */
    @PluginMethod
    public void pickAudio(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("audio/*");
        startActivityForResult(call, i, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject o = new JSObject(); o.put("cancelled", true); call.resolve(o); return;
        }
        String slot = slotOf(call);
        Uri uri = result.getData().getData();
        java.io.File tmp = new java.io.File(getContext().getFilesDir(), "adhan_custom_" + slot + ".tmp");
        try {
            long max = 30L * 1024 * 1024, total = 0;
            try (java.io.InputStream in = getContext().getContentResolver().openInputStream(uri);
                 java.io.FileOutputStream out = new java.io.FileOutputStream(tmp)) {
                if (in == null) throw new java.io.IOException("Could not open the file");
                byte[] buf = new byte[64 * 1024]; int n;
                while ((n = in.read(buf)) > 0) {
                    total += n;
                    if (total > max) throw new java.io.IOException("That file is larger than 30 MB");
                    out.write(buf, 0, n);
                }
            }
            long dur = 0;
            android.media.MediaMetadataRetriever r = new android.media.MediaMetadataRetriever();
            try {
                r.setDataSource(tmp.getAbsolutePath());
                String d = r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION);
                dur = d == null ? 0 : Long.parseLong(d);
                if (dur <= 0 || !"yes".equals(r.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO)))
                    throw new java.io.IOException("That does not look like an audio file Android can play");
            } finally { try { r.release(); } catch (Exception ignored) {} }

            String label = "audio file";
            try (android.database.Cursor c = getContext().getContentResolver().query(uri, new String[]{android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) label = c.getString(0);
            } catch (Exception ignored) {}

            java.io.File dest = AdhanScheduler.customFile(getContext(), slot);
            if (dest.exists() && !dest.delete()) throw new java.io.IOException("Could not replace the old file");
            if (!tmp.renameTo(dest)) throw new java.io.IOException("Could not save the file");
            AdhanScheduler.prefs(getContext()).edit().putString("snd_" + slot, "custom").putString("custom_name_" + slot, label).apply();
            JSObject o = new JSObject();
            o.put("name", label); o.put("durationMs", dur); o.put("slot", slot);
            call.resolve(o);
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            call.reject(e.getMessage() == null ? "Could not use that file" : e.getMessage());
        }
    }

    @PluginMethod
    public void clearCustom(PluginCall call) {
        String slot = slotOf(call);
        //noinspection ResultOfMethodCallIgnored
        AdhanScheduler.customFile(getContext(), slot).delete();
        android.content.SharedPreferences.Editor ed = AdhanScheduler.prefs(getContext()).edit().remove("custom_name_" + slot);
        if ("custom".equals(AdhanScheduler.sound(getContext(), slot))) ed.putString("snd_" + slot, "fajr".equals(slot) ? "adan1" : "adan2");
        ed.apply();
        call.resolve();
    }

    /** Everything the "Why isn't my adhan playing?" checklist needs, read straight from Android. */
    @PluginMethod
    public void diagnostics(PluginCall call) {
        Context c = getContext();
        JSObject o = statusObject();
        o.put("enabledNative", AdhanScheduler.isEnabled(c));
        o.put("pendingAlarms", AdhanScheduler.countPending(c));
        o.put("nextAlarmAt", AdhanScheduler.nextAlarmAt(c));
        o.put("soundFajr", AdhanScheduler.soundLabel(c, "fajr"));
        o.put("soundOther", AdhanScheduler.soundLabel(c, "other"));
        o.put("choiceFajr", AdhanScheduler.sound(c, "fajr"));
        o.put("choiceOther", AdhanScheduler.sound(c, "other"));
        o.put("customFajr", AdhanScheduler.prefs(c).getString("custom_name_fajr", ""));
        o.put("customOther", AdhanScheduler.prefs(c).getString("custom_name_other", ""));
        try {
            android.media.AudioManager am = (android.media.AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            o.put("alarmVolume", am.getStreamVolume(android.media.AudioManager.STREAM_ALARM));
            o.put("alarmVolumeMax", am.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM));
        } catch (Exception ignored) {}
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            o.put("dndFilter", nm.getCurrentInterruptionFilter());   /* 1 all, 2 priority, 3 none, 4 alarms only */
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.app.NotificationChannel ch = nm.getNotificationChannel(AdhanNotifications.CH_PLAYING);
                o.put("playingChannelBlocked", ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE);
            }
        } catch (Exception ignored) {}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                android.app.ActivityManager act = (android.app.ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
                o.put("backgroundRestricted", act.isBackgroundRestricted());
                android.app.usage.UsageStatsManager usm = (android.app.usage.UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
                if (usm != null) o.put("standbyBucket", usm.getAppStandbyBucket());   /* 10 active, 20 working set, 30 frequent, 40 rare, 45 restricted */
            } catch (Exception ignored) {}
        }
        o.put("manufacturer", Build.MANUFACTURER);
        o.put("model", Build.MODEL);
        o.put("release", Build.VERSION.RELEASE);
        call.resolve(o);
    }
}
