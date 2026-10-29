# Shop Orders for Android

The Android app is a React Native client with native screens, Android system typography, a secure credential store, and native gallery image saving. The hosted Next.js service remains the backend. The app does not include database credentials or the web platform's registration/admin screens.

## Build a test APK

Install the repository's Node dependencies and configure Android Studio's SDK plus JDK 17 or newer. Then run from the repository root:

```sh
npm install
npm run android:apk
```

The self-contained `standalone` test APK is written to:

```text
android/app/build/outputs/apk/standalone/app-standalone.apk
```

This variant embeds the JavaScript bundle and disables Metro-dependent developer support, so it can run without a computer or Metro server. It uses the `.debug` application ID suffix and local debug signing for sideload testing only; it is not a Play Store release. A separately controlled release signing key is required before publishing and for signed updates. The normal development APK is `npm run android:apk:dev` and requires `npm run mobile:start` while the app is running.

The production service URL defaults to `https://orderit-ruddy.vercel.app/`. Override it without editing source:

```sh
cd android
./gradlew assembleStandalone -PshopAppUrl=https://your-production-host/
```

Or set `ORDERIT_SHOP_APP_URL` in the build environment. The app accepts HTTPS service addresses only.

## Shop login and backend

Native sign-in uses `POST /api/auth/mobile/login`, which accepts shop accounts only and returns an audience-scoped bearer session. The token is saved with Android's secure credential store; ordinary local product/order data is stored separately on the device. The mobile API route and bearer-session support must be deployed on the hosted service before this app version can sign in.

## Offline orders and upgrade import

A shop signs in and completes its first catalog and order-history sync while online. After that, the native app keeps the active catalog, synced history, and locally saved orders on the phone. Queued orders retain stable idempotency keys; the app reconciles a lost server acknowledgement from order history and does not silently remove products that later become inactive. Such drafts stay available for explicit review. Reconnect, app foreground, and the Sync button trigger a sync attempt.

On first launch after upgrading from the former WebView app, a temporary hidden WebView reads that app's same-origin IndexedDB once and imports the saved shop data to native storage. The visible app screens are React Native. Keep the old app data intact until the first import completes; do not clear app storage during that transition.

Local shop data is stored on the phone and is not encrypted by the app. Use a device lock and avoid shared/untrusted devices. Signing out clears the native session from the secure store but preserves locally queued orders; the same shop must sign in online again to access/sync its records.

## Native order images

Saved orders can be opened as full product-list previews without a network request. From a preview, the app exports every order item to numbered PNG pages, with at most 25 products per page and compact row spacing for WhatsApp sharing. Images are saved into `Pictures/Shop Orders`. Android 10 and newer use MediaStore; older supported versions request storage permission when needed.

## Validation and release readiness

Run the automated suite with `npm test` and the TypeScript check with `npx tsc --noEmit`. `npm run android:apk` verifies native compilation, standalone bundle packaging, and debug signing. A real Android acceptance pass is still required for install/upgrade import, login against the deployed mobile API, first sync, airplane-mode order creation, reconnect/idempotency, account switching, keyboard/back behavior, and gallery saving. The standalone APK is not a public release artifact.
