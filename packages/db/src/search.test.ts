import { describe, expect, it } from "vitest";
import { MAX_SEARCH_LENGTH, normalizeSearchTerm } from "./search";

describe("normalizeSearchTerm", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeSearchTerm("  cerberos  ")).toBe("cerberos");
  });

  it("rejects a query that is too short to be useful", () => {
    expect(normalizeSearchTerm("a")).toBeNull();
    expect(normalizeSearchTerm(" ")).toBeNull();
    expect(normalizeSearchTerm("")).toBeNull();
  });

  it("accepts a two character query", () => {
    expect(normalizeSearchTerm("ce")).toBe("ce");
  });

  it("caps an overlong query", () => {
    expect(normalizeSearchTerm("x".repeat(200))).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("rejects anything that is not a string", () => {
    expect(normalizeSearchTerm(null)).toBeNull();
    expect(normalizeSearchTerm(undefined)).toBeNull();
    expect(normalizeSearchTerm(42)).toBeNull();
  });
});
