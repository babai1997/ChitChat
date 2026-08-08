# Database migrations — dev → prod

## What changed and why

Several schema changes this session (Device/Meeting/Backup tables,
`User.personalMeetingId`, etc.) were applied to the dev database with
`prisma db push`, which syncs the DB straight from `schema.prisma` and never
writes a migration file. That left `prisma/migrations/` badly out of date —
only 5 of the real schema's migrations existed on disk. Fixed by regenerating
a single migration (`20260808000000_add_e2ee_meetings_backup`) that captures
everything `db push` had applied, and backfilling `_prisma_migrations` so the
history is now accurate and `prisma migrate status` reports clean.

**Going forward: never run `prisma db push` again.** It's a dev-only
convenience command with no rollback story and no record of what changed —
exactly how the drift above happened. Every schema change from now on goes
through a real migration.

## Current setup: staging + neondb, same Neon instance

Neon's default project branch is named "production" and its default
database is `neondb`. Rather than a second Neon project/branch, a sibling
database — `staging` — was created on that SAME instance via
`CREATE DATABASE staging`. Both currently have identical schema (18 tables,
all empty). Two env vars in `.env` (`.env.example` has the template):

- `DATABASE_URL` → `staging`. The day-to-day working database — the backend
  dev server and `migrate dev` both use this by default. Never real prod
  data.
- `PRODUCTION_DATABASE_URL` → `neondb`. The real prod database. Only ever
  touched via `migrate:deploy`, never `migrate dev`/`migrate reset`/`db push`.

## The dev workflow

Edit `prisma/schema.prisma`, then:

```bash
npm run migrate:dev -- --name add_something_descriptive
```

This generates a new file under `prisma/migrations/`, applies it to
`staging` (the default `DATABASE_URL`), and regenerates the Prisma Client —
one step, and it's the only command that writes new migration files. Commit
the generated migration folder along with your schema change; run the app
against `staging` and confirm the feature actually works before shipping it.

## Shipping a verified migration to prod

Once a migration has been authored via `migrate dev` and verified against
`staging`, apply the exact same migration file(s) to `neondb`:

```bash
DATABASE_URL="$PRODUCTION_DATABASE_URL" npm run migrate:deploy
```

(`$PRODUCTION_DATABASE_URL` here just means: pull that value out of `.env` and
pass it as `DATABASE_URL` for this one command — e.g.
`DATABASE_URL="$(grep '^PRODUCTION_DATABASE_URL=' .env | sed -E "s/^PRODUCTION_DATABASE_URL='//;s/'$//")" npm run migrate:deploy`.)

`prisma migrate deploy`:
- Applies only migrations that haven't run yet on that database, in order.
- Never resets, drops, or diffs against the schema file — it just replays
  the SQL files in `prisma/migrations/`, so existing prod rows are
  untouched by anything except what a migration's SQL explicitly does.
- Is safe to run repeatedly (a no-op if nothing's pending) and safe in CI.

Never run `migrate dev`, `migrate reset`, or `db push` against `neondb` —
all three can drop/recreate schema. `migrate deploy` is the only safe
command for it.

## Extra safety net

Neon supports point-in-time restore and branching independent of anything
Prisma does. Before a schema change with real prod data behind it,
consider a Neon branch snapshot first — migrations are the correctness
mechanism, but a platform-level restore point is the recovery mechanism if
something still goes wrong.
