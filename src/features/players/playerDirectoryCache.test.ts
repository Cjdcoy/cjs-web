import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Player } from "../../lib/api";
import {
  cachePlayerDirectory,
  clearPlayerDirectoryCache,
  getCachedPlayer,
  loadPlayerDirectoryEntry,
} from "./playerDirectoryCache";

const redsherpa: Player = {
  country: "ES",
  last_seen: "2026-08-30 00:58:54",
  player_id: 141172,
  playername: "REDsherpa",
};

describe("playerDirectoryCache", () => {
  beforeEach(() => clearPlayerDirectoryCache());

  it("reuses metadata already loaded by the player directory", async () => {
    const listPlayers = vi.fn<typeof api.players>();
    cachePlayerDirectory("jh", [redsherpa]);

    await expect(
      loadPlayerDirectoryEntry(listPlayers, "jh", 141172, new AbortController().signal),
    ).resolves.toEqual(redsherpa);
    expect(listPlayers).not.toHaveBeenCalled();
  });

  it("loads and caches the complete directory for a direct profile visit", async () => {
    const listPlayers = vi.fn<typeof api.players>().mockResolvedValue([redsherpa]);

    await expect(
      loadPlayerDirectoryEntry(listPlayers, "jh", 141172, new AbortController().signal),
    ).resolves.toEqual(redsherpa);
    expect(listPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "last-seen", source: "jh" }),
    );
    expect(getCachedPlayer("jh", 141172)).toEqual(redsherpa);

    await expect(
      loadPlayerDirectoryEntry(listPlayers, "jh", 999, new AbortController().signal),
    ).resolves.toBeNull();
    expect(listPlayers).toHaveBeenCalledOnce();
  });
});
