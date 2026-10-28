# Shop Orders Android app

This is a small native Android shell for the existing OrderIT shop experience. It opens the production HTTPS service in a full-screen WebView, with no browser address bar. It keeps navigation on the configured service host, rejects cleartext traffic, suppresses registration/admin-facing entry points in the app UI, and only accepts PNG files from the trusted app page for saving into the phone's `Pictures/Shop Orders` folder.

The Android app does not contain the Next.js server, database credentials, passwords, or session tokens. The live order service remains hosted at `https://orderit-ruddy.vercel.app/` by default. Initial login and the first catalog/history sync require internet. The existing service worker and shop-local offline workspace can support previously synced shop data and queued orders, subject to the app's normal offline limitations.

## Build a test APK

From the repository root, run:

```sh
cd android
./gradlew assembleDebug
```

The installable debug APK is created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

It is signed with the local Android debug key for sideload testing. It is not a Play Store release. A separately controlled release signing key is required for public distribution and for maintaining the same app-signature identity across updates.

The service URL can be overridden at build time without editing source:

```sh
./gradlew assembleDebug -PshopAppUrl=https://your-production-host/
```

Or set `ORDERIT_SHOP_APP_URL` in the build environment. Only HTTPS URLs are accepted at runtime.

## Shop privacy and platform boundary

The app hides the address bar, registration link, desktop/web navigation hints, share/PDF controls, and admin-account content during normal use. The service origin still has to be embedded as the app's backend destination. A technically curious person can discover it by inspecting the APK or device network traffic; this wrapper does not make the hosted service technically unidentifiable.

The app is portrait-oriented, supports Android 6.0/API 23 and newer, and uses the system media library to save order images. Android 9 and older may request storage permission on the first image save.

## Validation

Builds can verify compilation, APK packaging, manifest metadata, and debug signing. There is no Android emulator or physical device attached to this build environment, so install, login, live ordering, offline launch, and gallery behavior still need a real-device acceptance pass before shop rollout.

In the Android offline workspace, shops can also save a PNG preview of a reviewed draft or saved order. A preview created before synchronization is labelled as not yet submitted/pending sync; it is not an official order confirmation or server-assigned order number.
