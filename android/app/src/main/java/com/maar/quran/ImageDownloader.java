package com.maar.quran;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Gets a picture's ORIGINAL bytes (from the internet, from the app's bundled files, or from bytes the page
 * already produced), checks it really is an image, and files it in Pictures/Quran Maar through MediaStore so
 * it shows up in Gallery / Google Photos.
 *
 * Nothing here decodes or re-encodes the picture: what comes in is exactly what is saved.
 * No Capacitor classes are used, so it can be tested on its own.
 */
final class ImageDownloader {

    static final String ALBUM = "Quran Maar";
    static final String FOLDER = "Pictures/" + ALBUM;

    interface Progress { void onProgress(long received, long total); }

    static final class Result {
        Uri uri; String name; String mime; long bytes; String source;
    }

    /** code: offline | timeout | network | http | not_found | not_image | storage | cancelled | failed */
    static final class Failure extends Exception {
        final String code;
        Failure(String code, String message) { super(message); this.code = code; }
        Failure(String code, String message, Throwable cause) { super(message, cause); this.code = code; }
    }

    private static final int CONNECT_MS = 15000, READ_MS = 20000, ATTEMPTS = 4;
    private static final long[] BACKOFF_MS = { 600, 1500, 3000 };

    private final Context ctx;
    /** Tests use a tiny back-off so a retry does not make the test slow. */
    long backoffScale = 1;

    ImageDownloader(Context c) { this.ctx = c.getApplicationContext(); }

    private File workDir() {
        File d = new File(ctx.getCacheDir(), "dl");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    File newWorkFile(String suffix) { return new File(workDir(), UUID.randomUUID().toString() + suffix); }

    // ------------------------------------------------------------------ sources

    /** Tries each address in order (best quality first); the first one that is a real image wins. */
    Result fromUrls(List<String> urls, String wantedName, String referer, Progress p, AtomicBoolean cancel) throws Failure {
        if (urls == null || urls.isEmpty()) throw new Failure("failed", "No picture address was given");
        Failure last = null;
        for (String u : urls) {
            File part = newWorkFile(".part");
            try {
                String[] headerMime = new String[1];
                fetch(u, part, referer, headerMime, p, cancel);
                String name = wantedName != null && !wantedName.trim().isEmpty() ? wantedName : ImageFormat.nameFromUrl(u);
                return finish(part, name, headerMime[0], u);
            } catch (Failure f) {
                last = f;
                part.delete();
                boolean tryNext = f.code.equals("http") || f.code.equals("not_found") || f.code.equals("not_image");
                if (!tryNext) throw f;
            } finally {
                part.delete();
            }
        }
        throw last != null ? last : new Failure("failed", "The picture could not be downloaded");
    }

    /** A picture bundled inside the app (the website files live in assets/public). */
    Result fromAsset(String path, String wantedName, Progress p, AtomicBoolean cancel) throws Failure {
        if (path == null || path.contains("..")) throw new Failure("not_found", "That picture is not part of the app");
        String clean = path.startsWith("/") ? path.substring(1) : path;
        int q = clean.indexOf('?'); if (q >= 0) clean = clean.substring(0, q);
        File part = newWorkFile(".part");
        try (InputStream in = ctx.getAssets().open("public/" + clean)) {
            long total = -1;
            try { total = in.available(); } catch (IOException ignored) { }
            copy(in, part, total, p, cancel);
            String name = wantedName != null && !wantedName.trim().isEmpty() ? wantedName : ImageFormat.nameFromUrl(clean);
            return finish(part, name, null, "asset:" + clean);
        } catch (java.io.FileNotFoundException e) {
            throw new Failure("not_found", "That picture is not part of the app", e);
        } catch (IOException e) {
            throw mapIo(e);
        } finally {
            part.delete();
        }
    }

    /** Bytes the page produced itself (for example the Ayah-of-the-day card) and staged in the cache. */
    Result fromFile(File staged, String wantedName, String hintMime) throws Failure {
        try { return finish(staged, wantedName, hintMime, "file"); }
        finally { staged.delete(); }
    }

    // ------------------------------------------------------------------ network

    private void fetch(String url, File part, String referer, String[] headerMimeOut, Progress p, AtomicBoolean cancel) throws Failure {
        long have = 0;
        int attempt = 0;
        long lastTick = 0;
        while (true) {
            if (cancel != null && cancel.get()) throw new Failure("cancelled", "Download cancelled");
            HttpURLConnection c = null;
            try {
                URL u = new URL(url);
                String proto = u.getProtocol();
                if (!"https".equals(proto) && !"http".equals(proto)) throw new Failure("failed", "Unsupported address");
                c = (HttpURLConnection) u.openConnection();
                c.setConnectTimeout(CONNECT_MS);
                c.setReadTimeout(READ_MS);
                c.setInstanceFollowRedirects(true);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) QuranMaar/1.0");
                c.setRequestProperty("Accept", "image/*,*/*;q=0.8");
                c.setRequestProperty("Accept-Encoding", "identity");   // exact bytes, no transparent re-compression
                if (referer != null && !referer.isEmpty()) c.setRequestProperty("Referer", referer);
                if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");

                int code = c.getResponseCode();
                if (code == 404 || code == 410) throw new Failure("not_found", "That picture could not be found online");
                if (code == 416 && have > 0) return;                       // already complete
                if (code != 200 && code != 206) throw new Failure("http", "The server answered " + code);
                String ctype = c.getContentType();
                headerMimeOut[0] = ctype;
                if (have == 0 && ctype != null) {
                    String lt = ctype.toLowerCase(Locale.ROOT);
                    if (!lt.startsWith("image/") && !lt.startsWith("application/octet-stream") && !lt.startsWith("binary/")) {
                        throw new Failure("not_image", "That address is not a picture");
                    }
                }
                boolean resumed = code == 206 && have > 0;
                if (!resumed) have = 0;                                     // server ignored Range: start over
                long len = c.getContentLengthLong();
                long total = len > 0 ? len + (resumed ? have : 0) : -1;

                long written = have;
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part, resumed)) {
                    byte[] buf = new byte[32768];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        if (cancel != null && cancel.get()) throw new Failure("cancelled", "Download cancelled");
                        out.write(buf, 0, n);
                        written += n;
                        long now = System.nanoTime();
                        if (p != null && now - lastTick > 80_000_000L) { lastTick = now; p.onProgress(written, total); }
                    }
                }
                if (total > 0 && written != total) throw new IOException("The connection dropped (" + written + " of " + total + " bytes)");
                if (p != null) p.onProgress(written, total > 0 ? total : written);
                return;
            } catch (Failure f) {
                throw f;
            } catch (IOException e) {
                if (isNoSpace(e)) throw new Failure("storage", "There is not enough free space on the phone", e);
                attempt++;
                if (attempt >= ATTEMPTS) throw mapIo(e);
                have = part.exists() ? part.length() : 0;
                try { Thread.sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] * backoffScale); }
                catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw new Failure("cancelled", "Download cancelled"); }
            } finally {
                if (c != null) c.disconnect();
            }
        }
    }

    private void copy(InputStream in, File part, long total, Progress p, AtomicBoolean cancel) throws IOException, Failure {
        long written = 0, lastTick = 0;
        try (OutputStream out = new FileOutputStream(part)) {
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (cancel != null && cancel.get()) throw new Failure("cancelled", "Download cancelled");
                out.write(buf, 0, n);
                written += n;
                long now = System.nanoTime();
                if (p != null && now - lastTick > 80_000_000L) { lastTick = now; p.onProgress(written, total); }
            }
        }
        if (p != null) p.onProgress(written, written);
    }

    private static boolean isNoSpace(IOException e) {
        String m = String.valueOf(e.getMessage()).toLowerCase(Locale.ROOT);
        return m.contains("enospc") || m.contains("no space left");
    }

    private static Failure mapIo(IOException e) {
        if (e instanceof UnknownHostException) return new Failure("offline", "No internet connection", e);
        if (e instanceof SocketTimeoutException) return new Failure("timeout", "The connection timed out", e);
        if (isNoSpace(e)) return new Failure("storage", "There is not enough free space on the phone", e);
        return new Failure("network", "The connection was interrupted", e);
    }

    // ------------------------------------------------------------------ saving

    private Result finish(File bytes, String wantedName, String headerMime, String source) throws Failure {
        if (!bytes.exists() || bytes.length() == 0) throw new Failure("not_image", "The picture was empty");
        byte[] head = new byte[512];
        int n;
        try (FileInputStream in = new FileInputStream(bytes)) { n = Math.max(0, in.read(head)); }
        catch (IOException e) { throw mapIo(e); }
        ImageFormat fmt = ImageFormat.sniff(head, n, headerMime);
        if (fmt == null) throw new Failure("not_image", "That file is not a picture");
        String stamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        String name = ImageFormat.fileName(wantedName, fmt.ext, "quran-maar-" + stamp);
        try {
            Result r = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? saveModern(bytes, name, fmt.mime) : saveLegacy(bytes, name, fmt.mime);
            r.source = source;
            r.bytes = bytes.length();
            r.mime = fmt.mime;
            return r;
        } catch (IOException e) {
            if (isNoSpace(e)) throw new Failure("storage", "There is not enough free space on the phone", e);
            throw new Failure("storage", "Android would not let the picture be saved: " + e.getMessage(), e);
        }
    }

    /** Android 10+: MediaStore, no permission needed. The picture is hidden until fully written (IS_PENDING). */
    private Result saveModern(File src, String name, String mime) throws IOException {
        ContentResolver r = ctx.getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        v.put(MediaStore.Images.Media.MIME_TYPE, mime);
        v.put(MediaStore.Images.Media.RELATIVE_PATH, FOLDER);
        v.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new IOException("MediaStore refused to create the file");
        try {
            try (InputStream in = new FileInputStream(src); OutputStream out = r.openOutputStream(uri)) {
                if (out == null) throw new IOException("Could not open the new file");
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.Images.Media.IS_PENDING, 0);
            r.update(uri, done, null, null);
        } catch (IOException | RuntimeException e) {
            try { r.delete(uri, null, null); } catch (Exception ignored) { }
            if (e instanceof IOException) throw (IOException) e;
            throw new IOException(e.getMessage(), e);
        }
        String finalName = name;
        try (Cursor c = r.query(uri, new String[]{ MediaStore.Images.Media.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) finalName = c.getString(0);
        } catch (Exception ignored) { }
        Result res = new Result();
        res.uri = uri;
        res.name = finalName;
        return res;
    }

    /** Android 9 and older: a file in Pictures/Quran Maar (needs the storage permission) that is then scanned into the Gallery. */
    @SuppressWarnings("deprecation")
    private Result saveLegacy(File src, String name, String mime) throws IOException {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ALBUM);
        if (!dir.exists() && !dir.mkdirs() && !dir.exists()) throw new IOException("Could not create the " + ALBUM + " folder");
        final File dir0 = dir;
        String unique = ImageFormat.uniqueName(name, n -> new File(dir0, n).exists());
        File dest = new File(dir, unique);
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } catch (IOException e) {
            dest.delete();
            throw e;
        }
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<Uri> scanned = new AtomicReference<>();
        MediaScannerConnection.scanFile(ctx, new String[]{ dest.getAbsolutePath() }, new String[]{ mime }, (path, uri) -> { scanned.set(uri); latch.countDown(); });
        try { latch.await(4, TimeUnit.SECONDS); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
        Uri uri = scanned.get();
        if (uri == null) uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", dest);
        Result res = new Result();
        res.uri = uri;
        res.name = unique;
        return res;
    }
}
