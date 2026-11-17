# Daily Quran Wallpaper (Android)

A real Android **live wallpaper**. Android shows its own preview / "Set wallpaper" screen; the user confirms once; a new
ayah then appears every day with the app closed.

## Components

| File | Role |
|---|---|
| `MaarWallpaperService.java` | `WallpaperService` + `Engine`. Draws today's ayah. Re-checks the date when the wallpaper becomes visible, on date/time/time-zone changes, and at midnight while on screen. |
| `WallpaperStore.java` | Settings, day→ayah mapping (same list/maths as "Ayah of the day"), verse text, validated translation cache, `active()` = what Android says is the wallpaper. |
| `WallpaperRenderer.java` | Draws the image (8 themes, Amiri Quran Arabic, frame, translation, surah + ayah). Used by the engine, the Settings preview and the PNG download, so all three are identical. |
| `WallpaperScheduler.java` / `WallpaperWorker.java` | WorkManager: unique periodic job (~00:05 local), immediate catch-up job, network-constrained job for translation downloads. Unique names = no duplicates. |
| `WallpaperPlugin.java` | Capacitor bridge `DailyWallpaper`: `configure, status, enable, disable, refresh, getCurrent, download`. |
| `BootReceiver.java` | Re-arms jobs after reboot / app update / clock or time-zone change. |
| `wallpaper.js` | Onboarding prompt + Settings section. |
| `assets/wallpaper/verses.json` | Arabic + English copied from the project's own surah pages by `tools/build-wallpaper-verses.py`. Nothing is typed in. |

Manifest: `MaarWallpaperService` (`BIND_WALLPAPER`, `android.service.wallpaper`), `res/xml/maar_wallpaper.xml`,
`uses-feature android.software.live_wallpaper required=false`.

## Behaviour

* **Enable** → `ACTION_CHANGE_LIVE_WALLPAPER` (falls back to Android's live-wallpaper list). After it closes, the app asks
  `WallpaperManager` what is really set. Success is reported **only** if Android says Quran Maar is the wallpaper.
* **Disable** → cancels all jobs and freezes the shown verse. The wallpaper stays on the phone until the user picks another.
* **Re-enable** → if Quran Maar is no longer the wallpaper, Android's screen is opened again.
* **Offline** → English and Arabic need no internet at all. Other languages download the next 30 days of translations when
  online; until then English is shown (and labelled in the UI).
* **Home vs lock** → home is always verifiable. Lock is verifiable on Android 14+, or when Android has started the wallpaper
  for the lock screen. Otherwise the app says "not confirmed" and never claims it.
* **Timing** → within minutes after midnight when the phone is awake. If the job is delayed (Doze, battery saver, OEM limits),
  the engine still shows the correct ayah the next time the wallpaper is displayed. Exact midnight is not guaranteed.

## Limits

* Some OEMs (notably Samsung/Xiaomi/Huawei variants) restrict live wallpapers on the lock screen or run their own wallpaper changer.
* Live wallpapers use a little more battery than a static image (the engine only draws on change).
* Existing installs that used the old static-image version must confirm once on Android's screen (a one-time prompt appears).

## Build

Push to GitHub → Actions → **Build Android debug APK** (or run it on a branch with *Run workflow*). Download the
`Quran-MAAR-debug-apk` artifact. Locally: `npm ci && npm run sync:android && cd android && ./gradlew assembleDebug`.
Regenerate verses: `python3 tools/build-wallpaper-verses.py`.

## Real-device test checklist

1. Fresh install → welcome → after a few seconds the "Daily Quran Wallpaper" prompt appears with *Enable Daily Wallpaper* / *Maybe Later*.
2. *Maybe Later* → app works normally; Settings → Daily Quran Wallpaper still offers it.
3. *Enable* → Android's own preview opens → *Set wallpaper* (choose Home / Lock / Both) → back in the app, status says confirmed.
4. Check the home screen, then lock the phone and check the lock screen. Compare with what Settings reports.
5. Close the app (swipe away). Change the phone date forward one day (or wait for midnight) → turn the screen on → new ayah.
6. Reboot → wallpaper still shows; next day still changes.
7. Airplane mode: ayah still changes (English/Arabic). With another language: English until online.
8. Settings toggle off → date forward → wallpaper does **not** change. Toggle on → Android's screen reappears only if it is no longer the wallpaper.
9. *Download Wallpaper* → Photos › Quran Maar → PNG is the full wallpaper (background, Arabic, translation).
