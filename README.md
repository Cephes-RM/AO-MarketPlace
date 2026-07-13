# albion-platform

Player database for Albion Online: a searchable directory of players, their kill/death
history, and computed performance ratings. This monorepo hosts that product and any
future Albion apps we build, sharing one database layer, one Albion API client, and one
rating engine across all of them.

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

Database migrate/seed steps arrive with tickets 1.2/1.3.

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
