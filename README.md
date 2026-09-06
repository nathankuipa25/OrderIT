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
npm run db:seed        # creates demo products + default admin (see below)
npm run dev
```

Visit http://localhost:3000 — you'll be redirected to `/login`.

## Accounts

Two roles:

- **Shop** — registers via `/register` with a shop name (this name becomes
  the header on every order they generate, e.g. "HenkTrust Chinakanaka"),
  can create orders and see only their own Orders/Home.
- **Admin** — logs in via `/login` with a seeded account, sees all shops'
  orders, and manages the shared product catalog. Admins don't create
  orders themselves.

**Default admin** (created by `npm run db:seed`):

```
username: Nathan
password: 0624
```

This is a placeholder — change it (or seed a different one) before any
real use. There's currently no in-app "change password" flow; the
simplest way to rotate it is to update the `passwordHash` directly via
Prisma Studio (`npx prisma studio`) using a bcrypt hash, or extend
`prisma/seed.js`.

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
it runs `prisma db push` followed by the seed script, using a `DATABASE_URL`
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
# 4. Make sure the database has been pushed + seeded (see above)
# 5. Deploy
```

Build command: `npm run build` (already wired to run `prisma generate` first).

