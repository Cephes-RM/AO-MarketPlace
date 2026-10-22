import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fileStateStore } from "./state";

it("reads legacy state and persists boundary incident fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "albion-monitor-state-"));
  try {
    const store = fileStateStore(join(directory, "state.json"));
    await store.write({ consecutiveFailures: 2, alerted: false });
    expect(await store.read()).toEqual({ consecutiveFailures: 2, alerted: false });
    const state = { consecutiveFailures: 0, alerted: false, consecutiveBoundaryMisses: 3, boundaryAlerted: true };
    await store.write(state);
    expect(await fileStateStore(join(directory, "state.json")).read()).toEqual(state);
    for (const invalid of [{ consecutiveBoundaryMisses: -1 }, { consecutiveBoundaryMisses: 1.5 }, { boundaryAlerted: "yes" }]) {
      await writeFile(join(directory, "state.json"), JSON.stringify({ ...state, ...invalid }));
      await expect(store.read()).rejects.toThrow("Invalid ingestion monitor state");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
