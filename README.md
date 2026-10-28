# OrderIT

Mobile-first shop order generator. Shops select products from a fixed catalog, submit orders without quantities/prices/inventory tracking, and save a clean order image. The hosted Next.js service remains the source of truth for catalog and order history.

## Native Android shop app

The Android app is a React Native client with shop-only sign-in, a shop-name-led interface, Android system typography and touch behavior, compact order cards, and a proper launcher icon. It saves orders locally before sync, retains idempotency keys, reconciles lost acknowledgements, and requires explicit review when a product is no longer active. Sync notices are short-lived toasts rather than persistent report panels. Order cards can be saved as PNG images to `Pictures/Shop Orders`.

The first shop sign-in and full catalog/history sync require internet. After that, synced shop data and queued orders are stored on the phone for offline use. The bearer token is stored using Android's secure credential store; shop data is stored locally and is not encrypted by the app. The first launch after upgrading the previous WebView app attempts a one-time, on-device import of its IndexedDB catalog, history, and queued orders.

Native sign-in requires the new backend route `POST /api/auth/mobile/login` and bearer-token support in the server session resolver. Those source changes are included in this branch and must be deployed to the hosted service before this app version can sign in. No deployment is performed by the local build.

Build a test APK and run checks from the repository root:

```bash
npm install
npm test
npx tsc --noEmit
npm run android:apk
```

The self-contained APK is at `android/app/build/outputs/apk/standalone/app-standalone.apk`. It embeds the React Native bundle and is signed with the local debug key for sideload testing; it is not a Play Store release. A separately controlled release signing key is required for publication and updates. Android SDK plus JDK 17 or newer is required. The native app keeps the existing Android API 23 minimum. Its 512×512 Play listing artwork is at `mobile/assets/shop-orders-play-icon-512.png`. More build and device-acceptance notes are in [android/README.md](android/README.md).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma · Postgres (Neon) · JWT auth (jose + bcryptjs) · React Native 0.75.5 Android client

## Local development

```bash
npm install
cp .env.example .env   # then paste your Neon connection string + a JWT_SECRET
npx prisma db push
npm run db:seed        # creates demo products only
# Create an administrator explicitly (use your own strong credentials):
ADMIN_USERNAME="your-admin" ADMIN_NAME="Your Name" ADMIN_PASSWORD="at-least-12-characters" npm run db:create-admin
npm run dev
```

Visit http://localhost:3000 — you'll be redirected to `/login`.

## Accounts

Two roles:

- **Shop** — registers via `/register` with a shop name (this name becomes the header on every order they generate, e.g. "HenkTrust Chinakanaka"), can create orders and see only their own Orders/Home.
- **Admin** — logs in via `/login` with an account created explicitly by an operator, sees all shops' orders, and manages the shared product catalog. Admins don't create orders themselves.

The product seed does not create user accounts or contain administrator credentials. To create the first administrator, run `npm run db:create-admin` with `ADMIN_USERNAME`, `ADMIN_NAME` (optional), and `ADMIN_PASSWORD` set in the shell. The password must be at least 12 characters. The command refuses to overwrite an existing account. Do not put credentials in source control or automation logs; run this step directly in the intended environment.

You'll also need a `JWT_SECRET` env var (any long random string — `openssl rand -base64 32` works well) for signing session cookies and native sessions. It must be set both locally and in Vercel.

## Database

This project uses Postgres via Prisma (tested with [Neon](https://neon.tech)). Set `DATABASE_URL` to your connection string, both locally (`.env`) and in Vercel's Environment Variables.

**The database schema must be updated before the deployed app can use new auth features.** Vercel's build step only runs `prisma generate`; it does not change the database. The GitHub Action (`.github/workflows/prisma-db-push.yml`) applies the approved additive SQL migrations and then runs `prisma db push` when schema or migration files are pushed to `main` (or when manually dispatched), using the `DATABASE_URL` repository secret. The new `MobileSession` table is required for native token login and per-device revocation: until that schema update has run against the live database, the updated native login and protected API requests will fail closed, and secure sign-out cannot be confirmed.

To run it yourself instead:

```bash
DATABASE_URL="your-neon-connection-string" npx prisma db push
DATABASE_URL="your-neon-connection-string" npm run db:seed
```

## Deploying to Vercel

```bash
# 1. Push this repo to GitHub (already done if you're reading this from there)
# 2. Go to vercel.com/new, import the GitHub repo
# 3. Add DATABASE_URL and JWT_SECRET as environment variables
# 4. Make sure the database has been pushed + seeded, then create an admin
# 5. Deploy
```

Build command: `npm run build` (already wired to run `prisma generate` first).

## Admin product/order reset

Administrators can use **Reset** in the admin navigation (`/admin/reset`) to clear the shared product catalog and order history. The reset deletes `Product` and `Order` rows only; an order's `OrderItem` rows are removed by the existing cascade. All shop accounts, admin accounts, and `User` rows are preserved.

Before reset, the page generates and downloads a JSON snapshot of the current products and orders. The reset requires the administrator to confirm that the file was saved and type `RESET PRODUCTS AND ORDERS`. The server accepts only a short-lived authorization tied to the same snapshot; if products or orders changed after backup, it refuses the reset and requires a new backup. The deletes run in one transaction while the affected tables are locked.

In production this feature is disabled unless `ORDERIT_RESET_ENABLED=true` is explicitly set. Keep it unset or false by default; if an approved production reset window requires enabling it, remove the setting or set it back to false immediately afterwards. `JWT_SECRET` is required to sign the backup authorization. Run `npm test` for the reset behavior tests; they use in-memory fakes and do not connect to a database.
