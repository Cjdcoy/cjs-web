import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { SourceProvider } from "../../lib/routing";
import { LeaderboardsPage } from "./LeaderboardsPage";

function renderPage() {
  return render(
    <SourceProvider>
      <LeaderboardsPage />
    </SourceProvider>,
  );
}

function standardEntry(
  id: number,
  overrides: Partial<Record<string, string | number | Record<string, number>>> = {},
) {
  return {
    player_id: id,
    player_name: `Runner ${id}`,
    rank: id,
    rating: 100 - id,
    score: 1_000 - id,
    country: id % 2 ? "Canada" : "France",
    country_code: id % 2 ? "ca" : "fr",
    region: id % 2 ? "NA" : "EU",
    last_seen: "2026-08-15 10:00:00",
    top_list: { "1": id },
    ...overrides,
  };
}

function rankEntry(id: number) {
  return {
    player_id: id,
    player_name: `XP Runner ${id}`,
    rank: id,
    total_xp: 20_000 - id * 100,
    prestige: Math.floor(id / 10),
    level: id,
    level_display: `Level ${id}`,
    title: "Jumper",
    xp_into_level: 10,
    xp_for_level: 100,
    xp_to_next: 90,
    maxed: false,
    country: "Canada",
    country_code: "ca",
    region: "NA",
    last_seen: "2026-08-15 10:00:00",
  };
}

describe("LeaderboardsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/leaderboards");
  });

  it("direct-loads a representative J4L rank XP URL with paging and player links", async () => {
    const rankXpLeaderboard = vi
      .spyOn(api, "rankXpLeaderboard")
      .mockResolvedValue(Array.from({ length: 12 }, (_, index) => rankEntry(index + 1)));
    window.history.replaceState(
      null,
      "",
      "/leaderboards?source=j4l&board=rank-xp&limit=10&page=2&sort=value&order=desc",
    );

    renderPage();

    expect(await screen.findByText("XP Runner 11")).toBeInTheDocument();
    expect(screen.getByText("XP Runner 12")).toBeInTheDocument();
    expect(screen.queryByText("XP Runner 10")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 11–12 of 12 matching players.")).toBeVisible();
    expect(screen.getByRole("link", { name: "XP Runner 11" })).toHaveAttribute(
      "href",
      "/players/11?source=j4l",
    );
    expect(screen.getByRole("columnheader", { name: /total xp/i })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(window.location.search).toBe(
      "?source=j4l&board=rank-xp&limit=10&page=2&sort=value&order=desc",
    );
    expect(rankXpLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ source: "j4l", signal: expect.any(AbortSignal) }),
    );
  });

  it("normalizes invalid and unsupported URL combinations before requesting data", async () => {
    const leaderboard = vi.spyOn(api, "leaderboard").mockResolvedValue([standardEntry(1)]);
    const rankXpLeaderboard = vi.spyOn(api, "rankXpLeaderboard").mockResolvedValue([]);
    window.history.replaceState(
      null,
      "",
      "/leaderboards?source=unknown&board=rank-xp&fps=999&limit=500&page=0&sort=score&order=sideways&region=EU",
    );

    renderPage();

    expect(await screen.findByText("Runner 1")).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(leaderboard).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "speed-skill",
        source: "jh",
        fps: "125",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(rankXpLeaderboard).not.toHaveBeenCalled();
  });

  it("updates the URL and results when board, search, limit, and sort controls change", async () => {
    vi.spyOn(api, "leaderboard").mockImplementation(async ({ kind }) => {
      return [
        standardEntry(1, { player_name: `${kind} Alpha`, score: 20 }),
        standardEntry(2, { player_name: `${kind} Beta`, score: 40 }),
      ];
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("speed-skill Alpha");

    await user.selectOptions(screen.getByRole("combobox", { name: "Board" }), "howmany");
    expect(await screen.findByText("howmany Alpha")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /fps/i })).toBeDisabled();
    expect(window.location.search).toBe("?board=howmany");

    await user.type(screen.getByRole("searchbox", { name: "Find a player or country" }), "Beta");
    expect(screen.queryByText("howmany Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("howmany Beta")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("query")).toBe("Beta");

    await user.selectOptions(screen.getByRole("combobox", { name: "Rows per page" }), "10");
    expect(new URLSearchParams(window.location.search).get("limit")).toBe("10");

    await user.click(screen.getByRole("button", { name: "Sort by maps completed, descending" }));
    expect(new URLSearchParams(window.location.search).get("sort")).toBe("value");
    expect(new URLSearchParams(window.location.search).get("order")).toBe("desc");
    expect(screen.getByRole("columnheader", { name: /maps completed/i })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("cancels an obsolete board request so late data is not presented", async () => {
    let obsoleteSignal: AbortSignal | undefined;
    vi.spyOn(api, "leaderboard").mockImplementation(({ kind, signal }) => {
      if (kind === "jump-skill") {
        return Promise.resolve([standardEntry(2, { player_name: "Current runner" })]);
      }

      obsoleteSignal = signal;
      return new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
        globalThis.setTimeout(
          () => resolve([standardEntry(1, { player_name: "Obsolete runner" })]),
          120,
        );
      });
    });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByRole("combobox", { name: "Board" }), "jump-skill");

    expect(await screen.findByText("Current runner")).toBeInTheDocument();
    expect(obsoleteSignal?.aborted).toBe(true);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 150));
    expect(screen.queryByText("Obsolete runner")).not.toBeInTheDocument();
  });

  it("exposes useful error and empty states", async () => {
    const leaderboard = vi
      .spyOn(api, "leaderboard")
      .mockRejectedValueOnce(new Error("The leaderboard service rejected the request."))
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Leaderboard unavailable" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "No ranked players yet" })).toBeVisible();
    expect(leaderboard).toHaveBeenCalledTimes(2);
  });

  it("has accessible ranking and control semantics", async () => {
    vi.spyOn(api, "leaderboard").mockResolvedValue([standardEntry(1)]);
    const { container } = renderPage();

    const table = await screen.findByRole("table", { name: /speed skill rankings/i });
    expect(within(table).getByRole("columnheader", { name: /rank/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(within(table).getByRole("row", { name: "Runner 1, official rank 1" })).toBeVisible();

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
