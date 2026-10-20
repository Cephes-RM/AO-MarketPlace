# Error pages and real 404s (PLAYERS-71)

The root `not-found.tsx` provides the missing-page screen for unknown routes and
missing player, guild, or alliance profiles. The root `error.tsx` handles unexpected
profile failures with a retry button. Both reuse the shared UI components, directory
search, and the existing color tokens from `globals.css`.

Missing or invalid profile IDs call `notFound()`. Other profile errors are rethrown
to the error boundary instead of being rendered as a successful profile response.
The guild page retains its React-cached lookup from PLAYERS-50.

## Check a running site or deployed preview

Run from the repository root:

```sh
pnpm check:404 https://your-preview-url.vercel.app
```

For local development, use `http://localhost:3000`. The script does not start the
server, deploy the app, or change the database.

It checks one random, plausible unknown ID for each of `/players`, `/guilds`, and
`/alliances`, using both HEAD (equivalent to `curl -I`) and GET. Every response must
be exactly 404. Redirects are not followed, so a protected preview cannot pass by
redirecting to a login or missing page. Use a preview that the checker can access.
The script exits with a nonzero status on a wrong status, connection failure, or
timeout.

Before making requests, it also rejects any `loading.tsx`, `loading.ts`,
`loading.jsx`, or `loading.js` at the app root or above the three profile pages.
Do not add those boundaries: they can start streaming before `notFound()` runs,
leaving the response status at 200. An explicit Suspense boundary can have the same
effect and should be reviewed carefully.

This script is provided for review; it has not been run against the local server
or a deployed preview as part of this change.
