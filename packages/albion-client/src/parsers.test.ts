import { describe, expect, it } from "vitest";
import {
  parseKillboardEvent,
  parsePlayerProfile,
  parseSearchResult,
} from "./parsers.ts";

describe("parsePlayerProfile", () => {
  it("maps Albion field names and omits empty optional fields", () => {
    expect(
      parsePlayerProfile({
        Id: "player-1",
        Name: "Cerber0S",
        GuildName: "A-T-L-A-S",
        GuildId: "guild-1",
        AllianceName: "",
        KillFame: 2_753_802_099,
        DeathFame: 1_711_172_046,
        FameRatio: 1.61,
      }),
    ).toEqual({
      id: "player-1",
      name: "Cerber0S",
      guildName: "A-T-L-A-S",
      guildId: "guild-1",
      killFame: 2_753_802_099,
      deathFame: 1_711_172_046,
      fameRatio: 1.61,
    });
  });
});

describe("parseKillboardEvent", () => {
  it("parses nested players, equipment, participants, and nullable values", () => {
    expect(
      parseKillboardEvent({
        EventId: 42,
        TimeStamp: "2026-09-18T12:00:00Z",
        Location: null,
        Killer: {
          Id: "killer-1",
          Name: "Killer",
          Equipment: {
            MainHand: { Type: "MAIN_SWORD", Count: 1, Quality: 3 },
            OffHand: null,
          },
        },
        Victim: { Id: "victim-1", Name: "Victim" },
        Participants: [{ Id: "participant-1", Name: "Participant" }],
        GroupMembers: [{ Id: "member-1", Name: "Member" }],
      }),
    ).toMatchObject({
      id: 42,
      occurredAt: "2026-09-18T12:00:00Z",
      location: null,
      killer: {
        id: "killer-1",
        name: "Killer",
        equipment: {
          mainHand: { type: "MAIN_SWORD", count: 1, quality: 3 },
          offHand: null,
        },
      },
      victim: { id: "victim-1", name: "Victim" },
      participants: [{ id: "participant-1", name: "Participant" }],
      groupMembers: [{ id: "member-1", name: "Member" }],
    });
  });
});

describe("parseSearchResult", () => {
  it("rejects malformed API payloads", () => {
    expect(() =>
      parseSearchResult({ players: [], guilds: "not-an-array" }),
    ).toThrow("Invalid Albion guilds: expected an array.");
  });
});
