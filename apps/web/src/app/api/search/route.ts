import { searchByName } from "@albion/db";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return Response.json(await searchByName(query));
  } catch {
    return Response.json({ error: "Search is unavailable" }, { status: 503 });
  }
}
