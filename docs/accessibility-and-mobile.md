# Accessibility and mobile pass — PLAYERS-78

## Changes ready for review

- Shared rank, caption and muted text colors are lighter. Against the page
  background / card surface respectively, the calculated contrast ratios are
  6.73 / 6.16 for rank, 7.31 / 6.69 for caption, and 8.85 / 8.09 for muted text.
  These calculations are not a substitute for checking the rendered UI.
- The search boundary has a separate, higher-contrast color token. A shared
  44px minimum target token sizes navigation, links, search controls and equipment
  toggles. Main-page labels use at least 12px; the search input uses 16px.
- The first Tab exposes a skip link to the focusable main landmark. Controls have
  visible focus outlines, and profile breadcrumbs identify the current page.
- Search retains focus in its labelled input. Down starts at the first result,
  Up starts at the last, Enter opens the selected profile, and Escape dismisses
  suggestions. Selection scrolls into view; Tab leaves the suggestions. Search
  loading, errors and result counts are announced. Result links keep native
  mouse actions, including opening a new tab.
- Mobile directory rows put scores below names; grids and navigation reflow.
  Long names and IDs can wrap. Search suggestions scroll within the viewport.
  Reduced-motion preferences disable the existing decorative transitions.

## Automated axe and interaction check

Start the web app with its usual populated database configuration in one terminal.
From the repository root, run these in another terminal:

```sh
pnpm install --frozen-lockfile
pnpm --filter @albion/accessibility exec playwright install chromium
pnpm check:a11y http://localhost:3000
```

The checker discovers a player and guild from the landing-page rankings. Choose a
player with recorded fights when the first ranked player has none:

```sh
pnpm check:a11y http://localhost:3000 --player=REAL_PLAYER_ID --guild=REAL_GUILD_ID
```

It scans the landing page, player profile and guild page at desktop, 390px,
320px and landscape widths. It also scans expanded equipment and search
suggestions, traverses controls with Tab, checks visible focus, keyboard
selection/toggling, target dimensions and page overflow. HTTP errors,
login redirects, empty rankings and recovery screens cannot pass as real content.
It exits nonzero for violations or failed assertions. The report is saved under
`artifacts/accessibility/axe-report.json` (ignored by Git), including axe checks
that need manual review. It does not alter the database or start a server.

## CI and Docker review follow-up — 24 October 2026

### Accessibility remains an explicit browser check

The review permits running `pnpm check:a11y` separately when its requirements are
documented. The current CI jobs do not provide a running site, populated database,
a player with recorded equipment, Chromium or its Linux system dependencies.
The checker deliberately rejects empty rankings and recovery/error pages. Run the
command above against an accessible preview or a populated local production build,
and retain its report before final review. Accessibility is not currently a CI
merge gate. A dedicated job would need a disposable database, seed data, browser
installation, web-server lifecycle management and report upload.

### Browser dependencies are separate from application installs

`playwright` and `@axe-core/playwright` now belong only to the private
`@albion/accessibility` workspace (`packages/accessibility`). They are removed
from root devDependencies. No root, web, worker or application dependency manifest
references this tools workspace. The Docker context also excludes the tools
workspace and generated accessibility reports via `.dockerignore`. This also covers pnpm 11.11.0's recursive install
behavior, which can include the root importer despite application filters.

The public `pnpm check:a11y` command still works through its small original entry
point, which loads the implementation in the tools workspace. Reports remain in
root `artifacts/accessibility/`. Install browsers using the filtered tools command
above; a full workspace install is needed for the audit command.

The inspected branch and `main` contain one Dockerfile:
`apps/worker/Dockerfile`, used by `compose.yaml`. Its `worker...` installation does
not select the accessibility workspace; the `web...` dependency closure does not
either. There is no checked-in web Dockerfile to inspect. A separately maintained
web image must also avoid installing the tools workspace or every workspace.

This follow-up is based on package/filter inspection. Docker is unavailable here,
so an actual image build and container dependency inspection remain to be done.
The historical validation below has not been rerun for the workspace relocation.

## Validation results — 21 October 2026

Checks used a production build at `http://127.0.0.1:3078`, backed by an isolated
PGlite database created from the current Prisma schema and repository seed data.
The pages contained populated rankings, a player with recorded equipment, and
a guild with members. No external or production database was changed.

| Check | Result |
| --- | --- |
| Web production build, including type validation | Passed |
| Shared UI typecheck and web lint | Passed |
| Axe 4.14.0, 20 page/state scans | Zero violations |
| Tab traversal and visible focus, 12 page/viewport runs | Passed |
| Arrow keys, Enter, Escape, Tab, Clear search, equipment Space/Enter | Passed |
| 44px target checks and horizontal overflow | Passed in all four viewport sizes |
| Visual review at 320 CSS pixels | Passed; mobile rankings remained readable |

Lighthouse 13.5.0 with Chrome Headless Shell 156.0.8078.4 returned:

| Page | Mobile accessibility | Desktop accessibility |
| --- | --- | --- |
| `/` | 100 / 100 | 100 / 100 |
| `/players/KgXzr2H7RF2PcYKr1uJGQA` | 100 / 100 | 100 / 100 |
| `/guilds/0PwhfF-hRfSkyzz_A4TxfQ` | 100 / 100 | 100 / 100 |

Local reports are under `artifacts/accessibility/`: `axe-report.json`,
`lighthouse-summary.json`, six Lighthouse HTML/JSON report pairs and
`contrast-review.json`. These generated files are ignored by Git.

The first axe run found a brand link label mismatch; the redundant `aria-label`
was removed so the visible brand text supplies the name. Search/clear symbols
now use decorative SVGs, and Tab explicitly closes the search suggestions.
The final production build and scans include these corrections.

Axe's incomplete contrast checks were reviewed separately: the hero sigil and
down arrow are decorative; the banner gradient's brightest background still
gives at least 7.72:1 for its eyebrow, 14.47:1 for its heading and 7.68:1 for its
description. The search popup intentionally overlays the breadcrumb, whose
contrast passes when the popup is closed. No axe rules were disabled.

The browser accessibility trees expose heading levels, navigation/search labels,
the selected search result and expanded equipment state. This review does not
replace listening with a screen reader.

## Acceptance checklist

- [x] Run the axe checker and review violations and incomplete results.
- [x] Lighthouse accessibility is at least 95 on all three required pages.
- [x] Automated keyboard traversal, visible focus and search/equipment controls.
- [x] Use a screen reader to check headings, navigation landmarks, form labels,
  search status/selection announcements and equipment expanded/collapsed state.
  User confirmed all Android TalkBack checks pass in Chrome.
- [x] On a **real phone**, check portrait and landscape, readable content,
  search with the keyboard open, equipment toggles, no sideways scrolling and
  easy-to-tap controls. User confirmed all checks pass in Android Chrome;
  automated checks also verified at least 44×44px tap targets.
- [x] Check reflow at 320 CSS pixels.
- [x] Check browser zoom at 200%. User confirmed the PC checks pass with
  readable, usable content and no clipping or overlapping controls.

Manual results recorded on 21 October 2026: the user confirmed that the landing
page, player cephes and a guild passed the physical phone checks in portrait
and landscape in Android Chrome, and the PC browser checks at 200% zoom.
The user also confirmed that all Android TalkBack checks passed: headings and
navigation, search labels/results/selection, opening a result and equipment
expanded/collapsed announcements. The phone model and exact PC browser were not
supplied. Manual results are user-reported.

The standalone `Preview-Players-78-Phone.cmd` launcher outside the checkout serves
the phone preview on port 3080 while the user's terminal stays open. It uses a
fresh isolated database with repository seed data and does not modify firewall
settings. The user confirmed connectivity and completed the phone checks.

All acceptance checks above are recorded as passed. This checklist does not
change the Jira ticket status.

References: [WCAG text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html),
[ARIA combobox behavior](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/),
[Playwright axe integration](https://playwright.dev/docs/accessibility-testing).
