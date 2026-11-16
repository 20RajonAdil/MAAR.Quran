package com.maar.quran;

import android.app.WallpaperInfo;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Everything the Daily Quran Wallpaper needs to know, in one place:
 *  - settings and what is currently shown (SharedPreferences),
 *  - which ayah belongs to which day (same list and same day maths as "Ayah of the day" in the app),
 *  - the verse text itself: Arabic + English come from a file bundled inside the APK (copied from the
 *    project's own surah pages by tools/build-wallpaper-verses.py), so the wallpaper works with no internet.
 *    Other translation languages are downloaded from the same API the app already uses, checked, and cached.
 *  - "advance": moving the shown verse on to today's.
 *  - whether Android really has MAAR Quran as the active wallpaper.
 *
 * Nothing in here invents Quran text. A verse is either copied from the bundled file, or it is a translation
 * that the API returned for exactly the surah and ayah that were asked for.
 */
final class WallpaperStore {
    private WallpaperStore() {}

    static final String PREFS = "maar_wallpaper";
    static final int PREFETCH_DAYS = 30;
    private static final String API = "https://api.alquran.cloud/v1";
    private static final String CACHE_FILE = "wp_translations.json";

    /** Same list and same order as DAILY_AYAH_REFS in app.js (and tools/build-wallpaper-verses.py). */
    static final String[] REFS = {
        "2:255", "2:286", "2:152", "2:153", "2:186", "2:45", "2:156", "2:201", "3:8", "3:26", "3:139", "3:159", "3:173", "3:200",
        "4:103", "5:8", "6:162", "7:23", "7:56", "8:46", "9:51", "10:62", "11:88", "12:87", "13:28", "14:7", "15:9", "16:90", "16:128",
        "17:23", "17:80", "18:10", "20:114", "21:87", "23:118", "24:35", "25:63", "28:24", "29:69", "31:17", "33:41", "33:56",
        "39:10", "39:53", "40:60", "41:34", "42:36", "49:13", "51:56", "55:13", "57:4", "59:22", "59:23", "64:11", "65:2", "65:3",
        "93:3", "94:5", "94:6", "112:1"
    };

    private static final Object LOCK = new Object();
    private static JSONObject bundle;   /* verses.json, loaded once */

    /* ------------------------------------------------------------------ model */

    static final class Verse {
        String ref, arabic, text, surahEn, surahAr, translator;
        int surahNo, ayahNo;
        /** false = the translation is not (yet) in the language the person chose, so English is shown for now. */
        boolean exact = true;

        JSONObject toJson() {
            try {
                JSONObject o = new JSONObject();
                o.put("ref", ref); o.put("ar", arabic); o.put("tr", text == null ? JSONObject.NULL : text);
                o.put("se", surahEn); o.put("sa", surahAr); o.put("n", surahNo); o.put("a", ayahNo);
                o.put("by", translator == null ? JSONObject.NULL : translator); o.put("exact", exact);
                return o;
            } catch (Exception e) { return new JSONObject(); }
        }

        static Verse fromJson(String s) {
            try {
                JSONObject o = new JSONObject(s);
                Verse v = new Verse();
                v.ref = o.getString("ref"); v.arabic = o.getString("ar");
                v.text = o.isNull("tr") ? null : o.getString("tr");
                v.surahEn = o.optString("se", ""); v.surahAr = o.optString("sa", "");
                v.surahNo = o.getInt("n"); v.ayahNo = o.getInt("a");
                v.translator = o.isNull("by") ? null : o.optString("by", null);
                v.exact = o.optBoolean("exact", true);
                return v;
            } catch (Exception e) { return null; }
        }

        /** Changes whenever anything that is drawn changes (used so the wallpaper is only redrawn when it must be). */
        String signature() {
            return ref + "|" + (text == null ? 0 : text.hashCode()) + "|" + exact;
        }
    }

    /** What the wallpaper should show right now. */
    static final class Display {
        Verse verse;
        int dayIdx;
        String lang, title;
        boolean rtl;

        String signature() {
            return verse.signature() + "|" + dayIdx + "|" + lang + "|" + rtl + "|" + (title == null ? 0 : title.hashCode());
        }
    }

    /** Which Android screens have MAAR Quran as their wallpaper, as far as Android lets an app find out. */
    static final class Active {
        boolean home;
        boolean lock;
        /** false = Android does not tell apps about the lock screen on this phone / version. Never claim "lock" then. */
        boolean lockKnown;
    }

    /* ------------------------------------------------------------------ prefs */

    static SharedPreferences p(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context c) {
        return p(c).getBoolean("enabled", false);
    }

    /** Today's date in the phone's time zone, e.g. 2026-11-16. */
    static String dayKey() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** Days since 1970 of the phone's local date, same maths as the website, so both pick the same ayah. */
    static int dayIndex() {
        return dayIndexOf(Calendar.getInstance());
    }

    static int dayIndexOf(Calendar l) {
        GregorianCalendar u = new GregorianCalendar(TimeZone.getTimeZone("UTC"));
        u.clear();
        u.set(l.get(Calendar.YEAR), l.get(Calendar.MONTH), l.get(Calendar.DAY_OF_MONTH));
        return (int) (u.getTimeInMillis() / 86400000L);
    }

    static String refForDay(int dayIdx) {
        return REFS[Math.floorMod(dayIdx, REFS.length)];
    }

    /** Milliseconds from now until the next local midnight. */
    static long millisUntilMidnight() {
        Calendar t = Calendar.getInstance();
        t.add(Calendar.DAY_OF_YEAR, 1);
        t.set(Calendar.HOUR_OF_DAY, 0); t.set(Calendar.MINUTE, 0); t.set(Calendar.SECOND, 0); t.set(Calendar.MILLISECOND, 0);
        return Math.max(1000L, t.getTimeInMillis() - System.currentTimeMillis());
    }

    static boolean isStale(Context c) {
        SharedPreferences p = p(c);
        return !dayKey().equals(p.getString("shown_day", "")) || !p.getBoolean("shown_exact", false);
    }

    /* ------------------------------------------------------------------ verse text */

    private static JSONObject bundle(Context c) {
        synchronized (LOCK) {
            if (bundle != null) return bundle;
            try (InputStream in = c.getApplicationContext().getAssets().open("wallpaper/verses.json")) {
                bundle = new JSONObject(new String(readAll(in), StandardCharsets.UTF_8));
            } catch (Exception e) {
                bundle = new JSONObject();
            }
            return bundle;
        }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    /** True when the translation for this edition ships inside the app (no internet needed). */
    static boolean isBundledEdition(String edition) {
        return edition == null || edition.isEmpty() || "ar".equals(edition) || "en.sahih".equals(edition);
    }

    static String edition(Context c) {
        String e = p(c).getString("edition", "");
        return e == null ? "" : e;
    }

    /** The verse for a given day in the person's chosen language. Never null unless the bundled file is missing. */
    static Verse verseFor(Context c, int dayIdx) {
        String ref = refForDay(dayIdx);
        JSONObject b = bundle(c).optJSONObject(ref);
        if (b == null) return null;
        Verse v = new Verse();
        v.ref = ref;
        v.arabic = b.optString("ar", "");
        v.surahEn = b.optString("se", "");
        v.surahAr = b.optString("sa", "");
        v.surahNo = b.optInt("n");
        v.ayahNo = b.optInt("a");
        if (v.arabic.isEmpty() || v.surahNo <= 0 || v.ayahNo <= 0) return null;

        String ed = edition(c);
        if (ed.isEmpty() || "ar".equals(ed)) {
            v.text = null;                                     /* Arabic only, by choice */
        } else if ("en.sahih".equals(ed)) {
            v.text = b.optString("en", null);
            v.translator = "Saheeh International";
        } else {
            String t = cachedTranslation(c, ed, ref);
            if (t != null) { v.text = t; }
            else { v.text = b.optString("en", null); v.translator = "Saheeh International"; v.exact = false; }   /* until it is downloaded */
        }
        return v;
    }

    /* ------------------------------------------------------------------ translation cache (other languages) */

    private static File cacheFile(Context c) {
        return new File(c.getApplicationContext().getFilesDir(), CACHE_FILE);
    }

    private static JSONObject loadCache(Context c, String edition) {
        synchronized (LOCK) {
            try {
                File f = cacheFile(c);
                if (f.exists()) {
                    JSONObject o = new JSONObject(new String(readAll(new java.io.FileInputStream(f)), StandardCharsets.UTF_8));
                    if (edition.equals(o.optString("edition")) && o.optJSONObject("t") != null) return o;
                }
            } catch (Exception ignored) {}
            try { return new JSONObject().put("edition", edition).put("t", new JSONObject()); } catch (Exception e) { return new JSONObject(); }
        }
    }

    private static String cachedTranslation(Context c, String edition, String ref) {
        JSONObject o = loadCache(c, edition);
        JSONObject t = o.optJSONObject("t");
        String s = t == null ? null : t.optString(ref, null);
        return (s == null || s.trim().isEmpty()) ? null : s;
    }

    private static void saveTranslation(Context c, String edition, String ref, String text) {
        synchronized (LOCK) {
            try {
                JSONObject o = loadCache(c, edition);
                o.getJSONObject("t").put(ref, text);
                File f = cacheFile(c), tmp = new File(f.getPath() + ".tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(o.toString().getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
                if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
            } catch (Exception ignored) {}
        }
    }

    /** True when a translation language has to be downloaded for any of the next days and some are still missing. */
    static boolean needsNetwork(Context c) {
        String ed = edition(c);
        if (isBundledEdition(ed)) return false;
        JSONObject t = loadCache(c, ed).optJSONObject("t");
        int base = dayIndex();
        for (int d = 0; d < PREFETCH_DAYS; d++) {
            String ref = refForDay(base + d);
            if (t == null || t.optString(ref, "").trim().isEmpty()) return true;
        }
        return false;
    }

    /**
     * Downloads (and caches) the translations for the next {@code days} days. Returns true when everything needed
     * is now on the phone. Each answer is checked: it must be for the surah and ayah that were asked for, in the
     * edition that was asked for, and not empty. Anything else is thrown away.
     */
    static boolean prefetch(Context c, int days) {
        String ed = edition(c);
        if (isBundledEdition(ed)) return true;
        JSONObject t = loadCache(c, ed).optJSONObject("t");
        int base = dayIndex(), failures = 0;
        boolean all = true;
        for (int d = 0; d < days; d++) {
            String ref = refForDay(base + d);
            if (t != null && !t.optString(ref, "").trim().isEmpty()) continue;
            String text = fetchTranslation(ref, ed);
            if (text != null) { saveTranslation(c, ed, ref, text); failures = 0; }
            else { all = false; if (++failures >= 2) break; }     /* offline: stop instead of waiting for 30 time-outs */
        }
        return all;
    }

    private static String fetchTranslation(String ref, String edition) {
        HttpURLConnection h = null;
        try {
            String[] sa = ref.split(":");
            int s = Integer.parseInt(sa[0]), a = Integer.parseInt(sa[1]);
            h = (HttpURLConnection) new URL(API + "/ayah/" + ref + "/" + edition).openConnection();
            h.setConnectTimeout(10000);
            h.setReadTimeout(15000);
            h.setRequestProperty("Accept", "application/json");
            if (h.getResponseCode() != 200) return null;
            JSONObject root;
            try (InputStream in = h.getInputStream()) { root = new JSONObject(new String(readAll(in), StandardCharsets.UTF_8)); }
            if (root.optInt("code") != 200) return null;
            JSONObject d = root.getJSONObject("data");
            if (d.getJSONObject("surah").getInt("number") != s) return null;
            if (d.getInt("numberInSurah") != a) return null;
            if (!edition.equals(d.getJSONObject("edition").optString("identifier"))) return null;
            String text = d.getString("text").trim();
            return text.isEmpty() ? null : text;
        } catch (Exception e) {
            return null;
        } finally {
            if (h != null) h.disconnect();
        }
    }

    /* ------------------------------------------------------------------ what is shown */

    /**
     * Moves the shown verse on to today's (or upgrades it once its translation has arrived).
     * Needs no internet: today's verse always comes from the bundled file or the cache.
     * @return true when the shown verse changed.
     */
    static boolean advance(Context c, boolean force) {
        synchronized (LOCK) {
            SharedPreferences p = p(c);
            if (!p.getBoolean("enabled", false)) return false;
            String day = dayKey();
            boolean same = day.equals(p.getString("shown_day", ""));
            boolean exact = p.getBoolean("shown_exact", false);
            if (!force && same && exact) return false;
            int idx = dayIndex();
            Verse v = verseFor(c, idx);
            if (v == null) { p.edit().putString("error", "no_verse_data").apply(); return false; }
            if (!force && same && !v.exact) return false;     /* nothing better than what is already shown */
            p.edit().putString("shown_day", day).putInt("shown_idx", idx).putString("shown_json", v.toJson().toString())
                    .putBoolean("shown_exact", v.exact).putLong("shown_at", System.currentTimeMillis()).remove("error").apply();
            return true;
        }
    }

    /**
     * What to draw. While the feature is on this is today's verse. While it is off it is the last verse that was
     * shown, so switching the feature off never changes (or removes) the wallpaper that is already on the phone.
     */
    static Display display(Context c, boolean persistAdvance) {
        SharedPreferences p = p(c);
        if (persistAdvance) advance(c, false);
        Display d = new Display();
        d.lang = p.getString("lang", "en");
        d.title = p.getString("title", "Ayah of the day");
        d.rtl = p.getBoolean("rtl", false);
        String json = p.getString("shown_json", null);
        Verse v = json == null ? null : Verse.fromJson(json);
        if (v != null) {
            d.verse = v;
            d.dayIdx = p.getInt("shown_idx", dayIndex());
            return d;
        }
        d.dayIdx = dayIndex();                       /* nothing shown yet (e.g. a preview): show today's */
        d.verse = verseFor(c, d.dayIdx);
        if (d.verse == null) return null;
        if (persistAdvance && !p.getBoolean("enabled", false)) {
            /* the real wallpaper while the feature is off: keep this verse so it never changes by itself */
            p.edit().putString("shown_day", dayKey()).putInt("shown_idx", d.dayIdx).putString("shown_json", d.verse.toJson().toString())
                    .putBoolean("shown_exact", d.verse.exact).putLong("shown_at", System.currentTimeMillis()).apply();
        }
        return d;
    }

    /* ------------------------------------------------------------------ is MAAR Quran really the wallpaper? */

    static ComponentName component(Context c) {
        return new ComponentName(c.getApplicationContext(), MaarWallpaperService.class);
    }

    /**
     * Asks Android which wallpaper is set. The home screen can always be checked. The lock screen can be checked on
     * Android 14+, and on older versions only if Android has started our wallpaper for the lock screen in this
     * process. Otherwise it is reported as unknown, never as active.
     */
    static Active active(Context c) {
        Context app = c.getApplicationContext();
        Active a = new Active();
        ComponentName me = component(app);
        WallpaperManager wm = WallpaperManager.getInstance(app);
        try {
            WallpaperInfo hi = wm.getWallpaperInfo();
            a.home = hi != null && me.equals(hi.getComponent());
        } catch (Throwable ignored) {}

        boolean lockSeen = MaarWallpaperService.hasEngineFor(WallpaperManager.FLAG_LOCK);
        boolean lockApi = false, lockOurs = false;
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                WallpaperInfo li = wm.getWallpaperInfo(WallpaperManager.FLAG_LOCK);
                lockOurs = li != null && me.equals(li.getComponent());
                lockApi = true;
            } catch (Throwable ignored) {}
        }
        if (lockOurs || lockSeen) { a.lock = true; a.lockKnown = true; }
        else if (lockApi && !a.home) { a.lock = false; a.lockKnown = true; }   /* neither screen is ours */
        /* else: home is ours but the lock screen could just be sharing it, and Android will not say: unknown */
        return a;
    }

    static boolean liveWallpaperSupported(Context c) {
        try { return c.getPackageManager().hasSystemFeature("android.software.live_wallpaper"); } catch (Throwable t) { return false; }
    }
}
