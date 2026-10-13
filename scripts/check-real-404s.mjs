import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = resolve(fileURLToPath(new URL("../apps/web/src/app/", import.meta.url)));
const profileRoutes = [
  { path: "players", segment: "[playerId]" },
  { path: "guilds", segment: "[guildId]" },
  { path: "alliances", segment: "[allianceId]" },
];

function assertNoLoadingBoundaries() {
  const boundaries = new Set();

  for (const route of profileRoutes) {
    let directory = join(appDirectory, route.path, route.segment);

    while (true) {
      for (const extension of ["tsx", "ts", "jsx", "js"]) {
        const loadingFile = join(directory, `loading.${extension}`);
        if (existsSync(loadingFile)) boundaries.add(loadingFile);
      }
      if (directory === appDirectory) break;
      const parent = dirname(directory);
      if (parent === directory) throw new Error("Could not locate the app root.");
      directory = parent;
    }
  }

  if (boundaries.size) {
    throw new Error(
      `Loading boundaries can turn missing profiles into HTTP 200 responses. Remove:\n${[...boundaries].join("\n")}`,
    );
  }
}

async function checkResponse(url, method) {
  try {
    const response = await fetch(url, {
      method,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "text/html",
        // Check the browser response, including its metadata-streaming behavior.
        "User-Agent": "Mozilla/5.0 (compatible; AlbionMarket404Check/1.0)",
      },
    });
    await response.body?.cancel();
    return { method, path: url.pathname, status: response.status };
  } catch (error) {
    return {
      method,
      path: url.pathname,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length !== 1) {
    throw new Error("Usage: pnpm check:404 https://your-preview-url.vercel.app");
  }

  const baseUrl = new URL(args[0]);
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new Error("Provide an HTTP(S) site URL without embedded credentials.");
  }

  assertNoLoadingBoundaries();

  const results = await Promise.all(profileRoutes.flatMap((route) => {
    // Use a plausible Albion ID with negligible chance of matching a real record.
    const unknownId = randomBytes(16).toString("base64url");
    const url = new URL(`/${route.path}/${unknownId}`, baseUrl.origin);
    return ["HEAD", "GET"].map((method) => checkResponse(url, method));
  }));

  let failures = 0;
  for (const result of results) {
    const passed = result.status === 404;
    console.log(
      `${passed ? "PASS" : "FAIL"} ${result.method} ${result.path}: ${result.error ?? `HTTP ${result.status}`}`,
    );
    if (!passed) failures += 1;
  }

  if (failures) {
    console.error("Every missing profile must return HTTP 404. Redirects, login pages, and server errors also fail this check.");
    process.exitCode = 1;
  } else {
    console.log("All three profile routes return HTTP 404 for HEAD and GET.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
