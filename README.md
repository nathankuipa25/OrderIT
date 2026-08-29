# OrderIT

Mobile-first shop order generator. Select products from a fixed catalog,
generate a clean image (and optional PDF) of the order — no quantities,
no prices, no inventory tracking.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma · SQLite

## Local development

```bash
npm install
cp .env.example .env
npx prisma db push
npm run db:seed   # optional: adds demo products
npm run dev
```

Visit http://localhost:3000

## Deploying to Vercel

SQLite is file-based, so it won't persist on Vercel's serverless/read-only
filesystem across deploys. Two options:

1. **Quick demo deploy** — deploy as-is. The DB resets on every deploy /
   cold start rotation. Fine for a demo, not for real shop data.
2. **Production** — swap the Prisma datasource to a hosted Postgres (e.g.
   Vercel Postgres, Neon, Supabase). Change `provider = "sqlite"` to
   `provider = "postgresql"` in `prisma/schema.prisma`, set `DATABASE_URL`
   in Vercel's Environment Variables, then `npx prisma db push`.

### Steps

```bash
# 1. Push this repo to GitHub (see commands below)
# 2. Go to vercel.com/new, import the GitHub repo
# 3. Add DATABASE_URL as an environment variable
# 4. Deploy
```

Build command: `npm run build` (already wired to run `prisma generate` first).
