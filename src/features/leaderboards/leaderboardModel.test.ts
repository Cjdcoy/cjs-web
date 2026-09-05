import { describe, expect, it } from "vitest";
import { readQueryState } from "../../lib/routing";
import {
  canonicalizeLeaderboardSearch,
  createLeaderboardRows,
  createDifficultySplit,
  createTopPlaceDistribution,
  filterLeaderboardRows,
  leaderboardQuerySchema,
  sortLeaderboardRows,
  type LeaderboardQueryState,
} from "./leaderboardModel";

describe("leaderboard query normalization", () => {
  it.each([
    {
      name: "defaults invalid values for JumpersHeaven",
      search:
        "?source=invalid&board=rank-xp&fps=999&limit=500&page=0&sort=score&order=sideways&region=EU",
      source: "jh" as const,
      expectedSearch: "",
    },
    {
      name: "removes FPS from map completion boards",
      search: "?board=howmany&fps=333&page=2",
      source: "jh" as const,
      expectedSearch: "?board=howmany",
    },
    {
      name: "keeps supported J4L rank XP controls",
      search: "?source=j4l&board=rank-xp&fps=76&limit=50&page=3&sort=value&order=desc",
      source: "j4l" as const,
      expectedSearch: "?source=j4l&board=rank-xp&sort=value&order=desc",
    },
    {
      name: "trims search input and drops prototype-only controls",
      search: "?query=%20Alpha%20&seen=week&country=ca&player=old",
      source: "jh" as const,
      expectedSearch: "?query=Alpha",
    },
  ])("$name", ({ expectedSearch, search, source }) => {
    expect(canonicalizeLeaderboardSearch(search, source)).toBe(expectedSearch);
  });

  it("round-trips every supported query value", () => {
    const search = canonicalizeLeaderboardSearch(
      "?source=j4l&board=jump-skill&fps=333&query=Runner&sort=player&order=desc",
      "j4l",
    );
    const state = readQueryState(search, leaderboardQuerySchema);

    expect(state).toEqual<LeaderboardQueryState>({
      board: "jump-skill",
      fps: "333",
      order: "desc",
      query: "Runner",
      sort: "player",
    });
  });
});

describe("leaderboard view transformations", () => {
  const rows = createLeaderboardRows(
    [
      {
        player_id: 1,
        player_name: "Zulu",
        rank: 1,
        rating: 91.25,
        score: 900,
        country: "Canada",
        country_code: "ca",
      },
      {
        player_id: 2,
        player_name: "alpha",
        rank: 2,
        rating: 95.5,
        score: 800,
        country: "France",
        country_code: "fr",
      },
      {
        player_id: 3,
        player_name: "Missing metric",
        rank: 3,
      },
    ],
    "speed-skill",
  );

  it("searches player and country fields without changing official ranks", () => {
    expect(filterLeaderboardRows(rows, "CAN")).toMatchObject([{ playerName: "Zulu", rank: 1 }]);
    expect(filterLeaderboardRows(rows, "ALP")).toMatchObject([{ playerName: "alpha", rank: 2 }]);
  });

  it("filters and sorts names by their visible text instead of caret controls", () => {
    const coloredRows = [
      { ...rows[0], playerName: "^2Zulu" },
      { ...rows[1], playerName: "^1alpha" },
    ];

    expect(filterLeaderboardRows(coloredRows, "zulu")).toMatchObject([{ playerName: "^2Zulu" }]);
    expect(sortLeaderboardRows(coloredRows, "player", "asc").map((row) => row.playerId)).toEqual([
      2, 1,
    ]);
  });

  it("sorts presentation values stably and keeps missing metrics last", () => {
    expect(sortLeaderboardRows(rows, "value", "desc").map(({ playerName }) => playerName)).toEqual([
      "alpha",
      "Zulu",
      "Missing metric",
    ]);
    expect(sortLeaderboardRows(rows, "player", "asc").map(({ playerName }) => playerName)).toEqual([
      "alpha",
      "Missing metric",
      "Zulu",
    ]);
  });

  it("normalizes current and legacy top-list keys into positions 1 through 10", () => {
    expect(createTopPlaceDistribution({ "1": 12, "10": 2 })).toEqual(
      Array.from({ length: 10 }, (_, index) => ({
        place: index + 1,
        count: index === 0 ? 12 : index === 9 ? 2 : 0,
      })),
    );
    expect(createTopPlaceDistribution({ top1: 4, top10: 1 })?.at(0)).toEqual({
      place: 1,
      count: 4,
    });
    expect(createTopPlaceDistribution({ unrelated: 3 })).toBeNull();
    expect(createTopPlaceDistribution(undefined)).toBeNull();
  });

  it("splits jump points by difficulty band and averages band midpoints", () => {
    expect(createDifficultySplit({ "9": 300, "0": 0, "2": 100, top1: 5 })).toEqual({
      bands: [
        { band: 2, points: 100 },
        { band: 9, points: 300 },
      ],
      average: 7.75,
    });
    expect(createDifficultySplit({ "0": 0 })).toBeNull();
    expect(createDifficultySplit(undefined)).toBeNull();
  });
});
