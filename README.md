# OrderIT

Mobile-first shop order generator. Select products from a fixed catalog,
generate a clean image (and optional PDF) of the order — no quantities,
no prices, no inventory tracking.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma · SQLite

## Local development

```bash
npm install
cp .env.example .env   # then paste your Neon (or other Postgres) connection string
npx prisma db push
npm run db:seed        # optional: adds demo products
npm run dev
```

Visit http://localhost:3000

## Database

This project uses Postgres via Prisma (tested with [Neon](https://neon.tech)).
Set `DATABASE_URL` to your connection string, both locally (`.env`) and in
Vercel's Environment Variables.

**Before your first deploy actually works, someone needs to run `npx prisma db push`
against that `DATABASE_URL` once** — this creates the `Product`, `Order`, and
`OrderItem` tables. Vercel's build step does not do this automatically (it
only runs `prisma generate`). Run it locally with the same `DATABASE_URL` set:

```bash
DATABASE_URL="your-neon-connection-string" npx prisma db push
```

## Deploying to Vercel

```bash
# 1. Push this repo to GitHub (already done if you're reading this from there)
# 2. Go to vercel.com/new, import the GitHub repo
# 3. Add DATABASE_URL as an environment variable (same Neon string)
# 4. Run `npx prisma db push` once against that DATABASE_URL (see above)
# 5. Deploy
```

Build command: `npm run build` (already wired to run `prisma generate` first).
