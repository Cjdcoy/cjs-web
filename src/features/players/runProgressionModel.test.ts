import { describe, expect, it } from "vitest";
import type { TopRun } from "../../lib/api";
import {
  createRunProgression,
  formatRunDurationMs,
  parseRunDurationMs,
} from "./runProgressionModel";

describe("run progression model", () => {
  it("orders finishes chronologically and identifies genuine personal-best gains", () => {
    const progression = createRunProgression([
      run(1, "9:20.60", "2026-04-07T13:31:21Z"),
      run(2, "9:27.05", "2026-04-07T20:18:32Z"),
      run(9, "45:00.25", "2025-07-31T23:40:48Z"),
      run(3, "10:10.20", "2026-04-07T13:04:36Z"),
    ]);

    expect(progression.points.map((point) => point.run.rank)).toEqual([9, 3, 1, 2]);
    expect(progression.points.map((point) => point.isPersonalBest)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(progression.points[3]?.previousFinishDeltaMs).toBe(6_450);
    expect(progression.points[2]?.personalBestGainMs).toBe(49_600);
    expect(progression.summary).toMatchObject({
      bestTimeMs: 560_600,
      biggestGainMs: 2_090_050,
      firstTimeMs: 2_700_250,
      improvementMs: 2_139_650,
      personalBestCount: 2,
      runCount: 4,
    });
    expect(progression.summary?.improvementPercent).toBeCloseTo(0.7924, 3);
  });

  it("parses API duration strings and falls back to documented numeric seconds", () => {
    expect(parseRunDurationMs(run(1, "1:02:03.45", "2026-01-01T00:00:00Z"))).toBe(3_723_450);
    expect(parseRunDurationMs({ ...run(1, "", "2026-01-01T00:00:00Z"), time_played: 12 })).toBe(
      12_000,
    );
    expect(formatRunDurationMs(3_723_450)).toBe("1:02:03.45");
    expect(formatRunDurationMs(560_600)).toBe("9:20.60");
  });

  it("returns an honest empty summary when no usable finishes exist", () => {
    const progression = createRunProgression([]);
    expect(progression).toEqual({ points: [], summary: null });
  });
});

function run(rank: number, duration: string, timeCreated: string): TopRun {
  return {
    cpid: 15_876,
    fps: "250",
    mapname: "jm_offices_250",
    player_id: 46_077,
    playername: "Runner",
    rank,
    run_id: 9_500_000 + rank,
    score: 0,
    time_created: timeCreated,
    time_played: 0,
    time_played_string: duration,
  };
}
