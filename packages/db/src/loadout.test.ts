import { describe, expect, it } from "vitest";
import { parseLoadout } from "./loadout";

describe("parseLoadout", () => {
  it.each([null, undefined, {}, [], "invalid", 42])("returns an empty loadout for %j", (value) => {
    expect(parseLoadout(value)).toEqual({});
  });

  it("ignores unknown slots and items missing a usable type", () => {
    expect(parseLoadout({
      unknown: { id: "T4_MAIN_SWORD" },
      head: { quality: 3 }, body: { id: " " }, cape: null,
      mount: { Type: 123 }, potion: [], food: "T4_FOOD",
    })).toEqual({});
  });

  it("normalizes API slots and item fields", () => {
    expect(parseLoadout({
      MainHand: { Type: " T8_MAIN_SWORD@2 ", Quality: 5, Count: 1 },
      Armor: { Type: "T8_ARMOR_PLATE_SET1", Quality: 4 },
      Shoes: { Type: "T8_SHOES_PLATE_SET1" },
      Food: { Type: "T7_MEAL_OMELETTE", Count: 10 },
    })).toEqual({
      main_hand: { id: "T8_MAIN_SWORD@2", quality: 5, count: 1 },
      body: { id: "T8_ARMOR_PLATE_SET1", quality: 4 },
      shoe: { id: "T8_SHOES_PLATE_SET1" },
      food: { id: "T7_MEAL_OMELETTE", count: 10 },
    });
  });

  it("accepts stored fields and keeps the input unchanged", () => {
    const source = { head: { id: "T4_HEAD_LEATHER_SET1", quality: 3, count: 1, extra: true } };
    const snapshot = structuredClone(source);
    expect(parseLoadout(source)).toEqual({ head: { id: "T4_HEAD_LEATHER_SET1", quality: 3, count: 1 } });
    expect(source).toEqual(snapshot);
  });

  it.each([0, -1, 6, 1.5, "3", NaN])("omits invalid quality %s", (quality) => {
    expect(parseLoadout({ main_hand: { id: "T4_MAIN_SWORD", quality } })).toEqual({ main_hand: { id: "T4_MAIN_SWORD" } });
  });

  it.each([0, -1, 1.5, "2", NaN, Number.MAX_SAFE_INTEGER + 1])("omits invalid count %s", (count) => {
    expect(parseLoadout({ food: { id: "T7_MEAL_OMELETTE", count } })).toEqual({ food: { id: "T7_MEAL_OMELETTE" } });
  });
});
