import { getPlayerById } from "@albion/db";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  try {
    const player = await getPlayerById(playerId);

    return (
      <main>
        <h1>{player.name}</h1>
        <ul>
          <li>Guild: {player.guildName ?? "None"}</li>
          <li>Alliance: {player.alliance ?? "None"}</li>
          <li>Fame: {player.fame}</li>
          <li>Kill Fame: {player.killFame}</li>
          <li>Death Fame: {player.deathFame}</li>
          <li>Rating: {player.rating}</li>
          <li>Stars: {player.stars}</li>
        </ul>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message === "Player not found") {
      return (
        <main>
          <p>Player not found.</p>
        </main>
      );
    }

    if (message === "Invalid player ID") {
      return (
        <main>
          <p>Invalid player ID.</p>
        </main>
      );
    }

    return (
      <main>
        <p>Something went wrong while loading this player.</p>
      </main>
    );
  }
}
