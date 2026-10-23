# Equipment item icons — PLAYERS-79

## Behavior

- Recorded equipment displays its icon from `https://render.albiononline.com/v1/item/{itemId}.png`.
- The complete recorded ID is percent-encoded, including `@` in enchanted items.
- Recorded quality values 1–5 are sent in the `quality` parameter. Missing or invalid quality is omitted; the existing quality label still says it was not recorded.
- Native lazy loading and asynchronous decoding defer image work. Icons reserve 64×64 pixels and request a 128px source for sharper displays.
- Alt text identifies the item, including its tier/enchantment. The readable item name remains visible below the image.
- Failed images become a neutral shield placeholder of the same size. Readable names and quality/count remain available, without a retry loop. Changing the recorded item or quality allows its new image to load.
- Empty slots remain “Not recorded”; no icon request is made for them.

## Item names and source

The [ao-data/ao-bin-dumps repository](https://github.com/ao-data/ao-bin-dumps) supplies item IDs and English names, while Albion's render service supplies the images.
The committed name catalogue is a compact equipment-only extract of `formatted/items.json`, pinned to upstream commit [`1a469e53de028c5f85cdd80505f10cbd0a2515cf`](https://github.com/ao-data/ao-bin-dumps/commit/1a469e53de028c5f85cdd80505f10cbd0a2515cf).

The full dump is not shipped. In the player page, the server-rendered equipment view resolves names and passes only each displayed name to the small icon component in the browser. Unknown/new IDs use the existing readable code formatter and can still request their icon. No database migration or runtime GitHub request is needed.

Regenerate the catalogue from the repository root:

```sh
node scripts/update-equipment-item-names.mjs
```

For an intentional upstream update, use `--revision=FULL_COMMIT_SHA` and review the generated diff. A previously downloaded copy of that revision can be used with `--source=PATH_TO_ITEMS_JSON`.

Game artwork and names belong to Sandbox Interactive. The existing community-project disclaimer remains in the site footer.

## Manual review checklist

- Open a player's recorded kill/death and expand equipment for both players.
- Confirm the icon matches each item, its quality, and any enchantment suffix.
- Check a narrow phone viewport for readable names and no horizontal scrolling.
- Inspect an enchanted image URL: `@` must appear as `%40`.
- Confirm `loading="lazy"`, explicit width/height, and descriptive alt text.
- Block `render.albiononline.com` in browser developer tools, then reload and expand equipment: names/quality/count must remain visible with a fixed-size placeholder.
- Confirm empty slots do not request icons.

## Validation — 21 October 2026

| Check | Result |
| --- | --- |
| Full unit suite | 193 tests passed across 9 files, including 26 new icon URL/name cases |
| Shared UI TypeScript check | Passed |
| Web and shared UI lint | Passed |
| Catalogue updater syntax | Passed |
| Development preview compilation with isolated seed data | Passed |
| Live Albion icons in the seeded cephes event | All 15 recorded icons loaded |
| Quality parameters, encoded enchanted IDs, lazy attributes, 64px dimensions and alt text | Passed |
| Render host blocked in an isolated browser context | All 15 placeholders retained their names and 64px frames |
| Empty slots | No image elements or icon requests |
| 390px and 320px browser viewports | No horizontal overflow; icons remained 64×64px |
| Browser application errors during normal loading | None |

Tests used the existing installed tool binaries directly. The Windows sandbox
required a workspace temporary directory for Vitest and existing plugin paths
for ESLint; no dependency versions or lint rules were changed for these checks.
This was a development preview, not a production-build or real-phone check.

The local browser report and reviewed desktop, mobile and blocked-image
screenshots are under `outputs/players-79-validation/` outside this checkout.
The preview launcher is also outside the checkout: `Preview-Players-79.cmd`.
It uses an isolated database on port 5437 and a separate Next.js cache, serving
the current branch at `http://127.0.0.1:3082` while its terminal stays open.
