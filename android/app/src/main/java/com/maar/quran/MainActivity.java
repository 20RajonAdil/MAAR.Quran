package com.maar.quran;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdhanPlugin.class);   /* native adhan: alarms + background audio */
        super.onCreate(savedInstanceState);
    }
}
