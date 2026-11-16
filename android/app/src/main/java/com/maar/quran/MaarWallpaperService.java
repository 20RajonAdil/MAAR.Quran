package com.maar.quran;

import android.app.WallpaperManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;

import androidx.core.content.ContextCompat;

import java.util.TimeZone;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Quran Maar as a real Android live wallpaper.
 *
 * Android itself shows its own preview / "Set wallpaper" screen for this service (the app only asks Android to
 * open it). Once it is the wallpaper, Android keeps this service running and asks the engine to draw.
 *
 * How the ayah changes every day:
 *  - The engine draws "today's verse" from WallpaperStore, which needs no internet (bundled text / cache).
 *  - It re-checks the date whenever the wallpaper becomes visible (screen on, back on the home screen), when
 *    Android announces a date / time / time-zone change, and with a timer at midnight while it is on screen.
 *    So the verse is correct the next time anyone looks at the phone, even if a background job was delayed.
 *  - WallpaperWorker (WorkManager) also runs shortly after midnight to download translations ahead of time and
 *    to tell every running engine to redraw (refreshAll).
 */
public class MaarWallpaperService extends WallpaperService {

    /** Engines Android has started in this process (home, lock, and preview ones). */
    private static final CopyOnWriteArraySet<WallEngine> ENGINES = new CopyOnWriteArraySet<>();

    @Override
    public Engine onCreateEngine() {
        return new WallEngine();
    }

    /** Asks every running engine to redraw now (called after new content arrives). Safe when none is running. */
    static void refreshAll() {
        for (final WallEngine e : ENGINES) {
            e.ui.post(new Runnable() { @Override public void run() { e.refresh(true); } });
        }
    }

    /** True if Android has started our wallpaper (not a preview) for this screen, e.g. WallpaperManager.FLAG_LOCK. */
    static boolean hasEngineFor(int flag) {
        for (WallEngine e : ENGINES) {
            if (!e.preview && (e.flags & flag) != 0) return true;
        }
        return false;
    }

    private final class WallEngine extends Engine {
        final Handler ui = new Handler(Looper.getMainLooper());
        private final ExecutorService ex = Executors.newSingleThreadExecutor();
        private volatile Bitmap bmp;        /* swapped and drawn on the main thread, read by the render thread */
        private int sw, sh;
        private boolean visible;
        private volatile boolean destroyed;
        private int gen;
        private volatile String drawnSig = "";
        volatile boolean preview;
        volatile int flags;

        private final BroadcastReceiver clock = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent i) {
                String a = i == null ? null : i.getAction();
                if (Intent.ACTION_TIMEZONE_CHANGED.equals(a)) TimeZone.setDefault(null);   /* re-read the phone's zone */
                refresh(false);
                armMidnight();
                WallpaperScheduler.rescheduleAfterClockChange(getApplicationContext());
            }
        };

        private final Runnable midnight = new Runnable() {
            @Override public void run() {
                refresh(false);
                armMidnight();
            }
        };

        @Override
        public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            setTouchEventsEnabled(false);
            readMeta();
            ENGINES.add(this);
            IntentFilter f = new IntentFilter();
            f.addAction(Intent.ACTION_DATE_CHANGED);
            f.addAction(Intent.ACTION_TIME_CHANGED);
            f.addAction(Intent.ACTION_TIMEZONE_CHANGED);
            try { ContextCompat.registerReceiver(MaarWallpaperService.this, clock, f, ContextCompat.RECEIVER_NOT_EXPORTED); } catch (Throwable ignored) {}

            if (!preview) {
                /* Picked straight from Android's wallpaper list (not through the app's switch): treat that as "yes, daily". */
                ex.execute(new Runnable() {
                    @Override public void run() {
                        try {
                            Context c = getApplicationContext();
                            if (!WallpaperStore.p(c).contains("enabled")) WallpaperStore.p(c).edit().putBoolean("enabled", true).apply();
                            WallpaperScheduler.ensure(c);
                        } catch (Throwable ignored) {}
                    }
                });
            }
        }

        private void readMeta() {
            try { preview = isPreview(); } catch (Throwable t) { preview = false; }
            int fl = 0;
            try { if (Build.VERSION.SDK_INT >= 24) fl = getWallpaperFlags(); } catch (Throwable ignored) {}
            flags = fl == 0 ? WallpaperManager.FLAG_SYSTEM : fl;     /* old Android has one wallpaper: treat it as the home screen */
        }

        @Override
        public void onSurfaceCreated(SurfaceHolder holder) {
            super.onSurfaceCreated(holder);
            readMeta();
        }

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int width, int height) {
            super.onSurfaceChanged(holder, format, width, height);
            readMeta();
            sw = width; sh = height;
            refresh(true);
        }

        @Override
        public void onSurfaceRedrawNeeded(SurfaceHolder holder) {
            super.onSurfaceRedrawNeeded(holder);
            draw();
        }

        @Override
        public void onVisibilityChanged(boolean v) {
            super.onVisibilityChanged(v);
            visible = v;
            if (v) {
                readMeta();
                refresh(false);          /* a new day may have started while the screen was off */
                armMidnight();
                kickCatchUpIfNeeded();
            } else {
                ui.removeCallbacks(midnight);
            }
        }

        @Override
        public void onDestroy() {
            destroyed = true;
            ENGINES.remove(this);
            try { MaarWallpaperService.this.unregisterReceiver(clock); } catch (Throwable ignored) {}
            ui.removeCallbacksAndMessages(null);
            ex.shutdownNow();
            bmp = null;
            super.onDestroy();
        }

        private void armMidnight() {
            ui.removeCallbacks(midnight);
            if (visible && !destroyed) ui.postDelayed(midnight, WallpaperStore.millisUntilMidnight() + 1500L);
        }

        /** The translation may still be downloading (other languages): make sure that is queued. */
        private void kickCatchUpIfNeeded() {
            if (preview) return;
            ex.execute(new Runnable() {
                @Override public void run() {
                    try {
                        Context c = getApplicationContext();
                        if (WallpaperStore.isEnabled(c) && WallpaperStore.isStale(c)) WallpaperScheduler.scheduleNow(c, false);
                    } catch (Throwable ignored) {}
                }
            });
        }

        /** Works out today's picture on a background thread, then draws it. {@code force} redraws even if nothing changed. */
        void refresh(final boolean force) {
            if (destroyed || sw <= 0 || sh <= 0) return;
            final int w = sw, h = sh, my = ++gen;
            try {
                ex.execute(new Runnable() {
                    @Override public void run() {
                        try {
                            Context c = getApplicationContext();
                            WallpaperStore.Display d = WallpaperStore.display(c, !preview);
                            final String sig = d == null ? "none" : d.signature() + "|" + w + "x" + h;
                            if (!force && sig.equals(drawnSig) && bmp != null) return;
                            float k = Math.min(1f, 1600f / w);     /* keep memory sensible on very high-resolution phones */
                            int bw = Math.round(w * k), bh = Math.round(h * k);
                            final Bitmap b;
                            if (d == null) {
                                b = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
                                new Canvas(b).drawColor(0xFF0B0B0B);
                            } else {
                                b = WallpaperRenderer.render(c, d.verse, d.title, d.lang, d.rtl, d.dayIdx, bw, bh);
                            }
                            ui.post(new Runnable() {
                                @Override public void run() {
                                    if (destroyed || my != gen) return;      /* a newer request is on its way */
                                    bmp = b;
                                    drawnSig = sig;
                                    draw();
                                }
                            });
                        } catch (Throwable ignored) { /* keep showing what is on screen */ }
                    }
                });
            } catch (Throwable ignored) { /* executor is shut down: engine is going away */ }
        }

        private void draw() {
            if (destroyed) return;
            SurfaceHolder holder = getSurfaceHolder();
            Canvas cv = null;
            try {
                cv = holder.lockCanvas();
                if (cv == null) return;
                if (bmp == null) {
                    cv.drawColor(0xFF0B0B0B);
                } else {
                    Rect dst = holder.getSurfaceFrame();
                    cv.drawBitmap(bmp, null, dst, new Paint(Paint.FILTER_BITMAP_FLAG));
                }
            } catch (Throwable ignored) {
            } finally {
                if (cv != null) { try { holder.unlockCanvasAndPost(cv); } catch (Throwable ignored) {} }
            }
        }
    }
}
