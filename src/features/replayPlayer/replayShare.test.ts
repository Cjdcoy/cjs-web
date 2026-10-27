import { describe, expect, it } from "vitest";
import { readReplayStartOffset, replaySharePath } from "./replayShare";

describe("replay share links", () => {
  it("reads a whole, non-negative t and ignores anything else", () => {
    expect(readReplayStartOffset("?t=1500")).toBe(1_500);
    expect(readReplayStartOffset("?view=cinema&t=0")).toBe(0);
    for (const search of ["", "?t=", "?t=-5", "?t=abc", "?t=1.5", "?t=1e3"]) {
      expect(readReplayStartOffset(search)).toBe(0);
    }
  });

  it("builds the link with t in whole ms, keeping other params, and round-trips", () => {
    expect(replaySharePath(7001, "?view=cinema&t=99", 1_500.4)).toBe(
      "/replays/7001?view=cinema&t=1500",
    );
    expect(replaySharePath(7001, "?view=cinema&t=99", 0)).toBe("/replays/7001?view=cinema");
    expect(replaySharePath(7001, "", 0)).toBe("/replays/7001");
    const shared = new URL(replaySharePath(7001, "", 12_345), "https://cjs.example.test");
    expect(readReplayStartOffset(shared.search)).toBe(12_345);
  });
});
