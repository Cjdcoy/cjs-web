import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/leaderboards");
  });

  it("direct-loads a representative J4L rank XP URL and removes legacy paging", async () => {
    const rankXpLeaderboard = vi
      .spyOn(api, "rankXpLeaderboard")
      .mockResolvedValue(Array.from({ length: 12 }, (_, index) => rankEntry(index + 1)));
    window.history.replaceState(
      null,
      "",
      "/leaderboards?source=j4l&board=rank-xp&limit=10&page=2&sort=value&order=desc",
    );

    renderPage();

    const pageHeading = screen.getByRole("heading", {
      level: 1,
      name: "Jump4Life leaderboards",
    });
    expect(pageHeading).toBeVisible();
    expect(pageHeading.closest(".cjs-page-heading")).not.toBeNull();
    expect(
      screen.getByText(/Compare official Jump4Life player rankings.*including Rank XP/),
    ).toBeVisible();
    const sourceControl = screen.getByRole("radiogroup", { name: "Leaderboard data source" });
    const sourceField = sourceControl.closest("fieldset");
    expect(sourceControl).toBeVisible();
    expect(sourceControl).not.toHaveClass("cjs-leaderboards__choice-control");
    expect(sourceField?.parentElement?.firstElementChild).toBe(sourceField);
    expect(screen.getByRole("radio", { name: "Jump4Life" })).toBeChecked();
    expect(document.querySelector(".cjs-leaderboards__eyebrow")).not.toHaveTextContent("Jump4Life");
    expect(await screen.findByText("XP Runner 1")).toBeInTheDocument();
    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    expect(refreshButton).toHaveAttribute("data-variant", "ghost");
    expect(refreshButton).toHaveTextContent("Refresh");
    expect(screen.getByText("XP Runner 11")).toBeInTheDocument();
    expect(screen.getByText("XP Runner 12")).toBeInTheDocument();
    expect(screen.getByText("Showing 12 of 12 matching players.")).toBeVisible();
    expect(screen.getByRole("link", { name: "XP Runner 11" })).toHaveAttribute(
      "href",
      "/players/11?source=j4l",
    );
    expect(screen.getByRole("link", { name: "XP Runner 11" })).toHaveAttribute(
      "data-variant",
      "player",
    );
    expect(screen.getByRole("columnheader", { name: /total xp/i })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(window.location.search).toBe("?source=j4l&board=rank-xp&sort=value&order=desc");
    expect(rankXpLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({ source: "j4l", signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps refresh context visible and announces refresh progress", async () => {
    let finishRefresh: (() => void) | undefined;
    vi.spyOn(api, "leaderboard")
      .mockResolvedValueOnce([standardEntry(1)])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRefresh = () => resolve([standardEntry(1)]);
          }),
      );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Runner 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    const refreshingButton = await screen.findByRole("button", { name: "Refreshing" });
    expect(refreshingButton).toBeDisabled();
    expect(refreshingButton).toHaveTextContent("Refreshing");
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing leaderboard results.");

    act(() => finishRefresh?.());

    expect(await screen.findByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
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

  it("updates the URL and results from visible board and FPS choices", async () => {
    vi.spyOn(api, "leaderboard").mockImplementation(async ({ kind }) => {
      return [
        standardEntry(1, { player_name: `${kind} Alpha`, score: 20 }),
        standardEntry(2, { player_name: `${kind} Beta`, score: 40 }),
      ];
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("speed-skill Alpha");

    expect(
      screen.getByRole("heading", { level: 1, name: "JumpersHeaven leaderboards" }),
    ).toBeVisible();
    expect(screen.getByText(/Compare official JumpersHeaven player rankings/)).toBeVisible();
    expect(document.querySelector(".cjs-leaderboards__eyebrow")).not.toHaveTextContent(
      "JumpersHeaven",
    );
    expect(screen.getByRole("radiogroup", { name: "Board" })).toBeVisible();
    expect(screen.getByRole("radiogroup", { name: "FPS" })).toBeVisible();
    expect(screen.queryByText(/uses the API's official ranking/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Jump" }));
    await user.click(screen.getByRole("radio", { name: "333" }));
    expect(await screen.findByText("jump-skill Alpha")).toBeInTheDocument();
    expect(window.location.search).toBe("?board=jump-skill&fps=333");
    expect(screen.getByRole("button", { name: "Reset filters" })).toBeVisible();

    await user.click(screen.getByRole("radio", { name: "Completions" }));
    expect(await screen.findByText("howmany Alpha")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "125" })).toBeDisabled();
    expect(window.location.search).toBe("?board=howmany");

    await user.type(screen.getByRole("searchbox", { name: "Find a player or country" }), "Beta");
    expect(screen.queryByText("howmany Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("howmany Beta")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("query")).toBe("Beta");

    await user.click(screen.getByRole("button", { name: "Sort by maps completed, descending" }));
    expect(new URLSearchParams(window.location.search).get("sort")).toBe("value");
    expect(new URLSearchParams(window.location.search).get("order")).toBe("desc");
    expect(screen.getByRole("columnheader", { name: /maps completed/i })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByRole("radio", { name: "Speed" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "125" })).toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Find a player or country" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();
  });

  it("switches source from an explicit feature filter", async () => {
    const leaderboard = vi.spyOn(api, "leaderboard").mockResolvedValue([standardEntry(1)]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Runner 1")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Jump4Life" }));

    await waitFor(() => expect(window.location.search).toBe("?source=j4l"));
    expect(screen.getByRole("heading", { level: 1, name: "Jump4Life leaderboards" })).toBeVisible();
    expect(leaderboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: "j4l", signal: expect.any(AbortSignal) }),
    );
  });

  it("reveals more players when the scroll sentinel enters view", async () => {
    let triggerIntersection: (() => void) | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          triggerIntersection = () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }

        observe() {}

        disconnect() {}
      },
    );
    vi.spyOn(api, "leaderboard").mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => standardEntry(index + 1)),
    );
    renderPage();

    expect(await screen.findByText("Runner 25")).toBeInTheDocument();
    expect(screen.queryByText("Runner 26")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load 5 more players" })).toBeVisible();

    await act(async () => triggerIntersection?.());

    expect(await screen.findByText("Runner 30")).toBeInTheDocument();
    expect(screen.getByText("Showing 30 of 30 matching players.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /load .* more players/i })).not.toBeInTheDocument();
  });

  it("shows a compact country flag and the full top 1–10 distribution", async () => {
    vi.spyOn(api, "leaderboard").mockResolvedValue([
      standardEntry(1, {
        country: "United Kingdom",
        country_code: "UK",
        top_list: {
          "1": 12,
          "2": 10,
          "3": 9,
          "4": 8,
          "5": 7,
          "6": 6,
          "7": 5,
          "8": 4,
          "9": 3,
          "10": 2,
        },
      }),
    ]);
    renderPage();

    const table = await screen.findByRole("table", { name: /speed skill rankings/i });
    const countryFlag = within(table).getByRole("img", { name: "United Kingdom" });
    expect(countryFlag.querySelector("img")).toHaveAttribute("src", "/country-flags/gb.svg");
    expect(countryFlag).not.toHaveTextContent("🇬🇧");
    expect(within(table).queryByRole("columnheader", { name: "Country" })).not.toBeInTheDocument();

    const distribution = within(table).getByRole("list", {
      name: /top-place distribution: top 1: 12.*top 10: 2/i,
    });
    expect(within(distribution).getAllByRole("listitem")).toHaveLength(10);
    expect(within(distribution).getByText("#1")).toBeVisible();
    expect(within(distribution).getByText("#10")).toBeVisible();
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

    await user.click(screen.getByRole("radio", { name: "Jump" }));

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
    vi.spyOn(api, "leaderboard").mockResolvedValue([
      standardEntry(1, { player_name: "^2Runner ^71" }),
    ]);
    const { container } = renderPage();

    const table = await screen.findByRole("table", { name: /speed skill rankings/i });
    expect(within(table).getByRole("columnheader", { name: /rank/i })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(within(table).getByRole("row", { name: "Runner 1, official rank 1" })).toBeVisible();
    expect(table.querySelector('[data-cod-color="2"]')).toHaveTextContent("Runner");
    expect(table.querySelector('[data-cod-color="7"]')).toHaveTextContent("1");

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
