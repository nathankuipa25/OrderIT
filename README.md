# OrderIT

Mobile-first shop order generator. Shops register/log in, select products
from a fixed catalog, and generate a clean image (and optional PDF) of the
order — no quantities, no prices, no inventory tracking.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma · Postgres (Neon) · JWT auth (jose + bcryptjs)

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

- **Shop** — registers via `/register` with a shop name (this name becomes
  the header on every order they generate, e.g. "HenkTrust Chinakanaka"),
  can create orders and see only their own Orders/Home.
- **Admin** — logs in via `/login` with an account created explicitly by an
  operator, sees all shops'
  orders, and manages the shared product catalog. Admins don't create
  orders themselves.

The product seed does not create user accounts or contain administrator
credentials. To create the first administrator, run `npm run db:create-admin`
with `ADMIN_USERNAME`, `ADMIN_NAME` (optional), and `ADMIN_PASSWORD` set in
the shell. The password must be at least 12 characters. The command refuses
to overwrite an existing account. Do not put credentials in source control or
automation logs; run this step directly in the intended environment.

You'll also need a `JWT_SECRET` env var (any long random string —
`openssl rand -base64 32` works well) for signing session cookies. It
must be set both locally and in Vercel.

## Database

This project uses Postgres via Prisma (tested with [Neon](https://neon.tech)).
Set `DATABASE_URL` to your connection string, both locally (`.env`) and in
Vercel's Environment Variables.

**Before your first deploy actually works, someone needs to run `npx prisma db push`
against that `DATABASE_URL` once** — this creates the `User`, `Product`, `Order`, and
`OrderItem` tables. Vercel's build step does not do this automatically (it
only runs `prisma generate`). A GitHub Action (`.github/workflows/prisma-db-push.yml`)
handles this automatically on any push that changes `prisma/schema.prisma` —
it runs `prisma db push` followed by the product-only seed script, using a `DATABASE_URL`
repo secret (**Settings → Secrets and variables → Actions**). You can also
trigger it manually from the Actions tab.

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
