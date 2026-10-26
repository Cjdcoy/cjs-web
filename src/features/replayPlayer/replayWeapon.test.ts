import { describe, expect, it } from "vitest";
import type { ReplaySamples } from "../../lib/api";
import { adsAt, createTimeline } from "./replayPlayback";
import {
  createWeaponTrack,
  diffTrack,
  gunRecoil,
  landingAt,
  muzzleFlash,
  viewmodelAnims,
  weaponAt,
  type WeaponTrack,
} from "./replayWeapon";

interface Row {
  t: number;
  z?: number;
  vz?: number;
  vx?: number;
  yaw?: number;
  air?: boolean;
  stance?: number;
  slot?: number;
  input?: number;
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
    input: rows.map((row) => row.input ?? 0),
    markers: [],
  };
  return createWeaponTrack(createTimeline(samples));
}

/** weaponAt with the timeline's own fWeaponPosFrac, as ReplayPlayer calls it. */
function gunAt(track: WeaponTrack, time: number, pitch: number) {
  return weaponAt(track, time, pitch, adsAt(track.timeline, time).frac);
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
    const at = (delta: number) => gunAt(landing, landing.landTimes[0] + delta, 0);
    expect(at(75).dip).toBeCloseTo(-6);
    expect(at(150).dip).toBeCloseTo(-12);
    expect(at(300).dip).toBeCloseTo(-6);
    expect(at(450).dip).toBe(0);
    expect(at(150).offset[2]).toBeCloseTo(-3);
    // Looking straight down, world down is the view's forward.
    expect(gunAt(landing, landing.landTimes[0] + 150, 90).offset[0]).toBeCloseTo(3);
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
    const settled = gunAt(turning, 1000, 0);
    const approach = 1 - Math.exp(-7);
    expect(settled.offset[1]).toBeCloseTo(3 * 0.16 * approach, 4);
    expect(settled.angles[1]).toBeCloseTo(3 * 0.1 * approach, 4);
    expect(settled.offset[2]).toBe(0);
  });

  it("evaluates mid-sample from the stored state, so seeking needs no history", () => {
    const mid = gunAt(turning, 125, 0);
    const atSample = gunAt(turning, 100, 0);
    expect(mid.offset[1]).toBeCloseTo(diffTrack(atSample.offset[1], 0.48, 7, 0.025));
  });
});

describe("base gun position", () => {
  it("eases to duckedOfs when crouched and still", () => {
    const crouched = weaponTrack(rows(60, () => ({ stance: 1 })));
    const [forward, left, up] = gunAt(crouched, 2950, 0).offset;
    expect(forward).toBeCloseTo(-2, 2);
    expect(left).toBeCloseTo(1, 2);
    expect(up).toBeCloseTo(-0.2, 2);
  });

  it("moves to standMove at full speed while standing", () => {
    const running = weaponTrack(rows(60, () => ({ vx: 190 })));
    expect(gunAt(running, 2950, 0).offset[2]).toBeCloseTo(-1.25, 2);
  });

  it("turns the gun by proneRot × speedFrac while crawling", () => {
    // 38 u/s is speedFrac 0.2 with proneRotMinSpeed 0 and ps->speed 190.
    const crawling = weaponTrack(rows(60, () => ({ stance: 2, vx: 38 })));
    const [, yaw, roll] = gunAt(crawling, 2950, 0).angles;
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
    expect(track.timeline.raises).toEqual([50, 100]);
  });
});

const ATTACK = 1;
const MELEE = 16;
const ADS = 1024;

describe("aim down sights", () => {
  it("fades the move offset out over the first half of fWeaponPosFrac", () => {
    const aimed = weaponTrack(rows(60, () => ({ vx: 190, input: ADS })));
    expect(gunAt(aimed, 2950, 0).offset[2]).toBeCloseTo(0, 5);
    // ADS from 2500 ms: fWeaponPosFrac 0.25 at 2562.5 ms keeps half the offset.
    const late = weaponTrack(rows(60, (index) => ({ vx: 190, input: index >= 50 ? ADS : 0 })));
    const hip = gunAt(late, 2500, 0).offset[2];
    expect(hip).toBeCloseTo(-1.25, 2);
    expect(gunAt(late, 2562.5, 0).offset[2]).toBeCloseTo(hip / 2, 2);
  });

  it("sways with the adsSway values once aimed", () => {
    // 6° per 1/60 s, clamped to adsSwayMaxAngle 4; adsSwayHorizScale 0.15, adsSwayLerpSpeed 6.
    const turning = weaponTrack(rows(41, (index) => ({ yaw: -18 * index, input: ADS })));
    expect(gunAt(turning, 1000, 0).offset[1]).toBeCloseTo(4 * 0.15, 1);
  });
});

describe("gun kick", () => {
  it("integrates BG_CalculateWeaponPosition_GunRecoil_SingleAngle in 5 ms steps", () => {
    // A hip kick of -32°/s pitch: 5 ms moves 0.16°, then accel 1000, speed decay 100, static 2.
    const s = new Array<number>(14).fill(0);
    s[12] = -32;
    gunRecoil(s, 0.005, 0);
    expect(s[10]).toBeCloseTo(-0.16, 6);
    expect(s[12]).toBeCloseTo(-13.49, 6);
    gunRecoil(s, 0.01, 0);
    expect(s[10]).toBeCloseTo(-0.248625, 5);
    // Under 0.25° and 1°/s it snaps to rest.
    gunRecoil(s, 0.005, 0);
    expect(s[10]).toBe(0);
    expect(s[12]).toBe(0);
  });

  it("caps an aimed kick at gunMaxPitch", () => {
    const s = new Array<number>(14).fill(0);
    s[12] = -100;
    let lowest = 0;
    for (let step = 0; step < 40; step += 1) {
      gunRecoil(s, 0.005, 1);
      lowest = Math.min(lowest, s[10]);
    }
    expect(lowest).toBe(-2);
  });

  it("kicks the gun up on a hip shot and settles it again", () => {
    const shot = weaponTrack(rows(10, (index) => ({ input: index === 2 ? ATTACK : 0 })));
    // hipGunKickPitchMin/Max -30/-35: the first 5 ms moves 0.15° to 0.175° up.
    const pitch = gunAt(shot, 105, 0).angles[0];
    expect(pitch).toBeLessThanOrEqual(-0.15);
    expect(pitch).toBeGreaterThanOrEqual(-0.1751);
    expect(gunAt(shot, 200, 0).angles[0]).toBe(0);
  });
});

describe("viewmodel anims", () => {
  const anims = (input: number[], time: number, slot: number[] = input.map(() => 0)) => {
    const { timeline } = weaponTrack(
      input.map((value, index) => ({ t: index * 50, input: value, slot: slot[index] })),
    );
    return viewmodelAnims(timeline, time, adsAt(timeline, time));
  };

  it("holds the idle with ads_down posed at its end at the hip", () => {
    expect(anims([0, 0], 250)).toEqual([
      { clip: "viewmodel_luger_idle", time: expect.closeTo(1 / 24), weight: 1 },
      { clip: "viewmodel_luger_ads_up", time: 0, weight: 0 },
      { clip: "viewmodel_luger_ads_down", time: 0.5, weight: 1 },
    ]);
    // Before the first sample the clip time stays at 0.
    expect(anims([0, 0], -10)[0].time).toBe(0);
  });

  it("restarts fire per shot and idles once its 19 frames have played", () => {
    expect(anims([0, ATTACK, 0], 150)[0]).toEqual({
      clip: "viewmodel_luger_fire",
      time: expect.closeTo(0.1),
      weight: 1,
    });
    expect(anims([0, ATTACK, 0], 800)[0].time).toBeCloseTo(0.75);
    // Fired at 50 ms, so the 791.7 ms anim ends at 841.7.
    expect(anims([0, ATTACK, 0], 850)[0]).toEqual({
      clip: "viewmodel_luger_idle",
      time: expect.closeTo(0.00833, 4),
      weight: 1,
    });
  });

  it("fires adsFire above fWeaponPosFrac 0.75 and poses the ADS pair by it", () => {
    const aimed = anims([ADS, ADS, ADS, ADS, ADS, ADS | ATTACK, ADS], 300);
    expect(aimed[0]).toEqual({
      clip: "viewmodel_luger_fire_ads",
      time: expect.closeTo(0.05),
      weight: 1,
    });
    expect(aimed[1]).toEqual({
      clip: "viewmodel_luger_ads_up",
      time: expect.closeTo(10 / 24),
      weight: 0.6,
    });
    expect(aimed[2]).toEqual({ clip: "viewmodel_luger_ads_down", time: 0, weight: 0.4 });
  });

  it("plays melee1 over meleeTime and pullout over raiseTime", () => {
    expect(anims([MELEE, 0], 350)[0]).toEqual({
      clip: "viewmodel_luger_melee1",
      time: expect.closeTo(0.41667),
      weight: 1,
    });
    expect(anims([0, 0, 0], 175, [3, 0, 0])[0]).toEqual({
      clip: "viewmodel_luger_pullout",
      time: expect.closeTo(0.27083),
      weight: 1,
    });
  });
});

describe("muzzle flash", () => {
  const shots = (count: number) =>
    weaponTrack(
      Array.from({ length: count * 4 }, (_, index) => ({
        t: index * 50,
        input: index % 4 === 0 ? ATTACK : 0,
      })),
    ).timeline;

  it("draws pistolflash_view's sprites and light for 100 ms after each shot", () => {
    const timeline = shots(1);
    expect(muzzleFlash(timeline, 0)).toMatchObject({
      light: {
        radius: expect.closeTo(200.025),
        color: [1.307, expect.closeTo(0.9328), expect.closeTo(0.8098)],
      },
    });
    const flash = muzzleFlash(timeline, 50);
    const small = flash?.sprites.slice(0, 3) ?? [];
    expect(small.map((sprite) => sprite.frame)).toEqual([13, 13, 13]);
    // Radius 0.1392 → 1 of 5 in; alpha between the keys and the Rand keys.
    expect(small[0].radius).toBeCloseTo(2.848);
    for (const sprite of small) {
      expect(sprite.color).toBeGreaterThanOrEqual(0.29);
      expect(sprite.color).toBeLessThanOrEqual(0.51);
    }
    expect(flash?.light.radius).toBeCloseTo(100.513, 2);
    expect(flash?.light.offset).toBeGreaterThanOrEqual(18);
    expect(flash?.light.offset).toBeLessThanOrEqual(29);
    expect(muzzleFlash(timeline, 100)).toBeNull();
    // Pure: a seek back shows the same flash.
    expect(muzzleFlash(timeline, 50)).toEqual(flash);
  });

  it("adds big_flash to about half of the shots", () => {
    const timeline = shots(200);
    const big = timeline.fireStarts.filter(
      (start) => (muzzleFlash(timeline, start + 10)?.sprites.length ?? 0) === 4,
    ).length;
    expect(timeline.fireStarts).toHaveLength(200);
    expect(big).toBeGreaterThan(70);
    expect(big).toBeLessThan(130);
  });
});
