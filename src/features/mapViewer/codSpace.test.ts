import { describe, expect, it } from "vitest";
import { codToScenePosition, codToSceneRotation, parseCameraHash } from "./codSpace";

describe("CoD to scene space", () => {
  it("maps Z-up CoD inches to Y-up glTF metres", () => {
    const [x, y, z] = codToScenePosition(100, 200, 300);
    expect(x).toBeCloseTo(2.54);
    expect(y).toBeCloseTo(7.62);
    expect(z).toBeCloseTo(-5.08);
  });

  it("turns CoD yaw and pitch into a camera looking the same way", () => {
    // Camera forward is -Z rotated by Y (yaw) then X (pitch), as three.js applies "YXZ".
    const forward = (pitch: number, yaw: number) => {
      const [rx, ry] = codToSceneRotation(pitch, yaw);
      return [-Math.sin(ry) * Math.cos(rx), Math.sin(rx), -Math.cos(ry) * Math.cos(rx)];
    };
    // Yaw 90 faces CoD +Y, which is scene -Z.
    forward(0, 90).forEach((value, index) => expect(value).toBeCloseTo([0, 0, -1][index]));
    // Yaw 0 faces CoD +X; positive pitch looks down.
    const down = forward(45, 0);
    expect(down[0]).toBeCloseTo(Math.SQRT1_2);
    expect(down[1]).toBeCloseTo(-Math.SQRT1_2);
  });

  it("parses the shareable camera hash", () => {
    expect(parseCameraHash("#10,-20,30,90,-15")).toEqual({
      x: 10,
      y: -20,
      z: 30,
      yaw: 90,
      pitch: -15,
    });
    expect(parseCameraHash("#1,2,3")).toEqual({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0 });
    expect(parseCameraHash("")).toBeNull();
    expect(parseCameraHash("#1,2")).toBeNull();
    expect(parseCameraHash("#1,,3")).toBeNull();
    expect(parseCameraHash("#results")).toBeNull();
  });
});
