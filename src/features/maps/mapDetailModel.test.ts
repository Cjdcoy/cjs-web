import { describe, expect, it } from "vitest";
import type { GameMap, TopRun } from "../../lib/api";
import {
  describeUnratedDifficulty,
  formatRunDate,
  formatRunTime,
  getMapRouteLabel,
  getPlainPlayerName,
  getSafeMediaUrl,
  hasMapTopRuns,
  formatPlaytime,
  getPlaytimeRouteEnder,
  mergePlaytime,
  parseMapRouteId,
  resolveMapRecord,
  selectCheckpoint,
  selectMapProfileFps,
} from "./mapDetailModel";

const checkpoints: GameMap[] = [
  { mapid: 2, mapname: "other", cp_id: 200 },
  { mapid: 1, mapname: "target", cp_id: 102 },
  { mapid: 1, mapname: "target", cp_id: 101 },
  { mapid: 1, mapname: "duplicate", cp_id: 102 },
];

describe("map detail model", () => {
  it.each([
    [0, "0s"],
    [59, "59s"],
    [59.9, "59s"],
    [60, "0h 01m"],
    [3_599, "0h 59m"],
    [3_600, "1h 00m"],
    [86_400, "24h 00m"],
    [90_061, "25h 01m"],
    [-1, "Not available"],
  ])("formats %s seconds of playtime as %s", (seconds, expected) => {
    expect(formatPlaytime(seconds)).toBe(expected);
  });

  it("filters playtime by route only for named routes on multi-route maps", () => {
    const hard = { mapid: 1, mapname: "m", cp_id: 1, ender: " hard " };
    const unnamed = { mapid: 1, mapname: "m", cp_id: 2, ender: null };
    const multi = { mapId: 1, defaultCheckpointId: 1, checkpoints: [hard, unnamed] };
    const single = { mapId: 1, defaultCheckpointId: 1, checkpoints: [hard] };

    expect(getPlaytimeRouteEnder(multi, hard)).toBe("hard");
    expect(getPlaytimeRouteEnder(multi, unnamed)).toBeNull();
    expect(getPlaytimeRouteEnder(single, hard)).toBeNull();
  });

  it("merges per-FPS playtime by player, summing seconds and keeping the FPS list", () => {
    expect(
      mergePlaytime([
        [
          "125",
          [
            { player_id: 1, player_name: "One", time_played: 100 },
            { player_id: 2, player_name: "Two", time_played: 90 },
          ],
        ],
        ["250", []],
        ["0", [{ player_id: 2, player_name: "Two (mix)", time_played: 30 }]],
        ["333", [{ player_id: 3, player_name: "Three", time_played: 100 }]],
      ]),
    ).toEqual([
      { player_id: 2, player_name: "Two", time_played: 120, fps: ["125", "0"] },
      { player_id: 1, player_name: "One", time_played: 100, fps: ["125"] },
      { player_id: 3, player_name: "Three", time_played: 100, fps: ["333"] },
    ]);
    expect(mergePlaytime([])).toEqual([]);
  });

  it("resolves map and checkpoint lookup links into a stable ordered record", () => {
    const byMap = resolveMapRecord(checkpoints, 1, "mapid");
    const byCheckpoint = resolveMapRecord(checkpoints, 101, "cpid");

    expect(byMap).toMatchObject({ mapId: 1, defaultCheckpointId: 102 });
    expect(byMap?.checkpoints.map((map) => map.cp_id)).toEqual([101, 102]);
    expect(byCheckpoint).toMatchObject({ mapId: 1, defaultCheckpointId: 101 });
    expect(resolveMapRecord(checkpoints, 999, "mapid")).toBeNull();
  });

  it("honors a valid checkpoint selection and falls back to the route checkpoint", () => {
    const record = resolveMapRecord(checkpoints, 1, "mapid");
    expect(record).not.toBeNull();
    if (!record) return;

    expect(selectCheckpoint(record, 101).cp_id).toBe(101);
    expect(selectCheckpoint(record, 999).cp_id).toBe(102);
    expect(selectCheckpoint(record, 0).cp_id).toBe(102);
  });

  it("selects an available profile FPS in 125, 250, 333, mix, 43, 76 order", () => {
    const map: GameMap = {
      mapid: 1,
      mapname: "target",
      cp_id: 101,
      difficulty: {
        "125": { difficulty: 2, nb_tops: 0 },
        "250": { difficulty: 3, nb_tops: 4 },
        "333": { difficulty: 4, nb_tops: 2 },
        "0": { difficulty: 5, nb_tops: 1 },
        "43": { difficulty: 6, nb_tops: 3 },
      },
    };
    const uncounted: GameMap = {
      ...map,
      difficulty: {
        "125": { difficulty: -1, nb_tops: 0 },
        "250": { difficulty: -2, nb_tops: 0 },
      },
    };

    expect(hasMapTopRuns(map, "125")).toBe(false);
    expect(hasMapTopRuns(uncounted, "125")).toBe(true);
    expect(hasMapTopRuns(uncounted, "250")).toBe(false);
    expect(hasMapTopRuns(map, "250")).toBe(true);
    expect(selectMapProfileFps(map, "125")).toBe("250");
    expect(selectMapProfileFps(map, "333")).toBe("333");
    expect(selectMapProfileFps(map, "43")).toBe("43");
    expect(selectMapProfileFps(map, "76")).toBe("250");
    expect(selectMapProfileFps({ ...map, difficulty: null }, "333")).toBe("125");
  });

  it("uses route names when supplied and safe numbered labels otherwise", () => {
    expect(getMapRouteLabel({ ...checkpoints[0], ender: "hard" }, 1)).toBe("hard");
    expect(getMapRouteLabel(checkpoints[0], 0)).toBe("Route 1");
  });

  it("rejects malformed route IDs and unsafe media URLs", () => {
    expect(parseMapRouteId(" 73 ")).toBe(73);
    expect(parseMapRouteId("0")).toBeNull();
    expect(parseMapRouteId("73-extra")).toBeNull();
    expect(parseMapRouteId(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
    expect(getSafeMediaUrl("https://media.example.invalid/video")).toBe(
      "https://media.example.invalid/video",
    );
    expect(getSafeMediaUrl("javascript:alert(1)")).toBeNull();
    expect(getSafeMediaUrl("not a URL")).toBeNull();
  });

  it("explains why a difficulty is unrated", () => {
    const map = (type: string | null, difficulty: number | null): GameMap => ({
      mapid: 1,
      mapname: "m",
      cp_id: 1,
      type,
      difficulty: difficulty === null ? {} : { "125": { difficulty, nb_tops: 0 } },
    });

    expect(describeUnratedDifficulty(map(null, -2), "125")).toBe(
      "No runs have been recorded at this FPS yet.",
    );
    expect(describeUnratedDifficulty(map("Surf", -1), "125")).toBe(
      "Difficulty is only rated for jump maps.",
    );
    expect(describeUnratedDifficulty(map("jump", -1), "125")).toBe(
      "The fastest run uses more than 3 nade jumps, so the difficulty formula does not apply.",
    );
    expect(describeUnratedDifficulty(map(null, null), "125")).toBe(
      "No difficulty data is available for this FPS.",
    );
  });

  it("presents safe fallback labels for partial run data", () => {
    const run = {
      time_played: 20_951,
      time_played_string: undefined,
    } as TopRun;

    expect(formatRunTime(run)).toBe("5:49:11");
    expect(formatRunTime({ ...run, time_played: 125 })).toBe("2:05");
    expect(formatRunTime({ ...run, time_played: 9 })).toBe("9s");
    expect(formatRunTime({ ...run, time_played: Number.NaN })).toBe("Time unavailable");
    expect(formatRunDate(undefined)).toBe("Date unavailable");
    expect(formatRunDate("invalid")).toBe("Date unavailable");
    expect(getPlainPlayerName("^1Alpha ^2Runner")).toBe("Alpha Runner");
    expect(getPlainPlayerName("^1^2")).toBe("Unknown player");
  });
});
