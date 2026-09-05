import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type RecentRunsPage, type TopRun } from "../../lib/api";
import { RecentPage } from "./RecentPage";

function run(overrides: Partial<TopRun> = {}): TopRun {
  return {
    rank: 1,
    player_id: 501,
    playername: "^2Runner",
    time_played: 12_345,
    time_played_string: "00:12.345",
    fps: "125",
    score: 100,
    mapname: "mp_cjs_training",
    cpid: 901,
    totalNr: 5,
    run_id: 7001,
    ender: null,
    time_created: "2026-09-05T01:02:03Z",
    ...overrides,
  };
}

function page(runs: TopRun[], nextCursor: string | null = null): RecentRunsPage {
  return { runs, nextCursor };
}

describe("RecentPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/recent");
  });

  it("merges both sources by real instant, newest first, and tags every row", async () => {
    const recentRuns = vi.spyOn(api, "recentRuns").mockImplementation(async ({ source }) =>
      source === "jh"
        ? // Sorts after the J4L row by instant (01:30Z) even though the raw string sorts first.
          page([run({ mapname: "jh_older", time_created: "2026-09-05T03:30:00+02:00" })])
        : page([
            run({
              run_id: 8001,
              player_id: 601,
              playername: "^3Sprinter",
              cpid: 902,
              rank: 0,
              totalNr: 0,
              mapname: "j4l_newer",
              time_created: "2026-09-05T02:00:00Z",
            }),
          ]),
    );
    const { container } = render(<RecentPage />);

    const list = await screen.findByRole("list", { name: "Recent updates" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    expect(within(rows[0]).getByText("J4L")).toBeVisible();
    expect(within(rows[0]).getByRole("link", { name: "Sprinter" })).toHaveAttribute(
      "href",
      "/players/601?source=j4l",
    );
    expect(within(rows[0]).getByRole("link", { name: "j4l_newer" })).toHaveAttribute(
      "href",
      "/maps/902?source=j4l&lookup=cpid",
    );
    expect(within(rows[0]).queryByText("World record")).not.toBeInTheDocument();

    expect(within(rows[1]).getByText("JH")).toBeVisible();
    expect(within(rows[1]).getByText("World record")).toBeVisible();
    expect(within(rows[1]).getByRole("link", { name: "jh_older" })).toHaveAttribute(
      "href",
      "/maps/901?source=jh&lookup=cpid",
    );
    expect(within(rows[1]).getByRole("link", { name: "Runner" })).toHaveAttribute(
      "href",
      "/players/501?source=jh",
    );

    expect(recentRuns).toHaveBeenCalledTimes(2);
    expect((await axe.run(container)).violations).toEqual([]);
  });

  it("keeps the healthy source visible when the other one fails", async () => {
    vi.spyOn(api, "recentRuns").mockImplementation(async ({ source }) => {
      if (source === "j4l") throw new Error("The cache is warming up.");
      return page([run()]);
    });
    render(<RecentPage />);

    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Jump4Life is unavailable: The cache is warming up.");
    expect(notice).not.toHaveTextContent("JumpersHeaven is unavailable");
    expect(
      within(await screen.findByRole("list", { name: "Recent updates" })).getAllByRole("listitem"),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "Recent updates unavailable" }),
    ).not.toBeInTheDocument();
  });

  it("sends each source its own cursor when loading more", async () => {
    const recentRuns = vi
      .spyOn(api, "recentRuns")
      .mockImplementation(async ({ cursor, source }) => {
        if (cursor) return page([run({ run_id: 9000, mapname: `${source}_page2` })]);
        return page([run({ mapname: `${source}_page1` })], `${source}-cursor`);
      });
    const user = userEvent.setup();
    render(<RecentPage />);

    await screen.findByRole("link", { name: "jh_page1" });
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("link", { name: "jh_page2" })).toBeVisible();
    expect(screen.getByRole("link", { name: "j4l_page2" })).toBeVisible();
    expect(recentRuns).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "jh-cursor", source: "jh" }),
    );
    expect(recentRuns).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "j4l-cursor", source: "j4l" }),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows a full error state only when both sources fail", async () => {
    const recentRuns = vi
      .spyOn(api, "recentRuns")
      .mockRejectedValueOnce(new Error("jh is down."))
      .mockRejectedValueOnce(new Error("j4l is down."))
      .mockResolvedValue(page([]));
    const user = userEvent.setup();
    render(<RecentPage />);

    const heading = await screen.findByRole("heading", { name: "Recent updates unavailable" });
    expect(heading).toBeVisible();
    expect(screen.getByText(/JumpersHeaven is unavailable: jh is down\./)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "No recent updates" })).toBeVisible();
    expect(recentRuns).toHaveBeenCalledTimes(4);
  });
});
