package com.maar.quran;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Full-screen "call to prayer" screen. Android shows it over the lock screen (through the notification's full-screen
 * intent) when the adhan starts, so you see the prayer name and can stop the adhan without unlocking the phone.
 * It closes by itself when the adhan finishes. Its own code only, nothing from any other app.
 */
public class AdhanActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private long openedAt;
    private long stoppedSince = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            //noinspection deprecation
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        openedAt = System.currentTimeMillis();
        build(getIntent());
        handler.postDelayed(poll, 700);
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        openedAt = System.currentTimeMillis();
        stoppedSince = 0;
        build(i);
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private void build(Intent i) {
        String name = i.getStringExtra("name"), time = i.getStringExtra("time");
        if (name == null) name = "";
        if (time == null) time = "";

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(28), dp(72), dp(28), dp(48));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFF0B2F2A, 0xFF12423A, 0xFF0A1F24});
        root.setBackground(bg);

        TextView small = text("Time for prayer", 16, 0xFFBFE3D6, false);
        TextView big = text(name, 44, Color.WHITE, true);
        TextView clock = text(time.isEmpty() || "Test".equals(time) ? "" : time, 64, Color.WHITE, true);
        TextView sub = text("The adhan is playing", 16, 0xFFBFE3D6, false);
        sub.setPadding(0, dp(18), 0, 0);

        View spacer = new View(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(1, 0, 1f));

        Button stop = new Button(this);
        stop.setText("Stop adhan");
        stop.setAllCaps(false);
        stop.setTextSize(20);
        stop.setTextColor(Color.WHITE);
        stop.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable sb = new GradientDrawable();
        sb.setColor(0xFF1F9D6B);
        sb.setCornerRadius(dp(32));
        stop.setBackground(sb);
        stop.setOnClickListener(v -> { AdhanService.stopNow(); finish(); });
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        stop.setLayoutParams(sp);

        Button open = new Button(this);
        open.setText("Open Quran Maar");
        open.setAllCaps(false);
        open.setTextColor(0xFFBFE3D6);
        open.setBackgroundColor(Color.TRANSPARENT);
        open.setOnClickListener(v -> {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            finish();
        });

        root.addView(small);
        root.addView(big);
        root.addView(clock);
        root.addView(sub);
        root.addView(spacer);
        root.addView(stop);
        root.addView(open);
        setContentView(root);
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    /** Closes when the adhan is no longer playing (after a short grace period while the audio starts). */
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            long now = System.currentTimeMillis();
            if (AdhanService.playing) stoppedSince = 0;
            else if (now - openedAt > 6000) {
                if (stoppedSince == 0) stoppedSince = now;
                if (now - stoppedSince > 1500) { finish(); return; }
            }
            handler.postDelayed(this, 700);
        }
    };

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
