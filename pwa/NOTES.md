# OrderIT PWA notes

OrderIT uses a small custom module service worker; it does not use `next-pwa` or Workbox. Do not add `next-pwa` as a build prerequisite. The worker caches the public offline shell and versioned Next.js assets only. Private API responses and authenticated page HTML are network-only. The offline shop workspace is a static shell that reads its shop data from an account-partitioned IndexedDB database.

The install manifest starts at `/offline.html`. Regular and maskable Android icons are separate 192×192 and 512×512 PNG files, with a source SVG, 180×180 Apple touch icon, favicon PNGs/ICO, and responsive iPhone/iPad launch artwork. Android's installed-PWA splash is platform-generated from manifest metadata and icon assets; the iOS startup-image links may be ignored on some iOS versions.

Run `npm test` for the repository behavior tests. Offline-specific tests use an IndexedDB test double and an emulated service-worker fetch handler; they do not verify a browser installation, native launch screen, real background sync, or real-device behavior. Follow the real-device checklist in [PHASE6-OFFLINE.md](./PHASE6-OFFLINE.md) before describing those behaviors as verified.
