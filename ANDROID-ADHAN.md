# Adhan on Android (when the app is closed)

## What works today
`adhan.js` plays the adhan at each prayer time **while Quran Maar is open** (browser, installed PWA, or the current APK). Settings > Adhan has an on/off switch, per-prayer switches, volume, and notifications.

## Why it cannot ring when the app is closed
A web page cannot schedule sound on a phone. Android and iOS freeze websites in the background. The current APK is a wrapper around the website, so it has the same limit.

## How to make it ring when closed (needs a new APK)
Wrap the site in a native shell that can set alarms. `adhan.js` already detects Capacitor and hands it the next ~8 days of prayer times as scheduled notifications that use the adhan sound. **This native part is untested: it needs Android Studio, which was not available when it was written.**

1. `npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications`
2. `npx cap init "Quran Maar" com.maar.quran --web-dir=www`, copy the website files into `www/`, then `npx cap add android`
3. Copy `adhan/Adan1.mp3` to `android/app/src/main/res/raw/adan1.mp3` and `adhan/Adan2.mp3` to `android/app/src/main/res/raw/adan2.mp3` (Android requires lowercase names in `res/raw`)
4. In `android/app/src/main/AndroidManifest.xml` add the permissions `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM`
5. `npx cap sync android`, open `android/` in Android Studio, then Build > Generate Signed APK
6. Upload the APK to a GitHub release and point `ANDROID_APK_URL` in `app.js` at it

Things to check when you test it:
- Fajr uses the "Adhan (Fajr)" channel with `adan1.mp3`; the other prayers use the "Adhan" channel with `adan2.mp3`. Android fixes a channel's sound after it is created, so if you change the files later, change the channel ids too.
- On Android 12 and later, the user may need to allow "Alarms & reminders" for the app.
- The schedule uses the prayer times from the last time the app was opened. Open the app every week or so to refresh it.
- Battery saver can delay alarms on some phones. Ask users to set the app to "Unrestricted".
