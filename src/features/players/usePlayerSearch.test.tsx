import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Player } from "../../lib/api";
import { usePlayerSearch } from "./usePlayerSearch";

describe("usePlayerSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the directory for a short query and debounces a meaningful search", async () => {
    const listPlayers = vi
      .fn<typeof api.players>()
      .mockResolvedValue([{ player_id: 1, playername: "Recent" }]);
    const searchPlayers = vi.fn<typeof api.searchPlayers>().mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ query }) =>
        usePlayerSearch({
          debounceMs: 50,
          listPlayers,
          query,
          searchPlayers,
          source: "jh",
        }),
      { initialProps: { query: "a" } },
    );

    expect(result.current.status).toBe("loading");
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "last-seen", source: "jh" }),
    );
    expect(result.current.players[0]?.playername).toBe("Recent");
    expect(searchPlayers).not.toHaveBeenCalled();

    rerender({ query: "alpha" });
    expect(result.current.status).toBe("debouncing");
    await act(async () => {
      vi.advanceTimersByTime(49);
    });
    expect(searchPlayers).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(searchPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, name: "alpha", source: "jh" }),
    );
    expect(result.current.status).toBe("success");
  });

  it("aborts an obsolete request and ignores its late result", async () => {
    const firstRequest = deferred<Player[]>();
    const secondRequest = deferred<Player[]>();
    const searchPlayers = vi.fn<typeof api.searchPlayers>((options) =>
      options.name === "alpha" ? firstRequest.promise : secondRequest.promise,
    );
    const { result, rerender } = renderHook(
      ({ query }) =>
        usePlayerSearch({
          debounceMs: 25,
          query,
          searchPlayers,
          source: "j4l",
        }),
      { initialProps: { query: "alpha" } },
    );

    await act(async () => {
      vi.advanceTimersByTime(25);
    });
    expect(searchPlayers).toHaveBeenCalledTimes(1);
    const firstSignal = searchPlayers.mock.calls[0][0].signal;

    rerender({ query: "beta" });
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(25);
    });
    expect(searchPlayers).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondRequest.resolve([{ player_id: 2, playername: "Beta" }]);
      await secondRequest.promise;
      await Promise.resolve();
    });
    expect(result.current.players[0]?.player_id).toBe(2);

    await act(async () => {
      firstRequest.resolve([{ player_id: 1, playername: "Alpha" }]);
      await firstRequest.promise;
    });
    expect(result.current.players.map((player) => player.player_id)).toEqual([2]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
