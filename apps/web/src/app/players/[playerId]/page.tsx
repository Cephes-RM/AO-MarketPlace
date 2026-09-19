import { getPlayerById } from "@albion/db";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  try {
    const player = await getPlayerById(playerId);
    const currentMembership = player.guildMemberships.find(
      (membership) => membership.leftAt === null,
    );

    return (
      <main>
        <h1>{player.name}</h1>
        <ul>
          <li>Guild: {currentMembership?.guild.name ?? "None"}</li>
          <li>Alliance: {player.alliance ?? "None"}</li>
          <li>Fame: {player.fame}</li>
          <li>Kill Fame: {player.killFame}</li>
          <li>Death Fame: {player.deathFame}</li>
          <li>Rating: {player.rating}</li>
          <li>Stars: {player.stars}</li>
        </ul>
        <section>
          <h2>Guild history</h2>
          {player.guildMemberships.length === 0 ? (
            <p>No guild history.</p>
          ) : (
            <ol>
              {player.guildMemberships.map((membership) => (
                <li key={membership.id}>
                  <strong>
                    {membership.guild.name}
                    {membership.leftAt === null ? " (Current)" : ""}
                  </strong>{" "}
                  <span>
                    {membership.joinedAt.toLocaleDateString()} - {membership.leftAt?.toLocaleDateString() ?? "Present"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
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
