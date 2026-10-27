# Local verification notes

Run the behavior and regression suite with `npm test`. It does not connect to a database. The admin bootstrap CLI check runs the documented `npm run db:create-admin` script in a temporary project, loads `DATABASE_URL` from a temporary `.env`, and substitutes a fake Prisma client so no account is written.

The order-number concurrency case runs the same allocation helper against a fake transaction-scoped mutex and an in-memory order table. It checks the application's locking protocol under concurrent callers; it does **not** prove PostgreSQL advisory-lock behavior or multi-process/database concurrency. A live PostgreSQL integration test remains unavailable in this workspace because no database configuration is provided. No production or real database was reset or modified.

Before deployment, apply the updated Prisma schema to the intended database and run a separate integration check against a disposable PostgreSQL database. Do not point such a test at production.
