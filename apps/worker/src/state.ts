import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MonitorState, StateStore } from "./monitor";

/** Use a persistent volume when separate scheduled processes run this worker. */
export function fileStateStore(path: string): StateStore {
  return {
    async read() {
      let text: string;
      try { text = await readFile(path, "utf8"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { consecutiveFailures: 0, alerted: false };
        throw error;
      }
      const state: Partial<MonitorState> = JSON.parse(text);
      if (!Number.isSafeInteger(state.consecutiveFailures) || state.consecutiveFailures! < 0 || typeof state.alerted !== "boolean") {
        throw new Error("Invalid ingestion monitor state");
      }
      return state as MonitorState;
    },
    async write(state) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
      await rename(temporary, path);
    },
  };
}
