PWA notes and TWA instructions

Files added/updated:
- public/manifest.webmanifest (now includes PNG data-URI placeholders for 192 & 512 icons and retains SVG as fallback)
- app/components/InstallButton.tsx (in-page install CTA using beforeinstallprompt)
- app/layout.tsx updated to render InstallButton
- public/service-worker.js updated to include icons in precache

What I generated for you:
- Tiny PNG placeholders are embedded as data URIs in manifest.webmanifest (1x1 transparent PNG). Replace them with real PNG assets for best results.

Next steps (recommended)
1) Replace the data-URI placeholders in public/manifest.webmanifest with real PNG files hosted at /icons (192x192 and 512x512 maskable) and update the src values to point to the files.
2) Ensure your site is served over HTTPS and deployed (Vercel, Netlify, etc.).
3) Verify installability via Lighthouse and test on Android Chrome. When beforeinstallprompt fires, the Install button will appear.

If you want, I can now:
- Generate real PNG placeholders (192x192 and 512x512) and add them to public/icons as binary files (I can encode them here), or
- Integrate next-pwa for automated Workbox precaching.

Reply which follow-up you prefer.
