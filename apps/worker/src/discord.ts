import type { RunReport } from "./monitor";

export function discordNotifier(webhook: string, request: typeof fetch = fetch) {
  const url = new URL(webhook);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !["discord.com", "discordapp.com"].includes(url.hostname) || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname)) {
    throw new Error("DISCORD_WEBHOOK_URL must be a Discord HTTPS webhook URL");
  }
  // Request confirmation; a fire-and-forget 204 can hide an unsaved message.
  url.searchParams.set("wait", "true");
  return async (report: RunReport) => {
    const incident = report.alertType === "polling_interval" ? {
      title: "Ingestion coverage warning", color: 0xf59e0b, stage: "Feed pagination",
      description: `Previous scan boundary missing for **${report.consecutiveBoundaryMisses} consecutive runs**.\nPoll more often; also check feed consistency.`,
    } : {
      title: "Ingestion run failed", color: 0xef4444, stage: report.failedStage ?? "Unknown",
      description: `**${report.consecutiveFailures} consecutive failed runs**.\n${report.error ?? "Unknown error"}`,
    };
    const fields = [
      { name: "Region", value: report.region, inline: true },
      { name: "Stage", value: incident.stage, inline: true },
    ];
    if (report.alertType === "polling_interval") {
      fields.push({ name: "Missing boundaries this run", value: String(report.boundaryMisses), inline: true });
    }
    if (report.fetched || report.written || report.skipped || report.retries || report.status === "failure") {
      fields.push({ name: "Run metrics", inline: false,
        value: `Fetched: ${report.fetched} · Written: ${report.written} · Skipped: ${report.skipped} · Retries: ${report.retries} · Duration: ${report.durationMs}ms` });
    }
    const response = await request(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title: incident.title, description: incident.description,
        color: incident.color, fields, footer: { text: "Albion ingestion monitor" }, timestamp: report.runId }],
        allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Discord alert failed (HTTP ${response.status})`);
    const message: unknown = await response.json();
    if (typeof message !== "object" || message === null || !("id" in message) || typeof message.id !== "string" || !message.id) {
      throw new Error("Discord did not confirm alert delivery");
    }
  };
}
