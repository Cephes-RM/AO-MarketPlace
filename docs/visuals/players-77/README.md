# PLAYERS-77 visual evidence

Captured on 14 October 2026 using the same local fixture data and a 1440 × 900
CSS viewport. Browser viewport captures include native scrollbar framing.

- Before: existing page UI and CSS from main commit
  `96c032d30153792cac1abc2f1f40ea11f3c3fcb7`, served on port 3076.
- After: PLAYERS-77 token extraction, served on port 3077.
- The fixture contains 30 players, five guilds, and one alliance. The same
  fixture was used for both views; no deployed database was accessed.
- These are viewport screenshots, not full-page captures. Visual inspection
  found no intended design changes in the captured areas. They are evidence
  for review, not a guarantee about every route, state, or browser.

| View | Before | After |
| --- | --- | --- |
| Homepage hero, totals, and section heading | [Before](home-before.jpg) | [After](home-after.jpg) |
| Phildas player profile and stats | [Before](player-before.jpg) | [After](player-after.jpg) |
| Recent kill with expanded equipment | [Before](combat-before.jpg) | [After](combat-after.jpg) |
| WhySpierdalasz guild and member list | [Before](guild-before.jpg) | [After](guild-after.jpg) |
| Bozy Smallec alliance and guild list | [Before](alliance-before.jpg) | [After](alliance-after.jpg) |

The new `/dev/ui` color catalogue is shown in [the token screenshot](tokens-after.jpg).
Its other sections demonstrate the type scale, spacing, borders/focus, other
foundations, and shared components.

Automated tests, lint, typecheck, and a production build were not run for this
ticket. The running Next.js development preview compiled the visited routes.
