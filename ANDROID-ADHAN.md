# Adhan on Android (when the app is closed)

> **Status: implemented, NOT yet tested on a real phone.** The code builds in GitHub Actions, but nothing below
> counts as "working" until someone has run the checklist at the bottom on a real Android device and ticked it off.

## What is built

The website's `adhan.js` still does everything it did before on the web and the installed PWA. Inside the Android app
(built with Capacitor) it hands the schedule to a native plugin called **AdhanNative**
(`android/app/src/main/java/com/maar/quran/`):

| Piece | What it does |
| --- | --- |
| `AdhanScheduler` | Stores the schedule and sets one alarm per prayer with `AlarmManager.setAlarmClock` (the same type of alarm the phone's own Clock app uses; the most reliable kind on Android). Side effect: Android may show a small alarm icon in the status bar / next alarm on the lock screen. Falls back to an inexact alarm if exact alarms are not allowed. |
| `AdhanReceiver` | Runs at the alarm time even if the app is closed. Starts the audio service (or shows a plain notification if that prayer's sound is off). Each `date-Prayer` pair can fire **once**, so no duplicate adhan. |
| `AdhanService` | A **foreground service** (type `mediaPlayback`) that plays the full `Adan1.mp3` (Fajr) / `Adan2.mp3` (other prayers) straight from the files packaged inside the app on the **alarm** audio stream (so silent mode and a low media volume do not mute it). Keeps playing with the screen locked. Shows a notification with the prayer name and time and a **Stop adhan** button. |
| `BootReceiver` | Re-sets all alarms after a **restart**, an **app update**, and any **clock / time-zone / date change**. |
| `AdhanPlugin` | The Capacitor bridge: schedule, status, stop, notification permission, exact-alarm settings, battery-optimisation request. |

**First launch (inside the app):** a pop-up asks *"Allow notifications to hear the adhan?"*. Tapping **Allow** asks Android for notification
permission, switches the adhan on for all five prayers, schedules it, and then shows Android's own one-tap "let the app run in the background"
dialog (battery exemption). No other setup screens. If the user taps *Not now* the pop-up returns after 2 days.

**Settings > Adhan (inside the app)** has: the master on/off switch, **per-prayer adhan sound** switches, **per-prayer notification**
switches and volume. Nothing changes on the website.

**Screen layout:** the app is kept between the phone's status bar and navigation bar (it no longer draws underneath them).

**Stopping the adhan:** the **Stop adhan** button on the playing notification (works from the lock screen), or the **Stop** pill inside the app.

**Choosing a different adhan:** the project has two fixed recordings and, by design, visitors cannot upload or switch recordings, so there is no picker.

## How times, dates, time zones and DST are handled

- The app keeps the next ~14 days of prayer times (same source and method as the Home page: Aladhan, method 3) and gives the phone each
  prayer as a **wall-clock date + time**, e.g. `2026-11-08` + `05:41`. If it cannot fetch them it falls back to repeating the last known times for up to 8 days.
- Every time alarms are set, the phone converts those wall-clock times using **its current time zone**. So a daylight-saving change, a manual
  clock change, or a time-zone change simply triggers a re-set (`BootReceiver`) with the right result.
- If you **travel to a different place**, the prayer times themselves change. The app refreshes them the next time it is opened. Until then
  the alarms keep the old city's times.
- The schedule runs dry after ~14 days (or 8 if offline). **Open the app about every two weeks.**

## Permissions the app asks for, and why

| Permission | Why | Notes |
| --- | --- | --- |
| `POST_NOTIFICATIONS` | Prayer notifications and the playing notification | Android 13+ asks at run time. Without it the adhan can still play, but you may not see the notification or the Stop button. |
| `SCHEDULE_EXACT_ALARM` (Android 12 / 12L only) | Alarms at the exact minute | Normally on by default; the user can switch it off under *Alarms & reminders*. The app shows a warning and a button if it is off. Without it Android may delay alarms by minutes. |
| `USE_EXACT_ALARM` (Android 13+) | Same, but granted automatically | **Google Play only allows this for alarm / calendar apps.** Fine for sideloaded APKs. If you ever publish on Google Play, check this policy first. |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | Play audio with the app closed | |
| `WAKE_LOCK` | Keep the CPU awake while the adhan plays | |
| `RECEIVE_BOOT_COMPLETED` | Re-set alarms after a restart | |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Lets the app ask to be exempt from battery optimisation | Also restricted on Google Play. |
| `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` | Prayer times for where you are | The site also works from IP location or a typed city. |
| `VIBRATE` | Reminder notification vibration | |

## Things that can stop or delay the adhan (be honest with users)

1. **Force stop.** If the user uses *Settings > Apps > Quran Maar > Force stop*, Android cancels every alarm and blocks the app until it is opened again. This is Android behaviour and cannot be worked around.
2. **Swiping the app away from recent apps** is normally fine on stock Android and Pixel phones (alarms survive), but **some manufacturers (Xiaomi / MIUI-HyperOS, Huawei, Oppo / Realme / OnePlus ColorOS, Vivo, some Samsung battery modes) treat it like a force stop.** For those, set Battery to **Unrestricted** and turn on **Autostart** for the app.
3. **Battery saver / Doze.** Exact alarms are allowed through Doze, but aggressive vendor battery managers can still delay or cancel them.
4. **Exact alarm permission off** (Android 12 / 12L, or revoked): alarms become inexact and can be late.
5. **Alarm volume.** The adhan plays on the **alarm** stream, so it plays even in silent / vibrate mode, but it follows the *alarm* volume. If that is turned to zero it is silent. Do Not Disturb allows alarms by default, but a user's own DND rules can block them. (Because it ignores silent mode, users who do not want it somewhere, such as a mosque, should switch that prayer off in Settings.)
6. **Another app holding audio focus** (a call, for example): a call stops the adhan; the adhan does not resume afterwards.
7. **After a restart**, Android only lets the app run once the phone has been unlocked for the first time. A prayer that passes before the first unlock after a reboot is skipped (anything within 90 seconds is still played).
8. **Android 15+** blocks media-playback foreground services from starting from a *boot* broadcast, but not from an exact alarm, which is how this app starts it. If Android ever refuses the audio, the app falls back to a normal notification so the prayer is not missed silently.
9. **Prayer-time drift:** only the times fetched for the next ~2 weeks are scheduled. Open the app about every two weeks.

## How to test (nothing here has been done yet)

Use a real phone, install the APK (see `ANDROID-BUILD.md`), open the app, **Settings > Adhan**, turn it on, allow notifications. To avoid waiting for
a real prayer, use Chrome on a computer: connect the phone by USB with *USB debugging* on, open `chrome://inspect`, inspect the app's WebView, and run
`QMAdhan.nativeTest(2)` in the console. That schedules a Dhuhr adhan and notification two minutes ahead (there is deliberately no test button in the app).

| # | Test | Expected | Result |
| - | --- | --- | --- |
| 1 | App **open** on screen when the time arrives | Notification with name + time, full adhan plays, Stop works | ☐ |
| 2 | App in the **background** (Home pressed) | Same | ☐ |
| 3 | App **closed** (swiped from recents) | Same | ☐ |
| 4 | **Screen locked**, phone idle for a few minutes | Adhan plays in full, Stop button on the lock screen works | ☐ |
| 5 | Phone in **Doze** (screen off 30+ min, unplugged) | Plays on time | ☐ |
| 6 | **Restart** the phone, unlock it, wait for the next prayer | Plays (alarms were re-set) | ☐ |
| 7 | Change **time zone** / turn **auto time** off and on | Alarms move with the clock | ☐ |
| 8 | Switch one prayer's **adhan** off, **notification** on | Notification only, no sound | ☐ |
| 9 | Switch one prayer's **notification** off, **adhan** on | Sound plays; Android still shows the Stop notification while playing (required for foreground audio) | ☐ |
| 10 | Master switch off | Nothing fires, any playing adhan stops | ☐ |
| 11 | Same prayer must not fire twice (open and close the app around the time) | One adhan only | ☐ |
| 12 | Repeat 3 and 4 on Android 12, 13, 14 and 15, and on at least one Xiaomi / Samsung phone | Record what happens | ☐ |

---

## Previous notes (kept for reference — superseded by the above)

These were written before the native plugin existed. They described a Capacitor `local-notifications` approach that used the notification
sound for the adhan. That is **no longer used** because notification sounds are cut short and are not meant for a multi-minute recording; the
foreground-service player above replaces it. The old route is still in `adhan.js` as a fallback that only activates if a build has Capacitor
LocalNotifications and no `AdhanNative` plugin.

- Fajr used the "Adhan (Fajr)" channel with `adan1.mp3`; the other prayers used the "Adhan" channel with `adan2.mp3`.
- On Android 12 and later, the user may need to allow "Alarms & reminders" for the app.
- Battery saver can delay alarms on some phones. Ask users to set the app to "Unrestricted".
