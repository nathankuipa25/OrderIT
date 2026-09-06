PWA and TWA updates

I added the following changes for full PWA/TWA support and automated checks:

1) PNG placeholders
- public/icons/icon-192.png
- public/icons/icon-512.png

NOTE: These are tiny placeholder files. Replace them with real 192x192 and 512x512 maskable PNGs for proper installability.

2) next-pwa integration
- next.config.mjs updated to use next-pwa. You MUST install the dependency before building:

  npm install next-pwa

This will generate the Workbox precache into /public during production builds. Configuration disables PWA in non-production to avoid SW issues during development.

3) GitHub Actions Lighthouse check
- .github/workflows/lighthouse.yml runs on pushes and PRs to main. It:
  - installs deps
  - builds the app
  - starts the production server (npm run start)
  - runs Lighthouse against http://localhost:3000
  - uploads the HTML report as an artifact

Important notes & next steps
- Install next-pwa as noted above.
- Replace the PNG placeholders with actual app icons (192 & 512) and a maskable PNG for best Android support.
- Ensure your start script in package.json serves the production build on port 3000 (Next's default). Example package.json scripts:
  "build": "next build",
  "start": "next start -p 3000"

- On hosting platforms (Vercel) you may prefer to disable next-pwa and use a separate Workbox build — next-pwa works with Vercel but ensure you test.

If you want, I can:
- Commit optimized real PNG placeholders I can generate for you.
- Add an alternate Lighthouse workflow that runs against a deployed preview URL (requires deployment step).
- Add Bubblewrap config or sample Android project for TWA packaging.
