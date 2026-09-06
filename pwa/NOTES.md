PWA notes and TWA instructions

Files added:
- public/manifest.webmanifest
- public/service-worker.js
- public/icons/icon-192.svg, icon-512.svg, maskable-icon.svg (placeholders)
- public/.well-known/assetlinks.json (placeholder for Android TWA)
- app/sw-register.tsx (client component that registers the SW)
- app/layout.tsx updated to include manifest links, meta tags, and SWRegister component

What to replace before production
1) Icons: replace the SVG placeholders in public/icons/ with correctly sized PNG (192x192, 512x512) and maskable PNG for better Android support.
2) assetlinks.json: replace package_name with your Android package (e.g. com.yourcompany.orderit) and set the SHA-256 fingerprint: open your signed Android apk/aab and extract the certificate fingerprint and paste into sha256_cert_fingerprints.

Trusted Web Activity (TWA)
- To publish to Play Store using TWA you need an Android wrapper app. Recommended tool: Bubblewrap (https://github.com/GoogleChromeLabs/bubblewrap).
- Typical steps:
  1. Build and host your PWA at a secure HTTPS origin.
  2. Create an Android project with bubblewrap init --manifest <url-to-manifest>
  3. Build with bubblewrap build — this produces an Android project you can sign and upload.
  4. After signing, obtain the SHA-256 cert fingerprint and put it into public/.well-known/assetlinks.json on the hosted origin.
  5. Test the assetlinks via: https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://your-site.com&relation=delegate_permission/common.handle_all_urls

Testing and verification
- Run Lighthouse (chrome://inspect -> Lighthouse) and ensure PWA checklist passes.
- Open site on Android Chrome -> Add to Home screen -> ensure it installs as standalone and launches like an app.

Service worker notes
- The provided service-worker.js is a lightweight, generic worker that precaches core files and provides runtime caching. For a production-grade Workbox setup, integrate Workbox into your Next.js build (e.g. using next-pwa or a custom Workbox build step) so you can generate a precache manifest automatically.

CI suggestion
- Add a Lighthouse CI check in GitHub Actions to ensure PWA score remains high.

If you want, I can:
- Convert these SVG placeholders into proper PNGs and add additional sizes.
- Integrate workbox generation into the Next.js build using next-pwa or a custom Workbox webpack plugin.
- Add a sample Android TWA project (bubblewrap config) or a README with exact bubblewrap commands.
