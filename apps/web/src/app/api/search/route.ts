import { NextResponse } from "next/server";
import { searchEntities } from "@albion/db";

// Reads the database on every request, so it must never be prerendered.
export const dynamic = "force-dynamic";

/** Site search: players, guilds and alliances matching ?q=. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q");
  const results = await searchEntities(query);

  return NextResponse.json(results, {
    // Results change only when the worker imports; a short cache keeps
    // repeated keystrokes off the database without going stale.
    headers: { "Cache-Control": "private, max-age=10" },
  });
}
