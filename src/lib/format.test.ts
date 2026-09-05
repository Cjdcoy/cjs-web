import { afterEach, describe, expect, it, vi } from "vitest";
import { formatDate, parseApiDate, timeAgo } from "./format";

describe("parseApiDate", () => {
  afterEach(() => vi.useRealTimers());

  it("reads every timestamp shape the API sends", () => {
    // Space-separated values are UTC, so all three name the same instant.
    expect(parseApiDate("2026-09-05T19:18:34Z").toISOString()).toBe("2026-09-05T19:18:34.000Z");
    expect(parseApiDate("2026-09-05 19:18:34").toISOString()).toBe("2026-09-05T19:18:34.000Z");
    expect(parseApiDate("2026-09-05T21:18:34+02:00").toISOString()).toBe(
      "2026-09-05T19:18:34.000Z",
    );
    expect(parseApiDate("2026-09-05T14:18:34-05:00").toISOString()).toBe(
      "2026-09-05T19:18:34.000Z",
    );
    expect(Number.isNaN(parseApiDate("not a date").getTime())).toBe(true);
  });

  it("keeps an offset timestamp out of the future branch of timeAgo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T20:18:34Z"));

    expect(timeAgo("2026-09-05T21:18:34+02:00")).toBe("1h ago");
    expect(timeAgo("2026-09-05T20:18:20Z")).toBe("Just now");
    // Small clock skew still reads as now; a real future date falls back to the date.
    expect(timeAgo("2026-09-05T20:19:00Z")).toBe("Just now");
    expect(timeAgo("2026-12-24T10:00:00Z")).toBe(formatDate("2026-12-24T10:00:00Z"));
  });
});
