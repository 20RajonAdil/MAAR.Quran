package com.maar.quran;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class ImageFormatTest {

    private static byte[] pad(int... b) {
        byte[] out = new byte[32];
        for (int i = 0; i < b.length; i++) out[i] = (byte) b[i];
        return out;
    }

    @Test public void sniffsPng() { assertSame(ImageFormat.PNG, ImageFormat.sniff(pad(0x89, 'P', 'N', 'G', 13, 10, 26, 10), 32, null)); }
    @Test public void sniffsJpeg() { assertSame(ImageFormat.JPEG, ImageFormat.sniff(pad(0xFF, 0xD8, 0xFF, 0xE0), 32, null)); }
    @Test public void sniffsGif() { assertSame(ImageFormat.GIF, ImageFormat.sniff(pad('G', 'I', 'F', '8', '9', 'a'), 32, null)); }
    @Test public void sniffsWebp() { assertSame(ImageFormat.WEBP, ImageFormat.sniff(pad('R', 'I', 'F', 'F', 1, 2, 3, 4, 'W', 'E', 'B', 'P'), 32, null)); }
    @Test public void sniffsBmp() { assertSame(ImageFormat.BMP, ImageFormat.sniff(pad('B', 'M', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10), 32, null)); }
    @Test public void sniffsAvif() { assertSame(ImageFormat.AVIF, ImageFormat.sniff(pad(0, 0, 0, 24, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f'), 32, null)); }
    @Test public void sniffsHeic() { assertSame(ImageFormat.HEIC, ImageFormat.sniff(pad(0, 0, 0, 24, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c'), 32, null)); }

    @Test public void sniffsSvgText() {
        byte[] b = "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".getBytes();
        assertSame(ImageFormat.SVG, ImageFormat.sniff(b, b.length, "text/plain"));
    }

    @Test public void magicBytesBeatAWrongContentType() {
        // a server that labels a JPEG as PNG must not produce a ".png" that is really a JPEG
        assertSame(ImageFormat.JPEG, ImageFormat.sniff(pad(0xFF, 0xD8, 0xFF, 0xE1), 32, "image/png"));
    }

    @Test public void htmlIsNotAnImage() {
        byte[] b = "<!doctype html><html><body>Not found</body></html>".getBytes();
        assertNull(ImageFormat.sniff(b, b.length, "text/html"));
    }

    @Test public void fallsBackToContentTypeWhenBytesAreUnknown() {
        assertSame(ImageFormat.PNG, ImageFormat.sniff(new byte[4], 4, "image/png; charset=binary"));
        assertNull(ImageFormat.sniff(new byte[4], 4, "application/json"));
        assertNull(ImageFormat.sniff(null, 0, null));
    }

    @Test public void fileNameGetsTheRealExtension() {
        assertEquals("maxresdefault.jpg", ImageFormat.fileName("maxresdefault.jpg", "jpg", "x"));
        assertEquals("photo.png", ImageFormat.fileName("photo.jpeg", "png", "x"));
        assertEquals("My video.jpg", ImageFormat.fileName("My video", "jpg", "x"));
        assertEquals("archive.v2.jpg", ImageFormat.fileName("archive.v2", "jpg", "x"));
    }

    @Test public void fileNameIsSafe() {
        assertEquals("evil.jpg", ImageFormat.fileName("../../evil.jpg", "jpg", "x"));
        assertEquals("a_b_c.png", ImageFormat.fileName("a:b*c?.png", "png", "x"));
        assertEquals("fallback.png", ImageFormat.fileName("   ", "png", "fallback"));
        assertEquals("fallback.png", ImageFormat.fileName(null, "png", "fallback"));
        assertEquals("fallback.png", ImageFormat.fileName("...", "png", "fallback"));
        assertTrue(ImageFormat.fileName(new String(new char[300]).replace('\0', 'a'), "jpg", "x").length() <= 84);
    }

    @Test public void nameFromUrl() {
        assertEquals("sunset-arch.jpg", ImageFormat.nameFromUrl("https://example.com/a/b/sunset-arch.jpg?x=1#top"));
        assertEquals("my pic.png", ImageFormat.nameFromUrl("https://example.com/my%20pic.png"));
        assertEquals("", ImageFormat.nameFromUrl("https://example.com/"));
        assertEquals("", ImageFormat.nameFromUrl(null));
    }

    @Test public void uniqueNameCountsUp() {
        final Set<String> taken = new HashSet<>(Arrays.asList("a.jpg", "a (1).jpg"));
        assertEquals("a (2).jpg", ImageFormat.uniqueName("a.jpg", taken::contains));
        assertEquals("b.jpg", ImageFormat.uniqueName("b.jpg", taken::contains));
    }
}
