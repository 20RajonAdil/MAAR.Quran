package com.maar.quran;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * A small on-phone log of what the adhan system did (alarms set, alarm fired, audio started, errors).
 * It is shown in Settings > Adhan so that, after the app has been closed, you can see whether Android
 * really delivered the alarm. Kept short (last 25 lines) and never leaves the phone.
 */
final class AdhanLog {
    private static final String KEY = "log";
    private static final int MAX = 25;

    private AdhanLog() {}

    static synchronized void add(Context c, String msg) {
        try {
            SharedPreferences p = AdhanScheduler.prefs(c);
            JSONArray old = new JSONArray(p.getString(KEY, "[]"));
            JSONArray out = new JSONArray();
            JSONObject e = new JSONObject().put("t", System.currentTimeMillis()).put("m", msg);
            out.put(e);
            for (int i = 0; i < old.length() && out.length() < MAX; i++) out.put(old.get(i));   /* newest first */
            p.edit().putString(KEY, out.toString()).apply();
        } catch (Exception ignored) {}
    }

    static JSONArray read(Context c) {
        try { return new JSONArray(AdhanScheduler.prefs(c).getString(KEY, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    static String delay(long ms) {
        return String.format(Locale.US, "%.1fs", Math.max(0, ms) / 1000.0);
    }
}
