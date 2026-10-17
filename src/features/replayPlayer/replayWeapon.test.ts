import { describe, expect, it } from "vitest";
import type { ReplaySamples } from "../../lib/api";
import { createTimeline } from "./replayPlayback";
import { createWeaponTrack, diffTrack, landingAt, weaponAt } from "./replayWeapon";

interface Row {
  t: number;
  z?: number;
  vz?: number;
  vx?: number;
  yaw?: number;
  air?: boolean;
  stance?: number;
  slot?: number;
}

function weaponTrack(rows: Row[]) {
  const samples: ReplaySamples = {
    run_id: 1,
    mapname: "jm_test",
    player_id: 2,
    playername: "Runner",
    format_version: 11,
    tick_ms: 50,
    duration_ms: rows.at(-1)?.t ?? 0,
    finished: true,
    t: rows.map((row) => row.t),
    pos: rows.flatMap((row, index) => [((row.vx ?? 0) * index) / 20, 0, row.z ?? 0]),
    ang: rows.flatMap((row) => [0, row.yaw ?? 0, 0]),
    vel: rows.flatMap((row) => [row.vx ?? 0, 0, row.vz ?? 0]),
    stance: rows.map((row) => row.stance ?? 0),
    flags: rows.map((row) => (row.air ? 4 : 0) | (row.stance ? 1 : 0)),
    aux: rows.map((row) => (row.slot ?? 0) * 2),
    markers: [],
  };
  return createWeaponTrack(createTimeline(samples));
}

function rows(count: number, row: (index: number) => Omit<Row, "t">): Row[] {
  return Array.from({ length: count }, (_, index) => ({ t: index * 50, ...row(index) }));
}

describe("landing dip", () => {
  // Falling at 300 u/s from 10 units up: fallHeight 66.25, viewDip trunc(54.25 / 26 × 4 + 4) = 12,
  // landing 32 ms after the airborne sample.
  const landing = weaponTrack([
    { t: 0, z: 60, vz: -300, air: true },
    { t: 50, z: 50 },
    ...rows(20, () => ({ z: 50 })).map((row) => ({ ...row, t: row.t + 100 })),
  ]);

  it("derives PM_CrashLand's view dip and the landing time from the last airborne sample", () => {
    expect(landing.landChanges).toEqual([-12]);
    expect(landing.landTimes[0]).toBeCloseTo(32, 0);
  });

  it("deflects over 150 ms and returns over 300 ms, the gun a quarter further", () => {
    const at = (delta: number) => weaponAt(landing, landing.landTimes[0] + delta, 0);
    expect(at(75).dip).toBeCloseTo(-6);
    expect(at(150).dip).toBeCloseTo(-12);
    expect(at(300).dip).toBeCloseTo(-6);
    expect(at(450).dip).toBe(0);
    expect(at(150).offset[2]).toBeCloseTo(-3);
    // Looking straight down, world down is the view's forward.
    expect(weaponAt(landing, landing.landTimes[0] + 150, 90).offset[0]).toBeCloseTo(3);
  });

  it("has no dip below 12 units and caps it at 24", () => {
    const timeline = (vz: number) =>
      createTimeline({
        ...({} as ReplaySamples),
        t: [0, 50],
        pos: [0, 0, 10, 0, 0, 0],
        vel: [0, 0, vz, 0, 0, 0],
        ang: [0, 0, 0, 0, 0, 0],
        stance: [0, 0],
        flags: [4, 0],
        markers: [],
      });
    // 10 units of drop at rest: fallHeight 10.
    expect(landingAt(timeline(0), 0, 1)).toBeNull();
    expect(landingAt(timeline(-2000), 0, 1)?.change).toBe(-24);
  });
});

describe("weapon sway", () => {
  // Turning right at 360°/s: 6° per 1/60 s, clamped to luger_mp2's swayMaxAngle 3.
  const turning = weaponTrack(rows(41, (index) => ({ yaw: -18 * index })));

  it("lags the gun left and yawed left, toward DiffTrack's clamped target", () => {
    const settled = weaponAt(turning, 1000, 0);
    const approach = 1 - Math.exp(-7);
    expect(settled.offset[1]).toBeCloseTo(3 * 0.16 * approach, 4);
    expect(settled.angles[1]).toBeCloseTo(3 * 0.1 * approach, 4);
    expect(settled.offset[2]).toBe(0);
  });

  it("evaluates mid-sample from the stored state, so seeking needs no history", () => {
    const mid = weaponAt(turning, 125, 0);
    const atSample = weaponAt(turning, 100, 0);
    expect(mid.offset[1]).toBeCloseTo(diffTrack(atSample.offset[1], 0.48, 7, 0.025));
  });
});

describe("base gun position", () => {
  it("eases to duckedOfs when crouched and still", () => {
    const crouched = weaponTrack(rows(60, () => ({ stance: 1 })));
    const [forward, left, up] = weaponAt(crouched, 2950, 0).offset;
    expect(forward).toBeCloseTo(-2, 2);
    expect(left).toBeCloseTo(1, 2);
    expect(up).toBeCloseTo(-0.2, 2);
  });

  it("moves to standMove at full speed while standing", () => {
    const running = weaponTrack(rows(60, () => ({ vx: 190 })));
    expect(weaponAt(running, 2950, 0).offset[2]).toBeCloseTo(-1.25, 2);
  });

  it("turns the gun by proneRot × speedFrac while crawling", () => {
    // 38 u/s is speedFrac 0.2 with proneRotMinSpeed 0 and ps->speed 190.
    const crawling = weaponTrack(rows(60, () => ({ stance: 2, vx: 38 })));
    const [, yaw, roll] = weaponAt(crawling, 2950, 0).angles;
    expect(yaw).toBeCloseTo(44, 1);
    expect(roll).toBeCloseTo(-60, 1);
  });
});

describe("weapon raise", () => {
  it("starts a raise when a weapon comes out, not from the grenade slot", () => {
    const track = weaponTrack([
      { t: 0, slot: 3 },
      { t: 50, slot: 0 },
      { t: 100, slot: 1 },
      { t: 150, slot: 2 },
      { t: 200, slot: 0 },
    ]);
    expect(track.raises).toEqual([50, 100]);
    expect(weaponAt(track, 40, 0).raiseMs).toBeNull();
    expect(weaponAt(track, 80, 0).raiseMs).toBe(30);
  });
});
