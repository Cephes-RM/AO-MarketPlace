import { createAlbionClient } from "@albion/albion-client";
import { createIngestionMonitor } from "./monitor";

// Local simulation only: no database access or messages to a Discord server.
const monitor = createIngestionMonitor({
  region: "europe",
  sendAlert: async (report) => {
    console.log(JSON.stringify({ event: "ingestion.mock_discord", failedStage: report.failedStage, consecutiveFailures: report.consecutiveFailures }));
  },
});

async function main() {
  for (let cycle = 0; cycle < 3; cycle++) {
    await monitor.run(async (context) => {
      const client = createAlbionClient({
        region: "europe", baseUrl: "https://broken-api.invalid/api/",
        fetch: async () => { throw new TypeError("API URL is unreachable"); },
        retry: { delaysMs: [0, 0] }, onRetry: () => context.retry(),
      });
      await context.stage("fetch", () => client.gameinfo.getRecentEventsTolerant());
    });
  }
  await monitor.run(async (context) => {
    await context.stage("fetch", async () => context.fetched(4));
    await context.stage("parse", async () => context.skip("malformed_event", 1));
    await context.stage("write", async () => { context.written(2); context.skip("duplicate_event"); });
  });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
