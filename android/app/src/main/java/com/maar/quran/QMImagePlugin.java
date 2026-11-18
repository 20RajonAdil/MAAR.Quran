package com.maar.quran;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * "Download any picture" for the app. One tap in the page calls download() and gets back a Gallery entry.
 *
 *  download({id, urls[] | assetPath | stageId, name, referer})  -> {uri, name, mime, bytes, folder}
 *  begin / append / commit    send bytes the page made itself (e.g. the Ayah card) in small pieces
 *  cancel({id}), view({uri,mime}), share({uri,mime,text}), ping()
 *
 * Progress is sent as the "progress" event {id, received, total}. Errors carry a code the page turns into a
 * friendly message: offline, timeout, network, http, not_found, not_image, storage, cancelled, duplicate, failed.
 */
@CapacitorPlugin(
        name = "QMImage",
        permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class QMImagePlugin extends Plugin {

    private static final String CHANNEL = "qm_image_downloads";

    private final ExecutorService pool = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<String, AtomicBoolean> jobs = new ConcurrentHashMap<>();
    private ImageDownloader dl;

    private ImageDownloader downloader() {
        if (dl == null) dl = new ImageDownloader(getContext());
        return dl;
    }

    @PluginMethod
    public void ping(PluginCall call) {
        JSObject o = new JSObject();
        o.put("version", 1);
        o.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(o);
    }

    // ------------------------------------------------------------------ download

    @PluginMethod
    public void download(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageResult");   // Android 9 and older only
            return;
        }
        start(call);
    }

    @PermissionCallback
    private void storageResult(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) start(call);
        else call.reject("Allow storage access so the picture can be saved to your Gallery.", "storage");
    }

    private void start(PluginCall call) {
        final String id = call.getString("id", "job-" + System.nanoTime());
        final AtomicBoolean cancel = new AtomicBoolean(false);
        if (jobs.putIfAbsent(id, cancel) != null) { call.reject("This picture is already downloading", "duplicate"); return; }

        final String name = call.getString("name");
        final String referer = call.getString("referer");
        final String assetPath = call.getString("assetPath");
        final String stageId = call.getString("stageId");
        final String mime = call.getString("mime");
        final List<String> urls = new ArrayList<>();
        JSArray arr = call.getArray("urls");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                try { String u = arr.getString(i); if (u != null && !u.isEmpty()) urls.add(u); } catch (Exception ignored) { }
            }
        }

        pool.execute(() -> {
            try {
                ImageDownloader.Progress p = (got, total) -> {
                    JSObject e = new JSObject();
                    e.put("id", id); e.put("received", got); e.put("total", total);
                    notifyListeners("progress", e);
                };
                ImageDownloader.Result r;
                if (stageId != null && !stageId.isEmpty()) {
                    File f = stageFile(stageId);
                    if (!f.exists()) throw new ImageDownloader.Failure("failed", "The picture was not received");
                    r = downloader().fromFile(f, name, mime);
                } else if (assetPath != null && !assetPath.isEmpty()) {
                    r = downloader().fromAsset(assetPath, name, p, cancel);
                } else {
                    r = downloader().fromUrls(urls, name, referer, p, cancel);
                }
                JSObject o = new JSObject();
                o.put("uri", r.uri.toString());
                o.put("name", r.name);
                o.put("mime", r.mime);
                o.put("bytes", r.bytes);
                o.put("folder", ImageDownloader.FOLDER);
                postDoneNotification(r);
                call.resolve(o);
            } catch (ImageDownloader.Failure f) {
                call.reject(f.getMessage(), f.code);
            } catch (Throwable t) {
                call.reject("The picture could not be saved: " + t.getMessage(), "failed");
            } finally {
                jobs.remove(id);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        AtomicBoolean c = jobs.get(call.getString("id", ""));
        if (c != null) c.set(true);
        call.resolve();
    }

    // ------------------------------------------------------------------ bytes made by the page, sent in small pieces

    private File stageFile(String id) {
        return new File(new File(getContext().getCacheDir(), "dl"), id.replaceAll("[^A-Za-z0-9-]", "") + ".stage");
    }

    @PluginMethod
    public void begin(PluginCall call) {
        try {
            File dir = new File(getContext().getCacheDir(), "dl");
            if (!dir.exists()) dir.mkdirs();
            String id = java.util.UUID.randomUUID().toString();
            if (!stageFile(id).createNewFile()) throw new Exception("Could not prepare the picture");
            JSObject o = new JSObject();
            o.put("id", id);
            call.resolve(o);
        } catch (Exception e) { call.reject("Could not prepare the picture: " + e.getMessage(), "failed"); }
    }

    @PluginMethod
    public void append(PluginCall call) {
        try {
            String chunk = call.getString("chunk");
            if (chunk == null) throw new Exception("No data");
            try (FileOutputStream os = new FileOutputStream(stageFile(call.getString("id", "")), true)) {
                os.write(Base64.decode(chunk, Base64.DEFAULT));
            }
            call.resolve();
        } catch (Exception e) { call.reject("Could not receive the picture: " + e.getMessage(), "failed"); }
    }

    /** Then call download({stageId, id, name, mime}) to file it. */

    // ------------------------------------------------------------------ view / share

    @PluginMethod
    public void view(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri", ""));
            String mime = call.getString("mime", "image/*");
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try { getActivity().startActivity(i); call.resolve(); }
                catch (Exception e) { call.reject("No app on this phone can open the picture", "failed"); }
            });
        } catch (Exception e) { call.reject("Could not open the picture", "failed"); }
    }

    @PluginMethod
    public void share(PluginCall call) {
        try {
            Uri uri = Uri.parse(call.getString("uri", ""));
            String mime = call.getString("mime", "image/*");
            String text = call.getString("text");
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.setClipData(ClipData.newRawUri("Picture", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Share picture");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try { getActivity().startActivity(chooser); call.resolve(); }
                catch (Exception e) { call.reject("Could not open the share sheet", "failed"); }
            });
        } catch (Exception e) { call.reject("Could not share the picture", "failed"); }
    }

    // ------------------------------------------------------------------ "Saved" notification (only if notifications are allowed)

    private void postDoneNotification(ImageDownloader.Result r) {
        try {
            Context c = getContext();
            if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Picture downloads", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Tells you when a picture has been saved to your Gallery");
                c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
            }
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(r.uri, r.mime);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent open = PendingIntent.getActivity(c, (int) (System.nanoTime() & 0x7fffffff), view, flags);
            NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                    .setSmallIcon(c.getApplicationInfo().icon)
                    .setContentTitle("Picture saved")
                    .setContentText(r.name + " \u2022 " + ImageDownloader.FOLDER)
                    .setContentIntent(open)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW);
            NotificationManagerCompat.from(c).notify((int) (System.nanoTime() & 0x7fffffff), b.build());
        } catch (SecurityException | IllegalArgumentException ignored) {
            /* the notification is a bonus; the picture is already saved */
        }
    }
}
