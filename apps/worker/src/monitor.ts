export interface MonitorState {
  consecutiveFailures: number;
  alerted: boolean;
}

export interface StateStore {
  read(): Promise<MonitorState>;
  write(state: MonitorState): Promise<void>;
}

export interface RunReport {
  event: "ingestion.run";
  runId: string;
  region: string;
  status: "success" | "failure";
  fetched: number;
  written: number;
  skipped: number;
  skipReasons: Record<string, number>;
  retries: number;
  durationMs: number;
  failedStage: string | null;
  error: string | null;
  consecutiveFailures: number;
  alertStatus: "not-needed" | "sent" | "already-sent" | "unconfigured" | "failed";
}

export interface RunContext {
  stage<T>(name: string, action: () => Promise<T> | T): Promise<T>;
  fetched(count: number): void;
  written(count: number): void;
  skip(reason: string, count?: number): void;
  retry(): void;
}

interface MonitorOptions {
  region: string;
  failureThreshold?: number;
  store?: StateStore;
  sendAlert?: (report: RunReport) => Promise<void>;
  log?: (entry: RunReport | { event: "ingestion.monitor_error"; error: string }) => void;
  now?: () => number;
}

/** URLs may contain database passwords or webhook tokens; never log them. */
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown ingestion error";
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

  return {
    async run(work: (context: RunContext) => Promise<void>): Promise<RunReport> {
      if (running) throw new Error("An ingestion cycle is already running");
      running = true;
      const started = now();
      let stage = "monitor_state";
      let state: MonitorState = { consecutiveFailures: 0, alerted: false };
      const report: RunReport = {
        event: "ingestion.run", runId: new Date(started).toISOString(), region: options.region,
        status: "success", fetched: 0, written: 0, skipped: 0, skipReasons: {},
        retries: 0, durationMs: 0, failedStage: null, error: null,
        consecutiveFailures: 0, alertStatus: "not-needed",
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
      };

      try {
        try {
          state = await store.read();
          await work(context);
          state = { consecutiveFailures: 0, alerted: false };
        } catch (error) {
          report.status = "failure";
          report.failedStage = stage;
          report.error = safeError(error);
          state = { ...state, consecutiveFailures: state.consecutiveFailures + 1 };
        }
        try {
          await store.write(state);
        } catch (error) {
          if (report.status === "success") {
            report.status = "failure";
            report.failedStage = "monitor_state";
            report.error = safeError(error);
            state = { consecutiveFailures: 1, alerted: false };
          }
          log({ event: "ingestion.monitor_error", error: safeError(error) });
        }
        report.consecutiveFailures = state.consecutiveFailures;
        report.durationMs = Math.max(0, now() - started);
        if (report.status === "failure" && state.consecutiveFailures >= threshold) {
          if (state.alerted) report.alertStatus = "already-sent";
          else if (!options.sendAlert) report.alertStatus = "unconfigured";
          else {
            try {
              await options.sendAlert({ ...report });
              report.alertStatus = "sent";
              // Persist only after delivery; retry an unsuccessful webhook next cycle.
              await store.write({ ...state, alerted: true });
            } catch (error) {
              report.alertStatus = "failed";
              log({ event: "ingestion.monitor_error", error: safeError(error) });
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
