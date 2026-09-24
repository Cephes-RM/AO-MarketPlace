# `@albion/ui`

Shared React components for Albion Next.js apps. Owner: Hamza.

Components are styled with Tailwind CSS classes and have no client-side state, so they
work as React Server Components (no `"use client"` needed).

## Using it in a Next.js app

1. Add the dependency and transpile the package (it ships TypeScript source):

   ```jsonc
   // package.json
   "dependencies": { "@albion/ui": "workspace:*" }
   ```

   ```ts
   // next.config.ts
   transpilePackages: ["@albion/ui"]
   ```

2. Let Tailwind v4 scan the package so its classes are generated — in the app's global CSS:

   ```css
   @import "tailwindcss";
   @source "../../../../packages/ui/src"; /* path relative to the CSS file */
   ```

`react`, `react-dom`, and `next` are peer dependencies provided by the app.

## Components

| Export           | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `Card`           | Bordered surface for grouping content                                   |
| `Badge`          | Small label (`neutral`, `gold`, `success`, `danger` tones)              |
| `StatCard`       | Labelled metric with optional hint line                                 |
| `StarRating`     | Read-only 0–5 star display                                              |
| `AllianceHeader` | Alliance name with guild and member counts                              |
| `GuildTable`     | Guilds with members, fame totals, and ratio; optional `getGuildHref`    |
| `PlayerHeader`   | Player name, region, guild/alliance, rating, and stars                  |
| `KillEventTable` | Killboard table; pass `playerId` to mark rows as Kill/Death             |
| `EmptyState`     | Message for empty lists, not-found, and error states                    |

Helpers: `formatFame` (accepts the string form of BigInt fame columns), `fameRatio`,
`formatDateTime` (UTC), and `cn` for joining class names.

```tsx
import { PlayerHeader, StatCard, formatFame } from "@albion/ui";

<PlayerHeader name={player.name} region={player.region} rating={player.rating} stars={player.stars} />
<StatCard label="Kill Fame" value={formatFame(player.killFame, { compact: true })} />
```

`KillEventTable` links players to `/players/<id>` by default; override with
`getPlayerHref`.

## Preview

Run `pnpm dev` and open `http://localhost:3000/dev/ui` to see every component with sample
data (development only; the route returns 404 in production).
