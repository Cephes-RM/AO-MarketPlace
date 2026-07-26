# albion-platform

-Player database for Albion Online: a searchable directory of players, their kill/death
-history, and computed performance ratings. This monorepo hosts that product and any
-future Albion apps we build, sharing one database layer, one Albion API client, and one
-rating engine across all of them.
## Dependency rule

Apps import packages. Packages never import apps. Packages only use each other's public exports. Reviews enforce this.

## Zero to running

```sh
nvm use                 # Node 22 (see .nvmrc)
corepack enable         # activates pnpm (see "packageManager" in package.json)
pnpm install
cp .env.example .env    # fill DATABASE_URL (pooled) and DIRECT_URL (direct) from the Neon dashboard
pnpm dev
```

See "Environment setup", "Database migrations", and "Seeding" below for the steps behind the `cp .env.example .env` and `pnpm dev` lines above.

## Environment setup

The app and Prisma both read `DATABASE_URL` and `DIRECT_URL` from `.env` at the repo root. Both values come from the same Neon project, but they're different connection strings:

- `DATABASE_URL` — the **pooled** connection. This is what the app and Prisma Client use at runtime (via PgBouncer), since it can handle many short-lived connections efficiently.
- `DIRECT_URL` — the **direct** connection. Prisma Migrate needs this one, because the pooler doesn't support the session features migrations rely on.

To get both: open the [Neon dashboard](https://console.neon.tech), select the project, go to "Connection Details", and toggle "Pooled connection" on/off to get each string respectively.

`.env.example` at the repo root is the template for these two variables — copy it to `.env` and fill in the real values (never commit `.env`).

## Database migrations

Migrations live in `packages/db/prisma/migrations` and are run through Prisma Migrate. The `db:migrate` script in `packages/db` wraps the command with `dotenv-cli` so it picks up `.env` from the repo root:

```sh
pnpm --filter @albion/db run db:migrate
```

This runs `prisma migrate dev` against `DIRECT_URL`, applies any pending migrations, and regenerates the Prisma Client. Run it after pulling schema changes, or after editing `packages/db/prisma/schema.prisma` yourself (it will prompt you for a migration name in that case).

## Seeding

A `db:seed` script exists (`pnpm --filter @albion/db run db:seed`), but there's no seed logic wired up yet — no `prisma/seed.ts` and no seed entry point configured, so running it currently does nothing. Seeding isn't available yet; this section will be updated once a real seed script lands.

## Local development

Day-to-day loop once your `.env` is set up:

```sh
pnpm dev            # starts the Next.js dev server (apps/web) via turbo
```

To inspect or edit rows in the database directly, use Prisma Studio:

```sh
pnpm --filter @albion/db exec dotenv -e ../../.env -- npx prisma studio
```

This opens a local web UI (defaults to `http://localhost:5555`) backed by the same `.env` connection strings, so you can browse and edit `Player` rows without writing SQL.

## Packages

| Package                     | Purpose                                        | Owner              |
| --------------------------- | ---------------------------------------------- | ------------------ |
| `apps/web`                  | Next.js app (the website)                      | —                  |
| `apps/worker`               | Ingestion worker (placeholder, built in Epic 4)| Marwane            |
| `packages/db`               | Prisma schema + client singleton               | Salmane and Ismail |
| `packages/albion-client`    | Albion API SDK (stub)                          | Marwane            |
| `packages/rating-engine`    | Pure computation, no I/O (stub)                | Yassir and Marwane |
| `packages/ui`               | Shared React components (stub)                 | Hamza              |
| `packages/typescript-config`| Shared tsconfig bases                          | —                  |
| `packages/eslint-config`    | Shared ESLint config                           | —                  |
