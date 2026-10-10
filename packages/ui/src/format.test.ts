import { describe, expect, it } from "vitest";
import { fameRatio, formatFame, formatItemType } from "./format";

describe("formatFame", () => {
  it.each([1234567, 1234567n, "1234567", " 1234567 "])("formats string, bigint and number: %s", (value) => {
    expect(formatFame(value)).toBe("1,234,567");
  });
  it.each([0, 0n, "0"])("preserves zero %s", (value) => expect(formatFame(value)).toBe("0"));
  it("preserves integers beyond number precision", () => {
    expect(formatFame("900719925474099312345")).toBe("900,719,925,474,099,312,345");
  });
  it.each([null, undefined, {}, true, "", " ", "invalid", "12.5", "1e6", -1, -1n, "-1", 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects malformed fame %s", (value) => {
    expect(formatFame(value)).toBe("Unavailable");
  });
});

describe("fameRatio", () => {
  it.each([[3, 2, "1.50"], ["5", "3", "1.67"], [1n, 8n, "0.13"], [0, 20, "0.00"]])("formats %s / %s", (kills, deaths, expected) => {
    expect(fameRatio(kills, deaths)).toBe(expected);
  });
  it.each([0, "0", 0n])("handles a player who has never died (%s)", (deaths) => {
    expect(fameRatio("10000", deaths)).toBe("∞");
    expect(fameRatio(0, deaths)).toBe("—");
  });
  it("does not lose precision for large fame values", () => {
    expect(fameRatio(3n * 10n ** 40n, 10n ** 40n)).toBe("3.00");
  });
  it.each([["", 1], [1, null], [-1, 1], [1, -1], [1.5, 2], [1, "bad"], [Infinity, 1]])("rejects malformed values %s / %s", (kills, deaths) => {
    expect(fameRatio(kills, deaths)).toBe("Unavailable");
  });
});

describe("formatItemType", () => {
  it.each([
    ["T4_MAIN_SWORD", "T4 · MAIN SWORD"],
    ["T8_ARMOR_CLOTH_SET1@3", "T8.3 · ARMOR CLOTH SET1"],
    [" T6_OFF_SHIELD@0 ", "T6.0 · OFF SHIELD"],
    ["UNIQUE_ITEM_CODE", "UNIQUE ITEM CODE"],
  ])("formats %s", (input, expected) => expect(formatItemType(input)).toBe(expected));
  it.each([undefined, null, "", " ", 123, {}])("handles a missing or malformed item %s", (input) => {
    expect(formatItemType(input)).toBe("Unknown item");
  });
});
