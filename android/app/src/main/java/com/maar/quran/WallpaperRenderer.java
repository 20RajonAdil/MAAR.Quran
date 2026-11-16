package com.maar.quran;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;

import java.util.Arrays;
import java.util.List;
import java.util.Random;

/** Draws the wallpaper: a different calm background each day (drawn in code, nothing to download) + the ayah. */
final class WallpaperRenderer {
    private WallpaperRenderer() {}

    private static final int NTHEMES = 8;
    /* top, middle, bottom, accent */
    private static final int[][] T = {
        {0xFF050B1F, 0xFF0B1B4D, 0xFF1B2A6B, 0xFFE9D8A6},   /* 0 night sky + crescent */
        {0xFF0B0B0B, 0xFF1A0A0E, 0xFF4A0B14, 0xFFCF3342},   /* 1 crimson mihrab (app colours) */
        {0xFF03160F, 0xFF06382A, 0xFF0B5D45, 0xFFD4B65F},   /* 2 emerald geometry */
        {0xFF1A0F2E, 0xFF5B2A5C, 0xFFD9714A, 0xFFFFD9A0},   /* 3 desert dusk */
        {0xFF021B2B, 0xFF05405F, 0xFF0A7A8F, 0xFF9FE8E0},   /* 4 ocean */
        {0xFF0D1030, 0xFF3B2B6B, 0xFFE8905A, 0xFFFFE2B8},   /* 5 mosque skyline */
        {0xFF050812, 0xFF0A1630, 0xFF081F1A, 0xFFB8F5D0},   /* 6 aurora */
        {0xFF140C06, 0xFF2B1A0A, 0xFF4A2E10, 0xFFF0C46A},   /* 7 golden geometry */
    };
    private static final List<String> LATIN = Arrays.asList("en", "fr", "de", "es", "it", "tr", "id", "ms", "sw");

    static Bitmap render(Context c, WallpaperWorker.Verse v, String title, String lang, boolean rtl, int dayIdx, int W, int H) {
        int th = Math.floorMod(dayIdx, NTHEMES);
        int[] col = T[th];
        Bitmap bmp = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Random rnd = new Random(dayIdx * 7919L + 13);
        float u = W / 1080f;   /* 1 "unit" = 1px on a 1080-wide screen */

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new LinearGradient(0, 0, 0, H, new int[]{col[0], col[1], col[2]}, new float[]{0f, .55f, 1f}, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, W, H, p);
        p.setShader(null);

        switch (th) {
            case 0: stars(cv, rnd, W, H, u, 120); crescent(cv, W, H, col[3]); break;
            case 1: stars(cv, rnd, W, H, u, 70); arch(cv, W, H, u); break;
            case 2: lattice(cv, W, H, u, col[3], 38); break;
            case 3: stars(cv, rnd, W, H, u, 40); dunes(cv, W, H, rnd); break;
            case 4: stars(cv, rnd, W, H, u, 30); waves(cv, W, H, col[3]); break;
            case 5: stars(cv, rnd, W, H, u, 50); skyline(cv, W, H); break;
            case 6: stars(cv, rnd, W, H, u, 90); aurora(cv, W, H); break;
            default: lattice(cv, W, H, u, col[3], 46); break;
        }

        /* ---- text ---- */
        Typeface arabicFace;
        try { arabicFace = Typeface.createFromAsset(c.getAssets(), "fonts/AmiriQuran-Regular.ttf"); }
        catch (Throwable e) { arabicFace = Typeface.SERIF; }
        boolean latin = LATIN.contains(lang);
        Typeface tFace = latin ? Typeface.create(Typeface.SERIF, Typeface.ITALIC) : Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL);

        TextPaint ap = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        ap.setTypeface(arabicFace); ap.setColor(0xFFF5F2ED);
        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setTypeface(tFace); tp.setColor(0xFFE8E2DA);
        TextPaint rp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        rp.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)); rp.setColor(col[3]); rp.setTextSize(W * 0.031f);
        TextPaint hp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        hp.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)); hp.setColor(col[3]); hp.setTextSize(W * 0.026f); hp.setLetterSpacing(0.14f);

        int textW = (int) (W * 0.80f);
        float pad = W * 0.055f, gap = W * 0.03f;
        float maxH = H * 0.54f - 2 * pad;
        String head = latin ? title.toUpperCase(java.util.Locale.ROOT) : title;
        String ref = ("ar".equals(lang) && v.surahAr != null && !v.surahAr.isEmpty() ? v.surahAr : v.surahEn) + "  \u00B7  " + v.surahNo + ":" + v.ayahNo;
        StaticLayout hL = lay(head, hp, textW, 1f, false);
        StaticLayout rL = lay(ref, rp, textW, 1f, false);

        float aSize = W * 0.068f, aMin = W * 0.030f, tMin = W * 0.024f, tMax = W * 0.042f;
        StaticLayout aL, tL;
        while (true) {
            ap.setTextSize(aSize);
            aL = lay(v.arabic, ap, textW, 1.75f, true);
            tL = null;
            if (v.text != null && !v.text.isEmpty()) {
                tp.setTextSize(Math.max(tMin, Math.min(tMax, aSize * 0.6f)));
                tL = lay(v.text, tp, textW, 1.3f, rtl);
            }
            float total = hL.getHeight() + gap + aL.getHeight() + (tL != null ? gap * 2 + tL.getHeight() : 0) + gap + rL.getHeight();
            if (total <= maxH || aSize <= aMin) break;
            aSize -= W * 0.002f;
            if (aSize < aMin) aSize = aMin;
        }
        float contentH = hL.getHeight() + gap + aL.getHeight() + (tL != null ? gap * 2 + tL.getHeight() : 0) + gap + rL.getHeight();
        float panelH = Math.min(H * 0.9f, contentH + 2 * pad);
        float panelW = textW + 2 * pad;
        float left = (W - panelW) / 2f;
        float top = Math.max(H * 0.06f, H * 0.52f - panelH / 2f);   /* a little below centre: the lock-screen clock sits higher */

        /* soft panel so the text is easy to read on every background */
        Paint pp = new Paint(Paint.ANTI_ALIAS_FLAG);
        pp.setColor(0x73000000);
        RectF r = new RectF(left, top, left + panelW, top + panelH);
        cv.drawRoundRect(r, W * 0.06f, W * 0.06f, pp);
        pp.setStyle(Paint.Style.STROKE); pp.setStrokeWidth(Math.max(1.5f, 2 * u)); pp.setColor((col[3] & 0x00FFFFFF) | 0x59000000);
        cv.drawRoundRect(r, W * 0.06f, W * 0.06f, pp);

        float y = top + pad;
        float cx = W / 2f;
        y = draw(cv, hL, cx, y) + gap;
        y = draw(cv, aL, cx, y);
        if (tL != null) {
            y += gap;
            Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
            line.setColor((col[3] & 0x00FFFFFF) | 0xB3000000); line.setStrokeWidth(Math.max(2f, 2.5f * u));
            cv.drawLine(cx - 40 * u, y, cx + 40 * u, y, line);
            y += gap;
            y = draw(cv, tL, cx, y);
        }
        y += gap;
        draw(cv, rL, cx, y);

        TextPaint bp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        bp.setTypeface(Typeface.create(Typeface.SERIF, Typeface.ITALIC)); bp.setColor(0x99F5F2ED); bp.setTextSize(W * 0.034f);
        bp.setTextAlign(Paint.Align.CENTER);
        cv.drawText("Quran Maar", cx, H * 0.945f, bp);
        return bmp;
    }

    private static StaticLayout lay(CharSequence t, TextPaint p, int w, float mult, boolean rtl) {
        return StaticLayout.Builder.obtain(t, 0, t.length(), p, w)
                .setAlignment(Layout.Alignment.ALIGN_CENTER)
                .setLineSpacing(0f, mult)
                .setIncludePad(false)
                .setTextDirection(rtl ? TextDirectionHeuristics.RTL : TextDirectionHeuristics.FIRSTSTRONG_LTR)
                .build();
    }

    /** Draws the layout with its top at y, horizontally centred on cx; returns the y below it. */
    private static float draw(Canvas cv, StaticLayout l, float cx, float y) {
        cv.save();
        cv.translate(cx - l.getWidth() / 2f, y);
        l.draw(cv);
        cv.restore();
        return y + l.getHeight();
    }

    /* ---------------- backgrounds ---------------- */

    private static void stars(Canvas cv, Random rnd, int W, int H, float u, int n) {
        Paint s = new Paint(Paint.ANTI_ALIAS_FLAG);
        for (int i = 0; i < n; i++) {
            s.setColor(((int) ((.15f + rnd.nextFloat() * .6f) * 255) << 24) | 0x00F5F2ED);
            cv.drawCircle(rnd.nextFloat() * W, rnd.nextFloat() * H * .8f, (.8f + rnd.nextFloat() * 1.8f) * u, s);
        }
    }

    private static void crescent(Canvas cv, int W, int H, int accent) {
        float cx = W * .76f, cy = H * .13f, r = W * .075f;
        Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
        g.setShader(new RadialGradient(cx, cy, r * 3.2f, (accent & 0x00FFFFFF) | 0x55000000, 0x00000000, Shader.TileMode.CLAMP));
        cv.drawCircle(cx, cy, r * 3.2f, g);
        Path a = new Path(); a.addCircle(cx, cy, r, Path.Direction.CW);
        Path b = new Path(); b.addCircle(cx + r * .42f, cy - r * .12f, r * .86f, Path.Direction.CW);
        a.op(b, Path.Op.DIFFERENCE);
        Paint f = new Paint(Paint.ANTI_ALIAS_FLAG); f.setColor(accent);
        cv.drawPath(a, f);
    }

    private static void arch(Canvas cv, int W, int H, float u) {
        Paint s = new Paint(Paint.ANTI_ALIAS_FLAG);
        s.setStyle(Paint.Style.STROKE); s.setStrokeWidth(2.5f * u); s.setColor(0x24F5F2ED);
        float ax = W * .065f, ay = H * .05f, aw = W - 2 * ax, ah = H - 2 * ay, ar = aw / 2f;
        Path p = new Path();
        p.moveTo(ax, ay + ah); p.lineTo(ax, ay + ar);
        p.arcTo(new RectF(ax, ay, ax + aw, ay + aw), 180f, 180f, false);
        p.lineTo(ax + aw, ay + ah);
        cv.drawPath(p, s);
        Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
        g.setShader(new RadialGradient(W / 2f, H * .25f, W * .6f, 0x59CF3342, 0x00CF3342, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, W, H, g);
    }

    /** Tiled 8-point stars (two overlapping squares), the classic Islamic geometric pattern. */
    private static void lattice(Canvas cv, int W, int H, float u, int accent, int alpha) {
        Paint s = new Paint(Paint.ANTI_ALIAS_FLAG);
        s.setStyle(Paint.Style.STROKE); s.setStrokeWidth(2f * u); s.setColor((accent & 0x00FFFFFF) | (alpha << 24));
        float cell = W * .20f, r = cell * .46f;
        for (float cy = cell / 2f - cell; cy < H + cell; cy += cell) {
            for (float cx = cell / 2f - cell; cx < W + cell; cx += cell) {
                for (int k = 0; k < 2; k++) {
                    Path p = new Path();
                    for (int i = 0; i < 4; i++) {
                        double ang = Math.toRadians(90 * i + 45 * k + 45);
                        float x = cx + (float) Math.cos(ang) * r, y = cy + (float) Math.sin(ang) * r;
                        if (i == 0) p.moveTo(x, y); else p.lineTo(x, y);
                    }
                    p.close();
                    cv.drawPath(p, s);
                }
                cv.drawCircle(cx, cy, r * .28f, s);
            }
        }
        Paint v = new Paint(Paint.ANTI_ALIAS_FLAG);   /* fade the pattern toward the edges so it stays calm */
        v.setShader(new RadialGradient(W / 2f, H / 2f, H * .75f, 0x00000000, 0xB0000000, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, W, H, v);
    }

    private static void dunes(Canvas cv, int W, int H, Random rnd) {
        int[] c = {0xFF3A1D3F, 0xFF2A1430, 0xFF170B1D};
        for (int i = 0; i < 3; i++) {
            float base = H * (.74f + i * .08f);
            Path p = new Path(); p.moveTo(0, base);
            float x = 0;
            while (x < W) {
                float seg = W * (.35f + rnd.nextFloat() * .25f);
                p.quadTo(x + seg / 2f, base - H * (.03f + rnd.nextFloat() * .04f), x + seg, base + (rnd.nextFloat() - .5f) * H * .02f);
                x += seg;
            }
            p.lineTo(W + 50, H); p.lineTo(0, H); p.close();
            Paint f = new Paint(Paint.ANTI_ALIAS_FLAG); f.setColor(c[i]);
            cv.drawPath(p, f);
        }
    }

    private static void waves(Canvas cv, int W, int H, int accent) {
        for (int i = 0; i < 5; i++) {
            float base = H * (.66f + i * .065f), amp = H * (.012f + i * .003f), len = W * (.9f - i * .1f), ph = i * 1.3f;
            Path p = new Path(); p.moveTo(0, H);
            for (int x = 0; x <= W; x += 12) p.lineTo(x, base + (float) Math.sin(x / len * 6.2832 + ph) * amp);
            p.lineTo(W, H); p.close();
            Paint f = new Paint(Paint.ANTI_ALIAS_FLAG);
            f.setColor((accent & 0x00FFFFFF) | ((18 + i * 8) << 24));
            cv.drawPath(p, f);
        }
    }

    private static void skyline(Canvas cv, int W, int H) {
        Paint f = new Paint(Paint.ANTI_ALIAS_FLAG); f.setColor(0xFF090818);
        float g = H * .90f;   /* ground line */
        dome(cv, f, W * .50f, g, W * .30f, W * .20f);
        dome(cv, f, W * .27f, g, W * .15f, W * .10f);
        dome(cv, f, W * .73f, g, W * .15f, W * .10f);
        minaret(cv, f, W * .10f, g, W * .035f, H * .20f);
        minaret(cv, f, W * .90f, g, W * .035f, H * .20f);
        minaret(cv, f, W * .38f, g, W * .022f, H * .13f);
        minaret(cv, f, W * .62f, g, W * .022f, H * .13f);
        cv.drawRect(0, g - 2, W, H, f);
    }

    private static void dome(Canvas cv, Paint f, float cx, float g, float w, float h) {
        cv.drawRect(cx - w / 2f, g - h * .45f, cx + w / 2f, g, f);
        cv.drawArc(new RectF(cx - w / 2f, g - h * .45f - h * .55f, cx + w / 2f, g - h * .45f + h * .55f), 180f, 180f, true, f);
        cv.drawRect(cx - 2, g - h * 1.15f, cx + 2, g - h * .98f, f);
    }

    private static void minaret(Canvas cv, Paint f, float cx, float g, float hw, float h) {
        cv.drawRect(cx - hw, g - h, cx + hw, g, f);
        cv.drawRect(cx - hw * 1.5f, g - h, cx + hw * 1.5f, g - h + hw, f);
        Path t = new Path(); t.moveTo(cx - hw * 1.1f, g - h); t.lineTo(cx, g - h - hw * 4f); t.lineTo(cx + hw * 1.1f, g - h); t.close();
        cv.drawPath(t, f);
    }

    private static void aurora(Canvas cv, int W, int H) {
        int[] c = {0x6644E0A0, 0x558A5CF0, 0x4430C8E0};
        float[][] pos = {{.25f, .22f, .9f}, {.78f, .35f, .8f}, {.5f, .62f, 1f}};
        for (int i = 0; i < 3; i++) {
            Paint g = new Paint(Paint.ANTI_ALIAS_FLAG);
            float r = W * pos[i][2];
            g.setShader(new RadialGradient(W * pos[i][0], H * pos[i][1], r, c[i], c[i] & 0x00FFFFFF, Shader.TileMode.CLAMP));
            cv.drawRect(0, 0, W, H, g);
        }
    }
}
