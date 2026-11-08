# Building the Android app (APK) in the cloud

You do **not** need Android Studio or Java on your computer. GitHub builds the APK for you.

## Get the APK

1. Open the repository on GitHub, then the **Actions** tab.
2. Click **Build Android debug APK** (it also runs by itself when app-related files change on `main`).
3. To build on demand: **Run workflow** (top right), choose the branch, click the green button.
4. When the run turns green, open it and scroll to **Artifacts**. Download **Quran-MAAR-debug-apk** (a zip containing `Quran-MAAR-debug.apk`).
5. Unzip it, copy the APK to your phone, tap it, and allow "Install unknown apps" if Android asks.

It is a **debug** build, signed with a temporary debug key. It is for testing. Artifacts are kept for 30 days.
Because the key is regenerated on each CI run, installing a newer build over an older one can fail with a "signature conflict": uninstall the old one first.
The app id is `com.maar.quran`. If you have the older `Quran.MAAR.apk` from release v1.0 installed and it uses a different id, both can be installed side by side.

## How it works

- `package.json` / `package-lock.json` — Capacitor 8 (core, Android, CLI). Locked, installed with `npm ci`.
- `capacitor.config.json` — app id, name, `webDir: www`, `androidScheme: https`.
- `scripts/prepare-www.mjs` — copies the website into `www/` (generated, git-ignored). It leaves out what the app does not need
  (old `v1`–`v6` pages, the 3 big PDFs, the Vercel function, the dropped `assistant/` folder…). **Nothing in the repo is moved or deleted.** It stops with an error if a required file is missing.
- `android/` — the native Android project (committed), including the native adhan code in `android/app/src/main/java/com/maar/quran/`.
- `.github/workflows/android-apk.yml` — installs Node 22 + Java 21, runs `npm ci`, `prepare:www`, `cap sync android`, `./gradlew assembleDebug`, checks the APK contains the adhan audio, and uploads it.

**GitHub Pages is untouched.** There was no Pages workflow in the repo (it deploys straight from the branch), and this workflow neither deploys nor changes Pages.
No secrets, passwords or signing keys are used or stored. The workflow only has `contents: read`.

## After you change the website

The website files at the repo root stay the source of truth. Edit them as usual; the next APK build packs the latest copy.
To refresh the app's offline cache for installed copies, bump `SHELL_VERSION` in `sw.js` as before.

## What changes inside the app (and what does not)

- Same design, same offline PWA behaviour, same service worker.
- Qur'an text, hadith, prayer times, audio, maps and fonts use the same online APIs as the website. They work from the app's `https://localhost` origin.
- The **video feed** is a Vercel function that does not exist inside the app, so the app calls the hosted copy at `https://quranmaar.vercel.app/api/videos`
  (the same thing the GitHub Pages site already does). This needs a connection; the last good list is cached offline as before.
- Adhan: see `ANDROID-ADHAN.md`.

## Known limits of the Android WebView (not changed by this work)

- **Recite & Check** (browser speech recognition) is not available in Android WebView.
- Saving a video with the browser-style **Download to device** button is not supported in the WebView (the in-app *Save for offline* path is unaffected).
- A "Download for Android" button still appears on the Home page inside the app itself; it is harmless.

## Release (signed) builds — not set up on purpose

Publishing on Google Play or sharing a permanent update-able build needs a signing key. That key must live in **GitHub Secrets**, never in the repo.
Ask before adding it.
