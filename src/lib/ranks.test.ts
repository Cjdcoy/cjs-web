import { describe, expect, it } from "vitest";
import { levelEmblemUrl, prestigeEmblemUrl } from "./ranks";

describe("levelEmblemUrl", () => {
  it("maps level 1 and the six-level core bands", () => {
    expect(levelEmblemUrl(1)).toBe("/ranks/rank-core-01.avif");
    expect(levelEmblemUrl(2)).toBe("/ranks/rank-core-02.avif");
    expect(levelEmblemUrl(7)).toBe("/ranks/rank-core-02.avif");
    expect(levelEmblemUrl(8)).toBe("/ranks/rank-core-03.avif");
    expect(levelEmblemUrl(43)).toBe("/ranks/rank-core-08.avif");
  });

  it("gives every mythic level its own emblem", () => {
    expect(levelEmblemUrl(44)).toBe("/ranks/rank-mythic-01.avif");
    expect(levelEmblemUrl(50)).toBe("/ranks/rank-mythic-07.avif");
  });

  it("clamps out-of-range levels and rejects missing ones", () => {
    expect(levelEmblemUrl(99)).toBe("/ranks/rank-mythic-07.avif");
    expect(levelEmblemUrl(0)).toBeNull();
    expect(levelEmblemUrl(-3)).toBeNull();
    expect(levelEmblemUrl(undefined)).toBeNull();
    expect(levelEmblemUrl(Number.NaN)).toBeNull();
  });
});

describe("prestigeEmblemUrl", () => {
  it("returns the compact badge and clamps to the highest prestige", () => {
    expect(prestigeEmblemUrl(1)).toBe("/ranks/rank-prestige-01-compact.avif");
    expect(prestigeEmblemUrl(10)).toBe("/ranks/rank-prestige-10-compact.avif");
    expect(prestigeEmblemUrl(42)).toBe("/ranks/rank-prestige-10-compact.avif");
  });

  it("treats no prestige as absent", () => {
    expect(prestigeEmblemUrl(0)).toBeNull();
    expect(prestigeEmblemUrl(undefined)).toBeNull();
  });
});
