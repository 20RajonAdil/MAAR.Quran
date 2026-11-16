package com.maar.quran;

import android.app.WallpaperManager;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Bridge for wallpaper.js: switch the daily ayah wallpaper on/off, change language, "change now". */
@CapacitorPlugin(name = "DailyWallpaper")
public class WallpaperPlugin extends Plugin {

    private void store(Context c, PluginCall call) {
        SharedPreferences.Editor e = WallpaperScheduler.p(c).edit();
        String ed = call.getString("edition", "");
        e.putString("edition", ed == null ? "" : ed);
        e.putString("lang", call.getString("lang", "en"));
        e.putString("title", call.getString("title", "Ayah of the day"));
        Boolean rtl = call.getBoolean("rtl", false);
        e.putBoolean("rtl", rtl != null && rtl);
        String t = call.getString("target", "both");
        e.putString("target", ("home".equals(t) || "lock".equals(t)) ? t : "both");
        e.putBoolean("enabled", true);
        e.apply();
    }

    private JSObject status(Context c) {
        SharedPreferences p = WallpaperScheduler.p(c);
        JSObject o = new JSObject();
        o.put("enabled", p.getBoolean("enabled", false));
        o.put("appliedDay", p.getString("applied_day", ""));
        o.put("ref", p.getString("applied_ref", ""));
        o.put("error", p.getString("error", ""));
        o.put("target", p.getString("target", "both"));
        try { o.put("allowed", WallpaperManager.getInstance(c).isSetWallpaperAllowed()); } catch (Throwable t) { o.put("allowed", true); }
        return o;
    }

    /** Turn on (or change settings). apply=false only saves the settings (used at app start to keep the language in sync). */
    @PluginMethod
    public void enable(final PluginCall call) {
        final Context c = getContext().getApplicationContext();
        store(c, call);
        Boolean ap = call.getBoolean("apply", true);
        final boolean apply = ap == null || ap;
        WallpaperScheduler.scheduleNext(c);
        if (!apply) {
            WallpaperScheduler.ensure(c);
            call.resolve(status(c));
            return;
        }
        run(call, c);
    }

    @PluginMethod
    public void applyNow(PluginCall call) {
        run(call, getContext().getApplicationContext());
    }

    private void run(final PluginCall call, final Context c) {
        new Thread(new Runnable() {
            @Override public void run() {
                boolean ok = false;
                try { ok = WallpaperWorker.apply(c, true); } catch (Throwable ignored) {}
                if (!ok) WallpaperScheduler.scheduleNow(c);   /* no internet right now: finish it when there is */
                JSObject r = status(c);
                r.put("ok", ok);
                call.resolve(r);
            }
        }, "maar-wallpaper-now").start();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Context c = getContext().getApplicationContext();
        WallpaperScheduler.p(c).edit().putBoolean("enabled", false).apply();
        WallpaperScheduler.cancel(c);
        call.resolve(status(c));
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status(getContext().getApplicationContext()));
    }
}
