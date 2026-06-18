# AGENTS.md

## Cursor Cloud specific instructions

This is a single Next.js SaaS Starter app (Next.js App Router + Drizzle ORM + PostgreSQL + Stripe). pnpm is the package manager.

### Services & how to run them
- **PostgreSQL**: required for the app to boot. It is installed via the system package manager (cluster `16/main`) and is **not auto-started on boot** — start it with `sudo pg_ctlcluster 16 main start`. Connection used by `.env`: `postgres://postgres:postgres@localhost:5432/postgres` (standard port 5432, not the 54322 mentioned in the README's Docker flow).
- **Next.js dev server**: `pnpm dev` (Turbopack) on http://localhost:3000.
- After a fresh DB or schema change, apply migrations with `pnpm db:migrate`. Tables: `users`, `teams`, `team_members`, `activity_logs`, `invitations`.

### Environment / `.env` (gotchas)
- `.env` is git-ignored and is **managed manually** here (do NOT run `pnpm db:setup` — it is interactive and requires the Stripe CLI + Docker). Required vars: `POSTGRES_URL`, `AUTH_SECRET`, `BASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are **placeholders**. Core flows (sign-up, sign-in, dashboard, team/activity) work fully without real Stripe keys. Stripe-dependent flows do **not** work with placeholders:
  - `pnpm db:seed` calls `createStripeProducts()` and will fail without a real Stripe key — it is not needed to exercise core auth/dashboard. Create users via the `/sign-up` route instead.
  - `/pricing` checkout and the customer-portal flow require a real Stripe test key + `stripe listen` webhook forwarding.

### Lint / test / build
- There are **no `lint` or `test` scripts** defined in `package.json`. Use `npx tsc --noEmit` for type checking.
- Production build is `pnpm build`; for development use `pnpm dev`.
