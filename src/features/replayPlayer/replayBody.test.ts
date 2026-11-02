import { describe, expect, it } from "vitest";
import type { ReplayMarker, ReplaySamples } from "../../lib/api";
import { bodyAt, createBodyTrack } from "./replayBody";
import { createTimeline } from "./replayPlayback";

/** One sample; position integrates the velocity unless `z` (or `x`) is given. */
interface Row {
  vx?: number;
  vy?: number;
  vz?: number;
  x?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
  air?: boolean;
  stance?: number;
  input?: number;
  aux?: number;
}

const STEP_MS = 8;
const FORWARD = 32;
const BACK = 64;
const RIGHT = 256;
const ATTACK = 1;
const JUMP = 2;
const ADS = 1024;
const LEAN_RIGHT = 4096;

function track(rows: Row[], markers: ReplayMarker[] = []) {
  let x = 0;
  let y = 0;
  let z = 0;
  const pos: number[] = [];
  rows.forEach((row, index) => {
    if (index > 0) {
      const before = rows[index - 1];
      x += ((before.vx ?? 0) * STEP_MS) / 1000;
      y += ((before.vy ?? 0) * STEP_MS) / 1000;
      z += ((before.vz ?? 0) * STEP_MS) / 1000;
    }
    x = row.x ?? x;
    z = row.z ?? z;
    pos.push(x, y, z);
  });
  const samples: ReplaySamples = {
    run_id: 1,
    mapname: "jm_test",
    player_id: 2,
    playername: "Runner",
    format_version: 12,
    tick_ms: STEP_MS,
    duration_ms: (rows.length - 1) * STEP_MS,
    finished: true,
    t: rows.map((_, index) => index * STEP_MS),
    pos,
    ang: rows.flatMap((row) => [row.pitch ?? 0, row.yaw ?? 0, 0]),
    vel: rows.flatMap((row) => [row.vx ?? 0, row.vy ?? 0, row.vz ?? 0]),
    stance: rows.map((row) => row.stance ?? 0),
    flags: rows.map((row) => (row.air ? 4 : 0) | (row.stance ? 1 : 0)),
    input: rows.map((row) => row.input ?? 0),
    aux: rows.map((row) => row.aux ?? 0),
    markers,
  };
  return createBodyTrack(createTimeline(samples));
}

function repeat(count: number, row: Row | ((index: number) => Row)): Row[] {
  return Array.from({ length: count }, (_, index) =>
    typeof row === "function" ? row(index) : { ...row },
  );
}

/** Clip name to mixer weight at `time`. */
function weights(rows: Row[], time: number): Record<string, number> {
  return weightsOf(track(rows), time);
}

function weightsOf(body: ReturnType<typeof track>, time: number): Record<string, number> {
  return Object.fromEntries(
    (bodyAt(body, time)?.anims ?? []).map((anim) => [anim.clip, anim.weight]),
  );
}

/** The legs clip with the most weight. */
function main(rows: Row[], time: number): string {
  const entries = Object.entries(weights(rows, time));
  return entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best), ["", -1])[0];
}

function clipTime(body: ReturnType<typeof track>, time: number, clip: string): number {
  const anim = bodyAt(body, time)?.anims.find((entry) => entry.clip === clip);
  if (!anim) throw new Error(`${clip} is not playing at ${time}`);
  return anim.time;
}

const RUN = { vx: 209, input: FORWARD };

describe("body movetypes", () => {
  it("stands idle at the hip or aimed", () => {
    expect(weights(repeat(20, {}), 100)).toEqual({ pb_stand_alert_pistol: 1 });
    expect(weights(repeat(20, { input: ADS }), 100)).toEqual({ pb_stand_ads_pistol: 1 });
  });

  it("walks while aiming or leaning and runs otherwise; speed does not decide", () => {
    expect(main(repeat(80, RUN), 600)).toBe("pb_pistol_run_fast");
    expect(main(repeat(80, { vx: 80, input: FORWARD }), 600)).toBe("pb_pistol_run_fast");
    expect(main(repeat(80, { ...RUN, input: FORWARD | ADS }), 600)).toBe(
      "pb_combatwalk_forward_loop_pistol",
    );
    expect(main(repeat(80, { ...RUN, input: FORWARD | LEAN_RIGHT }), 600)).toBe(
      "pb_combatwalk_forward_loop_pistol",
    );
  });

  it("backpedals, strafes with the legs to the view, and keeps sliding without keys", () => {
    expect(main(repeat(80, { vx: -170, input: BACK }), 600)).toBe("pb_combatrun_back_loop_pistol");
    const strafe = track(repeat(80, { vy: -200, yaw: 30, input: RIGHT }));
    expect(weightsOf(strafe, 600)).toEqual({ pb_combatrun_right_loop_pistol: 1 });
    expect(bodyAt(strafe, 600)?.legsYaw).toBeCloseTo(30, 6);
    // No keys: above 120 u/s the last movetype stays, below it the runner idles.
    const coast = (speed: number) => [...repeat(40, RUN), ...repeat(60, { vx: speed })];
    expect(main(coast(150), 700)).toBe("pb_pistol_run_fast");
    expect(main(coast(100), 700)).toBe("pb_stand_alert_pistol");
  });

  it("crouches and goes prone by the actual stance", () => {
    expect(weights(repeat(40, { stance: 1 }), 200)).toEqual({ pb_crouch_alert_pistol: 1 });
    expect(main(repeat(80, { ...RUN, vx: 130, stance: 1 }), 600)).toBe(
      "pb_crouch_run_forward_pistol",
    );
    expect(main(repeat(80, { ...RUN, vx: 130, stance: 1, input: FORWARD | ADS }), 600)).toBe(
      "pb_crouch_walk_forward_pistol",
    );
    expect(weights(repeat(40, { stance: 2 }), 200)).toEqual({ pb_prone_aim_pistol: 1 });
    expect(main(repeat(80, { vx: 30, stance: 2, input: FORWARD }), 600)).toBe(
      "pb_prone_crawl_pistol",
    );
  });

  it("climbs ladders at a rate from the vertical speed", () => {
    const up = track(repeat(80, { vz: 100, air: true, aux: 1 }));
    expect(weightsOf(up, 400)).toEqual({ pb_climbup: 1 });
    const rate = (clipTime(up, 480, "pb_climbup") - clipTime(up, 400, "pb_climbup")) / 0.08;
    expect(rate).toBeCloseTo(100 / 57.7157, 4);
    expect(main(repeat(80, { vz: -60, air: true, aux: 1 }), 400)).toBe("pb_climbdown");
  });
});

describe("body playback rate", () => {
  const rate = (rows: Row[], clip: string) => {
    const body = track(rows);
    const step = clipTime(body, 640, clip) - clipTime(body, 600, clip);
    return step / 0.04;
  };

  it("scales by speed over the clip's moveSpeed, capped by its speed class", () => {
    expect(rate(repeat(100, RUN), "pb_pistol_run_fast")).toBeCloseTo(209 / 200.5646, 4);
    expect(rate(repeat(100, { vx: 600, input: FORWARD }), "pb_pistol_run_fast")).toBeCloseTo(2, 4);
    const walk = repeat(100, { ...RUN, input: FORWARD | ADS });
    expect(rate(walk, "pb_combatwalk_forward_loop_pistol")).toBeCloseTo(
      3 - (57.4577 - 20) / 130,
      4,
    );
    expect(rate(repeat(100, { vx: 12, input: FORWARD }), "pb_pistol_run_fast")).toBeCloseTo(0.1, 4);
  });
});

describe("body events", () => {
  // Run 200 ms, jump (jump held, rising), fly 600 ms, land falling at 300 u/s, run on.
  const jump = (ground: Row, flight = 75) => [
    ...repeat(25, ground),
    { ...ground, vz: 250, air: true, input: (ground.input ?? 0) | JUMP },
    ...repeat(flight, (index) => ({ ...ground, vz: 250 - index * 6.4, air: true })),
    ...repeat(40, ground),
  ];
  const takeoff = 25 * STEP_MS;
  const landing = (25 + 76) * STEP_MS;

  it("plays the run or stand takeoff and holds it through the air", () => {
    const run = jump(RUN);
    const half = weights(run, takeoff + 50);
    expect(half.pb_runjump_takeoff_pistol).toBeCloseTo(0.5, 6);
    expect(half.pb_pistol_run_fast).toBeCloseTo(0.5, 6);
    expect(weights(run, takeoff + 500)).toEqual({ pb_runjump_takeoff_pistol: 1 });
    expect(main(jump({}), takeoff + 300)).toBe("pb_standjump_takeoff_pistol");
    expect(main(jump({ vx: -170, input: BACK }), takeoff + 300)).toBe("pb_standjump_takeoff");
  });

  it("lands into the locomotion through the land anim after a hard landing only", () => {
    // The land event holds the legs 55 ms; the next frame under 50 ms sets the run.
    const hard = weights(jump(RUN), landing + 16);
    expect(hard.pb_runjump_land_pistol).toBeGreaterThan(0);
    expect(hard.pb_runjump_takeoff_pistol).toBeGreaterThan(0);
    expect(hard.pb_pistol_run_fast).toBeGreaterThan(0);
    expect(weights(jump(RUN), landing + 400)).toEqual({ pb_pistol_run_fast: 1 });
    // A 12-unit fall or less is not a landing event.
    const soft = jump(RUN, 20).map((row, index) =>
      index > 25 ? { ...row, vz: row.air ? 10 : 0 } : row,
    );
    expect(weights(soft, (25 + 21) * STEP_MS + 16).pb_runjump_land_pistol).toBeUndefined();
  });

  it("puts a shot on the torso over the legs, or beside them aimed", () => {
    const shots = (input: number) => [
      ...repeat(20, { input }),
      { input: input | ATTACK },
      ...repeat(40, { input }),
    ];
    const hip = weights(shots(0), 20 * STEP_MS + 40);
    expect(hip.pt_stand_shoot_pistol / hip.pb_stand_alert_pistol).toBeCloseTo(100, 6);
    const aimed = weights(shots(ADS), 20 * STEP_MS + 40);
    expect(aimed).toEqual({ pb_stand_ads_pistol: 0.5, pb_stand__shoot_ads_pistol: 0.5 });
    // Moving, the pistol has no fire anim.
    const running = weights(
      [...repeat(20, RUN), { ...RUN, input: FORWARD | ATTACK }, ...repeat(20, RUN)],
      20 * STEP_MS + 40,
    );
    expect(Object.keys(running)).toEqual(["pb_pistol_run_fast"]);
  });
});

describe("body yaw", () => {
  const turn = (to: number) => [...repeat(10, { yaw: 0 }), ...repeat(120, { yaw: to })];

  it("turns the legs only once the view is 40° away, then all the way", () => {
    const small = bodyAt(track(turn(30)), 900);
    expect(small?.legsYaw).toBeCloseTo(0, 6);
    expect(small?.origin.angles[1]).toBeCloseTo(-30, 1);
    const large = bodyAt(track(turn(50)), 900);
    expect(large?.legsYaw).toBeCloseTo(50, 6);
    expect(large?.origin.angles[1]).toBeCloseTo(0, 6);
  });

  it("looks with the head and torso: the aim_down check pose", () => {
    // READY.md §8.5: view pitch 30, legs 35° right of a torso facing the view.
    const rows = [...repeat(10, { yaw: 0, pitch: 30 }), ...repeat(200, { yaw: 35, pitch: 30 })];
    const body = bodyAt(track(rows), 1500);
    expect(body?.legsYaw).toBeCloseTo(0, 6);
    const rounded = body?.controllers.map((angles) =>
      angles.map((value) => Math.round(value * 10) / 10),
    );
    expect(rounded).toEqual([
      [0, 0, 0],
      [3.6, 14, 0],
      [5.4, 14, 0],
      [9, 7, 0],
      [3.6, 0, 0],
      [8.4, 0, 0],
    ]);
    expect(body?.origin.angles.map(Math.round)).toEqual([0, -35, 0]);
  });
});

describe("body seeking", () => {
  // Run, turn, jump, land, crouch, shoot, a load teleport and prone: every kind of history.
  const rows: Row[] = [
    ...repeat(60, (index) => ({ ...RUN, yaw: index * 1.5 })),
    { ...RUN, yaw: 90, vz: 250, air: true, input: FORWARD | JUMP },
    ...repeat(60, (index) => ({ ...RUN, yaw: 90 - index, vz: 250 - index * 6.4, air: true })),
    ...repeat(50, (index) => ({ yaw: 30 + index, stance: 1, input: index === 20 ? ATTACK : 0 })),
    ...repeat(60, (index) => ({ x: 5000, vy: -200, yaw: 120, input: RIGHT, pitch: index / 3 })),
    ...repeat(70, (index) => ({
      yaw: 120 - index * 2,
      stance: 2,
      input: index > 30 ? FORWARD : 0,
    })),
  ];
  const times = Array.from({ length: 160 }, (_, index) => index * 15.7);

  it("gives the pose of playing up to a time, from a cold start", () => {
    const played = track(rows);
    for (const time of times) {
      expect(bodyAt(played, time)).toEqual(bodyAt(track(rows), time));
    }
  });

  it("gives the same pose scrubbing backwards and repeating", () => {
    const played = track(rows);
    const forward = times.map((time) => bodyAt(played, time));
    const backward = [...times].reverse().map((time) => bodyAt(played, time));
    expect(backward.reverse()).toEqual(forward);
  });

  it("settles across a load teleport", () => {
    // The sample after the teleport starts over: its strafe anim at full weight at once.
    const teleport = 171 * STEP_MS;
    expect(weightsOf(track(rows), teleport + 4)).toEqual({ pb_combatrun_right_loop_pistol: 1 });
  });
});

describe("engine mantle and scripted climb", () => {
  const mantle = (ms: number, rise: number) => {
    const count = Math.round(ms / STEP_MS);
    return [
      ...repeat(10, {}),
      ...repeat(count, (index) => ({ z: (rise * index) / count, aux: 8, air: true })),
      ...repeat(30, { z: rise }),
    ];
  };

  it("plays the mantle up anim for a run as long as the engine's", () => {
    expect(main(mantle(733, 45), 10 * STEP_MS + 300)).toBe("mp_mantle_up_45");
  });

  it("idles through J4L's linked climb", () => {
    expect(main(mantle(2000, 45), 10 * STEP_MS + 600)).toBe("pb_stand_alert_pistol");
  });
});
