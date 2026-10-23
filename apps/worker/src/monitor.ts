export interface MonitorState {
  consecutiveFailures: number;
  alerted: boolean;
  // Older file-backed state does not contain boundary incident fields.
  consecutiveBoundaryMisses?: number;
  boundaryAlerted?: boolean;
}

export interface StateStore {
  read(): Promise<MonitorState>;
  write(state: MonitorState): Promise<void>;
}

export interface RunReport {
  event: "ingestion.run";
  runId: string;
  region: string;
  message: string;
  status: "success" | "failure" | "cancelled";
  fetched: number;
  written: number;
  skipped: number;
  skipReasons: Record<string, number>;
  retries: number;
  durationMs: number;
  failedStage: string | null;
  error: string | null;
  consecutiveFailures: number;
  boundaryMisses: number;
  consecutiveBoundaryMisses: number;
  boundaryAlertStatus: RunReport["alertStatus"];
  alertType?: "failure" | "polling_interval";
  alertStatus: "not-needed" | "sent" | "already-sent" | "unconfigured" | "failed";
}

export interface RunContext {
  stage<T>(name: string, action: () => Promise<T> | T): Promise<T>;
  fetched(count: number): void;
  written(count: number): void;
  skip(reason: string, count?: number): void;
  retry(): void;
  boundaryMiss(): void;
}

interface MonitorOptions {
  region: string;
  failureThreshold?: number;
  store?: StateStore;
  sendAlert?: (report: RunReport) => Promise<void>;
  log?: (entry: RunReport | { event: "ingestion.monitor_error"; error: string }
    | { event: "ingestion.run_started"; runId: string; region: string; message: string }) => void;
  now?: () => number;
}

/** URLs may contain database passwords or webhook tokens; never log them. */
export function safeError(error: unknown): string {
  const messages: string[] = [];
  for (let cause = error, depth = 0; cause instanceof Error && depth < 3; cause = cause.cause, depth++) {
    let lines = cause.message.trim().split(/\r?\n/);
    if (cause.name.startsWith("PrismaClient")) {
      const invocation = lines.findIndex(line => line.startsWith("Invalid ") && line.includes("invocation"));
      const excerpt = lines.findIndex(line => line.trimStart().startsWith("→"));
      if (invocation >= 0) lines = lines.slice(excerpt >= 0 ? excerpt + 1 : invocation + 1);
      lines = lines.filter(line => line.trim());
    }
    messages.push(lines.slice(0, 2).join(" ").trim());
  }
  const message = messages.join(": ") || "Unknown ingestion error";
  return message.replace(/(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/gi, "[redacted URL]").slice(0, 350);
}

export function memoryStateStore(): StateStore {
  let state: MonitorState = { consecutiveFailures: 0, alerted: false };
  return {
    read: async () => ({ ...state }),
    write: async (next) => { state = { ...next }; },
  };
}

/** Wrap each scheduled cycle, with stage-aware logs and persistent failure counts. */
export function createIngestionMonitor(options: MonitorOptions) {
  const threshold = options.failureThreshold ?? 3;
  if (!Number.isSafeInteger(threshold) || threshold < 1) throw new Error("Failure threshold must be a positive integer");
  const store = options.store ?? memoryStateStore();
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const now = options.now ?? Date.now;
  let running = false;
  let state: MonitorState = { consecutiveFailures: 0, alerted: false };
  let stateLoaded = false;
  let pendingWrite = false;

  return {
    async run(work: (context: RunContext) => Promise<void>, signal?: AbortSignal): Promise<RunReport> {
      if (running) throw new Error("An ingestion cycle is already running");
      running = true;
      const started = now();
      let stage = "monitor_state";
      let stateRead = false;
      const report: RunReport = {
        event: "ingestion.run", runId: new Date(started).toISOString(), region: options.region,
        message: "Cycle running",
        status: "success", fetched: 0, written: 0, skipped: 0, skipReasons: {},
        retries: 0, durationMs: 0, failedStage: null, error: null,
        consecutiveFailures: 0, alertStatus: "not-needed",
        boundaryMisses: 0, consecutiveBoundaryMisses: 0, boundaryAlertStatus: "not-needed",
      };
      const add = (count: number) => {
        if (!Number.isSafeInteger(count) || count < 0) throw new Error("Metric counts must be non-negative integers");
        return count;
      };
      const context: RunContext = {
        stage: async (name, action) => { stage = name; return await action(); },
        fetched: (count) => { report.fetched += add(count); },
        written: (count) => { report.written += add(count); },
        skip: (reason, count = 1) => {
          const key = safeError(new Error(reason));
          report.skipped += add(count);
          Object.defineProperty(report.skipReasons, key, {
            value: (Object.hasOwn(report.skipReasons, key) ? report.skipReasons[key] : 0) + count,
            writable: true, enumerable: true, configurable: true,
          });
        },
        retry: () => { report.retries += 1; },
        boundaryMiss: () => { report.boundaryMisses += 1; },
      };

      try {
        log({ event: "ingestion.run_started", runId: report.runId, region: options.region, message: "Cycle started" });
        try {
          const saved = await store.read();
          if (!stateLoaded) {
            // Failures counted before the first successful read are additional to saved history.
            state = { ...saved, consecutiveFailures: saved.consecutiveFailures + state.consecutiveFailures,
              alerted: saved.alerted || state.alerted };
          } else if (!pendingWrite) state = { ...saved };
          stateLoaded = true;
          stateRead = true;
          await work(context);
          if (signal?.aborted) report.status = "cancelled";
        } catch (error) {
          if (signal?.aborted) report.status = "cancelled";
          else {
            report.status = "failure";
            report.failedStage = stage;
            report.error = safeError(error);
            state = { ...state, consecutiveFailures: state.consecutiveFailures + 1 };
            pendingWrite = true;
          }
        }
        if (report.status !== "cancelled" && report.boundaryMisses > 0) {
          state = { ...state, consecutiveBoundaryMisses: (state.consecutiveBoundaryMisses ?? 0) + 1 };
        }
        try {
          // A reset is successful only when its write succeeds; otherwise the incident continues.
          if (stateRead && report.status !== "cancelled") {
            const next = report.status === "success" ? { ...state, consecutiveFailures: 0, alerted: false,
              ...(report.boundaryMisses === 0 && state.consecutiveBoundaryMisses !== undefined
                ? { consecutiveBoundaryMisses: 0, boundaryAlerted: false } : {}) } : state;
            await store.write(next);
            state = next;
            pendingWrite = false;
          }
        } catch (error) {
          if (report.status === "success") {
            report.status = "failure";
            report.failedStage = "monitor_state";
            report.error = safeError(error);
            state = { ...state, consecutiveFailures: state.consecutiveFailures + 1 };
          }
          pendingWrite = true;
          log({ event: "ingestion.monitor_error", error: safeError(error) });
        }
        report.consecutiveFailures = state.consecutiveFailures;
        report.consecutiveBoundaryMisses = state.consecutiveBoundaryMisses ?? 0;
        report.message = report.status === "failure" ? `Cycle failed at ${report.failedStage}: ${report.error}`
          : report.status === "cancelled" ? "Cycle cancelled" : "Cycle completed";
        report.durationMs = Math.max(0, now() - started);
        for (const incident of [
          { needed: report.status === "failure" && state.consecutiveFailures >= threshold,
            flag: "alerted", status: "alertStatus", type: "failure" },
          { needed: report.status !== "cancelled" && report.boundaryMisses > 0 && report.consecutiveBoundaryMisses >= threshold,
            flag: "boundaryAlerted", status: "boundaryAlertStatus", type: "polling_interval" },
        ] as const) {
          if (!incident.needed) continue;
          if (state[incident.flag]) report[incident.status] = "already-sent";
          else if (!options.sendAlert) report[incident.status] = "unconfigured";
          else {
            try {
              await options.sendAlert({ ...report, alertType: incident.type });
              report[incident.status] = "sent";
              state = { ...state, [incident.flag]: true };
              pendingWrite = true;
            } catch (error) {
              report[incident.status] = "failed";
              log({ event: "ingestion.monitor_error", error: safeError(error) });
            }
            // Confirmed delivery is not a webhook failure if its database acknowledgment fails.
            if (report[incident.status] === "sent" && stateRead) {
              try {
                await store.write(state);
                pendingWrite = false;
              } catch (error) {
                log({ event: "ingestion.monitor_error", error: safeError(error) });
              }
            }
          }
        }
        report.durationMs = Math.max(0, now() - started);
        log(report);
        return report;
      } finally {
        running = false;
      }
    },
  };
}
