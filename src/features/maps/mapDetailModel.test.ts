import { describe, expect, it } from "vitest";
import type { GameMap, TopRun } from "../../lib/api";
import {
  formatRunDate,
  formatRunTime,
  getPlainPlayerName,
  getSafeMediaUrl,
  parseMapRouteId,
  resolveMapRecord,
  selectCheckpoint,
} from "./mapDetailModel";

const checkpoints: GameMap[] = [
  { mapid: 2, mapname: "other", cp_id: 200 },
  { mapid: 1, mapname: "target", cp_id: 102 },
  { mapid: 1, mapname: "target", cp_id: 101 },
  { mapid: 1, mapname: "duplicate", cp_id: 102 },
];

describe("map detail model", () => {
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
