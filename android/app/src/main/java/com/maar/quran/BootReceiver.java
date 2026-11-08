package com.maar.quran;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.TimeZone;

/**
 * Puts the alarms back after anything that clears or invalidates them:
 * phone restart, app update, clock/time-zone/date change, or the exact-alarm
 * permission being granted or revoked.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (a == null) return;
        if (Intent.ACTION_TIMEZONE_CHANGED.equals(a)) TimeZone.setDefault(null);   /* re-read the phone's zone */
        AdhanScheduler.rescheduleAll(c);
    }
}
