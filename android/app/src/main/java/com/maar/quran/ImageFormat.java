package com.maar.quran;

import java.net.URLDecoder;
import java.util.Locale;

/**
 * Pure-Java helpers (no Android classes, so they can be unit-tested on a normal JVM).
 * The picture's REAL format is read from its first bytes, so the saved file always has the right
 * extension and MIME type and the bytes are never re-encoded.
 */
final class ImageFormat {
    final String ext;
    final String mime;

    private ImageFormat(String ext, String mime) { this.ext = ext; this.mime = mime; }

    static final ImageFormat JPEG = new ImageFormat("jpg", "image/jpeg");
    static final ImageFormat PNG = new ImageFormat("png", "image/png");
    static final ImageFormat GIF = new ImageFormat("gif", "image/gif");
    static final ImageFormat WEBP = new ImageFormat("webp", "image/webp");
    static final ImageFormat BMP = new ImageFormat("bmp", "image/bmp");
    static final ImageFormat AVIF = new ImageFormat("avif", "image/avif");
    static final ImageFormat HEIC = new ImageFormat("heic", "image/heic");
    static final ImageFormat SVG = new ImageFormat("svg", "image/svg+xml");
    static final ImageFormat ICO = new ImageFormat("ico", "image/x-icon");

    /** Recognises the format from the first bytes. Falls back to the server's Content-Type. Null = not an image. */
    static ImageFormat sniff(byte[] h, int n, String headerMime) {
        if (h != null && n >= 12) {
            if ((h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return PNG;
            if ((h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) return JPEG;
            if (h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') return GIF;
            if (h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F' && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return WEBP;
            if (h[0] == 'B' && h[1] == 'M') return BMP;
            if (h[0] == 0 && h[1] == 0 && h[2] == 1 && h[3] == 0) return ICO;
            if (h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p') {
                String brand = new String(h, 8, 4).toLowerCase(Locale.ROOT);
                if (brand.equals("avif") || brand.equals("avis")) return AVIF;
                if (brand.startsWith("hei") || brand.equals("mif1") || brand.equals("msf1")) return HEIC;
            }
        }
        if (h != null && n > 0) {
            String head = new String(h, 0, Math.min(n, 512)).toLowerCase(Locale.ROOT);
            if (head.contains("<svg")) return SVG;
        }
        return fromMime(headerMime);
    }

    static ImageFormat fromMime(String mime) {
        if (mime == null) return null;
        String m = mime.toLowerCase(Locale.ROOT).trim();
        int semi = m.indexOf(';');
        if (semi >= 0) m = m.substring(0, semi).trim();
        switch (m) {
            case "image/jpeg": case "image/jpg": case "image/pjpeg": return JPEG;
            case "image/png": return PNG;
            case "image/gif": return GIF;
            case "image/webp": return WEBP;
            case "image/bmp": return BMP;
            case "image/avif": return AVIF;
            case "image/heic": case "image/heif": return HEIC;
            case "image/svg+xml": return SVG;
            case "image/x-icon": case "image/vnd.microsoft.icon": return ICO;
            default: return null;
        }
    }

    private static boolean isImageExt(String e) {
        switch (e) {
            case "jpg": case "jpeg": case "jfif": case "png": case "gif": case "webp": case "bmp": case "avif": case "heic": case "heif": case "svg": case "ico": return true;
            default: return false;
        }
    }

    /** A safe file name that ends with the real extension. */
    static String fileName(String wanted, String ext, String fallbackBase) {
        String n = wanted == null ? "" : wanted;
        int slash = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\'));
        if (slash >= 0) n = n.substring(slash + 1);
        int q = n.indexOf('?');
        if (q >= 0) n = n.substring(0, q);
        n = n.replaceAll("[\\p{Cntrl}]", " ").trim();
        int dot = n.lastIndexOf('.');
        if (dot > 0 && isImageExt(n.substring(dot + 1).toLowerCase(Locale.ROOT))) n = n.substring(0, dot);
        n = n.replaceAll("[\\\\/:*?\"<>|]", "_").replaceAll("\\s+", " ").trim();
        while (n.startsWith(".")) n = n.substring(1);
        if (n.length() > 80) n = n.substring(0, 80).trim();
        if (n.isEmpty()) n = fallbackBase;
        return n + "." + ext;
    }

    /** Last path piece of a URL, decoded, or "" when there is none. */
    static String nameFromUrl(String url) {
        if (url == null) return "";
        String p = url;
        int h = p.indexOf('#'); if (h >= 0) p = p.substring(0, h);
        int q = p.indexOf('?'); if (q >= 0) p = p.substring(0, q);
        int s = p.lastIndexOf('/');
        if (s >= 0) p = p.substring(s + 1);
        try { p = URLDecoder.decode(p, "UTF-8"); } catch (Exception ignored) { }
        return p;
    }

    /** Adds " (1)", " (2)" ... to a name until the test says it is free. */
    interface Exists { boolean test(String name); }

    static String uniqueName(String name, Exists exists) {
        if (!exists.test(name)) return name;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            String c = base + " (" + i + ")" + ext;
            if (!exists.test(c)) return c;
        }
        return base + " (" + System.currentTimeMillis() + ")" + ext;
    }
}
