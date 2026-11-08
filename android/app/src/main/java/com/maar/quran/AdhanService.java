package com.maar.quran;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.ServiceCompat;

/**
 * Plays the full adhan from the app's own bundled files in a foreground service,
 * so it keeps playing with the screen locked and the app closed. The notification
 * (with a Stop button) is required by Android for any foreground service.
 */
public class AdhanService extends Service {
    static final String ACTION_PLAY = "com.maar.quran.ADHAN_PLAY";
    static final String ACTION_STOP = "com.maar.quran.ADHAN_STOP";
    static final String ACTION_STATE = "com.maar.quran.ADHAN_STATE";

    static volatile boolean playing = false;
    static volatile String playingName = "";
    private static volatile AdhanService instance;

    private MediaPlayer mp;
    private AudioManager audio;
    private AudioFocusRequest focusReq;
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private String currentKey;
    private String currentName = "", currentTime = "";
    private boolean pausedByFocus = false;

    static Intent playIntent(Context c, String name, String time, String key) {
        return new Intent(c, AdhanService.class).setAction(ACTION_PLAY)
                .putExtra("name", name).putExtra("time", time).putExtra("key", key);
    }

    /** Stops the adhan if it is playing. Safe to call any time. */
    static void stopNow() {
        AdhanService s = instance;
        if (s != null) s.endPlayback();
    }

    @Override public void onCreate() { super.onCreate(); instance = this; }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) { endPlayback(); return START_NOT_STICKY; }

        String name = intent == null ? null : intent.getStringExtra("name");
        String time = intent == null ? "" : intent.getStringExtra("time");
        String key = intent == null ? null : intent.getStringExtra("key");
        if (name == null) { stopSelf(); return START_NOT_STICKY; }
        if (time == null) time = "";

        /* Android requires startForeground() very soon after the service starts. */
        android.app.Notification n = AdhanNotifications.playing(this, name, time);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        try {
            ServiceCompat.startForeground(this, AdhanNotifications.ID_PLAYING, n, type);
        } catch (Exception e) {
            AdhanNotifications.postReminder(this, name, time, key == null ? name : key);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (key != null && key.equals(currentKey) && mp != null) return START_NOT_STICKY;   /* same prayer already playing */
        begin(name, time, key);
        return START_NOT_STICKY;
    }

    private AssetFileDescriptor open(String name) throws java.io.IOException {
        String primary = "Fajr".equals(name) ? "Adan1.mp3" : "Adan2.mp3";
        String other = "Fajr".equals(name) ? "Adan2.mp3" : "Adan1.mp3";
        try { return getAssets().openFd("public/adhan/" + primary); }
        catch (java.io.IOException e) { return getAssets().openFd("public/adhan/" + other); }
    }

    private void begin(String name, String time, String key) {
        releasePlayer();
        currentKey = key; currentName = name; currentTime = time;
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        requestFocus();
        try {
            AssetFileDescriptor afd = open(name);
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            float v = AdhanScheduler.volume(this) / 100f;
            mp.setVolume(v, v);
            mp.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);   /* keeps the CPU awake while it plays */
            mp.setOnCompletionListener(m -> endPlayback());
            mp.setOnErrorListener((m, what, extra) -> { endPlayback(); return true; });
            mp.setOnPreparedListener(m -> { m.start(); publish(true); });
            mp.prepareAsync();
        } catch (Exception e) {
            AdhanNotifications.postReminder(this, name, time, key == null ? name : key);
            endPlayback();
        }
    }

    private void requestFocus() {
        if (audio == null) return;
        focusListener = change -> {
            if (mp == null) return;
            if (change == AudioManager.AUDIOFOCUS_LOSS) endPlayback();
            else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
                if (mp.isPlaying()) { mp.pause(); pausedByFocus = true; }
            } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedByFocus) { mp.start(); pausedByFocus = false; }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusReq = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setOnAudioFocusChangeListener(focusListener).build();
            audio.requestAudioFocus(focusReq);
        } else {
            //noinspection deprecation
            audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
    }

    private void abandonFocus() {
        if (audio == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) { if (focusReq != null) audio.abandonAudioFocusRequest(focusReq); }
        else if (focusListener != null) {
            //noinspection deprecation
            audio.abandonAudioFocus(focusListener);
        }
        focusReq = null; focusListener = null;
    }

    private void releasePlayer() {
        if (mp != null) {
            try { mp.stop(); } catch (Exception ignored) {}
            try { mp.release(); } catch (Exception ignored) {}
            mp = null;
        }
        pausedByFocus = false;
    }

    private void publish(boolean on) {
        playing = on;
        playingName = on ? currentName : "";
        sendBroadcast(new Intent(ACTION_STATE).setPackage(getPackageName())
                .putExtra("playing", on).putExtra("name", playingName));
    }

    void endPlayback() {
        releasePlayer();
        abandonFocus();
        currentKey = null;
        publish(false);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        releasePlayer();
        abandonFocus();
        if (playing) publish(false);
        instance = null;
        super.onDestroy();
    }
}
