import { describe, expect, it } from "vitest";
import type { Player } from "../../lib/api";
import { parseCodName, sortPlayers } from "./playerDiscovery";

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
    },
    {
      player_id: 1,
      playername: "^2Alpha",
      last_seen: "2026-01-03T00:00:00Z",
      visits: 20,
    },
  ];

  it("uses deterministic player IDs to break equivalent name ties", () => {
    expect(sortPlayers(players, "name").map((player) => player.player_id)).toEqual([1, 2, 3]);
  });

  it("puts missing or invalid metadata last for numeric and date sorts", () => {
    expect(sortPlayers(players, "visits").map((player) => player.player_id)).toEqual([1, 2, 3]);
    expect(sortPlayers(players, "last-seen").map((player) => player.player_id)).toEqual([1, 2, 3]);
  });

  it("does not mutate the API response array", () => {
    const originalOrder = players.map((player) => player.player_id);
    sortPlayers(players, "name");
    expect(players.map((player) => player.player_id)).toEqual(originalOrder);
  });
});
