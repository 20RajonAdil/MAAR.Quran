package com.maar.quran;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Same near-black as the website, so the strips behind the phone's bars match the app. */
    private static final int BAR_COLOR = Color.parseColor("#0B0B0B");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdhanPlugin.class);   /* native adhan: alarms + background audio */
        super.onCreate(savedInstanceState);

        /* Keep the website between the status bar and the navigation bar instead of drawing underneath them
           (newer Android versions draw apps edge-to-edge by default, which put the clock over the header
           and the gesture bar over the bottom menu). */
        Window w = getWindow();
        w.getDecorView().setBackgroundColor(BAR_COLOR);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
        c.setAppearanceLightStatusBars(false);       /* light icons on the dark strip */
        c.setAppearanceLightNavigationBars(false);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
