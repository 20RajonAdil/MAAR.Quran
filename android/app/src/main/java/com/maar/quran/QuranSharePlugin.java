package com.maar.quran;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

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
import java.io.OutputStream;

/**
 * Real image saving and sharing for the "Ayah of the day" card.
 *  - saveImage:  writes the PNG straight into Photos / Pictures / Quran Maar. No share sheet, no other app is opened.
 *  - shareImage: opens Android's normal share sheet with the PNG attached.
 */
@CapacitorPlugin(
        name = "QuranShare",
        permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class QuranSharePlugin extends Plugin {

    private static String safeName(String n) {
        if (n == null || n.trim().isEmpty()) n = "quran-maar.png";
        n = n.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!n.toLowerCase().endsWith(".png")) n += ".png";
        return n;
    }

    @PluginMethod
    public void saveImage(PluginCall call) {
        /* Android 9 and older need the storage permission; Android 10+ does not. */
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageResult");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storageResult(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) doSave(call);
        else call.reject("Storage permission was not allowed, so the image could not be saved.");
    }

    private void doSave(PluginCall call) {
        String b64 = call.getString("base64");
        if (b64 == null || b64.isEmpty()) { call.reject("No image data"); return; }
        String name = safeName(call.getString("filename"));
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            Context c = getContext();
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
                    os.write(bytes);
                }
                v.clear();
                v.put(MediaStore.Images.Media.IS_PENDING, 0);
                r.update(uri, v, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Quran Maar");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not create the Quran Maar folder");
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                MediaScannerConnection.scanFile(c, new String[] { f.getAbsolutePath() }, new String[] { "image/png" }, null);
                uri = Uri.fromFile(f);
            }
            JSObject o = new JSObject();
            o.put("uri", uri.toString());
            o.put("folder", "Pictures/Quran Maar");
            call.resolve(o);
        } catch (Exception e) {
            call.reject("Could not save the image: " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareImage(PluginCall call) {
        String b64 = call.getString("base64");
        if (b64 == null || b64.isEmpty()) { call.reject("No image data"); return; }
        String name = safeName(call.getString("filename"));
        String text = call.getString("text");
        try {
            Context c = getContext();
            File dir = new File(c.getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Could not prepare the image");
            File f = new File(dir, name);
            try (FileOutputStream os = new FileOutputStream(f)) { os.write(Base64.decode(b64, Base64.DEFAULT)); }
            Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", f);

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.setClipData(ClipData.newRawUri("Ayah", uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Share ayah");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            getActivity().runOnUiThread(() -> {
                try { getActivity().startActivity(chooser); call.resolve(); }
                catch (Exception e) { call.reject("Could not open the share sheet: " + e.getMessage()); }
            });
        } catch (Exception e) {
            call.reject("Could not share the image: " + e.getMessage());
        }
    }
}
