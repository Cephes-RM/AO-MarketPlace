import type { RunReport } from "./monitor";

export function discordNotifier(webhook: string, request: typeof fetch = fetch) {
  const url = new URL(webhook);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !["discord.com", "discordapp.com"].includes(url.hostname) || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname)) {
    throw new Error("DISCORD_WEBHOOK_URL must be a Discord HTTPS webhook URL");
  }
  // Request confirmation; a fire-and-forget 204 can hide an unsaved message.
  url.searchParams.set("wait", "true");
  return async (report: RunReport) => {
    const content = [
      `Albion ingestion failed ${report.consecutiveFailures} consecutive cycles (${report.region}).`,
      `Failed stage: ${report.failedStage ?? "unknown"}`,
      `Fetched: ${report.fetched}; written: ${report.written}; skipped: ${report.skipped}; retries: ${report.retries}; duration: ${report.durationMs}ms.`,
      `Error: ${report.error ?? "Unknown error"}`,
      `Run: ${report.runId}`,
    ].join("\n");
    const response = await request(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Discord alert failed (HTTP ${response.status})`);
    const message: unknown = await response.json();
    if (typeof message !== "object" || message === null || !("id" in message) || typeof message.id !== "string" || !message.id) {
      throw new Error("Discord did not confirm alert delivery");
    }
  };
}
