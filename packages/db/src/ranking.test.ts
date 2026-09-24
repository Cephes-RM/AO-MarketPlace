import { describe, expect, it } from "vitest";
import { byAverageRating, byPlayerRating, rankByAverageRating, rankingRow } from "./ranking";

const player = (name: string, rating: number, killFame: number) => ({
  name,
  rating,
  killFame: BigInt(killFame),
});

describe("byPlayerRating", () => {
  it("ranks on rating, not kill fame", () => {
    const ranked = [
      player("Farmer", 40, 900_000_000),
      player("Duelist", 95, 1_000),
      player("Regular", 70, 50_000_000),
    ].sort(byPlayerRating);

    expect(ranked.map((p) => p.name)).toEqual(["Duelist", "Regular", "Farmer"]);
  });

  it("uses kill fame only to break a tie in rating, then the name", () => {
    const ranked = [
      player("Bravo", 80, 100),
      player("Alpha", 80, 100),
      player("Heavy", 80, 500),
    ].sort(byPlayerRating);

    expect(ranked.map((p) => p.name)).toEqual(["Heavy", "Alpha", "Bravo"]);
  });
});

const entity = (name: string) => ({ id: name.toLowerCase(), name });

describe("rankingRow", () => {
  it("averages the members' ratings", () => {
    expect(rankingRow(entity("Guild"), [80, 90, 100])).toMatchObject({
      memberCount: 3,
      averageRating: 90,
    });
  });

  it("has no average when there are no members", () => {
    expect(rankingRow(entity("Empty"), [])).toMatchObject({
      memberCount: 0,
      averageRating: null,
    });
  });
});

describe("rankByAverageRating", () => {
  it("ranks the highest average rating first", () => {
    const ranked = rankByAverageRating(
      [
        rankingRow(entity("Casuals"), [10, 20]),
        rankingRow(entity("Elite"), [95, 90]),
        rankingRow(entity("Middling"), [50, 60]),
      ],
      5,
    );

    expect(ranked.map((row) => row.name)).toEqual(["Elite", "Middling", "Casuals"]);
  });

  it("ranks on the average, not the total, so a big roster cannot buy its way up", () => {
    const ranked = rankByAverageRating(
      [
        rankingRow(entity("Zerg"), Array.from({ length: 50 }, () => 40)),
        rankingRow(entity("Small elite"), [90, 90]),
      ],
      5,
    );

    expect(ranked[0]?.name).toBe("Small elite");
  });

  it("puts empty rosters last, even below a roster averaging zero", () => {
    const ranked = rankByAverageRating(
      [rankingRow(entity("Empty"), []), rankingRow(entity("Unrated"), [0, 0])],
      5,
    );

    expect(ranked.map((row) => row.name)).toEqual(["Unrated", "Empty"]);
  });

  it("breaks ties on roster size, then on name", () => {
    const ranked = rankByAverageRating(
      [
        rankingRow(entity("Bravo"), [70]),
        rankingRow(entity("Alpha"), [70]),
        rankingRow(entity("Large"), [70, 70, 70]),
      ],
      5,
    );

    expect(ranked.map((row) => row.name)).toEqual(["Large", "Alpha", "Bravo"]);
  });

  it("keeps only the top entries without mutating the input", () => {
    const rows = [
      rankingRow(entity("A"), [10]),
      rankingRow(entity("B"), [30]),
      rankingRow(entity("C"), [20]),
    ];

    expect(rankByAverageRating(rows, 2).map((row) => row.name)).toEqual(["B", "C"]);
    expect(rows.map((row) => row.name)).toEqual(["A", "B", "C"]);
    expect(byAverageRating(rows[1]!, rows[0]!)).toBeLessThan(0);
  });
});
