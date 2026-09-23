import { searchByName } from "@albion/db";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchByName(query);

  return Response.json(results);
}
