package com.maar.quran;

import android.Manifest;
import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.DisplayMetrics;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Bridge between the website (wallpaper.js) and the real Android wallpaper service.
 *
 *  enable()     - asks ANDROID to open its own live-wallpaper preview / confirmation screen for MAAR Quran, waits for
 *                 it to close, then asks Android which wallpaper is really set. Only if Android says MAAR Quran is the
 *                 wallpaper is the feature switched on and success reported.
 *  disable()    - stops the automatic daily updates. The wallpaper that is on the phone is not touched.
 *  status()     - what Android reports (home / lock screen), what the app has stored.
 *  getCurrent() - the verse that is on the wallpaper plus a preview picture of it.
 *  refresh()    - move to today's verse / download translations now.
 *  download()   - saves the actual rendered wallpaper (PNG) to Pictures/Quran Maar.
 *  configure()  - language and settings (called at every app start so the wallpaper follows the app language).
 */
@CapacitorPlugin(
        name = "DailyWallpaper",
        permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class WallpaperPlugin extends Plugin {

    private static volatile boolean picking;

    private Context ctx() {
        return getContext().getApplicationContext();
    }

    /* ------------------------------------------------------------------ settings */

    /** @return true when the language / translation edition changed. */
    private boolean storeConfig(Context c, PluginCall call) {
        SharedPreferences p = WallpaperStore.p(c);
        String oldEd = p.getString("edition", ""), oldLang = p.getString("lang", "en");
        String ed = call.getString("edition", "");
        if (ed == null) ed = "";
        String lang = call.getString("lang", "en");
        if (lang == null) lang = "en";
        Boolean rtl = call.getBoolean("rtl", false);
        p.edit().putString("edition", ed).putString("lang", lang)
                .putString("title", call.getString("title", "Ayah of the day"))
                .putBoolean("rtl", rtl != null && rtl).apply();
        return !ed.equals(oldEd) || !lang.equals(oldLang);
    }

    private JSObject statusObject(Context c) {
        SharedPreferences p = WallpaperStore.p(c);
        WallpaperStore.Active a = WallpaperStore.active(c);
        JSObject o = new JSObject();
        o.put("supported", WallpaperStore.liveWallpaperSupported(c));
        o.put("enabled", p.getBoolean("enabled", false));
        o.put("homeActive", a.home);
        o.put("lockActive", a.lock);
        o.put("lockKnown", a.lockKnown);
        o.put("active", a.home || a.lock);
        o.put("appliedDay", p.getString("shown_day", ""));
        o.put("updatedAt", p.getLong("shown_at", 0L));
        o.put("exact", p.getBoolean("shown_exact", true));
        o.put("needsInternet", WallpaperStore.needsNetwork(c));
        o.put("error", p.getString("error", ""));
        o.put("sdk", Build.VERSION.SDK_INT);
        return o;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Context c = ctx();
        boolean changed = storeConfig(c, call);
        if (WallpaperStore.isEnabled(c)) {
            if (changed) WallpaperStore.advance(c, true);
            WallpaperScheduler.ensure(c);
            if (changed) WallpaperScheduler.scheduleNow(c, true);
            MaarWallpaperService.refreshAll();
        }
        call.resolve(statusObject(c));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject(ctx()));
    }

    /* ------------------------------------------------------------------ enable: Android's own preview screen */

    @PluginMethod
    public void enable(final PluginCall call) {
        final Context c = ctx();
        storeConfig(c, call);

        if (!WallpaperStore.liveWallpaperSupported(c)) {
            JSObject r = statusObject(c);
            r.put("activated", false);
            r.put("reason", "unsupported");
            call.resolve(r);
            return;
        }

        WallpaperStore.Active a = WallpaperStore.active(c);
        if (a.home || a.lock) {                       /* already the real wallpaper: no need to ask Android again */
            finishEnable(c);
            JSObject r = statusObject(c);
            r.put("activated", true);
            r.put("alreadyActive", true);
            call.resolve(r);
            return;
        }

        if (picking) {
            JSObject r = statusObject(c);
            r.put("activated", false);
            r.put("reason", "busy");
            call.resolve(r);
            return;
        }
        picking = true;
        final Activity act = getActivity();
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                /* This opens Android's own "Quran Maar - live wallpaper" preview with its Set wallpaper button. */
                Intent preview = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                preview.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, WallpaperStore.component(c));
                try {
                    startActivityForResult(call, preview, "pickerResult");
                    return;
                } catch (Throwable first) {
                    /* a few phones do not have the direct preview: open Android's list of live wallpapers instead */
                }
                try {
                    startActivityForResult(call, new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER), "pickerResult");
                } catch (Throwable second) {
                    picking = false;
                    JSObject r = statusObject(c);
                    r.put("activated", false);
                    r.put("reason", "no_picker");
                    call.resolve(r);
                }
            }
        });
    }

    /** Android's screen has closed. Do not trust the result code alone: ask Android what is really set. */
    @ActivityCallback
    private void pickerResult(final PluginCall call, final ActivityResult result) {
        if (call == null) { picking = false; return; }
        final Context c = ctx();
        final int code = result == null ? Activity.RESULT_CANCELED : result.getResultCode();
        new Thread(new Runnable() {
            @Override public void run() {
                WallpaperStore.Active a = WallpaperStore.active(c);
                int tries = code == Activity.RESULT_CANCELED ? 3 : 12;      /* Android needs a moment to start the service */
                for (int i = 0; i < tries && !(a.home || a.lock); i++) {
                    try { Thread.sleep(500); } catch (InterruptedException ignored) {}
                    a = WallpaperStore.active(c);
                }
                boolean ok = a.home || a.lock;
                if (ok) finishEnable(c);
                JSObject r = statusObject(c);
                r.put("activated", ok);
                r.put("cancelled", !ok && code == Activity.RESULT_CANCELED);
                r.put("resultCode", code);
                picking = false;
                call.resolve(r);
            }
        }, "maar-wallpaper-verify").start();
    }

    /** Android has confirmed MAAR Quran is the wallpaper: switch the daily updates on. */
    private void finishEnable(Context c) {
        WallpaperStore.p(c).edit().putBoolean("enabled", true).apply();
        WallpaperStore.advance(c, true);
        WallpaperScheduler.scheduleDaily(c, false);
        WallpaperScheduler.scheduleNow(c, true);
        MaarWallpaperService.refreshAll();
    }

    /* ------------------------------------------------------------------ disable */

    @PluginMethod
    public void disable(PluginCall call) {
        Context c = ctx();
        WallpaperStore.p(c).edit().putBoolean("enabled", false).apply();   /* the last verse stays on the wallpaper */
        WallpaperScheduler.cancel(c);
        call.resolve(statusObject(c));
    }

    /* ------------------------------------------------------------------ refresh */

    @PluginMethod
    public void refresh(PluginCall call) {
        Context c = ctx();
        boolean complete = true;
        if (WallpaperStore.isEnabled(c)) {
            WallpaperStore.advance(c, false);
            if (WallpaperStore.needsNetwork(c)) complete = WallpaperStore.prefetch(c, WallpaperStore.PREFETCH_DAYS);
            WallpaperStore.advance(c, false);
            MaarWallpaperService.refreshAll();
            if (!complete) WallpaperScheduler.scheduleNet(c);
        }
        JSObject r = statusObject(c);
        r.put("ok", complete);
        call.resolve(r);
    }

    /* ------------------------------------------------------------------ what is on the wallpaper */

    private static float aspect(Context c) {
        DisplayMetrics dm = c.getResources().getDisplayMetrics();
        float w = Math.min(dm.widthPixels, dm.heightPixels), h = Math.max(dm.widthPixels, dm.heightPixels);
        float a = w < 100 ? 2.1f : h / w;
        return Math.max(1.6f, Math.min(2.4f, a));
    }

    @PluginMethod
    public void getCurrent(PluginCall call) {
        Context c = ctx();
        try {
            WallpaperStore.Display d = WallpaperStore.display(c, WallpaperStore.isEnabled(c));
            if (d == null) { call.reject("The verse data is missing from this build."); return; }
            int pw = 540, ph = Math.round(pw * aspect(c));
            Bitmap b = WallpaperRenderer.render(c, d.verse, d.title, d.lang, d.rtl, d.dayIdx, pw, ph);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.JPEG, 88, bo);
            b.recycle();

            JSObject v = new JSObject();
            v.put("ref", d.verse.ref);
            v.put("arabic", d.verse.arabic);
            v.put("translation", d.verse.text == null ? "" : d.verse.text);
            v.put("translator", d.verse.translator == null ? "" : d.verse.translator);
            v.put("surahEn", d.verse.surahEn);
            v.put("surahAr", d.verse.surahAr);
            v.put("surahNo", d.verse.surahNo);
            v.put("ayahNo", d.verse.ayahNo);
            v.put("exact", d.verse.exact);

            JSObject r = statusObject(c);
            r.put("verse", v);
            r.put("preview", "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("Could not prepare the preview: " + t.getMessage());
        }
    }

    /* ------------------------------------------------------------------ download the real image */

    @PluginMethod
    public void download(PluginCall call) {
        /* Android 9 and older need the storage permission; Android 10+ does not. */
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageResult");
            return;
        }
        doDownload(call);
    }

    @PermissionCallback
    private void storageResult(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) doDownload(call);
        else call.reject("Storage permission was not allowed, so the wallpaper could not be saved.");
    }

    private void doDownload(PluginCall call) {
        Context c = ctx();
        Bitmap bmp = null;
        try {
            WallpaperStore.Display d = WallpaperStore.display(c, WallpaperStore.isEnabled(c));
            if (d == null) { call.reject("The verse data is missing from this build."); return; }
            int w = 1440, h = Math.round(w * aspect(c));
            bmp = WallpaperRenderer.render(c, d.verse, d.title, d.lang, d.rtl, d.dayIdx, w, h);

            String name = String.format(Locale.US, "quran-maar-wallpaper-%s-%d-%d.png", WallpaperStore.dayKey(), d.verse.surahNo, d.verse.ayahNo);
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver r = c.getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Quran Maar");
                v.put(MediaStore.Images.Media.IS_PENDING, 1);
                uri = r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("Android would not create the file");
                try (OutputStream os = r.openOutputStream(uri)) {
                    if (os == null) throw new Exception("Could not open the file");
                    if (!bmp.compress(Bitmap.CompressFormat.PNG, 100, os)) throw new Exception("Could not write the image");
                }
                v.clear();
                v.put(MediaStore.Images.Media.IS_PENDING, 0);
                r.update(uri, v, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Quran Maar");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create the Quran Maar folder");
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) {
                    if (!bmp.compress(Bitmap.CompressFormat.PNG, 100, os)) throw new Exception("Could not write the image");
                }
                MediaScannerConnection.scanFile(c, new String[] { f.getAbsolutePath() }, new String[] { "image/png" }, null);
                uri = Uri.fromFile(f);
            }
            JSObject o = new JSObject();
            o.put("uri", uri.toString());
            o.put("folder", "Pictures/Quran Maar");
            o.put("filename", name);
            o.put("width", w);
            o.put("height", h);
            o.put("ref", d.verse.ref);
            call.resolve(o);
        } catch (Throwable e) {
            call.reject("Could not save the wallpaper: " + e.getMessage());
        } finally {
            if (bmp != null) bmp.recycle();
        }
    }
}
