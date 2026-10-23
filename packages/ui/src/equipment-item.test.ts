import { describe, expect, it } from "vitest";
import { equipmentItemIconUrl } from "./equipment-item-icon";
import { equipmentItemName } from "./equipment-item-name";

describe("equipmentItemIconUrl", () => {
  it("uses Albion's render service and percent-encodes enchanted IDs", () => {
    const url = new URL(equipmentItemIconUrl("T4_MAIN_SWORD@1", 5)!);
    expect(url.origin).toBe("https://render.albiononline.com");
    expect(url.pathname).toBe("/v1/item/T4_MAIN_SWORD%401.png");
    expect(url.searchParams.get("quality")).toBe("5");
    expect(url.searchParams.get("size")).toBe("128");
  });

  it.each([1, 2, 3, 4, 5])("preserves recorded quality %s", (quality) => {
    expect(new URL(equipmentItemIconUrl("T4_BAG", quality)!).searchParams.get("quality"))
      .toBe(String(quality));
  });

  it.each([undefined, 0, 6, -1, 2.5, NaN, Infinity])("omits unknown or invalid quality %s", (quality) => {
    expect(new URL(equipmentItemIconUrl("T4_BAG", quality)!).searchParams.has("quality"))
      .toBe(false);
  });

  it("trims the ID without changing its tier or enchantment", () => {
    expect(new URL(equipmentItemIconUrl(" T8_ARMOR_CLOTH_SET1@3 ", 2)!).pathname)
      .toBe("/v1/item/T8_ARMOR_CLOTH_SET1%403.png");
  });

  it("encodes path and query characters instead of changing the host or parameters", () => {
    const url = new URL(equipmentItemIconUrl("bad/id?quality=5#fragment", 2)!);
    expect(url.origin).toBe("https://render.albiononline.com");
    expect(url.pathname).toBe("/v1/item/bad%2Fid%3Fquality%3D5%23fragment.png");
    expect(url.searchParams.get("quality")).toBe("2");
    expect(url.hash).toBe("");
  });

  it.each(["", " ", "\uD800"])("avoids requests for unusable IDs %j", (id) => {
    expect(equipmentItemIconUrl(id, 1)).toBeNull();
  });
});

describe("equipmentItemName", () => {
  it("uses the upstream English item name", () => {
    expect(equipmentItemName("T4_MAIN_SWORD")).toBe("T4 · Adept's Broadsword");
  });

  it("reuses the base name while preserving enchantment", () => {
    expect(equipmentItemName(" T6_MAIN_CURSEDSTAFF_AVALON@1 "))
      .toBe("T6.1 · Master's Shadowcaller");
  });

  it("does not label an unenchanted item as enchanted", () => {
    expect(equipmentItemName("T4_MAIN_SWORD@0")).toBe("T4 · Adept's Broadsword");
  });

  it("keeps new or unknown items readable", () => {
    expect(equipmentItemName("T8_UNKNOWN_NEW_HELMET@3"))
      .toBe("T8.3 · UNKNOWN NEW HELMET");
  });

  it.each(["", " "])("handles empty IDs %j", (id) => {
    expect(equipmentItemName(id)).toBe("Unknown item");
  });

  it.each(["__proto__", "constructor"])("does not read inherited catalogue properties: %s", (id) => {
    expect(typeof equipmentItemName(id)).toBe("string");
    expect(equipmentItemName(id)).not.toContain("[object Object]");
  });
});
