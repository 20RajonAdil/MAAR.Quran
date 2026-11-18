package com.maar.quran;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Runs on a real (emulated) Android device. A tiny web server on the phone itself plays the part of "the internet",
 * so every case is repeatable: good picture, wrong label, missing picture, not a picture, dropped connection...
 * After each save the picture is looked up in MediaStore (the Gallery's own database) and compared byte for byte.
 */
@RunWith(AndroidJUnit4.class)
public class ImageDownloaderTest {

    private Context ctx;
    private ImageDownloader dl;
    private MiniServer server;
    private final List<Uri> saved = new ArrayList<>();

    private byte[] png, jpeg;

    @Before
    public void setUp() throws Exception {
        ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            // Android 9 and older ask the user for storage access; the test grants it the same way a user would.
            try (java.io.InputStream sh = new android.os.ParcelFileDescriptor.AutoCloseInputStream(
                    InstrumentationRegistry.getInstrumentation().getUiAutomation()
                            .executeShellCommand("pm grant " + ctx.getPackageName() + " android.permission.WRITE_EXTERNAL_STORAGE"))) {
                readAll(sh);   // wait for the command to finish
            }
        }
        dl = new ImageDownloader(ctx);
        dl.backoffScale = 0;                       // no waiting between retries in tests
        png = makeImage(321, 179, Bitmap.CompressFormat.PNG, 100);
        jpeg = makeImage(400, 300, Bitmap.CompressFormat.JPEG, 90);
        server = new MiniServer();
        server.route("/a.png", Route.ok("image/png", png));
        server.route("/photo", Route.ok("image/png", jpeg));                       // a JPEG with a wrong label
        server.route("/page.html", Route.ok("text/html", "<html><body>nope</body></html>".getBytes(StandardCharsets.UTF_8)));
        server.start();
    }

    @After
    public void tearDown() {
        if (server != null) server.stop();
        ContentResolver r = ctx.getContentResolver();
        for (Uri u : saved) {
            try { r.delete(u, null, null); } catch (Exception ignored) { }
        }
    }

    // ---------------------------------------------------------------- the real thing

    @Test
    public void savesTheExactOriginalBytes_andItAppearsInTheGallery() throws Exception {
        ImageDownloader.Result r = keep(dl.fromUrls(Collections.singletonList(server.url("/a.png")), "my test", null, null, null));
        assertEquals("image/png", r.mime);
        assertTrue(r.name, r.name.startsWith("my test") && r.name.endsWith(".png"));
        assertArrayEquals("saved bytes must equal the served bytes (no re-compression)", png, readSaved(r));
        assertEquals(png.length, r.bytes);

        // original resolution preserved
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        byte[] back = readSaved(r);
        BitmapFactory.decodeByteArray(back, 0, back.length, o);
        assertEquals(321, o.outWidth);
        assertEquals(179, o.outHeight);

        assertInGallery(r);
    }

    @Test
    public void realFormatBeatsAWrongLabel_jpegStaysJpeg() throws Exception {
        ImageDownloader.Result r = keep(dl.fromUrls(Collections.singletonList(server.url("/photo")), "holiday.png", null, null, null));
        assertEquals("image/jpeg", r.mime);
        assertTrue(r.name, r.name.endsWith(".jpg"));
        assertArrayEquals(jpeg, readSaved(r));
        assertInGallery(r);
    }

    @Test
    public void triesTheNextAddress_whenTheBestQualityOneDoesNotExist() throws Exception {
        List<String> urls = Arrays.asList(server.url("/missing-maxres.jpg"), server.url("/a.png"));
        ImageDownloader.Result r = keep(dl.fromUrls(urls, "thumb", null, null, null));
        assertArrayEquals(png, readSaved(r));
    }

    @Test
    public void refusesSomethingThatIsNotAPicture_andSavesNothing() throws Exception {
        int before = galleryCount();
        try {
            dl.fromUrls(Collections.singletonList(server.url("/page.html")), "x", null, null, null);
            fail("expected a failure");
        } catch (ImageDownloader.Failure f) {
            assertEquals("not_image", f.code);
        }
        assertEquals("nothing may be added to the Gallery", before, galleryCount());
    }

    @Test
    public void reportsMissingPictures() throws Exception {
        try {
            dl.fromUrls(Collections.singletonList(server.url("/nope.jpg")), "x", null, null, null);
            fail("expected a failure");
        } catch (ImageDownloader.Failure f) {
            assertEquals("not_found", f.code);
        }
    }

    @Test
    public void resumesAfterTheConnectionDrops() throws Exception {
        final AtomicInteger hits = new AtomicInteger();
        final AtomicBoolean sawRange = new AtomicBoolean();
        server.route("/flaky.png", (req, out) -> {
            int n = hits.incrementAndGet();
            String range = req.header("range");
            if (range != null) sawRange.set(true);
            if (n == 1) {                                               // send half, then die
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nAccept-Ranges: bytes\r\nContent-Length: " + png.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                out.write(png, 0, png.length / 2);
                out.flush();
                return false;                                           // abrupt close
            }
            int from = range != null ? Integer.parseInt(range.replace("bytes=", "").replace("-", "").trim()) : 0;
            out.write(("HTTP/1.1 206 Partial Content\r\nContent-Type: image/png\r\nContent-Range: bytes " + from + "-" + (png.length - 1) + "/" + png.length + "\r\nContent-Length: " + (png.length - from) + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            out.write(png, from, png.length - from);
            return true;
        });
        ImageDownloader.Result r = keep(dl.fromUrls(Collections.singletonList(server.url("/flaky.png")), "flaky", null, null, null));
        assertArrayEquals(png, readSaved(r));
        assertTrue("the second request should ask only for the missing part", sawRange.get());
        assertTrue(hits.get() >= 2);
    }

    @Test
    public void restartsCleanly_whenTheServerIgnoresRange() throws Exception {
        final AtomicInteger hits = new AtomicInteger();
        server.route("/norange.png", (req, out) -> {
            if (hits.incrementAndGet() == 1) {
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: " + png.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                out.write(png, 0, png.length / 3);
                out.flush();
                return false;
            }
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: " + png.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
            out.write(png);
            return true;
        });
        ImageDownloader.Result r = keep(dl.fromUrls(Collections.singletonList(server.url("/norange.png")), "n", null, null, null));
        assertArrayEquals("no duplicated or missing bytes", png, readSaved(r));
    }

    @Test
    public void givesUpWithAClearCode_whenThereIsNoConnection() throws Exception {
        int dead;
        try (ServerSocket s = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) { dead = s.getLocalPort(); }
        int before = galleryCount();
        try {
            dl.fromUrls(Collections.singletonList("http://127.0.0.1:" + dead + "/a.png"), "x", null, null, null);
            fail("expected a failure");
        } catch (ImageDownloader.Failure f) {
            assertTrue(f.code, f.code.equals("network") || f.code.equals("offline") || f.code.equals("timeout"));
        }
        assertEquals(before, galleryCount());
    }

    @Test
    public void reportsProgressUpToTheEnd() throws Exception {
        final AtomicLong last = new AtomicLong(-1), total = new AtomicLong(-1);
        keep(dl.fromUrls(Collections.singletonList(server.url("/a.png")), "p", null, (got, t) -> { last.set(got); total.set(t); }, null));
        assertEquals(png.length, last.get());
        assertEquals(png.length, total.get());
    }

    @Test
    public void canBeCancelled() throws Exception {
        AtomicBoolean cancel = new AtomicBoolean(true);
        try {
            dl.fromUrls(Collections.singletonList(server.url("/a.png")), "c", null, null, cancel);
            fail("expected cancel");
        } catch (ImageDownloader.Failure f) {
            assertEquals("cancelled", f.code);
        }
    }

    @Test
    public void copiesAPictureBundledInsideTheApp_withoutChangingIt() throws Exception {
        String asset = "daily-ayah-img/sunset-arch.jpg";
        byte[] original;
        try (InputStream in = ctx.getAssets().open("public/" + asset)) { original = readAll(in); }
        catch (java.io.IOException missing) { assumeTrue("web files are not bundled in this build", false); return; }
        ImageDownloader.Result r = keep(dl.fromAsset(asset, "sunset", null, null));
        assertEquals("image/jpeg", r.mime);
        assertArrayEquals(original, readSaved(r));
    }

    @Test
    public void filesBytesThePageProduced() throws Exception {
        File f = dl.newWorkFile(".stage");
        try (OutputStream o = new FileOutputStream(f)) { o.write(png); }
        ImageDownloader.Result r = keep(dl.fromFile(f, "ayah-card", "image/png"));
        assertArrayEquals(png, readSaved(r));
        assertFalse("the temporary file must be cleaned up", f.exists());
    }

    @Test
    public void savingTheSameNameTwiceKeepsBothPictures() throws Exception {
        ImageDownloader.Result a = keep(dl.fromUrls(Collections.singletonList(server.url("/a.png")), "same", null, null, null));
        ImageDownloader.Result b = keep(dl.fromUrls(Collections.singletonList(server.url("/a.png")), "same", null, null, null));
        assertNotEquals(a.uri, b.uri);
        assertNotEquals(a.name, b.name);
        assertArrayEquals(png, readSaved(a));
        assertArrayEquals(png, readSaved(b));
    }

    // ---------------------------------------------------------------- helpers

    private ImageDownloader.Result keep(ImageDownloader.Result r) { saved.add(r.uri); return r; }

    private byte[] readSaved(ImageDownloader.Result r) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q || "media".equals(r.uri.getAuthority())) {
            try (InputStream in = ctx.getContentResolver().openInputStream(r.uri)) { return readAll(in); }
        }
        return readAll(new FileInputStream(legacyFile(r)));
    }

    @SuppressWarnings("deprecation")
    private File legacyFile(ImageDownloader.Result r) {
        return new File(new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ImageDownloader.ALBUM), r.name);
    }

    /** The Gallery reads MediaStore, so the picture has to be a normal, finished, visible row in the right folder. */
    private void assertInGallery(ImageDownloader.Result r) throws Exception {
        ContentResolver cr = ctx.getContentResolver();
        long id = ContentUris.parseId(r.uri);
        try (Cursor c = cr.query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[]{ MediaStore.Images.Media.DISPLAY_NAME, MediaStore.Images.Media.MIME_TYPE, MediaStore.Images.Media.SIZE },
                MediaStore.Images.Media._ID + "=?", new String[]{ String.valueOf(id) }, null)) {
            assertNotNull(c);
            assertTrue("the picture must be listed in the Gallery's image list", c.moveToFirst());
            assertEquals(r.name, c.getString(0));
            assertEquals(r.mime, c.getString(1));
            assertEquals(r.bytes, c.getLong(2));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try (Cursor c = cr.query(r.uri, new String[]{ MediaStore.Images.Media.RELATIVE_PATH, MediaStore.Images.Media.IS_PENDING }, null, null, null)) {
                assertTrue(c != null && c.moveToFirst());
                assertTrue(c.getString(0), c.getString(0).startsWith("Pictures/" + ImageDownloader.ALBUM));
                assertEquals("must not be left hidden as pending", 0, c.getInt(1));
            }
        }
    }

    private int galleryCount() {
        try (Cursor c = ctx.getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, new String[]{ MediaStore.Images.Media._ID },
                MediaStore.Images.Media.DISPLAY_NAME + " LIKE ?", new String[]{ "x%" }, null)) {
            return c == null ? 0 : c.getCount();
        }
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static byte[] makeImage(int w, int h, Bitmap.CompressFormat f, int q) {
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint();
        for (int y = 0; y < h; y += 4) {
            p.setColor(Color.rgb((y * 7) % 255, (y * 3) % 255, 200 - (y % 150)));
            c.drawRect(0, y, w, y + 4, p);
        }
        p.setColor(Color.WHITE);
        c.drawCircle(w / 2f, h / 2f, Math.min(w, h) / 3f, p);
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        b.compress(f, q, o);
        return o.toByteArray();
    }

    // ---------------------------------------------------------------- a very small web server

    interface Route { boolean handle(Req req, OutputStream out) throws Exception;   // false = close abruptly, leave things unfinished
        static Route ok(final String type, final byte[] body) {
            return (req, out) -> {
                out.write(("HTTP/1.1 200 OK\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                out.write(body);
                return true;
            };
        }
    }

    static final class Req {
        final String path; final java.util.Map<String, String> headers = new java.util.HashMap<>();
        Req(String path) { this.path = path; }
        String header(String n) { return headers.get(n.toLowerCase(java.util.Locale.ROOT)); }
    }

    static final class MiniServer {
        private ServerSocket socket;
        private volatile boolean running;
        private final java.util.concurrent.ConcurrentHashMap<String, Route> routes = new java.util.concurrent.ConcurrentHashMap<>();

        void route(String path, Route r) { routes.put(path, r); }
        String url(String path) { return "http://127.0.0.1:" + socket.getLocalPort() + path; }

        void start() throws Exception {
            socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
            running = true;
            Thread t = new Thread(() -> {
                while (running) {
                    try {
                        final Socket s = socket.accept();
                        new Thread(() -> serve(s)).start();
                    } catch (Exception e) { if (!running) return; }
                }
            });
            t.setDaemon(true);
            t.start();
        }

        void stop() { running = false; try { socket.close(); } catch (Exception ignored) { } }

        private void serve(Socket s) {
            try {
                s.setSoTimeout(5000);
                java.io.BufferedReader in = new java.io.BufferedReader(new java.io.InputStreamReader(s.getInputStream(), StandardCharsets.US_ASCII));
                String line = in.readLine();
                if (line == null) return;
                String path = line.split(" ")[1];
                Req req = new Req(path);
                String h;
                while ((h = in.readLine()) != null && !h.isEmpty()) {
                    int i = h.indexOf(':');
                    if (i > 0) req.headers.put(h.substring(0, i).trim().toLowerCase(java.util.Locale.ROOT), h.substring(i + 1).trim());
                }
                OutputStream out = s.getOutputStream();
                Route r = routes.get(path);
                if (r == null) {
                    out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                } else if (!r.handle(req, out)) {
                    out.flush();
                    s.setSoLinger(true, 0);                             // reset the connection, like a phone losing signal
                    s.close();
                    return;
                }
                out.flush();
                s.close();
            } catch (Exception ignored) {
                try { s.close(); } catch (Exception ignored2) { }
            }
        }
    }
}
