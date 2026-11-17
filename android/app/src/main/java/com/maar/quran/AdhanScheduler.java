package com.maar.quran;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Keeps the prayer schedule the website hands over and turns it into exact
 * Android alarms.
 *
 * The schedule is stored as wall-clock times ("2026-11-08" + "05:41"), NOT as
 * fixed instants. Every reschedule converts them with the phone's CURRENT time
 * zone, so daylight saving changes and time-zone changes are handled the same
 * way as a reboot: just call rescheduleAll() again.
 */
public final class AdhanScheduler {
    private AdhanScheduler() {}

    static final String PREFS = "adhan_native";
    static final String ACTION_ALARM = "com.maar.quran.ADHAN_ALARM";
    static final int CODE_BASE = 7000;
    static final int CODE_COUNT = 200;
    /** An alarm that fires later than this after its time is ignored (e.g. Doze delays). */
    static final long STALE_MS = 10 * 60 * 1000L;
    /** After a reboot / app start, a prayer this recent that has not played yet still plays. */
    private static final long GRACE_MS = 90 * 1000L;

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveConfig(Context c, boolean enabled, int volume, JSONArray events, String fajrSound, String otherSound) {
        prefs(c).edit()
                .putString("snd_fajr", cleanSound(fajrSound, "adan1"))
                .putString("snd_other", cleanSound(otherSound, "adan2"))
                .putBoolean("enabled", enabled)
                .putInt("volume", Math.max(5, Math.min(100, volume)))
                .putString("events", events == null ? "[]" : events.toString())
                .apply();
    }

    /** "adan1" / "adan2" (bundled) or "custom" (a file the user picked, copied into the app's private storage). */
    static String cleanSound(String v, String def) {
        return ("adan1".equals(v) || "adan2".equals(v) || "custom".equals(v)) ? v : def;
    }

    /** slot is "fajr" or "other". */
    static String sound(Context c, String slot) {
        return prefs(c).getString("snd_" + slot, "fajr".equals(slot) ? "adan1" : "adan2");
    }

    static java.io.File customFile(Context c, String slot) {
        return new java.io.File(c.getFilesDir(), "adhan_custom_" + slot);
    }

    static boolean isEnabled(Context c) { return prefs(c).getBoolean("enabled", false); }

    static int volume(Context c) { return prefs(c).getInt("volume", 85); }

    static JSONArray loadEvents(Context c) {
        try { return new JSONArray(prefs(c).getString("events", "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    static boolean canScheduleExact(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    /** Wall-clock date + time in the phone's current time zone -> epoch millis. */
    static long toEpoch(String date, String time) {
        String[] d = date.split("-");
        String[] t = time.split(":");
        Calendar cal = Calendar.getInstance();
        cal.clear();
        cal.set(Integer.parseInt(d[0].trim()), Integer.parseInt(d[1].trim()) - 1, Integer.parseInt(d[2].trim()),
                Integer.parseInt(t[0].trim()), Integer.parseInt(t[1].trim()), 0);
        return cal.getTimeInMillis();
    }

    private static PendingIntent pending(Context c, int code, Intent i, int flags) {
        return PendingIntent.getBroadcast(c, code, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Intent baseIntent(Context c) {
        return new Intent(c, AdhanReceiver.class).setAction(ACTION_ALARM);
    }

    static void cancelAlarms(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int code = CODE_BASE; code < CODE_BASE + CODE_COUNT; code++) {
            PendingIntent pi = pending(c, code, baseIntent(c), PendingIntent.FLAG_NO_CREATE);
            if (pi != null) { am.cancel(pi); pi.cancel(); }
        }
    }

    /** Cancels everything this app scheduled, then sets one alarm per upcoming event. */
    static synchronized int rescheduleAll(Context c) {
        cancelAlarms(c);
        if (!isEnabled(c)) return 0;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;

        boolean exact = canScheduleExact(c);
        long now = System.currentTimeMillis();
        JSONArray ev = loadEvents(c);
        int scheduled = 0;

        for (int i = 0; i < ev.length() && scheduled < CODE_COUNT; i++) {
            JSONObject e = ev.optJSONObject(i);
            if (e == null) continue;
            boolean play = e.optBoolean("play", false), notify = e.optBoolean("notify", false), vibrate = e.optBoolean("vibrate", false);
            String mode = e.optString("mode", "adhan");
            if (!play && !notify && !vibrate) continue;
            String date = e.optString("date"), time = e.optString("time"), name = e.optString("name");
            if (date.isEmpty() || time.isEmpty() || name.isEmpty()) continue;
            long at;
            try { at = toEpoch(date, time); } catch (Exception ex) { continue; }
            String key = date + "-" + name;
            long fireAt = at;
            if (at <= now) {
                if (now - at > GRACE_MS || wasHandled(c, key)) continue;   /* missed, or already played */
                fireAt = now + 1500;
            }
            Intent in = baseIntent(c)
                    .putExtra("key", key).putExtra("name", name).putExtra("time", time)
                    .putExtra("at", at).putExtra("play", play).putExtra("notify", notify).putExtra("vibrate", vibrate).putExtra("mode", mode);
            PendingIntent pi = pending(c, CODE_BASE + scheduled, in, PendingIntent.FLAG_UPDATE_CURRENT);
            try {
                if (exact) {
                    /* setAlarmClock = the same kind of alarm as the phone's own alarm clock app: the most reliable type on Android */
                    am.setAlarmClock(new AlarmManager.AlarmClockInfo(fireAt, AdhanNotifications.openApp(c)), pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi);
                }
            } catch (SecurityException se) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, pi);
            }
            scheduled++;
        }
        return scheduled;
    }

    /** How many of this app's prayer alarms Android is really holding right now (checked against AlarmManager's PendingIntents). */
    static int countPending(Context c) {
        int n = 0;
        for (int code = CODE_BASE; code < CODE_BASE + CODE_COUNT; code++) {
            PendingIntent pi = pending(c, code, baseIntent(c), PendingIntent.FLAG_NO_CREATE);
            if (pi != null) n++;
        }
        return n;
    }

    /** The next prayer time (epoch ms) that has an alarm, or 0. */
    static long nextAlarmAt(Context c) {
        long now = System.currentTimeMillis(), best = 0;
        JSONArray ev = loadEvents(c);
        for (int i = 0; i < ev.length(); i++) {
            JSONObject e = ev.optJSONObject(i);
            if (e == null) continue;
            if (!e.optBoolean("play", false) && !e.optBoolean("notify", false) && !e.optBoolean("vibrate", false)) continue;
            try {
                long at = toEpoch(e.optString("date"), e.optString("time"));
                if (at > now && (best == 0 || at < best)) best = at;
            } catch (Exception ignored) {}
        }
        return best;
    }

    /** What the adhan for this slot will actually play: a label, or null if the file is missing. */
    static String soundLabel(Context c, String slot) {
        String s = sound(c, slot);
        if ("custom".equals(s)) {
            java.io.File f = customFile(c, slot);
            if (f.isFile() && f.length() > 0) return "Your file: " + prefs(c).getString("custom_name_" + slot, "custom audio");
            s = "fajr".equals(slot) ? "adan1" : "adan2";   /* the service falls back to the bundled one */
        }
        String asset = "adan1".equals(s) ? "Adan1.mp3" : "Adan2.mp3";
        try { c.getAssets().openFd("public/adhan/" + asset).close(); return "adan1".equals(s) ? "Adhan 1" : "Adhan 2"; }
        catch (Exception e) { return null; }
    }

    /* ---- duplicate protection: each "date-Prayer" key is allowed to fire once ---- */

    static synchronized boolean wasHandled(Context c, String key) {
        String s = prefs(c).getString("handled", "");
        for (String k : s.split("\\|")) if (k.equals(key)) return true;
        return false;
    }

    /** Returns true if this is the first time the key is seen (and records it). */
    static synchronized boolean markHandled(Context c, String key) {
        if (wasHandled(c, key)) return false;
        String[] old = prefs(c).getString("handled", "").split("\\|");
        StringBuilder sb = new StringBuilder();
        int from = Math.max(0, old.length - 39);
        for (int i = from; i < old.length; i++) if (!old[i].isEmpty()) sb.append(old[i]).append('|');
        sb.append(key);
        prefs(c).edit().putString("handled", sb.toString()).apply();
        return true;
    }
}
