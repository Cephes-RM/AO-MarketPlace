import { createAlbionClient } from "@albion/albion-client";
import type { AlbionEventPlayer, AlbionKillboardEvent } from "@albion/albion-client";
import { parseLoadout } from "@albion/db/loadout";
import { describe, expect, it } from "vitest";
import eventsFixture from "../../../fixtures/albion-api/europe/events-sample.json";
import { mapKillEvents, stripEmpty, toPlayerLoadout } from "./ingest-mapping.ts";

type ApiRecord = Record<string, unknown>;

// Real Europe events fetched through the client exactly as the worker does.
async function fetchFixtureEvents() {
  const client = createAlbionClient({
    region: "europe",
    includeRaw: true,
    fetch: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => structuredClone(eventsFixture),
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  });
  return (await client.gameinfo.getRecentEventsTolerant()).records;
}

function fighter(id: string, extra: Partial<AlbionEventPlayer> = {}): AlbionEventPlayer {
  return { id, name: id.toUpperCase(), ...extra };
}

function event(id: number, extra: Partial<AlbionKillboardEvent> = {}): AlbionKillboardEvent {
  return {
    id,
    occurredAt: "2026-09-25T12:00:00.000Z",
    location: null,
    killer: fighter("killer"),
    victim: fighter("victim"),
    participants: [],
    raw: { EventId: id },
    ...extra,
  };
}

describe("toPlayerLoadout", () => {
  it("maps every equipment slot into the stored PlayerLoadout shape", () => {
    const item = (type: string) => ({ type, count: 1, quality: 3 });
    expect(toPlayerLoadout({
      mainHand: item("MAIN"), offHand: item("OFF"), head: item("HEAD"), armor: item("ARMOR"),
      shoes: item("SHOES"), bag: item("BAG"), cape: item("CAPE"), mount: item("MOUNT"),
      potion: { type: "POTION", count: 12, quality: 1 }, food: { type: "FOOD", count: 7, quality: 1 },
    })).toEqual({
      main_hand: { id: "MAIN", count: 1, quality: 3 },
      off_hand: { id: "OFF", count: 1, quality: 3 },
      head: { id: "HEAD", count: 1, quality: 3 },
      body: { id: "ARMOR", count: 1, quality: 3 },
      shoe: { id: "SHOES", count: 1, quality: 3 },
      bag: { id: "BAG", count: 1, quality: 3 },
      cape: { id: "CAPE", count: 1, quality: 3 },
      mount: { id: "MOUNT", count: 1, quality: 3 },
      potion: { id: "POTION", count: 12, quality: 1 },
      food: { id: "FOOD", count: 7, quality: 1 },
    });
  });

  it("omits empty slots and invalid quality or count", () => {
    expect(toPlayerLoadout(undefined)).toEqual({});
    expect(toPlayerLoadout({
      mainHand: { type: "T8_MAIN_SWORD", quality: 0, count: 1 },
      offHand: null,
      armor: { type: "T8_ARMOR_PLATE_SET1", quality: 4, count: 0 },
    })).toEqual({
      main_hand: { id: "T8_MAIN_SWORD", count: 1 },
      body: { id: "T8_ARMOR_PLATE_SET1", quality: 4 },
    });
  });

  it("matches parseLoadout on the original PascalCase payload for real Europe gear", async () => {
    const records = await fetchFixtureEvents();
    for (const record of records) {
      const raw = record.raw as ApiRecord;
      const people = [record.killer, record.victim, ...record.participants];
      const rawPeople = [raw.Killer, raw.Victim, ...(raw.Participants as unknown[])] as ApiRecord[];
      people.forEach((person, index) => {
        const loadout = toPlayerLoadout(person.equipment);
        expect(loadout).toEqual(parseLoadout(rawPeople[index].Equipment));
        expect(parseLoadout(loadout)).toEqual(loadout);
      });
    }
  });
});

describe("stripEmpty", () => {
  it("drops empty fields at any depth and keeps everything else unchanged", () => {
    expect(stripEmpty({
      EventId: 1, Location: null, GuildName: "", Inventory: [], GvGMatch: {},
      Killer: { KillFame: 0, Alive: false, Equipment: { OffHand: null, MainHand: { Type: "SWORD", ActiveSpells: [] } } },
      Participants: [{ Id: "a", Avatar: "" }, {}],
      Victim: { Inventory: [{ Type: "T4_RUNE", Count: 31, Quality: 0 }, null, null] },
    })).toEqual({
      EventId: 1,
      Killer: { KillFame: 0, Alive: false, Equipment: { MainHand: { Type: "SWORD" } } },
      Participants: [{ Id: "a" }],
      Victim: { Inventory: [{ Type: "T4_RUNE", Count: 31, Quality: 0 }] },
    });
  });
});

describe("mapKillEvents", () => {
  it("maps real Europe events with raw payload, battleId and occurredAt on every event", async () => {
    const records = await fetchFixtureEvents();
    const { batch, skipped } = mapKillEvents(records, "europe");

    expect(skipped).toEqual([]);
    expect(batch.events).toHaveLength(records.length);
    for (const stored of batch.events) {
      const source = records.find((record) => String(record.id) === stored.id)!;
      expect(stored.raw).toEqual(stripEmpty(source.raw));
      expect(JSON.stringify(stored.raw)).not.toMatch(/null|""|\[\]|\{\}/);
      expect(stored.raw).toHaveProperty("Killer.LifetimeStatistics");
      expect(stored.battleId).toBe(String(source.battleId));
      expect(stored.occurredAt).toEqual(new Date(source.occurredAt));
      expect(stored.killerLoadout).toEqual(toPlayerLoadout(source.killer.equipment));
      expect(stored.victimLoadout).toEqual(toPlayerLoadout(source.victim.equipment));
      expect(stored.participants.map((participant) => participant.loadout))
        .toEqual(source.participants.map((participant) => toPlayerLoadout(participant.equipment)));
    }
    expect(batch.players.every((player) => player.region === "europe")).toBe(true);
    expect(batch.players.map((player) => player.id)).toEqual(
      expect.arrayContaining(records.flatMap((record) => [record.killer.id, record.victim.id])),
    );
  });

  it("maps fight details without copying event fame onto players", () => {
    const killer = fighter("killer", {
      guildId: "g1", guildName: "Guild", allianceId: "a1", allianceName: "Alliance",
      killFame: 999_999, deathFame: 5, averageItemPower: 1300.4, damageDone: 812.6,
      supportHealingDone: 3_000_000_000, equipment: { mainHand: { type: "SWORD", quality: 5, count: 1 } },
    });
    const helper = fighter("helper", { killFame: 2_000, damageDone: 10 });
    const { batch } = mapKillEvents([event(7, {
      battleId: 900, location: "Martlock", totalVictimKillFame: 12_345.9,
      killer, victim: fighter("victim", { guildId: "g2" }),
      participants: [killer, helper, helper],
    })], "europe");

    expect(batch.players).toEqual([
      { id: "killer", name: "KILLER", region: "europe" },
      { id: "victim", name: "VICTIM", region: "europe" },
      { id: "helper", name: "HELPER", region: "europe" },
    ]);
    expect(batch.alliances).toEqual([{ id: "a1", name: "Alliance", nameIsFallback: false }]);
    expect(batch.guilds).toEqual([
      { id: "g1", name: "Guild", nameIsFallback: false, allianceId: "a1" },
      { id: "g2", name: "g2", nameIsFallback: true, allianceId: null },
    ]);
    expect(batch.events[0]).toMatchObject({
      id: "7", killerId: "killer", victimId: "victim", battleId: "900", location: "Martlock",
      totalFame: 12_345n, killerItemPower: 1300.4, victimItemPower: null,
      killerLoadout: { main_hand: { id: "SWORD", quality: 5, count: 1 } }, victimLoadout: {},
    });
    expect(batch.events[0].participants).toEqual([
      { playerId: "killer", damageDone: 813, healingDone: null, killFame: 999_999n, isPrimary: true,
        itemPower: 1300.4, loadout: { main_hand: { id: "SWORD", quality: 5, count: 1 } } },
      { playerId: "helper", damageDone: 10, healingDone: null, killFame: 2_000n, isPrimary: false,
        itemPower: null, loadout: {} },
    ]);
  });

  it("keeps the names from the most recent fight regardless of feed order", () => {
    const newer = event(2, {
      occurredAt: "2026-09-25T13:00:00Z",
      killer: fighter("killer", { name: "Renamed", guildId: "g1", guildName: "New guild", allianceId: "a1", allianceName: "New alliance" }),
    });
    const older = event(1, {
      occurredAt: "2026-09-25T12:00:00Z",
      killer: fighter("killer", { name: "Original", guildId: "g1", guildName: "Old guild", allianceId: "a1", allianceName: "Old alliance" }),
    });
    const { batch } = mapKillEvents([newer, older], "europe");

    expect(batch.players.find((player) => player.id === "killer")?.name).toBe("Renamed");
    expect(batch.guilds).toEqual([{ id: "g1", name: "New guild", nameIsFallback: false, allianceId: "a1" }]);
    expect(batch.alliances).toEqual([{ id: "a1", name: "New alliance", nameIsFallback: false }]);
    expect(batch.events.map((stored) => stored.id)).toEqual(["1", "2"]);
  });

  it("flags ID and tag stand-ins so they never replace a real name", () => {
    const named = event(1, {
      occurredAt: "2026-09-25T12:00:00Z",
      killer: fighter("killer", { guildId: "g1", guildName: "Real guild", allianceId: "a1", allianceName: "Real alliance" }),
    });
    const idsOnly = event(2, {
      occurredAt: "2026-09-25T13:00:00Z",
      killer: fighter("killer", { guildId: "g1", allianceId: "a1", allianceTag: "TAG" }),
      victim: fighter("victim", { guildId: "g2", allianceId: "a2" }),
    });

    expect(mapKillEvents([idsOnly], "europe").batch).toMatchObject({
      alliances: [
        { id: "a1", name: "TAG", nameIsFallback: true },
        { id: "a2", name: "a2", nameIsFallback: true },
      ],
      guilds: [
        { id: "g1", name: "g1", nameIsFallback: true, allianceId: "a1" },
        { id: "g2", name: "g2", nameIsFallback: true, allianceId: "a2" },
      ],
    });

    // The ID-only fight is newer, so it is applied last; the real names still survive it.
    const { batch } = mapKillEvents([idsOnly, named], "europe");
    expect(batch.alliances).toContainEqual({ id: "a1", name: "Real alliance", nameIsFallback: false });
    expect(batch.guilds).toContainEqual({ id: "g1", name: "Real guild", nameIsFallback: false, allianceId: "a1" });
  });

  it("skips events without a usable timestamp or raw payload", () => {
    const { batch, skipped } = mapKillEvents([
      event(1, { occurredAt: "not a date" }),
      event(2, { raw: undefined }),
      event(3),
    ], "europe");

    expect(batch.events.map((stored) => stored.id)).toEqual(["3"]);
    expect(skipped).toEqual([
      { eventId: 1, reason: "invalid_timestamp" },
      { eventId: 2, reason: "missing_raw_payload" },
    ]);
  });
});
