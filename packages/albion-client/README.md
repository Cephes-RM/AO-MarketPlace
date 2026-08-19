# `@albion/albion-client`

This package is the shared client for Albion Online APIs. Other applications
and services use it instead of calling Albion endpoints directly.

It handles:

- Albion server selection (`west`, `europe`, or `east`)
- HTTP requests and errors
- Input validation
- Typed TypeScript responses
- Conversion of Albion response fields to camelCase

It does not contain database, UI, or business logic.

## Usage

Create one client for the Albion server you want to access:

```ts
import { createAlbionClient } from "@albion/albion-client";

const albion = createAlbionClient({ region: "europe" });
```

The application or service provides the region, usually from the user's server
selection or a saved player record. Every `gameinfo` method called on this
client will use that same Albion server. Create or select a different client to
access another region.

Then call the method needed by your service:

```ts
const search = await albion.gameinfo.searchPlayers("PlayerName");
const player = await albion.gameinfo.getPlayer("player-id");
const kills = await albion.gameinfo.getPlayerKills("player-id", { limit: 10 });
const deaths = await albion.gameinfo.getPlayerDeaths("player-id");

const events = await albion.gameinfo.getRecentEvents({ limit: 10 });
const event = await albion.gameinfo.getEvent(123456);
```

Killboard events include the killer, victim, average item power, and equipment.
Empty equipment slots can be `null` or missing.

To fetch an item icon from Albion's render service:

```ts
const itemType = event.killer.equipment?.mainHand?.type;

if (itemType) {
  const iconBytes = await albion.items.getIcon(itemType);
}
```

`items.getIcon()` returns the image as an `ArrayBuffer`.

## Errors

Failed Albion requests throw `AlbionApiError`, which includes the HTTP `status`
and requested `url`.
