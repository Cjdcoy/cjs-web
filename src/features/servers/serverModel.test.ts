import { describe, expect, it } from "vitest";
import {
  filterServers,
  formatUpdatedTime,
  InvalidServerDashboardError,
  normalizeServerDashboard,
} from "./serverModel";

describe("server dashboard normalizer", () => {
  it("normalizes partial servers and computes omitted summary values", () => {
    const dashboard = normalizeServerDashboard({
      servers: [
        {
          domain: "cod2.example.invalid",
          ip: "203.0.113.10",
          port: 28_960,
          map: "mp_training",
          mapid: 101,
          game_type: "classic_jump",
          players: null,
          online: true,
        },
      ],
    });

    expect(dashboard).toMatchObject({
      omittedServerCount: 0,
      onlineServers: 1,
      totalPlayers: 0,
    });
    expect(dashboard.servers[0]).toMatchObject({
      connectionAddress: "cod2.example.invalid:28960",
      mapName: "mp_training",
      mode: "Classic Jump",
      playerCount: 0,
      players: null,
    });
  });

  it("drops unusable entries and safely normalizes malformed optional fields", () => {
    const dashboard = normalizeServerDashboard({
      servers: [
        null,
        {},
        {
          domain: "https://not-a-host.invalid/path",
          ip: "not a host",
          port: 70_000,
          map: "mp_partial",
          mapid: -1,
          game_type: 42,
          players: [null, { playername: "^2Runner", playerid: 7, ping: 38 }],
          player_count: "two",
          online: "yes",
        },
      ],
      online_servers: -3,
      total_players: "many",
    });

    expect(dashboard.omittedServerCount).toBe(2);
    expect(dashboard.totalPlayers).toBe(1);
    expect(dashboard.onlineServers).toBe(0);
    expect(dashboard.servers[0]).toMatchObject({
      connectionAddress: null,
      mapId: null,
      mode: "Mode unavailable",
      online: false,
      playerCount: 1,
      players: [{ id: 7, name: "Runner", ping: 38 }],
      port: null,
    });
  });

  it("rejects a malformed root payload with safe context", () => {
    expect(() => normalizeServerDashboard({ servers: "unavailable" })).toThrow(
      InvalidServerDashboardError,
    );
  });

  it("filters only servers that currently report players", () => {
    const dashboard = normalizeServerDashboard({
      servers: [
        { domain: "empty.invalid", map: "mp_empty", player_count: 0 },
        { domain: "busy.invalid", map: "mp_busy", player_count: 3 },
      ],
    });

    expect(filterServers(dashboard.servers, false)).toHaveLength(2);
    expect(filterServers(dashboard.servers, true).map((server) => server.domain)).toEqual([
      "busy.invalid",
    ]);
  });
});

describe("server update time", () => {
  it.each([
    [1_000, 1_000, "just now"],
    [1_000, 31_000, "30 seconds ago"],
    [1_000, 61_000, "1 minute ago"],
    [1_000, 121_000, "2 minutes ago"],
  ])("formats %s to %s as %s", (timestamp, now, expected) => {
    expect(formatUpdatedTime(timestamp, now)).toBe(expected);
  });
});
