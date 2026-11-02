import {
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from "three";
import { describe, expect, it } from "vitest";
import { METRES_PER_COD_UNIT } from "./codSpace";
import { buildFloorGrid, floorBelow, type FloorGrid } from "./entityLight";
import type { SurfaceLight } from "./legacySurface";

/** A horizontal quad over x, z in [x0, x1] × [z0, z1] at height y (scene metres), uv1 = (x, z). */
function quad(x0: number, x1: number, z0: number, z1: number, y: number, facingUp = true) {
  const geometry = new BufferGeometry();
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      corners.flatMap(([x, z]) => [x, y, z]),
      3,
    ),
  );
  geometry.setAttribute("uv1", new Float32BufferAttribute(corners.flat(), 2));
  // Counter-clockwise seen from above (+y) faces up.
  geometry.setIndex(facingUp ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3]);
  return geometry;
}

function lightmapped(name: string): MeshBasicMaterial {
  const material = new MeshBasicMaterial();
  const texture = new DataTexture(new Uint8Array(4), 1, 1);
  texture.name = name;
  const light: SurfaceLight = {
    kind: "lightmap",
    lightmap: texture,
    sunVisibility: texture,
    scale: 1,
  };
  material.userData.litLight = light;
  return material;
}

function build(render: Object3D): FloorGrid {
  render.updateMatrixWorld(true);
  const builder = buildFloorGrid(render);
  let step = builder.next();
  while (!step.done) step = builder.next();
  return step.value;
}

/** floorBelow at scene x, z with the feet at scene height y. */
function below(grid: FloorGrid, x: number, y: number, z: number) {
  const unit = METRES_PER_COD_UNIT;
  const hit = floorBelow(grid, x / unit, -z / unit, y / unit);
  return hit && { light: (hit.light.lightmap as DataTexture).name, u: hit.uv.x, v: hit.uv.y };
}

describe("floor grid", () => {
  const render = new Group();
  // A 20 m floor, a 1 m high platform drawn twice as instances, and a downward-facing ceiling.
  render.add(new Mesh(quad(-10, 10, -10, 10, 0), lightmapped("floor")));
  const platform = new InstancedMesh(quad(0, 1, 0, 1, 1), lightmapped("platform"), 2);
  platform.setMatrixAt(0, new Matrix4());
  platform.setMatrixAt(1, new Matrix4().makeTranslation(5, 0, 0));
  render.add(platform);
  render.add(new Mesh(quad(-10, 10, -10, 10, 0.5, false), lightmapped("ceiling")));
  // Not lightmapped: never the floor.
  render.add(new Mesh(quad(-10, 10, -10, 10, 0.25), new MeshBasicMaterial()));
  const grid = build(render);

  it("finds the highest lightmapped surface below the feet, with its uv1", () => {
    expect(below(grid, -3, 0, 2)).toEqual({ light: "floor", u: -3, v: 2 });
    const top = below(grid, 0.25, 1, 0.75);
    expect(top?.light).toBe("platform");
    expect(top?.u).toBeCloseTo(0.25, 5);
    expect(top?.v).toBeCloseTo(0.75, 5);
    // The second instance, moved 5 m along x, keeps the geometry's uv1.
    expect(below(grid, 5.5, 1.5, 0.5)?.light).toBe("platform");
  });

  it("skips surfaces above the search start, facing down, or off the map", () => {
    // Standing under the platform: it is above the feet, so the floor is below.
    expect(below(grid, 0.5, 0, 0.5)?.light).toBe("floor");
    // Above the downward-facing ceiling and the unlit quad: both are passed over.
    expect(below(grid, -3, 1, 2)?.light).toBe("floor");
    expect(below(grid, 50, 0, 50)).toBeNull();
    expect(below(grid, 0, -1, 0)).toBeNull();
  });
});
