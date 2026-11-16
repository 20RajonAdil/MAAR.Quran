package com.maar.quran;

import android.app.WallpaperManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.util.DisplayMetrics;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.TimeZone;

/**
 * Picks today's ayah (same list and same day-rotation as "Ayah of the day" in the app), gets it in the
 * language the person chose for the app, draws the wallpaper and sets it.
 */
final class WallpaperWorker {
    private WallpaperWorker() {}

    private static final String[] REFS = {
        "2:255","2:286","2:152","2:153","2:186","2:45","2:156","2:201","3:8","3:26","3:139","3:159","3:173","3:200",
        "4:103","5:8","6:162","7:23","7:56","8:46","9:51","10:62","11:88","12:87","13:28","14:7","15:9","16:90","16:128",
        "17:23","17:80","18:10","20:114","21:87","23:118","24:35","25:63","28:24","29:69","31:17","33:41","33:56",
        "39:10","39:53","40:60","41:34","42:36","49:13","51:56","55:13","57:4","59:22","59:23","64:11","65:2","65:3",
        "93:3","94:5","94:6","112:1"
    };
    private static final String API = "https://api.alquran.cloud/v1";

    static final class Verse {
        String ref, arabic, text, surahEn, surahAr;
        int surahNo, ayahNo;
        boolean old;   /* from an earlier day (no internet right now) */
    }

    /** Days since 1970 of the phone's local date, same maths as the website, so both pick the same ayah. */
    static int dayIndex() {
        Calendar l = Calendar.getInstance();
        GregorianCalendar u = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        u.clear();
        u.set(l.get(Calendar.YEAR), l.get(Calendar.MONTH), l.get(Calendar.DAY_OF_MONTH));
        return (int) (u.getTimeInMillis() / 86400000L);
    }

    /** @return true when finished (or nothing to do); false = try again later. */
    static boolean apply(Context ctx, boolean force) {
        Context c = ctx.getApplicationContext();
        SharedPreferences p = WallpaperScheduler.p(c);
        if (!p.getBoolean("enabled", false)) return true;
        String day = WallpaperScheduler.dayKey();
        if (!force && day.equals(p.getString("applied_day", ""))) return true;

        String edition = p.getString("edition", "");
        Verse v = loadVerse(p, day, edition);
        if (v == null) { p.edit().putString("error", "offline").apply(); return false; }

        try {
            WallpaperManager wm = WallpaperManager.getInstance(c);
            if (!wm.isWallpaperSupported() || !wm.isSetWallpaperAllowed()) {
                p.edit().putString("error", "not_allowed").apply();
                return true;   /* nothing a retry can fix */
            }
            DisplayMetrics dm = c.getResources().getDisplayMetrics();
            int w = Math.min(dm.widthPixels, dm.heightPixels);
            int h = Math.max(Math.max(dm.widthPixels, dm.heightPixels), wm.getDesiredMinimumHeight());
            if (w < 400) w = 1080;
            if (h < 800) h = 2400;
            /* keep memory sensible on very high-resolution phones */
            float k = Math.min(1f, 1600f / w);
            w = Math.round(w * k); h = Math.round(h * k);

            Bitmap bmp = WallpaperRenderer.render(c, v, p.getString("title", "Ayah of the day"), p.getString("lang", "en"),
                    p.getBoolean("rtl", false), dayIndex(), w, h);

            String t = p.getString("target", "both");
            int flags = "home".equals(t) ? WallpaperManager.FLAG_SYSTEM
                    : "lock".equals(t) ? WallpaperManager.FLAG_LOCK
                    : (WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK);
            wm.setBitmap(bmp, null, true, flags);
            bmp.recycle();
        } catch (Throwable e) {
            p.edit().putString("error", "failed").apply();
            return false;
        }

        SharedPreferences.Editor ed = p.edit();
        ed.remove("error");
        ed.putString("applied_ref", v.ref);
        if (!v.old) ed.putString("applied_day", day);   /* an old ayah is a stop-gap: keep trying for today's */
        ed.apply();
        return !v.old;
    }

    /* ---------------- verse: cache or internet ---------------- */

    private static Verse loadVerse(SharedPreferences p, String day, String edition) {
        String cached = p.getString("v_json", null);
        boolean sameEd = edition.equals(p.getString("v_ed", ""));
        if (cached != null && sameEd && day.equals(p.getString("v_day", ""))) {
            Verse v = parse(cached);
            if (v != null) return v;
        }
        String ref = REFS[Math.floorMod(dayIndex(), REFS.length)];
        String json = fetch(ref, edition);
        Verse v = json == null ? null : parse(json);
        if (v != null) {
            p.edit().putString("v_json", json).putString("v_day", day).putString("v_ed", edition).apply();
            return v;
        }
        if (cached != null && sameEd) {
            Verse o = parse(cached);
            if (o != null) { o.old = true; return o; }
        }
        return null;
    }

    private static boolean arabicOnly(String edition) {
        return edition == null || edition.isEmpty() || "ar".equals(edition);
    }

    private static String fetch(String ref, String edition) {
        HttpURLConnection h = null;
        try {
            String eds = arabicOnly(edition) ? "quran-uthmani" : "quran-uthmani," + edition;
            h = (HttpURLConnection) new URL(API + "/ayah/" + ref + "/editions/" + eds).openConnection();
            h.setConnectTimeout(12000);
            h.setReadTimeout(15000);
            h.setRequestProperty("Accept", "application/json");
            if (h.getResponseCode() != 200) return null;
            InputStream in = h.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            return out.toString("UTF-8");
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    private static Verse parse(String json) {
        try {
            JSONObject root = new JSONObject(json);
            Object d = root.get("data");
            JSONObject ar, tr = null;
            if (d instanceof JSONArray) {
                JSONArray a = (JSONArray) d;
                ar = a.getJSONObject(0);
                if (a.length() > 1) tr = a.getJSONObject(1);
            } else {
                ar = (JSONObject) d;
            }
            Verse v = new Verse();
            v.arabic = ar.getString("text");
            v.text = tr == null ? null : tr.getString("text");
            JSONObject s = ar.getJSONObject("surah");
            v.surahNo = s.getInt("number");
            v.surahEn = s.optString("englishName", "");
            v.surahAr = s.optString("name", "");
            v.ayahNo = ar.getInt("numberInSurah");
            v.ref = v.surahNo + ":" + v.ayahNo;
            return v;
        } catch (Exception e) {
            return null;
        }
    }
}
