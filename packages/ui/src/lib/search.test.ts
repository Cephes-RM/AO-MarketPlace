import { describe, expect, it } from "vitest";
import {
  EMPTY_SEARCH_RESULTS,
  flattenSearchGroups,
  moveHighlight,
  toSearchGroups,
} from "./search";

const results = {
  players: [{ id: "p1", name: "CerberoS", rating: 85 }],
  guilds: [{ id: "g1", name: "Ruthless Reign" }],
  alliances: [{ id: "a1", name: "Bozy Smallec" }],
};

describe("toSearchGroups", () => {
  it("separates players, guilds and alliances, players first", () => {
    expect(toSearchGroups(results).map((group) => group.label)).toEqual([
      "Players",
      "Guilds",
      "Alliances",
    ]);
  });

  it("routes each kind to its own page", () => {
    const [players, guilds, alliances] = toSearchGroups(results);

    expect(players?.options[0]?.href).toBe("/players/p1");
    expect(guilds?.options[0]?.href).toBe("/guilds/g1");
    expect(alliances?.options[0]?.href).toBe("/alliances/a1");
  });

  it("encodes ids so an odd Albion id cannot break the URL", () => {
    const [group] = toSearchGroups({ ...EMPTY_SEARCH_RESULTS, guilds: [{ id: "a b/c", name: "X" }] });

    expect(group?.options[0]?.href).toBe("/guilds/a%20b%2Fc");
  });

  it("drops empty groups so no heading shows without rows", () => {
    const groups = toSearchGroups({ ...EMPTY_SEARCH_RESULTS, players: results.players });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("Players");
  });

  it("returns nothing for empty or missing results", () => {
    expect(toSearchGroups(EMPTY_SEARCH_RESULTS)).toEqual([]);
    expect(toSearchGroups(null)).toEqual([]);
  });

  it("shows a player's rating as the row detail", () => {
    expect(toSearchGroups(results)[0]?.options[0]?.detail).toBe("Rating 85");
  });
});

describe("flattenSearchGroups", () => {
  it("lists every option in display order", () => {
    expect(flattenSearchGroups(toSearchGroups(results)).map((option) => option.name)).toEqual([
      "CerberoS",
      "Ruthless Reign",
      "Bozy Smallec",
    ]);
  });
});

describe("moveHighlight", () => {
  it("moves down and wraps at the end", () => {
    expect(moveHighlight(0, 1, 3)).toBe(1);
    expect(moveHighlight(2, 1, 3)).toBe(0);
  });

  it("moves up and wraps at the start", () => {
    expect(moveHighlight(0, -1, 3)).toBe(2);
  });

  it("has nothing to highlight when there are no options", () => {
    expect(moveHighlight(0, 1, 0)).toBe(-1);
  });
});
