import { describe, expect, it } from "vitest";
import type { Player } from "../../lib/api";
import { filterPlayers, parseCodName, playerCountryOptions, sortPlayers } from "./playerDiscovery";

describe("parseCodName", () => {
  it("turns supported COD color controls into text-only segments", () => {
    expect(parseCodName("^1Red^7White^2Green")).toEqual({
      plainText: "RedWhiteGreen",
      segments: [
        { color: "1", text: "Red" },
        { color: "7", text: "White" },
        { color: "2", text: "Green" },
      ],
    });
  });

  it("preserves unknown controls and markup-like input as literal text", () => {
    expect(parseCodName("^x<script>alert(1)</script>")).toEqual({
      plainText: "^x<script>alert(1)</script>",
      segments: [{ color: null, text: "^x<script>alert(1)</script>" }],
    });
  });

  it("provides a readable fallback when a name contains only color controls", () => {
    expect(parseCodName("^1^2")).toEqual({
      plainText: "Unknown player",
      segments: [{ color: null, text: "Unknown player" }],
    });
  });
});

describe("sortPlayers", () => {
  const players: Player[] = [
    {
      player_id: 3,
      playername: "^1Beta",
      last_seen: "not-a-date",
    },
    {
      player_id: 2,
      playername: "alpha",
      last_seen: "2026-01-02T00:00:00Z",
      visits: 20,
      admin: 90,
    },
    {
      player_id: 1,
      playername: "^2Alpha",
      last_seen: "2026-01-03T00:00:00Z",
      visits: 20,
      admin: 50,
    },
  ];

  it("uses deterministic player IDs to break equivalent name ties", () => {
    expect(sortPlayers(players, "name").map((player) => player.player_id)).toEqual([1, 2, 3]);
  });

  it("puts missing or invalid metadata last for numeric and date sorts", () => {
    expect(sortPlayers(players, "visits").map((player) => player.player_id)).toEqual([1, 2, 3]);
    expect(sortPlayers(players, "last-seen").map((player) => player.player_id)).toEqual([1, 2, 3]);
  });

  it("orders admin level from highest to lowest and puts a missing level last", () => {
    expect(sortPlayers(players, "admin").map((player) => player.player_id)).toEqual([2, 1, 3]);
  });

  it("orders player level by rank XP and puts an unranked player last", () => {
    const levelXp = new Map([
      [3, 500],
      [1, 100],
    ]);
    expect(sortPlayers(players, "level", levelXp).map((player) => player.player_id)).toEqual([
      3, 1, 2,
    ]);
  });

  it("does not mutate the API response array", () => {
    const originalOrder = players.map((player) => player.player_id);
    sortPlayers(players, "name");
    expect(players.map((player) => player.player_id)).toEqual(originalOrder);
  });
});

describe("filterPlayers", () => {
  const players: Player[] = [
    { player_id: 1, playername: "alpha", country: "de" },
    { player_id: 2, playername: "beta", country: "UK" },
    { player_id: 3, playername: "gamma" },
  ];

  it("keeps only the player matching an all-digit id", () => {
    expect(filterPlayers(players, { country: "", id: "2" }).map((p) => p.player_id)).toEqual([2]);
  });

  it("ignores an id that is not all digits", () => {
    expect(filterPlayers(players, { country: "", id: "2x" })).toBe(players);
  });

  it("compares countries case-insensitively and treats UK as GB", () => {
    expect(filterPlayers(players, { country: "gb", id: "" }).map((p) => p.player_id)).toEqual([2]);
    expect(filterPlayers(players, { country: "De", id: "" }).map((p) => p.player_id)).toEqual([1]);
  });

  it("applies the id and country filters together", () => {
    expect(filterPlayers(players, { country: "GB", id: "1" })).toEqual([]);
    expect(filterPlayers(players, { country: "DE", id: "1" }).map((p) => p.player_id)).toEqual([1]);
  });

  it("returns the same array instance when no filter applies", () => {
    expect(filterPlayers(players, { country: "  ", id: "" })).toBe(players);
  });
});

describe("playerCountryOptions", () => {
  it("lists distinct known countries sorted by label and skips players without one", () => {
    expect(
      playerCountryOptions([
        { player_id: 1, playername: "a", country: "US" },
        { player_id: 2, playername: "b", country: "de" },
        { player_id: 3, playername: "c", country: "DE" },
        { player_id: 4, playername: "d" },
      ]),
    ).toEqual([
      { code: "DE", label: "Germany" },
      { code: "US", label: "United States" },
    ]);
  });

  it("falls back to the code when it is not a known region", () => {
    expect(
      playerCountryOptions([{ player_id: 1, playername: "a", country: "Exampleland" }]),
    ).toEqual([{ code: "EXAMPLELAND", label: "EXAMPLELAND" }]);
  });
});
